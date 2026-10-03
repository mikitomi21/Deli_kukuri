import logging

from app.worker.celery_app import celery_app
from app.worker.placing import place_task_call, voice_provider_ready
from app.worker.scheduling import claim_due_call_tasks, materialize_call_tasks

logger = logging.getLogger(__name__)


@celery_app.task(name="app.worker.tasks.hello_world")
def hello_world() -> str:
    """Task testowy — weryfikacja .delay() (kryterium Done w T03)."""
    logger.info("Hello World from Celery Beat! 🌽")
    return "Hello World from Celery Beat!"


@celery_app.task(name="app.worker.tasks.dispatcher_tick")
def dispatcher_tick() -> None:
    """Claim due call tasks once and enqueue provider calls."""
    if not voice_provider_ready():
        logger.info("Voice provider is unavailable; pending calls remain queued")
        return
    for task_id in claim_due_call_tasks():
        place_call.delay(task_id)


@celery_app.task(name="app.worker.tasks.materializer_tick")
def materializer_tick() -> None:
    """Materialize approved daily routines into call tasks."""
    created = materialize_call_tasks()
    logger.info("Materialized %s call task(s)", created)


@celery_app.task(name="app.worker.tasks.place_call")
def place_call(call_task_id: str) -> None:
    """Dial the ward using the shared voice gateway."""
    place_task_call(call_task_id)
