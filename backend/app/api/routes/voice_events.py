import logging
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

import httpx
from fastapi import APIRouter, Header, HTTPException
from sqlmodel import Session, SQLModel, select

from app.api.deps import SessionDep
from app.core.config import settings
from app.models import (
    Call,
    CallOutcome,
    CallResult,
    CallTask,
    CallTaskStatus,
    CallTurn,
    EscalationEvent,
    Routine,
    User,
    Ward,
)
from app.twilio.sms import send_admin_sms

router = APIRouter(tags=["voice"])
logger = logging.getLogger(__name__)


class VoiceEvent(SQLModel):
    event: Literal["summary", "terminal"]
    sid: str
    medications: dict[str, Literal[0, 1]] = {}
    transcript: str = ""
    notes: str = ""
    status: Literal["completed", "busy", "failed", "no-answer", "canceled"] | None = (
        None
    )
    duration_sec: int = 0


def _prepare_sms_notification(
    session: Session,
    task: CallTask,
    result: CallResult,
    event: VoiceEvent,
) -> EscalationEvent | None:
    # Give the scheduled retry a chance before notifying about an unanswered call.
    if (
        event.event == "terminal"
        and event.status == "no-answer"
        and task.attempt_no < 2
    ):
        return None

    admin = session.exec(
        select(User).where(
            User.is_superuser.is_(True),
            User.admin_phone_number.is_not(None),
        )
    ).first()
    if admin is None or admin.admin_phone_number is None:
        return None

    if session.exec(
        select(EscalationEvent).where(
            EscalationEvent.call_result_id == result.id,
            EscalationEvent.channel == "sms",
        )
    ).first():
        return None

    routine = session.get(Routine, task.routine_id)
    ward = session.get(Ward, routine.ward_id) if routine else None
    if ward is None:
        return None
    preference = ward.sms_notification_preference
    if preference == "never":
        return None

    expected_medications = len(routine.items) if routine else 0
    missed = [name for name, value in event.medications.items() if value == 0]
    missing_response = result.outcome == CallOutcome.UNCLEAR or (
        event.event == "summary"
        and (
            not event.medications
            or (
                expected_medications > 0
                and len(event.medications) < expected_medications
            )
        )
    )
    call_failed = event.event == "terminal" and event.status != "completed"
    has_issue = (
        result.outcome != CallOutcome.TOOK or missing_response or call_failed
    )
    if preference == "issues_only" and not has_issue:
        return None

    if not all(
        (
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN,
            settings.SMS_FROM,
        )
    ):
        logger.warning("Medication SMS skipped because Twilio SMS settings are missing")
        return None

    lines = ["Podsumowanie rozmowy", f"Podopieczny: {ward.full_name}"]
    if event.notes.strip():
        lines.extend(["", event.notes.strip()[:500]])
    problems = []
    if event.status and event.status != "completed":
        status_messages = {
            "no-answer": "Nie uzyskano odpowiedzi na połączenie.",
            "busy": "Linia była zajęta.",
            "failed": "Połączenie nie powiodło się.",
            "canceled": "Połączenie zostało przerwane.",
        }
        problems.append(status_messages.get(event.status, "Połączenie nie powiodło się."))
    if missed:
        problems.append(f"Niepotwierdzone przyjęcie: {', '.join(missed)}.")
    if missing_response and not missed:
        problems.append("Nie uzyskano potwierdzenia przyjęcia wszystkich leków.")
    if not problems:
        problems.append("Brak wykrytych problemów.")
    lines.extend(["", "Wykryte problemy:"])
    lines.extend(f"• {problem}" for problem in problems)
    lines.extend(["", "DzwoniLek"])

    return EscalationEvent(
        call_result_id=result.id,
        caregiver_id=ward.caregiver_id,
        channel="sms",
        payload={"message": "\n".join(lines), "to": admin.admin_phone_number},
        status="pending",
    )


