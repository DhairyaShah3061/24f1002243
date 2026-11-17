import csv
import logging
import os
import time
from datetime import date, timedelta
from html import escape
from uuid import uuid4

from flask import current_app

from backend.jobs.celery_app import celery
from backend.models import Booking, ReminderLog, Trek, User, db
from backend.services import stats_service
from backend.services.mail import send_email
from backend.services.trek_info import REPORTING_INSTRUCTIONS, trek_guide

log = logging.getLogger(__name__)

EXPORT_PREFIX = "bookings_"
CSV_COLUMNS = [
    "User ID", "Trek Name", "Location", "Booking Status",
    "Start Date", "End Date", "Booking Date", "Payment Status",
]


# Daily reminders.
def _staff_lead(trek):
    profile = trek.assigned_staff
    if profile is None:
        return "To be announced", "Our support team will share it soon"
    return profile.user.name, profile.contact or profile.user.phone or profile.user.email


def _reminder_html(user, trek, days_left, lead_name, lead_contact):
    when = "tomorrow" if days_left == 1 else f"in {days_left} days"
    items = "".join(f"<li>{escape(item)}</li>" for item in trek_guide(trek)["what_to_carry"])
    return f"""
<h2>Your trek starts {when}!</h2>
<p>Hi {escape(user.name)},</p>
<p>This is a reminder for your upcoming trek.</p>
<table cellpadding="4">
  <tr><td><b>Trek</b></td><td>{escape(trek.name)}</td></tr>
  <tr><td><b>Location</b></td><td>{escape(trek.location)}</td></tr>
  <tr><td><b>Start date</b></td><td>{trek.start_date.strftime('%d %b %Y')}</td></tr>
  <tr><td><b>Days left</b></td><td>{days_left}</td></tr>
  <tr><td><b>Trek leader</b></td><td>{escape(lead_name)}</td></tr>
  <tr><td><b>Leader contact</b></td><td>{escape(lead_contact)}</td></tr>
</table>
<h3>What to carry</h3>
<ul>{items}</ul>
<h3>Reporting instructions</h3>
<p>{escape(REPORTING_INSTRUCTIONS)}</p>
<p>Have a safe and happy trek!<br>Team TMA</p>
"""


def _reminder_text(user, trek, days_left, lead_name, lead_contact):
    return (
        f"Reminder for {user.name}: {trek.name} ({trek.location}) starts on "
        f"{trek.start_date.isoformat()}, {days_left} day(s) left. "
        f"Leader: {lead_name} ({lead_contact}). {REPORTING_INSTRUCTIONS}"
    )


@celery.task(name="backend.jobs.tasks.send_daily_reminders")
def send_daily_reminders():
    today = date.today()
    window_end = today + timedelta(days=current_app.config["REMINDER_DAYS_AHEAD"])

    bookings = (
        Booking.query.join(Trek, Booking.trek_id == Trek.id)
        .filter(
            Booking.status == "Booked",
            Trek.start_date > today,
            Trek.start_date <= window_end,
            Trek.started_at.is_(None),
            Trek.status != "Completed",
        )
        .order_by(Trek.start_date, Booking.id)
        .all()
    )

    sent = skipped = failed = 0
    for booking in bookings:
        try:
            already = ReminderLog.query.filter_by(booking_id=booking.id, sent_on=today).first()
            if already:
                skipped += 1
                continue

            user, trek = booking.user, booking.trek
            days_left = (trek.start_date - today).days
            lead_name, lead_contact = _staff_lead(trek)
            html = _reminder_html(user, trek, days_left, lead_name, lead_contact)
            text = _reminder_text(user, trek, days_left, lead_name, lead_contact)

            emailed = send_email(user.email, f"Reminder: {trek.name} starts in {days_left} day(s)", html, text)
            if not emailed:
                failed += 1
                continue

            # Save the sent reminder.
            db.session.add(ReminderLog(booking_id=booking.id, sent_on=today, channel="email"))
            db.session.commit()
            sent += 1
        except Exception:  # one bad booking must not stop the rest
            db.session.rollback()
            log.exception("Reminder for booking %s failed", booking.id)
            failed += 1

    summary = {"sent": sent, "skipped": skipped, "failed": failed}
    log.info("Daily reminders: %s", summary)
    return summary


