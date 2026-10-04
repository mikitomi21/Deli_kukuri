import json
import uuid

import httpx
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine
from app.models import (
    Call,
    CallResult,
    CallStatus,
    CallTask,
    CallTaskStatus,
    Routine,
    RoutineItem,
    Ward,
)


def voice_provider_ready() -> bool:
    if not settings.VOICE_SERVICE_TOKEN:
        return False
    try:
        response = httpx.get(
            f"{settings.VOICE_SERVICE_URL.rstrip('/')}/health", timeout=2
        )
        return response.is_success and response.json().get("ready") is True
    except (httpx.HTTPError, ValueError):
        return False


def _medication_details(item: RoutineItem) -> dict[str, str]:
    """Medication details keyed to the question list label, for AI answers.

    Prefers the generated ai_summary JSON (what_it_is / how_to_take /
    when_to_take / warnings) and falls back to plain catalog fields.
    """
    medication = item.medication
    details: dict[str, str] = {
        "label": f"{medication.name} {medication.dosage}, dawka: {item.amount_label}",
        "name": medication.name,
    }
    summary = None
    if medication.ai_summary:
        try:
            summary = json.loads(medication.ai_summary)
        except ValueError:
            summary = None
    if isinstance(summary, dict):
        for key in ("what_it_is", "how_to_take", "when_to_take", "warnings"):
            value = summary.get(key)
            if isinstance(value, str) and value.strip():
                details[key] = value.strip()
    for key, value in (
        ("generic_name", medication.generic_name),
        ("form", medication.form),
        ("how_to_take", medication.instructions),
    ):
        if value and value.strip() and key not in details:
            details[key] = value.strip()
    return details


def place_task_call(task_id: str) -> None:
    """Reserve a provider call once, then pass the routine to the voice gateway."""
    with Session(engine) as session:
        task = session.get(CallTask, uuid.UUID(task_id))
        if task is None or task.status not in (
            CallTaskStatus.PENDING,
            CallTaskStatus.IN_PROGRESS,
        ):
            return
        routine = session.get(Routine, task.routine_id)
        ward = session.get(Ward, routine.ward_id) if routine else None
        if not routine or routine.status != "approved" or not ward or not ward.active:
            task.status = CallTaskStatus.CANCELLED
            session.add(task)
            session.commit()
            return
        if session.exec(select(Call).where(Call.call_task_id == task.id)).first():
            return
        if not settings.VOICE_SERVICE_TOKEN:
            raise RuntimeError("VOICE_SERVICE_TOKEN is not configured")
        # These strings are read aloud by the AI consultant, so the dose must
        # be explicit ("Medicine 5 mg, dawka: 1") — never an unexplained number.
        medications = [
            f"{item.medication.name} {item.medication.dosage}, dawka: {item.amount_label}"
            for item in routine.items
            if item.medication
        ]
        if not medications:
            task.status = CallTaskStatus.CANCELLED
            session.add(task)
            session.commit()
            return
        # Details from the medication catalog let the consultant answer
        # "what is this medication?" questions without inventing anything.
        medication_details = [
            _medication_details(item) for item in routine.items if item.medication
        ]
        call = Call(call_task_id=task.id, status=CallStatus.QUEUED)
        session.add(call)
        task.status = CallTaskStatus.IN_PROGRESS
        session.add(task)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            return  # Another worker already reserved this unique task.
        call_id = call.id
        try:
            response = httpx.post(
                f"{settings.VOICE_SERVICE_URL.rstrip('/')}/internal/calls",
                headers={"Authorization": f"Bearer {settings.VOICE_SERVICE_TOKEN}"},
                json={
                    "task_id": task_id,
                    "to": ward.phone_e164,
                    "ward_name": ward.full_name,
                    "tz": ward.tz,
                    # Planned administration hour (routine time_of_day) so the
                    # AI can ask closed "did you take it at HH:MM" questions.
                    "scheduled_time": routine.time_of_day.strftime("%H:%M"),
                    "medications": medications,
                    "medication_details": medication_details,
                },
                timeout=30,
            )
            response.raise_for_status()
            provider_call = response.json()
            # A fast callback may already have finalized this row.
            session.exec(
                update(Call)
                .where(Call.id == call_id)
                .values(twilio_call_sid=provider_call["sid"])
            )
            session.commit()
        except (httpx.HTTPError, KeyError, ValueError):
            session.rollback()
            call = session.get(Call, call_id)
            task = session.get(CallTask, uuid.UUID(task_id))
            if call and task and task.status == CallTaskStatus.IN_PROGRESS:
                call.status = CallStatus.FAILED
                task.status = CallTaskStatus.FAILED
                session.add_all([call, task])
                session.add(
                    CallResult(
                        call_id=call.id,
                        outcome="no_answer",
                        notes="Voice provider request failed",
                    )
                )
                # A timeout may hide a successful dial; only terminal callbacks retry.
                session.commit()
            raise
