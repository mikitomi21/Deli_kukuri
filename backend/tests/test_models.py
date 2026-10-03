"""Model-level validation tests for fields with no dedicated create API
(medication dosage is seed-fed, so only the model constraint is testable)."""

import pytest
from pydantic import ValidationError

from app.models import MedicationBase, RoutineItemCreate


@pytest.mark.parametrize(
    ("dosage", "valid"),
    [
        ("5 mg", True),
        ("850 mg", True),
        ("12,5 mg", True),
        ("0,5 ml", True),
        ("5", True),
        ("160/4,5 µg", True),
        ("-5 mg", False),
        ("-1", False),
        ("mg", False),
        ("", False),
    ],
)
def test_medication_dosage_must_be_non_negative(dosage: str, valid: bool) -> None:
    data = {"name": "Warfarin", "dosage": dosage}
    if valid:
        assert MedicationBase.model_validate(data).dosage == dosage.strip()
    else:
        with pytest.raises(ValidationError):
            MedicationBase.model_validate(data)


@pytest.mark.parametrize(
    ("amount", "valid"),
    [
        ("1", True),
        ("0,5", True),
        ("1.5", True),
        ("-1", False),
        ("jedna tabletka", False),
        ("1 tabletka", False),
        ("   ", False),
    ],
)
def test_routine_item_amount_must_be_numeric(amount: str, valid: bool) -> None:
    data = {"medication_id": "00000000-0000-0000-0000-000000000000", "amount_label": amount}
    if valid:
        assert RoutineItemCreate.model_validate(data).amount_label == amount.strip()
    else:
        with pytest.raises(ValidationError):
            RoutineItemCreate.model_validate(data)
