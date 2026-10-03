import uuid
from datetime import UTC, datetime, time
from typing import Annotated

from pydantic import AliasChoices, EmailStr, StringConstraints
from sqlalchemy import DateTime, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(SQLModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    is_superuser: bool | None = None
    full_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    items: list[Item] = Relationship(back_populates="owner", cascade_delete=True)
    wards: list[Ward] = Relationship(back_populates="caregiver", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(SQLModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Katalog globalny, współdzielony przez opiekunów; odczyt dla wszystkich,
# zmiany tylko dla admina (seed + CRUD w admin panelu — docs/03-data-model.md).
class MedicationBase(SQLModel):
    name: str = Field(index=True, min_length=1, max_length=255)
    dosage: str = Field(min_length=1, max_length=100)
    form: str | None = Field(default=None, max_length=100)
    instructions: str | None = Field(default=None, max_length=255)


class MedicationCreate(MedicationBase):
    pass


class MedicationUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    dosage: str | None = Field(default=None, min_length=1, max_length=100)
    form: str | None = Field(default=None, max_length=100)
    instructions: str | None = Field(default=None, max_length=255)


# Database model, database table inferred from class name
class Medication(MedicationBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )

    __table_args__ = (UniqueConstraint("name", "dosage"),)


# Properties to return via API, id is always required
class MedicationPublic(MedicationBase):
    id: uuid.UUID
    created_at: datetime | None = None


class MedicationsPublic(SQLModel):
    data: list[MedicationPublic]
    count: int


# E.164: "+" + country code + number, np. +48600100200 (docs/03-data-model.md, Ward)
# (Annotated zamiast Field(regex=) — regex= w SQLModel 0.0.39 jest ignorowany)
PHONE_E164_PATTERN = r"^\+[1-9]\d{6,14}$"
E164Phone = Annotated[str, StringConstraints(pattern=PHONE_E164_PATTERN, max_length=16)]


# Shared properties
class WardBase(SQLModel):
    full_name: str = Field(min_length=1, max_length=255)
    phone_e164: E164Phone
    tz: str = Field(default="Europe/Warsaw", max_length=64)


# Properties to receive via API on creation
class WardCreate(WardBase):
    pass


# Properties to receive via API on update, all are optional
class WardUpdate(SQLModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone_e164: E164Phone | None = None
    tz: str | None = Field(default=None, max_length=64)


# Database model, database table inferred from class name
class Ward(WardBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    active: bool = True
    caregiver_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    caregiver: User | None = Relationship(back_populates="wards")


# Properties to return via API, id is always required
class WardPublic(WardBase):
    id: uuid.UUID
    active: bool
    caregiver_id: uuid.UUID
    created_at: datetime | None = None


class WardsPublic(SQLModel):
    data: list[WardPublic]
    count: int


# Rutyny — status bramkuje schedulowanie: materializer planuje tylko `approved`
# (docs/03-data-model.md, docs/04-user-stories.md C2–C4).
# MVP: "daily"; zarezerwowany format tygodniowy "MO,TU,..." (post-MVP).
DAYS_MASK_PATTERN = r"^daily$|^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU)){0,6}$"
DaysMask = Annotated[str, StringConstraints(pattern=DAYS_MASK_PATTERN, max_length=64)]


class RoutineBase(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    time_of_day: time
    # W API pole nazywa się `days` (docs/05); kolumna zostaje `days_mask` (docs/03).
    # Dyrektywa niżej: SQLModel.Field nie typuje validation_alias/serialization_alias
    days_mask: DaysMask = Field(  # type: ignore
        default="daily",
        validation_alias=AliasChoices("days", "days_mask"),
        serialization_alias="days",
    )


class RoutineItemCreate(SQLModel):
    medication_id: uuid.UUID
    amount_label: str = Field(min_length=1, max_length=255)


# Properties to receive via API on creation: items + dependencies w jednym payloadzie
class RoutineCreate(RoutineBase):
    items: list[RoutineItemCreate] = []
    depends_on: list[uuid.UUID] = []


# Properties to receive via API on update, all are optional.
# Edycja (nawet pauzowanej) cofa status do `draft` — obsługa w routingu (C4, D10).
class RoutineUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    time_of_day: time | None = None
    days_mask: DaysMask | None = Field(  # type: ignore
        default=None,
        validation_alias=AliasChoices("days", "days_mask"),
        serialization_alias="days",
    )
    items: list[RoutineItemCreate] | None = None
    depends_on: list[uuid.UUID] | None = None


# Database model, database table inferred from class name
class Routine(RoutineBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: str = Field(default="draft", max_length=32)
    ward_id: uuid.UUID = Field(
        foreign_key="ward.id", nullable=False, ondelete="CASCADE", index=True
    )
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),
    )
    items: list[RoutineItem] = Relationship(cascade_delete=True)


class RoutineItem(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    routine_id: uuid.UUID = Field(
        foreign_key="routine.id", nullable=False, ondelete="CASCADE", index=True
    )
    medication_id: uuid.UUID = Field(foreign_key="medication.id", nullable=False)
    amount_label: str = Field(min_length=1, max_length=255)
    medication: Medication | None = Relationship()


# `dependent_routine` wymaga `prerequisite_routine` — walidacja przy approve,
# runtime enforcement podczas rozmowy = post-MVP (docs/03-data-model.md).
class RoutineDependency(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    dependent_routine_id: uuid.UUID = Field(
        foreign_key="routine.id", nullable=False, ondelete="CASCADE", index=True
    )
    prerequisite_routine_id: uuid.UUID = Field(
        foreign_key="routine.id", nullable=False, ondelete="CASCADE", index=True
    )

    __table_args__ = (
        UniqueConstraint(
            "dependent_routine_id",
            "prerequisite_routine_id",
            name="uq_routine_dependency",
        ),
    )


class RoutineItemPublic(SQLModel):
    id: uuid.UUID
    medication_id: uuid.UUID
    amount_label: str
    medication: MedicationPublic | None = None


# Zależność w odpowiedzi: id, nazwa i status wymaganej rutyny
# (chip „wymaga: Rano 9:00" w kreatorze, docs/04-user-stories.md C3)
class RoutineDependencyPublic(SQLModel):
    id: uuid.UUID
    name: str
    status: str


class RoutinePublic(RoutineBase):
    id: uuid.UUID
    ward_id: uuid.UUID
    status: str
    items: list[RoutineItemPublic] = []
    depends_on: list[RoutineDependencyPublic] = []
    created_at: datetime | None = None


class RoutinesPublic(SQLModel):
    data: list[RoutinePublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)
