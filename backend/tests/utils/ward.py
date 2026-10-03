from sqlmodel import Session

from app.models import Ward, WardCreate
from tests.utils.user import create_random_user
from tests.utils.utils import random_lower_string


def create_random_ward(db: Session) -> Ward:
    user = create_random_user(db)
    caregiver_id = user.id
    assert caregiver_id is not None
    ward_in = WardCreate(
        full_name=random_lower_string(),
        phone_e164="+48600100200",
        tz="Europe/Warsaw",
    )
    ward = Ward.model_validate(ward_in, update={"caregiver_id": caregiver_id})
    db.add(ward)
    db.commit()
    db.refresh(ward)
    return ward
