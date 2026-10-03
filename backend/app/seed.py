import json
import logging
import random
from datetime import UTC, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import engine, init_db
from app.models import (
    Call,
    CallOutcome,
    CallResult,
    CallStatus,
    CallTask,
    CallTaskStatus,
    CallTurn,
    Medication,
    Routine,
    RoutineItem,
    User,
    Ward,
)
from app.worker.scheduling import materialize_call_tasks

logger = logging.getLogger(__name__)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def seed_medications(session: Session) -> int:
    """Ładuje katalog leków z fixtures/medicines.json do bazy (idempotentnie).

    Katalog jest globalny i read-only w MVP — seed to jedyne źródło danych
    (docs/03-data-model.md, Medication).
    """
    medicines: list[dict[str, str]] = json.loads(
        (FIXTURES_DIR / "medicines.json").read_text(encoding="utf-8")
    )
    added = 0
    for medicine in medicines:
        exists = session.exec(
            select(Medication).where(
                Medication.name == medicine["name"],
                Medication.dosage == medicine["dosage"],
            )
        ).first()
        if exists:
            if not exists.generic_name and "generic_name" in medicine:
                exists.generic_name = medicine.get("generic_name")
                exists.fda_raw = medicine.get("fda_raw")
                exists.ai_summary = medicine.get("ai_summary")
                session.add(exists)
            continue
        session.add(Medication(**medicine))
        added += 1
    session.commit()
    logger.info("Medications seed: %d new of %d in fixture", added, len(medicines))
    return added


def seed_all() -> None:
    """Cały seed przy starcie aplikacji: pierwszy superuser + katalog leków.

    Wszystko idempotentne — wielokrotne wywołanie nie duplikuje danych.
    """
    with Session(engine) as session:
        init_db(session)
        seed_medications(session)
        if settings.SEED_DEMO_DATA:
            seed_demo(session)
        else:
            logger.info("Demo seed disabled (SEED_DEMO_DATA=0)")
    # Materialize upcoming CallTasks right at startup instead of waiting for
    # the 30-minute beat tick — without this, freshly seeded (or just created)
    # approved routines have no visible pending calls until the next tick.
    materialize_call_tasks()


# --- Demo data (docs/01-mvp-scope.md demo checklist: 2 wards, 4 routines,
# --- call-result history between 8:00 and 21:00) -------------------------------

# Demo history covers today + 6 previous days so the weekly adherence % (S4)
# has a full week of data. Occurrences later than "now" are left to the
# materializer so the live demo still schedules real upcoming calls.
DEMO_HISTORY_DAYS_BACK = 6

# Per-occurrence outcome weights; deterministic per (routine, day) so repeated
# seeds produce identical history.
_OUTCOME_WEIGHTS = [
    (CallOutcome.TOOK, 0.72),
    (CallOutcome.NOT_TAKEN, 0.10),
    (CallOutcome.UNCLEAR, 0.06),
    (CallOutcome.NO_ANSWER, 0.12),
]

DEMO_WARDS: list[dict] = [
    {
        "full_name": "Halina Kowalska",
        "phone_e164": "+48600100200",
        "question_template": "Czy przyjęła pani dziś lek {name} {dosage}, dawka {amount}?",
        "answer_yes": "Tak, przyjęłam",
        "answer_no": "Nie, jeszcze nie wzięłam",
        "answer_unclear": "No... chyba wzięłam, nie pamiętam dobrze",
        "routines": [
            {
                "name": "Rano 9:00",
                "time_of_day": "09:00",
                "medications": [("Acard", "75 mg", "1"), ("Euthyrox N", "50 µg", "1")],
            },
            {
                "name": "Wieczór 20:00",
                "time_of_day": "20:00",
                "medications": [
                    ("Glucophage", "850 mg", "1"),
                    ("Magne B6", "48 mg magnezu", "1"),
                ],
            },
        ],
    },
    {
        "full_name": "Jan Nowak",
        "phone_e164": "+48600100201",
        "question_template": "Czy przyjął pan dziś lek {name} {dosage}, dawka {amount}?",
        "answer_yes": "Tak, przyjąłem",
        "answer_no": "Nie, jeszcze nie przyjąłem",
        "answer_unclear": "Chyba tak, nie jestem pewien",
        "routines": [
            {
                "name": "Południe 14:00",
                "time_of_day": "14:00",
                "medications": [("Metformax", "500 mg", "1"), ("Amlor", "5 mg", "1")],
            },
            {
                "name": "Wieczór 21:00",
                "time_of_day": "21:00",
                "medications": [
                    ("Norvasc", "10 mg", "1"),
                    ("Witamina D3", "2000 IU", "1"),
                ],
            },
            {
                # Left as a draft (szkic) so the demo shows the approval gate:
                # a draft routine has no items history and is never materialized.
                "name": "Popołudnie 17:00",
                "time_of_day": "17:00",
                "status": "draft",
                "medications": [
                    ("Witamina D3", "2000 IU", "1"),
                    ("Magne B6", "48 mg magnezu", "1"),
                ],
            },
        ],
    },
]


