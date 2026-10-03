from datetime import time

from sqlmodel import Session

from app.models import Medication, Routine, RoutineDependency, RoutineItem, Ward
from tests.utils.utils import random_lower_string

# Prefiks nazw leków tworzonych przez testy — po nich conftest sprząta bazę,
# żeby sztuczne leki nie zawyżały katalogu (patrz test_read_medications_seeded_catalog)
TEST_MEDICATION_PREFIX = "TestLek-"


def create_random_medication(db: Session) -> Medication:
    medication = Medication(
        name=f"{TEST_MEDICATION_PREFIX}{random_lower_string()}",
        dosage="5 mg",
        form="tabletki powlekane",
    )
    db.add(medication)
    db.commit()
    db.refresh(medication)
    return medication


def create_random_routine(
    db: Session,
    *,
    ward: Ward,
    name: str | None = None,
    time_of_day: time = time(9, 0),
    status: str = "draft",
    medications: list[Medication] | None = None,
) -> Routine:
    if medications is None:
        medications = [create_random_medication(db)]
    routine = Routine(
        name=name or f"Rutyna {random_lower_string()}",
        time_of_day=time_of_day,
        ward_id=ward.id,
        status=status,
    )
    db.add(routine)
    db.flush()
    for medication in medications:
        db.add(
            RoutineItem(
                routine_id=routine.id,
                medication_id=medication.id,
                amount_label="1 tabletka",
            )
        )
    db.commit()
    db.refresh(routine)
    return routine


def link_routines(db: Session, *, dependent: Routine, prerequisite: Routine) -> None:
    db.add(
        RoutineDependency(
            dependent_routine_id=dependent.id,
            prerequisite_routine_id=prerequisite.id,
        )
    )
    db.commit()
