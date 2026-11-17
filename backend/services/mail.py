import logging
import smtplib
import ssl
from email.message import EmailMessage

from flask import current_app

log = logging.getLogger(__name__)

TIMEOUT_SECONDS = 20


def _connect(cfg):
    host, port = cfg["MAIL_SERVER"], cfg["MAIL_PORT"]
    context = ssl.create_default_context()
    if cfg["MAIL_USE_SSL"]:
        smtp = smtplib.SMTP_SSL(host, port, timeout=TIMEOUT_SECONDS, context=context)
    else:
        smtp = smtplib.SMTP(host, port, timeout=TIMEOUT_SECONDS)
        smtp.ehlo()
        if cfg["MAIL_USE_TLS"]:
            smtp.starttls(context=context)
            smtp.ehlo()
    if cfg["MAIL_USERNAME"]:
        smtp.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
    return smtp


def send_email(to, subject, html, text=None, attachments=None):
    """Send one email through the configured SMTP server. Returns True on success."""
    cfg = current_app.config
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg["MAIL_SENDER"]
    msg["To"] = to
    msg.set_content(text or "This message needs an HTML-capable mail client.")
    msg.add_alternative(html, subtype="html")
    for filename, data, mime in attachments or []:
        maintype, subtype = mime.split("/", 1)
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=filename)

    try:
        with _connect(cfg) as smtp:
            smtp.send_message(msg)
        log.info("Email sent to %s: %s", to, subject)
        return True
    except smtplib.SMTPAuthenticationError as exc:
        log.error("Email to %s failed: SMTP login rejected (%s). Check MAIL_USERNAME / MAIL_PASSWORD "
                  "(Gmail and Microsoft need an app password).", to, exc.smtp_code)
    except smtplib.SMTPRecipientsRefused:
        log.error("Email to %s failed: the server refused this address.", to)
    except (OSError, smtplib.SMTPException) as exc:
        log.error("Email to %s failed: %s", to, exc)
    return False
