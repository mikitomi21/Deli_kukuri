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

# Beat wg docs/07: dispatcher co 60 s, materializer co 30 min. Na start taski
# tylko logują „tick"; realne implementacje trafią do app/worker/dispatcher.py
# i materializer.py (docs/02-architecture.md).
celery_app.conf.beat_schedule = {
    "dispatcher-every-60s": {
        "task": "app.worker.tasks.dispatcher_tick",
        "schedule": 60.0,
    },
    "materializer-every-30min": {
        "task": "app.worker.tasks.materializer_tick",
        "schedule": 1800.0,
    },
}
