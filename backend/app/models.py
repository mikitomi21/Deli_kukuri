import uuid
from datetime import UTC, datetime, time
from typing import Annotated, Any

from pydantic import AliasChoices, EmailStr, StringConstraints
from sqlalchemy import JSON, CheckConstraint, DateTime, Index, UniqueConstraint, func
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(UTC)


def get_call_max_attempts() -> int:
    from app.core.config import settings

    return settings.CALL_MAX_ATTEMPTS


class TimestampedModel(SQLModel):
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now()},
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),
        sa_column_kwargs={"server_default": func.now(), "onupdate": get_datetime_utc},
    )


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
class User(UserBase, TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
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
class Item(ItemBase, TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
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
class Medication(MedicationBase, TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

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
class Ward(WardBase, TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
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
class Routine(RoutineBase, TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: str = Field(default="draft", max_length=32)
    ward_id: uuid.UUID = Field(
        foreign_key="ward.id", nullable=False, ondelete="CASCADE", index=True
    )
    items: list[RoutineItem] = Relationship(cascade_delete=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'approved', 'paused')", name="ck_routine_status"
        ),
    )


class RoutineItem(TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    routine_id: uuid.UUID = Field(
        foreign_key="routine.id", nullable=False, ondelete="CASCADE", index=True
    )
    medication_id: uuid.UUID = Field(foreign_key="medication.id", nullable=False)
    amount_label: str = Field(min_length=1, max_length=255)
    medication: Medication | None = Relationship()


# `dependent_routine` wymaga `prerequisite_routine` — walidacja przy approve,
# runtime enforcement podczas rozmowy = post-MVP (docs/03-data-model.md).
class RoutineDependency(TimestampedModel, table=True):
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


class CallTaskStatus:
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CallTask(TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    routine_id: uuid.UUID = Field(
        foreign_key="routine.id", nullable=False, ondelete="CASCADE", index=True
    )

    scheduled_at: datetime = Field(sa_type=DateTime(timezone=True))
    attempt_no: int = Field(default=1, ge=1)
    max_attempts: int = Field(default_factory=get_call_max_attempts, ge=1)
    status: str = Field(default=CallTaskStatus.PENDING, max_length=32)

    __table_args__ = (
        Index("ix_calltask_status_scheduled_at", "status", "scheduled_at"),
        UniqueConstraint(
            "routine_id", "scheduled_at", "attempt_no", name="uq_calltask_occurrence"
        ),
        CheckConstraint(
            "attempt_no >= 1 AND max_attempts >= attempt_no",
            name="ck_calltask_attempts",
        ),
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')",
            name="ck_calltask_status",
        ),
    )


class CallTaskPublic(SQLModel):
    id: uuid.UUID
    routine_id: uuid.UUID
    scheduled_at: datetime
    attempt_no: int
    max_attempts: int
    status: str
    created_at: datetime | None = None


class CallTasksPublic(SQLModel):
    data: list[CallTaskPublic]
    count: int


class CallResultPublic(SQLModel):
    outcome: str
    confidence: float
    transcript_full: str
    notes: str | None = None


class CallTurnPublic(SQLModel):
    turn_no: int
    question: str
    speech_result: str
    confidence: float
    parsed: str


class CallPublic(SQLModel):
    id: uuid.UUID
    ward_id: uuid.UUID
    call_task_id: uuid.UUID
    routine_id: uuid.UUID
    routine: dict[str, str]
    status: str
    started_at: datetime
    duration_sec: int
    attempt_no: int
    result: CallResultPublic | None = None
    turns: list[CallTurnPublic] = []


class CallsPublic(SQLModel):
    data: list[CallPublic]
    count: int


class DailyStats(SQLModel):
    took: int
    total: int


class WardStatsPublic(SQLModel):
    today: DailyStats
    week_pct: int


class CallStatus:
    QUEUED = "queued"
    RINGING = "ringing"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"
    BUSY = "busy"
    FAILED = "failed"
    NO_ANSWER = "no-answer"
    CANCELED = "canceled"


class Call(TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    call_task_id: uuid.UUID = Field(
        foreign_key="calltask.id", nullable=False, ondelete="CASCADE", unique=True
    )
    twilio_call_sid: str | None = Field(default=None, max_length=64, unique=True)
    status: str = Field(default=CallStatus.IN_PROGRESS, max_length=32)
    duration_sec: int = Field(default=0, ge=0)
    recording_url: str | None = Field(default=None, max_length=2048)

    __table_args__ = (
        CheckConstraint("duration_sec >= 0", name="ck_call_duration"),
        CheckConstraint(
            "status IN ('queued', 'ringing', 'in-progress', 'completed', "
            "'busy', 'failed', 'no-answer', 'canceled')",
            name="ck_call_status",
        ),
    )


class CallTurn(TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    call_id: uuid.UUID = Field(
        foreign_key="call.id", nullable=False, ondelete="CASCADE", index=True
    )
    turn_no: int = Field(ge=1)
    question: str
    speech_result: str = ""
    confidence: float = Field(default=0.0, ge=0, le=1)
    parsed: str = Field(default="unclear", max_length=16)

    __table_args__ = (
        UniqueConstraint("call_id", "turn_no", name="uq_callturn_number"),
        CheckConstraint("turn_no >= 1", name="ck_callturn_number"),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_callturn_confidence"),
        CheckConstraint(
            "parsed IN ('yes', 'no', 'unclear')", name="ck_callturn_parsed"
        ),
    )


class CallOutcome:
    TOOK = "took"
    NOT_TAKEN = "not_taken"
    UNCLEAR = "unclear"
    NO_ANSWER = "no_answer"


class CallResult(TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    call_id: uuid.UUID = Field(
        foreign_key="call.id", nullable=False, ondelete="CASCADE", unique=True
    )
    outcome: str = Field(max_length=32)
    confidence: float = Field(default=0.0, ge=0, le=1)
    transcript_full: str = ""
    notes: str | None = None

    __table_args__ = (
        CheckConstraint(
            "outcome IN ('took', 'not_taken', 'unclear', 'no_answer')",
            name="ck_callresult_outcome",
        ),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_callresult_confidence"),
    )


class EscalationEvent(TimestampedModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    call_result_id: uuid.UUID = Field(
        foreign_key="callresult.id", nullable=False, ondelete="CASCADE", index=True
    )
    caregiver_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE", index=True
    )
    channel: str = Field(default="email", max_length=16)
    payload: dict[str, Any] = Field(default_factory=dict, sa_type=JSON)
    status: str = Field(default="pending", max_length=16)

    __table_args__ = (
        CheckConstraint(
            "channel IN ('email', 'sms')", name="ck_escalationevent_channel"
        ),
        CheckConstraint(
            "status IN ('pending', 'sent', 'failed')", name="ck_escalationevent_status"
        ),
    )


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