@router.post("/internal/calls/{task_id}/events")
def persist_voice_event(
    session: SessionDep,
    task_id: uuid.UUID,
    event: VoiceEvent,
    authorization: str | None = Header(default=None),
) -> dict[str, bool]:
    """Persist authenticated provider events, deduplicating final callbacks."""
    if not settings.VOICE_SERVICE_TOKEN or not secrets.compare_digest(
        authorization or "", f"Bearer {settings.VOICE_SERVICE_TOKEN}"
    ):
        raise HTTPException(status_code=401, detail="Invalid provider token")
    call = session.exec(
        select(Call).where(Call.call_task_id == task_id).with_for_update()
    ).first()
    task = session.get(CallTask, task_id)
    if not call or not task:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.twilio_call_sid and call.twilio_call_sid != event.sid:
        raise HTTPException(status_code=409, detail="Provider call SID mismatch")
    call.twilio_call_sid = event.sid
    result = session.exec(
        select(CallResult).where(CallResult.call_id == call.id)
    ).first()
    sms_notification = None
    if event.event == "summary":
        outcome = CallOutcome.UNCLEAR
        if event.medications:
            outcome = (
                CallOutcome.TOOK
                if all(event.medications.values())
                else CallOutcome.NOT_TAKEN
            )
        if result is None:
            result = CallResult(call_id=call.id, outcome=outcome)
        result.outcome = outcome
        result.transcript_full = event.transcript
        result.notes = event.notes
        result.confidence = (
            0.0  # The Realtime summary does not expose a calibrated confidence.
        )
        session.add(result)
        sms_notification = _prepare_sms_notification(
            session, task, result, event
        )
        if sms_notification is not None:
            session.add(sms_notification)
        if not session.exec(
            select(CallTurn.id).where(CallTurn.call_id == call.id)
        ).first():
            question = ""
            turn_no = 0
            for line in event.transcript.splitlines():
                match = re.match(r"^\[[^\]]+\] (AI|USER): (.*)$", line)
                if not match:
                    continue
                speaker, text = match.groups()
                if speaker == "AI":
                    question = text
                else:
                    turn_no += 1
                    session.add(
                        CallTurn(
                            call_id=call.id,
                            turn_no=turn_no,
                            question=question,
                            speech_result=text,
                            confidence=0.0,
                            parsed="unclear",
                        )
                    )
    else:
        if event.status is None or event.duration_sec < 0:
            raise HTTPException(status_code=422, detail="Invalid terminal status")
        if task.status in (
            CallTaskStatus.COMPLETED,
            CallTaskStatus.FAILED,
            CallTaskStatus.CANCELLED,
        ):
            if not (call.status == "failed" and event.status == "completed"):
                return {"accepted": True}
        call.status = event.status
        call.duration_sec = event.duration_sec
        if result is None:
            result = CallResult(
                call_id=call.id,
                outcome=(
                    CallOutcome.UNCLEAR
                    if event.status == "completed"
                    else CallOutcome.NO_ANSWER
                ),
            )
            session.add(result)
        task.status = (
            CallTaskStatus.COMPLETED
            if event.status == "completed"
            else CallTaskStatus.FAILED
        )
        if (
            result.outcome in (CallOutcome.NOT_TAKEN, CallOutcome.NO_ANSWER)
            and task.attempt_no < task.max_attempts
        ):
            session.add(
                CallTask(
                    routine_id=task.routine_id,
                    scheduled_at=datetime.now(UTC)
                    + timedelta(minutes=settings.CALL_RETRY_DELAY_MIN),
                    attempt_no=task.attempt_no + 1,
                    max_attempts=task.max_attempts,
                )
            )
        session.add(task)
        sms_notification = _prepare_sms_notification(
            session, task, result, event
        )
        if sms_notification is not None:
            session.add(sms_notification)
    session.add(call)
    session.commit()
    if sms_notification is not None:
        try:
            send_admin_sms(
                sms_notification.payload["to"], sms_notification.payload["message"]
            )
        except (httpx.HTTPError, RuntimeError):
            logger.exception("Failed to send medication follow-up SMS")
            sms_notification.status = "failed"
        else:
            sms_notification.status = "sent"
        session.add(sms_notification)
        session.commit()
    return {"accepted": True}
