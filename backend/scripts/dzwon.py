# -*- coding: utf-8 -*-
"""
Bot dzwoni na TWILIO_PHONE_NUMBER i pyta kolejno o każdy lek z listy LEKI:
czy był przyjęty. Po każdym pytaniu czeka na Twoją odpowiedź (rozpoznawanie
mowy pl-PL), a po odpowiedzi na ostatnie pytanie kończy rozmowę. Na końcu
wysyła transkrypcję do OpenAI, które dla każdego leku wywnioskowuje z tekstu
0 (nieprzyjęty) lub 1 (przyjęty) i zwraca JSON {"nazwa_leku": 0|1}. JSON jest
wypisywany w konsoli i zapisywany do leki_wynik.json obok skryptu.

Użycie:
    python dzwon.py                  # numery z .env
    python dzwon.py +48123123123     # numer docelowy jako argument
    python dzwon.py +48123123123 +4915888620339   # oraz numer "od"

Wymaga .env obok skryptu: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
CALL_FROM, TWILIO_PHONE_NUMBER, OPENAI_API_KEY (opcjonalnie OPENAI_MODEL,
domyślnie gpt-4o-mini). Bez dodatkowych bibliotek.
"""

import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Leki, o które bot pyta po kolei — klucze w wynikowym JSON {"lek": 0|1}
LEKI = ["ibuprofen", "paracetamol", "aspiryna"]

# Pytania bota generowane z listy leków: bot mówi pytanie, czeka na odpowiedź,
# ... po odpowiedzi na ostatnie pytanie kończy rozmowę.
ROZMOWA = [f"Czy brała lub brał Pan(i) dzisiaj lek {lek}?" for lek in LEKI]

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(SCRIPT_DIR, ".env")
ENDPOINTS_FILE = os.path.join(SCRIPT_DIR, ".twilio_endpoints.json")
WYNIK_FILE = os.path.join(SCRIPT_DIR, "leki_wynik.json")
TRANSKRYPCJA_FILE = os.path.join(SCRIPT_DIR, "transkrypcja.txt")


