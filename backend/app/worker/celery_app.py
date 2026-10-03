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
    timezone="UTC",
    enable_utc=True,
)

# Harmonogram beat — slot co minutę wg docs/02-architecture.md; docelowo
# tu wejdzie dispatcher (docs/07-scheduling-escalation.md), materializer co 30 min.
celery_app.conf.beat_schedule = {
    "hello-world-every-minute": {
        "task": "app.worker.tasks.hello_world",
        "schedule": 60.0,
    },
}
