import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, delete, func, select, update

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    CallTask,
    CallTaskStatus,
    Medication,
    MedicationPublic,
    Message,
    Routine,
    RoutineCreate,
    RoutineDependency,
    RoutineDependencyPublic,
    RoutineItem,
    RoutineItemCreate,
    RoutineItemPublic,
    RoutinePublic,
    RoutinesPublic,
    RoutineUpdate,
    Ward,
)
from app.worker.scheduling import materialize_call_tasks

router = APIRouter(tags=["routines"])

# Statusy rutyny — `approved` bramkuje schedulowanie przez materializer (docs/03)
DRAFT = "draft"
APPROVED = "approved"
PAUSED = "paused"


def _get_owned_ward(session: Any, current_user: Any, ward_id: uuid.UUID) -> Any:
    ward = session.get(Ward, ward_id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        # Obcy zasób = 404, nie ujawniamy istnienia cudzych podopiecznych (docs/05)
        raise HTTPException(status_code=404, detail="Ward not found")
    return ward


def _get_owned_routine(session: Any, current_user: Any, routine_id: uuid.UUID) -> Any:
    routine = session.get(Routine, routine_id)
    if not routine:
        raise HTTPException(status_code=404, detail="Routine not found")
    ward = session.get(Ward, routine.ward_id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        raise HTTPException(status_code=404, detail="Routine not found")
    return routine


def _validate_medications(session: Any, items: list[RoutineItemCreate]) -> None:
    medication_ids = {item.medication_id for item in items}
    if not medication_ids:
        return
    found = set(
        session.exec(
            select(Medication.id).where(col(Medication.id).in_(medication_ids))
        ).all()
    )
    if medication_ids - found:
        raise HTTPException(status_code=404, detail="Medication not found")


def _validate_dependencies(
    session: Any,
    ward_id: uuid.UUID,
    dependent_routine_id: uuid.UUID | None,
    prerequisite_ids: list[uuid.UUID],
) -> list[uuid.UUID]:
    """Zwaliduj zależności; zwróć deduplikowaną listę (kolejność zachowana)."""
    unique_ids = list(dict.fromkeys(prerequisite_ids))
    if dependent_routine_id is not None and dependent_routine_id in unique_ids:
        raise HTTPException(status_code=409, detail="Routine cannot depend on itself")
    for prerequisite_id in unique_ids:
        prerequisite = session.get(Routine, prerequisite_id)
        # Rutyna wymagana musi należeć do tego samego podopiecznego;
        # cudza/nieistniejąca = 404 (konwencja z docs/05)
        if prerequisite is None or prerequisite.ward_id != ward_id:
            raise HTTPException(status_code=404, detail="Routine not found")
    return unique_ids


def _replace_items(
    session: Any, routine: Routine, items: list[RoutineItemCreate]
) -> None:
    session.exec(delete(RoutineItem).where(col(RoutineItem.routine_id) == routine.id))
    for item in items:
        session.add(
            RoutineItem(
                routine_id=routine.id,
                medication_id=item.medication_id,
                amount_label=item.amount_label,
            )
        )


def _replace_dependencies(
    session: Any, routine: Routine, prerequisite_ids: list[uuid.UUID]
) -> None:
    session.exec(
        delete(RoutineDependency).where(
            col(RoutineDependency.dependent_routine_id) == routine.id
        )
    )
    for prerequisite_id in dict.fromkeys(prerequisite_ids):
        session.add(
            RoutineDependency(
                dependent_routine_id=routine.id,
                prerequisite_routine_id=prerequisite_id,
            )
        )


def _routine_to_public(session: Any, routine: Routine) -> RoutinePublic:
    items = [
        RoutineItemPublic(
            id=item.id,
            medication_id=item.medication_id,
            amount_label=item.amount_label,
            medication=MedicationPublic.model_validate(item.medication)
            if item.medication
            else None,
        )
        for item in routine.items
    ]
    dependencies = session.exec(
        select(RoutineDependency).where(
            col(RoutineDependency.dependent_routine_id) == routine.id
        )
    ).all()
    depends_on = []
    for dependency in dependencies:
        prerequisite = session.get(Routine, dependency.prerequisite_routine_id)
        if prerequisite:
            depends_on.append(
                RoutineDependencyPublic(
                    id=prerequisite.id,
                    name=prerequisite.name,
                    status=prerequisite.status,
                )
            )
    return RoutinePublic.model_validate(
        routine, update={"items": items, "depends_on": depends_on}
    )


@router.post("/wards/{ward_id}/routines", response_model=RoutinePublic)
def create_routine(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: uuid.UUID,
    routine_in: RoutineCreate,
) -> Any:
    """
    Create a new routine (draft) with items and dependencies in one payload.
    """
    ward = _get_owned_ward(session, current_user, ward_id)
    if not ward.active:
        # Dezaktywowany podopieczny: materializer go pomija — nowych rutyn nie tworzymy
        raise HTTPException(status_code=409, detail="Ward is deactivated")
    _validate_medications(session, routine_in.items)
    prerequisite_ids = _validate_dependencies(
        session, ward_id, None, routine_in.depends_on
    )
    # Konstruktor zamiast model_validate(routine_in): payload zawiera zagnieżdżone
    # items/depends_on, których nie da się mapować na relacje modelu tabeli
    routine = Routine(
        name=routine_in.name,
        time_of_day=routine_in.time_of_day,
        days_mask=routine_in.days_mask,
        ward_id=ward_id,
    )
    session.add(routine)
    session.flush()  # id rutyny potrzebne dla items i dependencies
    for item in routine_in.items:
        session.add(
            RoutineItem(
                routine_id=routine.id,
                medication_id=item.medication_id,
                amount_label=item.amount_label,
            )
        )
    for prerequisite_id in prerequisite_ids:
        session.add(
            RoutineDependency(
                dependent_routine_id=routine.id,
                prerequisite_routine_id=prerequisite_id,
            )
        )
    session.commit()
    session.refresh(routine)
    return _routine_to_public(session, routine)


@router.get("/wards/{ward_id}/routines", response_model=RoutinesPublic)
def read_routines_for_ward(
    session: SessionDep,
    current_user: CurrentUser,
    ward_id: uuid.UUID,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    List routines of a ward, with items, dependencies and status.
    """
    _get_owned_ward(session, current_user, ward_id)
    count_statement = (
        select(func.count()).select_from(Routine).where(Routine.ward_id == ward_id)
    )
    count = session.exec(count_statement).one()
    routines = session.exec(
        select(Routine)
        .where(Routine.ward_id == ward_id)
        .order_by(col(Routine.time_of_day))
        .offset(skip)
        .limit(limit)
    ).all()
    return RoutinesPublic(
        data=[_routine_to_public(session, routine) for routine in routines],
        count=count,
    )


@router.patch("/routines/{id}", response_model=RoutinePublic)
def update_routine(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    routine_in: RoutineUpdate,
) -> Any:
    """
    Update a routine. Editing an approved/paused routine resets it to `draft`
    (changes require re-approval, docs/04-user-stories.md C4).
    """
    routine = _get_owned_routine(session, current_user, id)
    update_dict = routine_in.model_dump(exclude_unset=True)
    if not update_dict:
        return _routine_to_public(session, routine)
    # Jawne null-e opcjonalnych pól = błąd klienta; bez tego NOT NULL wywali się 500
    null_fields = sorted(key for key, value in update_dict.items() if value is None)
    if null_fields:
        raise HTTPException(
            status_code=422,
            detail=f"Fields cannot be null: {', '.join(null_fields)}",
        )
    # Walidacja przed mutacją — błędny payload nie rusza istniejących items/deps
    if "items" in update_dict and routine_in.items is not None:
        _validate_medications(session, routine_in.items)
    if "depends_on" in update_dict and routine_in.depends_on is not None:
        _validate_dependencies(
            session, routine.ward_id, routine.id, routine_in.depends_on
        )
    routine.status = DRAFT
    session.exec(
        update(CallTask)
        .where(
            CallTask.routine_id == routine.id, CallTask.status == CallTaskStatus.PENDING
        )
        .values(status=CallTaskStatus.CANCELLED)
    )
    for field in ("name", "time_of_day", "days_mask"):
        if field in update_dict:
            setattr(routine, field, update_dict[field])
    if "items" in update_dict and routine_in.items is not None:
        _replace_items(session, routine, routine_in.items)
    if "depends_on" in update_dict and routine_in.depends_on is not None:
        _replace_dependencies(session, routine, routine_in.depends_on)
    session.add(routine)
    session.commit()
    session.refresh(routine)
    return _routine_to_public(session, routine)


@router.delete("/routines/{id}")
def delete_routine(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Delete a routine regardless of status. Scheduled call tasks are derived
    from approved routines, so they disappear with the routine automatically.
    """
    routine = _get_owned_routine(session, current_user, id)
    session.exec(delete(Routine).where(col(Routine.id) == routine.id))
    session.commit()
    return Message(message="Routine deleted successfully")


@router.post("/routines/{id}/approve", response_model=RoutinePublic)
def approve_routine(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Approve a routine (gates scheduling). 409 when the routine has no
    medications or a required routine is not approved (docs/05).
    """
    routine = _get_owned_routine(session, current_user, id)
    items_count = session.exec(
        select(func.count())
        .select_from(RoutineItem)
        .where(col(RoutineItem.routine_id) == routine.id)
    ).one()
    if not items_count:
        raise HTTPException(
            status_code=409, detail="Cannot approve a routine without medications"
        )
    dependencies = session.exec(
        select(RoutineDependency).where(
            col(RoutineDependency.dependent_routine_id) == routine.id
        )
    ).all()
    for dependency in dependencies:
        prerequisite = session.get(Routine, dependency.prerequisite_routine_id)
        if prerequisite is None or prerequisite.status != APPROVED:
            name = prerequisite.name if prerequisite else "unknown"
            raise HTTPException(
                status_code=409,
                detail=f"Cannot approve: required routine '{name}' is not approved",
            )
    routine.status = APPROVED
    session.add(routine)
    session.commit()
    session.refresh(routine)
    materialize_call_tasks(routine_id=routine.id)
    return _routine_to_public(session, routine)


@router.post("/routines/{id}/pause", response_model=RoutinePublic)
def pause_routine(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Pause a routine: the materializer skips paused routines (docs/04, C4).
    """
    routine = _get_owned_routine(session, current_user, id)
    if routine.status != APPROVED:
        raise HTTPException(
            status_code=409, detail="Only approved routines can be paused"
        )
    routine.status = PAUSED
    session.exec(
        update(CallTask)
        .where(
            CallTask.routine_id == routine.id, CallTask.status == CallTaskStatus.PENDING
        )
        .values(status=CallTaskStatus.CANCELLED)
    )
    session.add(routine)
    session.commit()
    session.refresh(routine)
    return _routine_to_public(session, routine)
