import os

from celery import Celery, Task
from celery.schedules import crontab
from flask import has_app_context

from backend.config import INSTANCE_DIR, Config

_flask_app = None


def get_flask_app():
    global _flask_app
    if _flask_app is None:
        from backend.app import create_app

        _flask_app = create_app()
    return _flask_app


class FlaskTask(Task):

    abstract = True

    def __call__(self, *args, **kwargs):
        if has_app_context():
            return super().__call__(*args, **kwargs)
        with get_flask_app().app_context():
            return super().__call__(*args, **kwargs)


celery = Celery(
    "tma",
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND,
    include=["backend.jobs.tasks"],
    task_cls=FlaskTask,
)

celery.conf.update(
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=60 * 60 * 24,  # keep export results for a day
    broker_connection_retry_on_startup=True,
    beat_schedule_filename=os.path.join(INSTANCE_DIR, "celerybeat-schedule"),  # keep beat state out of the root
    beat_schedule={
        "daily-trek-reminders": {
            "task": "backend.jobs.tasks.send_daily_reminders",
            "schedule": crontab(hour=8, minute=0),  # every day 08:00 IST
        },
        "monthly-admin-report": {
            "task": "backend.jobs.tasks.send_monthly_report",
            "schedule": crontab(minute=0, hour=9, day_of_month=1),  # 1st of month 09:00 IST
        },
        "daily-export-cleanup": {
            "task": "backend.jobs.tasks.cleanup_old_exports",
            "schedule": crontab(hour=2, minute=30),  # every day 02:30 IST
        },
    },
)
