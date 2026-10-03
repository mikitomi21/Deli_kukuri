# -*- coding: utf-8 -*-
"""Wysyła szablon Content Template (Twilio Content Template Builder)
przez pełne konto Twilio (SMS_ACCOUNT_SID / SMS_AUTH_TOKEN / SMS_FROM
z .env) na numer podany jako argument (domyślnie +48515569957).

Szablon jest ze stałą treścią (bez zmiennych), więc wysyłka to samo
ContentSid — treść zdefiniowana w konsoli Twilio:
    "Pan Jakub nie wziął wszystkich leków"

Użycie:
    python sms_template.py                # domyślnie +48515569957
    python sms_template.py +48601234567   # inny odbiorca
"""

import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

TEMPLATE_SID = "HX976048a53e1a278363c1ca50c7ec49a6"
DEFAULT_TO = "+48515569957"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(SCRIPT_DIR, ".env")

HINTS = {
    "21659": "'From' nie jest numerem kupionym w Twilio na tym koncie — sprawdź SMS_FROM w .env",
    "21266": "'To' i 'From' są identyczne — podaj innego odbiorcę",
    "20003": "konto wymaga zatwierdzonego KYC w Trust Hub",
    "63016": "szablon nie istnieje na tym koncie lub nie jest przeznaczony na kanał SMS",
}


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


def podpowiedz_bledu(error_text):
    for code, hint in HINTS.items():
        if f'"code":{code}' in error_text:
            print(f"Podpowiedź: {hint}", file=sys.stderr)
            return


def main():
    env = load_env()
    sid = env.get("SMS_ACCOUNT_SID") or env.get("TWILIO_ACCOUNT_SID")
    token = env.get("SMS_AUTH_TOKEN") or env.get("TWILIO_AUTH_TOKEN")
    from_number = env.get("SMS_FROM")
    to_number = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TO

    if not (sid and token and from_number):
        sys.exit(
            f"Brak danych nadawcy w {ENV_FILE}: potrzebne SMS_ACCOUNT_SID, "
            "SMS_AUTH_TOKEN i SMS_FROM (numer kupiony w Twilio)."
        )

    req = urllib.request.Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
        method="POST",
    )
    auth = base64.b64encode(f"{sid}:{token}".encode()).decode()
    req.add_header("Authorization", "Basic " + auth)
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    data = urllib.parse.urlencode(
        {
            "To": to_number,
            "From": from_number,
            "ContentSid": TEMPLATE_SID,
        }
    ).encode()
    try:
        with urllib.request.urlopen(req, data) as resp:
            msg = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err = f"Twilio SMS -> {e.code}: {e.read().decode()[:300]}"
        print(f"Błąd wysyłki: {err}", file=sys.stderr)
        podpowiedz_bledu(err)
        sys.exit(1)

    print(f"SMS (szablon {TEMPLATE_SID}) wysłany!")
    print(f"  Od:     {msg['from']}")
    print(f"  Do:     {msg['to']}")
    print(f"  SID:    {msg['sid']}")
    print(f"  Status: {msg['status']}")


if __name__ == "__main__":
    main()
