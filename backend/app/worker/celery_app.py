import os

from celery import Celery

broker_url = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
result_backend = os.getenv("CELERY_RESULT_BACKEND", broker_url)

celery_app = Celery(
    "kukurin",
    broker=broker_url,
    backend=result_backend,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone=os.getenv("CELERY_TIMEZONE", "Europe/Warsaw"),
    enable_utc=True,
)

# Production defaults follow docs/07; isolated integration tests can use shorter intervals.
celery_app.conf.beat_schedule = {
    "dispatcher-every-60s": {
        "task": "app.worker.tasks.dispatcher_tick",
        "schedule": float(os.getenv("CELERY_DISPATCH_INTERVAL_SECONDS", "60")),
    },
    "materializer-every-30min": {
        "task": "app.worker.tasks.materializer_tick",
        "schedule": float(os.getenv("CELERY_MATERIALIZE_INTERVAL_SECONDS", "1800")),
    },
}
