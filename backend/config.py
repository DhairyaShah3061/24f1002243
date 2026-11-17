import os

from dotenv import load_dotenv

BACKEND_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_DIR = os.path.dirname(BACKEND_DIR)
INSTANCE_DIR = os.path.join(BACKEND_DIR, "instance")

# Secrets (SMTP password, SECRET_KEY...) live in backend/.env, never in the code.
load_dotenv(os.path.join(BACKEND_DIR, ".env"))


def _env_bool(name, default):
    return os.environ.get(name, "1" if default else "0").strip().lower() in ("1", "true", "yes")


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me-to-a-long-random-string")

    # Use the local SQLite file.
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///" + os.path.join(INSTANCE_DIR, "tma.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Token lifetimes.
    TOKEN_HOURS = int(os.environ.get("TOKEN_HOURS", "8"))
    REMEMBER_ME_DAYS = int(os.environ.get("REMEMBER_ME_DAYS", "30"))

    # Default admin.
    ADMIN_NAME = os.environ.get("ADMIN_NAME", "TMA Admin")
    ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@tma.local")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

    # Redis connections.
    REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
    CACHE_ENABLED = _env_bool("CACHE_ENABLED", True)
    CACHE_TTL_TREK_LIST = 300
    CACHE_TTL_TREK_DETAIL = 300
    CACHE_TTL_LOCATIONS = 600
    CACHE_TTL_ADMIN_STATS = 60

    # Mail settings. Set these in backend/.env (see backend/.env.example).
    # Port 587 + MAIL_USE_TLS=1 (STARTTLS) or port 465 + MAIL_USE_SSL=1 both work.
    # With no MAIL_USERNAME the mailer talks to a local debug server (localhost:1025).
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "localhost")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", "1025"))
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "").strip()
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "").replace(" ", "")  # app passwords are shown with spaces
    MAIL_USE_TLS = _env_bool("MAIL_USE_TLS", False)
    MAIL_USE_SSL = _env_bool("MAIL_USE_SSL", False)
    MAIL_SENDER = os.environ.get("MAIL_SENDER", "").strip() or (
        f"Summit Lovers <{MAIL_USERNAME}>" if MAIL_USERNAME else "Summit Lovers <no-reply@tma.local>"
    )
    # Monthly report recipient. Falls back to the admin account's own email.
    MAIL_REPORT_TO = os.environ.get("MAIL_REPORT_TO", "").strip()

    # Reminder window.
    REMINDER_DAYS_AHEAD = int(os.environ.get("REMINDER_DAYS_AHEAD", "3"))

    # Export settings.
    EXPORT_DIR = os.environ.get("EXPORT_DIR", os.path.join(INSTANCE_DIR, "exports"))
    EXPORT_RETENTION_DAYS = int(os.environ.get("EXPORT_RETENTION_DAYS", "7"))
