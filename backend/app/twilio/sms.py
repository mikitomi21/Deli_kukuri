import httpx

from app.core.config import settings


def send_admin_sms(to_number: str, message: str) -> None:
    """Send an SMS to the configured administrator using the Twilio REST API."""
    account_sid = settings.TWILIO_ACCOUNT_SID
    auth_token = settings.TWILIO_AUTH_TOKEN
    from_number = settings.SMS_FROM
    if not all((account_sid, auth_token, from_number)):
        raise RuntimeError("Admin SMS settings are incomplete")

    response = httpx.post(
        "https://api.twilio.com/2010-04-01/Accounts/"
        f"{account_sid}/Messages.json",
        data={
            "To": to_number,
            "From": from_number,
            "Body": message,
        },
        auth=(account_sid, auth_token),
        timeout=10,
    )
    response.raise_for_status()