# Monthly report.
def _report_html(stats):
    label = escape(stats["label"])
    summary = f"""
<table cellpadding="6" border="1" style="border-collapse:collapse">
  <tr><td>Treks conducted</td><td><b>{stats['treks_conducted']}</b></td></tr>
  <tr><td>Participants</td><td><b>{stats['participants']}</b></td></tr>
  <tr><td>New bookings</td><td><b>{stats['new_bookings']}</b></td></tr>
  <tr><td>Cancellations</td><td><b>{stats['cancellations']}</b></td></tr>
  <tr><td>Revenue (payments received)</td><td><b>&#8377; {stats['revenue']:,.2f}</b></td></tr>
</table>"""

    if stats["conducted_treks"]:
        rows = "".join(
            f"<tr><td>{escape(t['name'])}</td><td>{escape(t['location'])}</td>"
            f"<td>{t['start_date']}</td><td>{t['end_date']}</td><td>{t['participants']}</td></tr>"
            for t in stats["conducted_treks"]
        )
        conducted = f"""
<h3>Treks conducted</h3>
<table cellpadding="6" border="1" style="border-collapse:collapse">
  <tr><th>Trek</th><th>Location</th><th>Start</th><th>End</th><th>Participants</th></tr>
  {rows}
</table>"""
    else:
        conducted = "<h3>Treks conducted</h3><p>No treks were completed this month.</p>"

    if stats["popular_treks"]:
        items = "".join(
            f"<li>{escape(t['name'])} ({escape(t['location'])}): {t['bookings']} booking(s)</li>"
            for t in stats["popular_treks"]
        )
        popular = f"<h3>Most popular treks</h3><ol>{items}</ol>"
    else:
        popular = "<h3>Most popular treks</h3><p>No bookings were made this month.</p>"

    quiet = ""
    if not (stats["treks_conducted"] or stats["new_bookings"] or stats["cancellations"]):
        quiet = "<p><i>It was a quiet month: no trek activity was recorded.</i></p>"

    return f"""
<h2>TMA monthly activity report: {label}</h2>
{quiet}
{summary}
{conducted}
{popular}
<p>The admin Reports page shows the same numbers.<br>Team TMA</p>
"""


@celery.task(name="backend.jobs.tasks.send_monthly_report")
def send_monthly_report():
    year, month = stats_service.previous_month()
    stats = stats_service.monthly_activity(year, month)

    admin = User.query.filter_by(role="admin").first()
    if admin is None:
        log.warning("Monthly report: no admin user to send to")
        return {"sent": False, "month": stats["label"], "reason": "no admin"}

    recipient = current_app.config["MAIL_REPORT_TO"] or admin.email
    sent = send_email(recipient, f"TMA monthly report: {stats['label']}", _report_html(stats))
    log.info("Monthly report for %s sent=%s", stats["label"], sent)
    return {"sent": sent, "month": stats["label"], "to": recipient}


# CSV export.
def _delete_old_exports(export_dir, retention_days):
    cutoff = time.time() - retention_days * 86400
    removed = 0
    if not os.path.isdir(export_dir):
        return removed
    for name in os.listdir(export_dir):
        if not (name.startswith(EXPORT_PREFIX) and name.endswith(".csv")):
            continue
        path = os.path.join(export_dir, name)
        try:
            if os.path.isfile(path) and os.path.getmtime(path) < cutoff:
                os.remove(path)
                removed += 1
        except OSError:
            log.warning("Could not delete old export %s", path)
    return removed


def _fmt(value):
    return value.strftime("%Y-%m-%d") if value else ""


@celery.task(name="backend.jobs.tasks.export_bookings_csv")
def export_bookings_csv(user_id):
    cfg = current_app.config
    export_dir = cfg["EXPORT_DIR"]
    os.makedirs(export_dir, exist_ok=True)
    _delete_old_exports(export_dir, cfg["EXPORT_RETENTION_DAYS"])

    bookings = (
        Booking.query.join(Trek, Booking.trek_id == Trek.id)
        .filter(Booking.user_id == user_id)
        .order_by(Booking.booking_date.desc())
        .all()
    )

    filename = f"{EXPORT_PREFIX}{user_id}_{uuid4().hex}.csv"
    path = os.path.join(export_dir, filename)
    # Keep CSV friendly for Excel.
    with open(path, "w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.writer(fh)
        writer.writerow(CSV_COLUMNS)
        for b in bookings:
            writer.writerow([
                b.user_id, b.trek.name, b.trek.location, b.status,
                _fmt(b.trek.start_date), _fmt(b.trek.end_date),
                _fmt(b.booking_date), b.payment_status,
            ])

    emailed = False
    user = db.session.get(User, user_id)
    if user is not None:
        with open(path, "rb") as fh:
            csv_bytes = fh.read()
        emailed = send_email(
            user.email,
            "Your booking history export (CSV attached)",
            f"<p>Hi {escape(user.name)},</p><p>Your booking history export "
            f"({len(bookings)} booking(s)) is attached to this email as a CSV file. "
            "</p><p>Team TMA</p>",
            f"Hi {user.name}, your booking history export ({len(bookings)} booking(s)) is attached as a CSV file.",
            attachments=[("booking_history.csv", csv_bytes, "text/csv")],
        )

    log.info("Export for user %s: %s (%d rows)", user_id, filename, len(bookings))
    return {"user_id": user_id, "filename": filename, "rows": len(bookings), "emailed": emailed}


@celery.task(name="backend.jobs.tasks.cleanup_old_exports")
def cleanup_old_exports():
    cfg = current_app.config
    removed = _delete_old_exports(cfg["EXPORT_DIR"], cfg["EXPORT_RETENTION_DAYS"])
    return {"removed": removed}