def load_env():
    env = {}
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def save_env_key(key, value):
    lines = open(ENV_FILE, encoding="utf-8").read().splitlines()
    for i, line in enumerate(lines):
        if line.strip().startswith(key + "="):
            lines[i] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    with open(ENV_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def twilio_api(env, method, url, params=None):
    req = urllib.request.Request(url, method=method)
    auth = base64.b64encode(
        f'{env["TWILIO_ACCOUNT_SID"]}:{env["TWILIO_AUTH_TOKEN"]}'.encode()
    ).decode()
    req.add_header("Authorization", "Basic " + auth)
    data = None
    if params:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        data = urllib.parse.urlencode(params).encode()
    try:
        with urllib.request.urlopen(req, data) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Twilio {method} -> {e.code}: {e.read().decode()[:300]}") from None


def http_json(method, url, body=None, headers=None, timeout=60):
    req = urllib.request.Request(url, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    data = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, data, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url} -> {e.code}: {e.read().decode()[:300]}") from None


def xml_escape(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def ensure_webhook_endpoints(env):
    """Łańcuszek endpointów webhook.site: endpoint 0 = TwiML startowy,
    endpoint i (1..N) = odbiera odpowiedź na pytanie i-te, po czym odsyła
    pytanie i+1 (albo kończy rozmowę dla ostatniego). TwiML odświeżany jest
    przy każdym uruchomieniu, więc zmiany LEKI/ROZMOWA działają od razu."""
    needed = len(ROZMOWA) + 1
    uuids = [u.strip() for u in env.get("TWILIO_ENDPOINTS", "").split(",") if u.strip()]
    while len(uuids) < needed:
        token = http_json("POST", "https://webhook.site/token", {
            "default_status": 200, "default_content_type": "text/xml", "default_content": "",
        })
        uuids.append(token["uuid"])
        print(f"  nowy endpoint webhook.site: https://webhook.site/{token['uuid']}")
    uuids = uuids[:needed]

    for i, uuid in enumerate(uuids):
        if i < len(ROZMOWA):
            next_url = f"https://webhook.site/{uuids[i + 1]}"
            content = (
                '<?xml version="1.0" encoding="UTF-8"?><Response>'
                '<Gather input="speech" language="pl-PL" speechTimeout="auto" '
                f'action="{next_url}" method="POST">'
                f'<Say language="pl-PL">{xml_escape(ROZMOWA[i])}</Say>'
                "</Gather></Response>"
            )
        else:
            # ostatni endpoint: po odpowiedzi na ostatnie pytanie — koniec rozmowy
            content = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
        http_json("PUT", f"https://webhook.site/token/{uuid}", {
            "default_status": 200,
            "default_content_type": "text/xml",
            "default_content": content,
        })

    save_env_key("TWILIO_ENDPOINTS", ",".join(uuids))
    env["TWILIO_ENDPOINTS"] = ",".join(uuids)
    return uuids


def gpt_wynik_leki(api_key, model, leki, transkrypcja_tekst):
    """Wysyła transkrypcję do OpenAI i zwraca dict {nazwa_leku: 0|1}."""
    system = (
        "Jesteś ekstraktorem danych z transkrypcji rozmowy telefonicznej. "
        "Bot pyta w niej kolejno, czy rozmówca brał dany lek, a rozmówca odpowiada. "
        "Dostaniesz listę leków oraz transkrypcję. Dla każdego leku z listy "
        "wywnioskuj z wypowiedzi rozmówcy, czy lek został przyjęty: 1 — tak, "
        "0 — nie (odpowiedzi wymijające lub bez potwierdzenia traktuj jako 0). "
        'Odpowiedz WYŁĄCZNIE obiektem JSON postaci {"<nazwa leku>": 0|1} '
        "z kluczami identycznymi jak na liście leków, bez dodatkowego tekstu."
    )
    user = "Leki: " + ", ".join(leki) + "\n\nTranskrypcja:\n" + transkrypcja_tekst
    data = http_json(
        "POST",
        "https://api.openai.com/v1/chat/completions",
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        },
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=90,
    )
    content = data["choices"][0]["message"]["content"].strip()
    try:
        return json.loads(content)
    except ValueError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            raise RuntimeError(f"OpenAI zwróciło nie-JSON: {content[:300]}")
        return json.loads(match.group(0))


def main():
    env = load_env()
    for key in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "CALL_FROM", "TWILIO_PHONE_NUMBER"):
        if key not in env:
            sys.exit(f"Brak {key} w {ENV_FILE}")

    args = sys.argv[1:]
    to_number = args[0] if len(args) > 0 else env["TWILIO_PHONE_NUMBER"]
    from_number = args[1] if len(args) > 1 else env["CALL_FROM"]

    uuids = ensure_webhook_endpoints(env)
    voice_url = f"https://webhook.site/{uuids[0]}"

    account = env["TWILIO_ACCOUNT_SID"]
    print(f"Dzwonię: {from_number} → {to_number}")
    for i, line in enumerate(ROZMOWA, 1):
        print(f"  {i}. bot: \"{line}\" → czeka na odpowiedź")
    call = twilio_api(env, "POST", f"https://api.twilio.com/2010-04-01/Accounts/{account}/Calls.json", {
        "To": to_number,
        "From": from_number,
        "Url": voice_url,
    })
    sid = call["sid"]
    print(f"Call SID: {sid} — czekam na zakończenie rozmowy...")

    status = call.get("status", "")
    duration = 0
    started = time.time()
    while status in ("queued", "ringing", "in-progress") and time.time() - started < 300:
        time.sleep(5)
        c = twilio_api(env, "GET", f"https://api.twilio.com/2010-04-01/Accounts/{account}/Calls/{sid}.json")
        if c["status"] != status:
            print(f"  status: {c['status']}")
            status = c["status"]
        duration = c.get("duration") or 0

    placed = status in ("completed", "in-progress")
    print(f"\nPOŁĄCZENIE: {'TAK' if placed else 'NIE'} (status: {status}, czas: {duration} s)")

    print("\n--- TRANSKRYPCJA ---")
    entries = []
    for turn, uuid in enumerate(uuids[1:], 1):
        reqs = http_json(
            "GET",
            f"https://webhook.site/token/{uuid}/requests?sorting=created_at&order_by=asc&per_page=100",
        )
        for item in reqs.get("data", []):
            fields = urllib.parse.parse_qs(item.get("content", ""), keep_blank_values=True)
            flat = {k: v[0] for k, v in fields.items()}
            speech = flat.get("SpeechResult", "").strip()
            if flat.get("CallSid") == sid and speech:
                entries.append((turn, item.get("created_at", ""), speech, flat.get("Confidence", "")))
    entries.sort(key=lambda e: (e[0], e[1]))
    if not entries:
        print("(brak wypowiedzi — nikt nic nie powiedział podczas rozmowy)")
    for turn, t, speech, confidence in entries:
        print(f'[tura {turn}] [{t}] "{speech}" (pewność: {confidence})')
    print("--------------------")

    transkrypcja_tekst = "\n".join(
        f'Bot: {ROZMOWA[turn - 1]}\nOdpowiedź rozmówcy: "{speech}"' for turn, _, speech, _ in entries
    )
    with open(TRANSKRYPCJA_FILE, "w", encoding="utf-8") as f:
        f.write(transkrypcja_tekst)
    print(f"(transkrypcja zapisana: {TRANSKRYPCJA_FILE})")

    api_key = env.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("\n(pomijam analizę GPT — uzupełnij OPENAI_API_KEY w .env)")
        return
    if not entries:
        print("\n(pomijam analizę GPT — brak wypowiedzi do analizy)")
        return

    model = env.get("OPENAI_MODEL", "").strip() or "gpt-4o-mini"
    print(f"\n=== GPT ({model}): ANALIZA LEKÓW ===")
    try:
        wynik = gpt_wynik_leki(api_key, model, LEKI, transkrypcja_tekst)
    except (RuntimeError, KeyError, ValueError) as e:
        print(f"Błąd OpenAI: {e}", file=sys.stderr)
        return
    with open(WYNIK_FILE, "w", encoding="utf-8") as f:
        json.dump(wynik, f, ensure_ascii=False, indent=2)
    print(json.dumps(wynik, ensure_ascii=False, indent=2))
    print(f"\nZapisano: {WYNIK_FILE}")


if __name__ == "__main__":
    main()