def _get_medication(session: Session, name: str, dosage: str) -> Medication:
    medication = session.exec(
        select(Medication).where(
            Medication.name == name, Medication.dosage == dosage
        )
    ).first()
    if medication is None:
        raise ValueError(
            f"Demo medication {name!r} ({dosage}) not found — "
            "the medication catalog seed must run first"
        )
    return medication


def _pick_outcome(rng: random.Random) -> str:
    roll = rng.random()
    cumulative = 0.0
    for outcome, weight in _OUTCOME_WEIGHTS:
        cumulative += weight
        if roll < cumulative:
            return outcome
    return CallOutcome.TOOK


def _turns_and_transcript(
    *,
    ward: Ward,
    spec: dict,
    medications: list[tuple[str, str, str]],
    outcome: str,
    rng: random.Random,
    scheduled_utc: datetime,
) -> tuple[list[CallTurn], CallResult]:
    """Build the call turns + result row, matching the voice-event transcript
    format (`[HH:MM:SS] AI: ...` / `[HH:MM:SS] USER: ...`, see voice_events.py)."""
    zone = ZoneInfo(ward.tz)
    turns: list[CallTurn] = []
    transcript_lines: list[str] = []
    turn_no = 0
    clock = scheduled_utc + timedelta(seconds=5)

    # One medication the ward skipped / mumbled about drives the outcome.
    declined_index = rng.randrange(len(medications)) if outcome != CallOutcome.TOOK else -1

    for index, (name, dosage, amount) in enumerate(medications):
        turn_no += 1
        question = spec["question_template"].format(
            name=name, dosage=dosage, amount=amount
        )
        if outcome == CallOutcome.UNCLEAR and index == declined_index:
            speech = spec["answer_unclear"]
            parsed = "unclear"
            confidence = rng.uniform(0.40, 0.60)
        elif index == declined_index:
            speech = spec["answer_no"]
            parsed = "no"
            confidence = rng.uniform(0.88, 0.96)
        else:
            speech = spec["answer_yes"]
            parsed = "yes"
            confidence = rng.uniform(0.90, 0.98)

        ai_at = clock.astimezone(zone).strftime("%H:%M:%S")
        transcript_lines.append(f"[{ai_at}] AI: {question}")
        clock += timedelta(seconds=8)
        user_at = clock.astimezone(zone).strftime("%H:%M:%S")
        transcript_lines.append(f"[{user_at}] USER: {speech}")
        clock += timedelta(seconds=7)

        turns.append(
            CallTurn(
                turn_no=turn_no,
                question=question,
                speech_result=speech,
                confidence=round(confidence, 2),
                parsed=parsed,
            )
        )

    avg_confidence = (
        round(sum(turn.confidence for turn in turns) / len(turns), 2) if turns else 0.0
    )
    if outcome == CallOutcome.NO_ANSWER:
        result = CallResult(
            outcome=CallOutcome.NO_ANSWER,
            confidence=0.0,
            transcript_full="",
            notes="No answer after 25 s",
        )
    else:
        result = CallResult(
            outcome=outcome,
            confidence=avg_confidence,
            transcript_full="\n".join(transcript_lines),
        )
    return turns, result


def _seed_occurrence(
    session: Session,
    *,
    routine: Routine,
    ward: Ward,
    spec: dict,
    medications: list[tuple[str, str, str]],
    scheduled_utc: datetime,
    attempt_no: int,
    rng: random.Random,
    forced_outcome: str | None,
) -> int:
    """Insert one completed CallTask + Call + turns + result (idempotent per
    unique key (routine_id, scheduled_at, attempt_no)). Returns the number of
    created occurrences, including the retry."""
    exists = session.exec(
        select(CallTask).where(
            CallTask.routine_id == routine.id,
            CallTask.scheduled_at == scheduled_utc,
            CallTask.attempt_no == attempt_no,
        )
    ).first()
    if exists:
        return 0

    outcome = forced_outcome or _pick_outcome(rng)
    call_status = (
        CallStatus.NO_ANSWER if outcome == CallOutcome.NO_ANSWER else CallStatus.COMPLETED
    )
    turns, result = _turns_and_transcript(
        ward=ward,
        spec=spec,
        medications=medications,
        outcome=outcome,
        rng=rng,
        scheduled_utc=scheduled_utc,
    )

    task = CallTask(
        routine_id=routine.id,
        scheduled_at=scheduled_utc,
        attempt_no=attempt_no,
        status=CallTaskStatus.COMPLETED,
        created_at=scheduled_utc,
        updated_at=scheduled_utc,
    )
    session.add(task)
    session.flush()  # assign task.id before linking the call

    call = Call(
        call_task_id=task.id,
        status=call_status,
        duration_sec=25 if outcome == CallOutcome.NO_ANSWER else 45 + len(turns) * 15,
    )
    call.created_at = scheduled_utc
    call.updated_at = scheduled_utc
    session.add(call)
    session.flush()  # assign call.id

    result.call_id = call.id
    result.created_at = scheduled_utc
    result.updated_at = scheduled_utc
    session.add(result)
    for turn in turns:
        turn.call_id = call.id
        session.add(turn)

    # Failed first attempts get a retry 15 minutes later (S1), mirroring the
    # behavior of the voice-event callback in voice_events.py.
    created = 1
    if outcome in (CallOutcome.NOT_TAKEN, CallOutcome.NO_ANSWER) and attempt_no < 2:
        retry_outcome = (
            CallOutcome.TOOK
            if rng.random() < 0.6
            else (
                CallOutcome.NOT_TAKEN
                if outcome == CallOutcome.NOT_TAKEN
                else CallOutcome.NO_ANSWER
            )
        )
        created += _seed_occurrence(
            session,
            routine=routine,
            ward=ward,
            spec=spec,
            medications=medications,
            scheduled_utc=scheduled_utc + timedelta(minutes=15),
            attempt_no=attempt_no + 1,
            rng=rng,
            forced_outcome=retry_outcome,
        )
    return created


