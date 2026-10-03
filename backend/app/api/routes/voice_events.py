import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from sqlmodel import SQLModel, select

from app.api.deps import SessionDep
from app.core.config import settings
from app.models import Call, CallOutcome, CallResult, CallTask, CallTaskStatus, CallTurn

router = APIRouter(tags=["voice"])


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
    session.add(call)
    session.commit()
    return {"accepted": True}
