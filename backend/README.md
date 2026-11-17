# Summit Lovers (TMA)

All commands run from the project root (the folder that contains `backend/` and `frontend/`).

```
backend/    Flask API, SQLite (instance/), Redis cache, Celery jobs, tests, scripts
frontend/   Vue 3 + Bootstrap UI (src/), served by Flask at /static
```

## Run
    pip install -r backend/requirements.txt
    python -m backend.app                        # http://127.0.0.1:5000
    celery -A backend.jobs.celery_app worker -l info -P solo
    celery -A backend.jobs.celery_app beat -l info

## Real emails
1. Copy `backend/.env.example` to `backend/.env` and fill in the `MAIL_*` values
   (Gmail/Workspace needs an App Password).
2. Check it: `python -m backend.scripts.send_test_email you@example.com`
3. The Celery jobs (daily reminders, monthly report, export-ready mail) then send through the same SMTP account.

## Tests
    python -m unittest discover -s backend/tests -t . -v
