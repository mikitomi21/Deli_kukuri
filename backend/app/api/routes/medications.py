import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Medication, MedicationPublic, MedicationsPublic

# Katalog globalny i read-only w MVP — zasilany wyłącznie seedem (docs/05).
router = APIRouter(prefix="/medications", tags=["medications"])


@router.get("/", response_model=MedicationsPublic)
def read_medications(
    session: SessionDep,
    _current_user: CurrentUser,
    q: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Search the shared medication catalog; `q` filters by name (ILIKE).
    """
    statement = select(Medication)
    count_statement = select(func.count()).select_from(Medication)
    if q:
        pattern = f"%{q}%"
        statement = statement.where(col(Medication.name).ilike(pattern))
        count_statement = count_statement.where(col(Medication.name).ilike(pattern))
    count = session.exec(count_statement).one()
    medications = session.exec(
        statement.order_by(col(Medication.name)).offset(skip).limit(limit)
    ).all()
    return MedicationsPublic(
        data=[
            MedicationPublic.model_validate(medication) for medication in medications
        ],
        count=count,
    )


@router.get("/{id}", response_model=MedicationPublic)
def read_medication(
    session: SessionDep, _current_user: CurrentUser, id: uuid.UUID
) -> Any:
    """
    Get medication by ID.
    """
    medication = session.get(Medication, id)
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found")
    return medication
