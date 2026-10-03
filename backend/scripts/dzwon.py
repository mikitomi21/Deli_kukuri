# -*- coding: utf-8 -*-
"""
Bot dzwoni na TWILIO_PHONE_NUMBER i prowadzi rozmowę wg listy ROZMOWA:
mówi zdanie nr 1, czeka na Twoją odpowiedź, mówi zdanie nr 2, czeka na
Twoją odpowiedź, ... a po odpowiedzi na ostatnie zdanie kończy rozmowę.
Na końcu wypisuje w konsoli transkrypcję Twoich odpowiedzi.

Użycie:
    python dzwon.py                  # numery z .env
    python dzwon.py +48123123123     # numer docelowy jako argument
    python dzwon.py +48123123123 +4915888620339   # oraz numer "od"

Wymaga .env obok skryptu: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
CALL_FROM, TWILIO_PHONE_NUMBER. Bez dodatkowych bibliotek.
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Przebieg rozmowy: bot mówi ROZMOWA[0], czeka na odpowiedź, mówi ROZMOWA[1],
# czeka na odpowiedź, ... po odpowiedzi na ostatnie zdanie kończy rozmowę.
# Możesz dodać/usunąć linie — długość rozmowy dopasowuje się sama.
ROZMOWA = [
    "Witaj, tutaj Arnold Bon Bigos, chciałem się dopytać czy piłeś dzisiaj piwo?",
    "A dużo wypiłeś tego piwa?",
]

ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")


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


def http_json(method, url, body=None):
    req = urllib.request.Request(url, method=method)
    data = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, data) as resp:
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
    endpoint i (1..N) = odbiera odpowiedź na zdanie i-te, po czym odsyła
    zdanie i+1 (albo kończy rozmowę dla ostatniego). TwiML odświeżany jest
    przy każdym uruchomieniu, więc zmiany ROZMOWA działają od razu."""
    needed = len(ROZMOWA) + 1
    uuids = [u.strip() for u in env.get("TWILIO_ENDPOINTS", "").split(",") if u.strip()]
    while len(uuids) < needed:
        token = http_json("POST", "https://webhook.site/token", {
            "default_status": 200, "default_content_type": "text/xml", "default_content": "",
        })
        uuids.append(token["uuid"])
        print(f"  nowy endpoint: https://webhook.site/{token['uuid']}")
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
            # ostatni endpoint: po odpowiedzi na ostatnie zdanie — koniec rozmowy
            content = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>'
        http_json("PUT", f"https://webhook.site/token/{uuid}", {
            "default_status": 200,
            "default_content_type": "text/xml",
            "default_content": content,
        })

    save_env_key("TWILIO_ENDPOINTS", ",".join(uuids))
    env["TWILIO_ENDPOINTS"] = ",".join(uuids)
    return uuids


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
        print(f"  {i}. bot: \"{line}\" → czeka na Twoją odpowiedź")
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


if __name__ == "__main__":
    main()
