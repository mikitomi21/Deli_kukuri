import json
import logging
from pathlib import Path

from sqlmodel import Session, select

from app.core.db import engine, init_db
from app.models import Medication

logger = logging.getLogger(__name__)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def seed_medications(session: Session) -> int:
    """Ładuje katalog leków z fixtures/medicines.json do bazy (idempotentnie).

    Katalog jest globalny i read-only w MVP — seed to jedyne źródło danych
    (docs/03-data-model.md, Medication).
    """
    medicines: list[dict] = json.loads(
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
