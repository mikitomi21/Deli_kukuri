import logging

from app.worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.worker.tasks.hello_world")
def hello_world() -> str:
    logger.info("Hello World from Celery Beat! 🌽")
    return "Hello World from Celery Beat!"
