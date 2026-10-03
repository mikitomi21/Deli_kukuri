import argparse
import getpass
import logging

from sqlmodel import Session, select

from app import crud
from app.core.db import engine
from app.core.security import get_password_hash
from app.models import User, UserCreate

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def upsert_admin(email: str, password: str, superuser: bool = True) -> None:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if user:
            user.hashed_password = get_password_hash(password)
            user.is_superuser = superuser
            user.is_active = True
            session.add(user)
            session.commit()
            session.refresh(user)
            logger.info("Zaktualizowano istniejacego uzytkownika: %s", email)
        else:
            user_in = UserCreate(
                email=email, password=password, is_superuser=superuser
            )
            crud.create_user(session=session, user_create=user_in)
            logger.info("Utworzono nowego uzytkownika: %s", email)


def main() -> None:
    parser = argparse.ArgumentParser(description="Tworzy/resetuje uzytkownika (admina).")
    parser.add_argument("--email", required=True, help="adres e-mail")
    parser.add_argument("--password", help="haslo (bez tej opcji zapyta interaktywnie)")
    parser.add_argument(
        "--no-superuser", action="store_true", help="zwykly uzytkownik zamiast admina"
    )
    args = parser.parse_args()

    password = args.password or getpass.getpass("Haslo (min. 8 znakow): ")
    if len(password) < 8:
        raise SystemExit("Haslo musi miec min. 8 znakow")

    upsert_admin(email=args.email, password=password, superuser=not args.no_superuser)


if __name__ == "__main__":
    main()