def _seed_demo_history(
    session: Session,
    routine: Routine,
    ward: Ward,
    spec: dict,
    medications: list[tuple[str, str, str]],
) -> int:
    zone = ZoneInfo(ward.tz)
    today = datetime.now(zone).date()
    created = 0
    for days_back in range(DEMO_HISTORY_DAYS_BACK, -1, -1):
        day = today - timedelta(days=days_back)
        # Deterministic RNG per (routine, day): re-running the seed yields the
        # same history instead of new random outcomes for already-seeded days.
        rng = random.Random(f"{routine.id}:{day.isoformat()}")
        scheduled_local = datetime.combine(day, routine.time_of_day, tzinfo=zone)
        scheduled_utc = scheduled_local.astimezone(UTC)
        # Only occurrences that already passed today; future ones belong to the
        # live materializer so the demo shows real pending CallTasks.
        if scheduled_utc > datetime.now(UTC):
            continue
        created += _seed_occurrence(
            session,
            routine=routine,
            ward=ward,
            spec=spec,
            medications=medications,
            scheduled_utc=scheduled_utc,
            attempt_no=1,
            rng=rng,
            forced_outcome=None,
        )
    return created


def seed_demo(session: Session) -> int:
    """Seed demo caregivers' data: 2 wards, 4 approved routines and one week of
    call-result history (docs/01-mvp-scope.md demo checklist). Idempotent."""
    caregiver = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if caregiver is None:
        logger.warning("Demo seed skipped: first superuser not found yet")
        return 0

    created_routines = 0
    created_calls = 0
    for ward_spec in DEMO_WARDS:
        ward = session.exec(
            select(Ward).where(
                Ward.caregiver_id == caregiver.id,
                Ward.phone_e164 == ward_spec["phone_e164"],
            )
        ).first()
        if ward is None:
            ward = Ward(
                full_name=ward_spec["full_name"],
                phone_e164=ward_spec["phone_e164"],
                caregiver_id=caregiver.id,
            )
            session.add(ward)
            session.flush()

        for routine_spec in ward_spec["routines"]:
            hour, minute = (int(part) for part in routine_spec["time_of_day"].split(":"))
            routine = session.exec(
                select(Routine).where(
                    Routine.ward_id == ward.id,
                    Routine.name == routine_spec["name"],
                    Routine.time_of_day == time(hour, minute),
                )
            ).first()
            if routine is None:
                routine = Routine(
                    name=routine_spec["name"],
                    time_of_day=time(hour, minute),
                    ward_id=ward.id,
                    status=routine_spec.get("status", "approved"),
                )
                session.add(routine)
                session.flush()
                for name, _dosage, amount in routine_spec["medications"]:
                    session.add(
                        RoutineItem(
                            routine_id=routine.id,
                            medication_id=_get_medication(session, name, _dosage).id,
                            amount_label=amount,
                        )
                    )
                created_routines += 1

            # History always reads items back from the DB so re-seeding an
            # existing routine keeps the original medications.
            item_rows = session.exec(
                select(RoutineItem).where(RoutineItem.routine_id == routine.id)
            ).all()
            med_triplets = [
                (
                    session.get(Medication, item.medication_id).name,
                    session.get(Medication, item.medication_id).dosage,
                    item.amount_label,
                )
                for item in item_rows
            ]
            # Only approved routines have call history — a draft (szkic) has
            # never been called, and only approved ones are materialized.
            if routine.status == "approved":
                created_calls += _seed_demo_history(
                    session, routine, ward, ward_spec, med_triplets
                )

    session.commit()
    logger.info(
        "Demo seed: %d new routine(s), %d new call(s) with results",
        created_routines,
        created_calls,
    )
    return created_routines
