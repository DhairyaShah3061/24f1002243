"""Send one real test email with the SMTP settings from backend/.env.

    python -m backend.scripts.send_test_email you@example.com

Run it from the project root. It prints which server it is using and whether the
send worked, so you can check the mail setup before relying on the Celery jobs.
"""
import logging
import sys

from backend.app import create_app
from backend.services.mail import send_email


def run(to):
    app = create_app()
    cfg = app.config
    print(f"Server : {cfg['MAIL_SERVER']}:{cfg['MAIL_PORT']} "
          f"({'SSL' if cfg['MAIL_USE_SSL'] else 'STARTTLS' if cfg['MAIL_USE_TLS'] else 'plain'})")
    print(f"Login  : {cfg['MAIL_USERNAME'] or '(none)'}")
    print(f"From   : {cfg['MAIL_SENDER']}")
    print(f"To     : {to}")
    if cfg["MAIL_SERVER"] == "localhost" and not cfg["MAIL_USERNAME"]:
        print("Note   : MAIL_USERNAME is empty, so this targets a local debug server. "
              "Fill in backend/.env for real delivery.")
    with app.app_context():
        ok = send_email(
            to,
            "Summit Lovers test email",
            "<h2>It works</h2><p>This is a test email from Summit Lovers (TMA).</p>",
            "It works. This is a test email from Summit Lovers (TMA).",
        )
    print("Result : sent" if ok else "Result : FAILED (see the error above)")
    return 0 if ok else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m backend.scripts.send_test_email you@example.com")
    raise SystemExit(run(sys.argv[1]))
