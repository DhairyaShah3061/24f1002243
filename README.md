# Summit Lovers: Trekking Management Application (TMA)

A web app for a trekking company. Admins plan and approve treks and manage staff, staff run the treks they are assigned, and trekkers browse, book, pay for and track their treks.

Built with a Flask REST API, SQLite, a Vue 3 single-page frontend, Redis caching and Celery background jobs.

## Features

**Trekkers**
- Register, log in (with "remember me") and edit their profile
- Browse treks with search and filters for difficulty, location and duration, with pagination
- Trek pages with a packing list, difficulty note and reporting instructions
- Book a seat (no overbooking, one active booking per trek), pay (simulated), cancel, and see booking history
- Export booking history as a CSV that is emailed to them

**Staff**
- See only the treks assigned to them
- Open or close bookings, change free seats, view and remove participants
- Mark a trek as started and as completed (which completes its active bookings)

**Admin**
- Create, edit, approve, delete and assign treks
- Create and manage staff accounts, blacklist or whitelist staff and trekkers
- Dashboard, bookings list and reports with charts (popular treks, monthly participation)

**Automatic jobs (Celery Beat, India time)**
- 08:00 daily: reminder emails for treks starting within 3 days
- 09:00 on the 1st: monthly report email to the admin
- 02:30 daily: delete old CSV exports

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Flask 3.1, Flask-SQLAlchemy / SQLAlchemy 2.0, PyJWT, python-dotenv |
| Database | SQLite (`backend/instance/tma.db`) |
| Cache and queue | Redis |
| Background jobs | Celery worker and Celery Beat |
| Frontend | Vue 3, Vue Router 4, Bootstrap 5, Chart.js (all loaded from CDNs, no build step) |
| Email | SMTP (`smtplib`) |

## Requirements

- Python 3 (developed with 3.13)
- A Redis server (used for the cache and as the Celery broker)
- An SMTP account for real emails (optional; without one, mail goes to a local debug server on port 1025)
- An internet connection when the page loads, because Vue, Bootstrap and Chart.js come from CDNs

## Setup

Run all commands from the project root (the folder that contains `backend/` and `frontend/`).

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r backend/requirements.txt
```

### Configuration

Settings are read from `backend/.env` (never committed to git). All of them have defaults in `backend/config.py`, so the app starts without a `.env` file. For anything beyond local development, set at least:

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | Secret used to sign login tokens. Use a long random value |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | The first admin account, created on first start if no admin exists |
| `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USE_TLS`, `MAIL_USE_SSL` | SMTP connection |
| `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SENDER` | SMTP login and sender (Gmail and Microsoft need an app password) |
| `MAIL_REPORT_TO` | Monthly report recipient (defaults to the admin's email) |

Other optional settings: `DATABASE_URL`, `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, `CACHE_ENABLED`, `TOKEN_HOURS`, `REMEMBER_ME_DAYS`, `REMINDER_DAYS_AHEAD`, `EXPORT_DIR`, `EXPORT_RETENTION_DAYS`.

To check your mail settings:

```bash
python -m backend.scripts.send_test_email you@example.com
```

## Run

**One command** (starts Redis if it is not already running, the Flask server, a Celery worker and Celery Beat):

```bash
python start.py
```

The launcher looks for `redis-server` in the folder named by the `REDIS_HOME` environment variable, then on your PATH. Press Ctrl+C to stop everything.

**Or run each part in its own terminal:**

```bash
redis-server
python -m backend.app
celery -A backend.jobs.celery_app worker -l info -P solo
celery -A backend.jobs.celery_app beat -l info
```

Then open http://127.0.0.1:5000 and log in with the admin account from your configuration. Trekkers can register themselves. Staff accounts are created by the admin.

If Redis is not running, the site still works (without caching), but CSV export and the scheduled jobs will not.

## API overview

All endpoints return JSON: `{"data": ..., "message": "..."}` on success and `{"error": "..."}` on failure. Protected endpoints need the header `Authorization: Bearer <token>`, which `POST /api/login` returns.

| Prefix | Who can use it | What it covers |
| --- | --- | --- |
| `/api/register`, `/api/login`, `/api/logout` | Anyone | Accounts and tokens |
| `/api/treks` | Anyone | Browse treks, locations and trek details (cached) |
| `/api/bookings` | Trekkers | Book, list, cancel and pay for bookings |
| `/api/export` | Trekkers | Start a CSV export and check its status |
| `/api/profile` | Any logged-in user | View and update your profile |
| `/api/staff` | Staff | Assigned treks, participant list, start and complete |
| `/api/admin` | Admin | Treks, staff, trekkers, bookings, stats and reports |

## Project structure

```
start.py                 One-command launcher
backend/
  app.py                 Flask app factory, pages and error handlers
  config.py              Settings (reads backend/.env)
  auth.py                Register, login, JWT and the roles_required guard
  cache.py               Redis cache helpers (fail open if Redis is down)
  serializers.py         Database objects to JSON
  utils.py               Shared helpers: responses, parsing, pagination
  models/                User, StaffProfile, Trek, Booking, ReminderLog
  routes/                API endpoints: admin, staff, treks, bookings, profile, exports
  services/              Business rules, statistics, trek guide, email sending
  jobs/                  Celery app, tasks and the Beat schedule
  scripts/               Test email and cache timing scripts
  templates/index.html   The single HTML page that loads the Vue app
  instance/              Created at runtime: the SQLite database and Celery schedule files
frontend/
  src/                   Vue app: api.js, store.js, router.js, components/, views/, css/, assets/
  sw.js, manifest.webmanifest   Make the app installable (PWA)
```

## Notes

- Payment is a simulation: it only marks a booking as paid, and no money moves.
- Deleting a trek that has bookings is refused, so booking history is kept. Close the trek instead.
- Blacklisted accounts are rejected on every request, even with a valid token.
