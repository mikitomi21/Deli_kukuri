import logging

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.worker.tasks.hello_world")
def hello_world() -> str:
    """Task testowy — weryfikacja .delay() (kryterium Done w T03)."""
    logger.info("Hello World from Celery Beat! 🌽")
    return "Hello World from Celery Beat!"


@celery_app.task(name="app.worker.tasks.dispatcher_tick")
def dispatcher_tick() -> None:
    """Placeholder — docelowo skan CallTask due (docs/07, sekcja Dispatcher)."""
    logger.info("dispatcher tick")


@celery_app.task(name="app.worker.tasks.materializer_tick")
def materializer_tick() -> None:
    """Placeholder — docelowo rutyny → CallTask (docs/07, sekcja Materializer)."""
    logger.info("materializer tick")
