import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Message,
    Ward,
    WardCreate,
    WardPublic,
    WardsPublic,
    WardUpdate,
)

router = APIRouter(prefix="/wards", tags=["wards"])


@router.get("/", response_model=WardsPublic)
def read_wards(
    session: SessionDep, current_user: CurrentUser, skip: int = 0, limit: int = 100
) -> Any:
    """
    Retrieve wards of the current caregiver.
    """
    count_statement = (
        select(func.count())
        .select_from(Ward)
        .where(Ward.caregiver_id == current_user.id)
    )
    count = session.exec(count_statement).one()
    statement = (
        select(Ward)
        .where(Ward.caregiver_id == current_user.id)
        .order_by(col(Ward.created_at).desc())
        .offset(skip)
        .limit(limit)
    )
    wards = session.exec(statement).all()
    return WardsPublic(
        data=[WardPublic.model_validate(ward) for ward in wards], count=count
    )


@router.get("/{id}", response_model=WardPublic)
def read_ward(session: SessionDep, current_user: CurrentUser, id: uuid.UUID) -> Any:
    """
    Get ward by ID.
    """
    ward = session.get(Ward, id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        # Obcy podopieczny = 404, nie ujawniamy istnienia cudzych zasobów (docs/05)
        raise HTTPException(status_code=404, detail="Ward not found")
    return ward


@router.post("/", response_model=WardPublic)
def create_ward(
    *, session: SessionDep, current_user: CurrentUser, ward_in: WardCreate
) -> Any:
    """
    Create new ward (podopieczny) owned by the current caregiver.
    """
    ward = Ward.model_validate(ward_in, update={"caregiver_id": current_user.id})
    session.add(ward)
    session.commit()
    session.refresh(ward)
    return ward


@router.patch("/{id}", response_model=WardPublic)
def update_ward(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    ward_in: WardUpdate,
) -> Any:
    """
    Update a ward.
    """
    ward = session.get(Ward, id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        raise HTTPException(status_code=404, detail="Ward not found")
    update_dict = ward_in.model_dump(exclude_unset=True)
    ward.sqlmodel_update(update_dict)
    session.add(ward)
    session.commit()
    session.refresh(ward)
    return ward


@router.delete("/{id}")
def delete_ward(
    session: SessionDep, current_user: CurrentUser, id: uuid.UUID
) -> Message:
    """
    Deactivate a ward (soft delete): inactive wards are skipped by the materializer.
    """
    ward = session.get(Ward, id)
    if not ward or (
        not current_user.is_superuser and ward.caregiver_id != current_user.id
    ):
        raise HTTPException(status_code=404, detail="Ward not found")
    ward.active = False
    session.add(ward)
    session.commit()
    session.refresh(ward)
    return Message(message="Ward deactivated successfully")
