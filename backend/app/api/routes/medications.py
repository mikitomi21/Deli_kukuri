import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import (
    Medication,
    MedicationPublic,
    MedicationsPublic,
    MedicationUpdate,
    Message,
)

# Katalog globalny: odczyt dla zalogowanych, zmiany tylko dla admina (docs/05).
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


@router.patch(
    "/{id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=MedicationPublic,
)
def update_medication(
    session: SessionDep,
    id: uuid.UUID,
    medication_in: MedicationUpdate,
    _current_user: CurrentUser,
) -> Any:
    """
    Update a medication (superuser only).
    """
    medication = session.get(Medication, id)
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found")

    update_data = medication_in.model_dump(exclude_unset=True)
    if "name" in update_data or "dosage" in update_data:
        new_name = update_data.get("name", medication.name)
        new_dosage = update_data.get("dosage", medication.dosage)
        duplicate = session.exec(
            select(Medication).where(
                Medication.name == new_name,
                Medication.dosage == new_dosage,
                Medication.id != id,
            )
        ).first()
        if duplicate:
            raise HTTPException(
                status_code=409,
                detail="A medication with this name and dosage already exists",
            )

    medication.sqlmodel_update(update_data)
    session.add(medication)
    session.commit()
    session.refresh(medication)
    return medication


@router.delete(
    "/{id}",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=Message,
)
def delete_medication(
    session: SessionDep, id: uuid.UUID, _current_user: CurrentUser
) -> Message:
    """
    Delete a medication from the catalog (superuser only).
    """
    medication = session.get(Medication, id)
    if not medication:
        raise HTTPException(status_code=404, detail="Medication not found")

    session.delete(medication)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail="Medication is referenced by routine items and cannot be deleted",
        )
    return Message(message="Medication deleted successfully")
