from datetime import date

from backend.models import Booking, StaffProfile, Trek, db
from backend.utils import parse_date, parse_int

DIFFICULTIES = ("Easy", "Moderate", "Hard")
TREK_STATUSES = ("Pending", "Approved", "Open", "Closed", "Completed")
# Completed treks also complete bookings.
ADMIN_STATUSES = ("Pending", "Approved", "Open", "Closed")
STAFF_STATUSES = ("Open", "Closed")
# Public trek rules.
VISIBLE_STATUSES = ("Approved", "Open")

MAX_SLOTS = 500
MAX_DURATION_DAYS = 60


class TrekError(Exception):

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def active_booking_count(trek_id):
    return Booking.query.filter_by(trek_id=trek_id, status="Booked").count()


def find_assignable_staff(staff_id):
    profile = db.session.get(StaffProfile, staff_id)
    if not profile:
        raise TrekError("Selected staff member does not exist.", 404)
    if profile.user.is_blacklisted:
        raise TrekError("Selected staff member is blacklisted.", 409)
    return profile


def _text(data, key, label, max_len, required=True):
    value = data.get(key)
    value = value.strip() if isinstance(value, str) else ""
    if required and not value:
        raise TrekError(f"{label} is required.")
    if len(value) > max_len:
        raise TrekError(f"{label} must be at most {max_len} characters.")
    return value or None


def validate_trek_payload(data, trek=None):
    clean = {
        "name": _text(data, "name", "Name", 120),
        "location": _text(data, "location", "Location", 100),
        "description": _text(data, "description", "Description", 2000, required=False),
        "image_url": _text(data, "image_url", "Image URL", 500, required=False),
    }

    difficulty = data.get("difficulty")
    if difficulty not in DIFFICULTIES:
        raise TrekError("Difficulty must be Easy, Moderate or Hard.")
    clean["difficulty"] = difficulty

    if clean["image_url"] and not clean["image_url"].startswith(("http://", "https://", "/static/")):
        raise TrekError("Image URL must start with http://, https:// or /static/.")

    start, end = parse_date(data.get("start_date")), parse_date(data.get("end_date"))
    if not start or not end:
        raise TrekError("Start and end dates are required (YYYY-MM-DD).")
    if end < start:
        raise TrekError("End date cannot be before the start date.")
    if trek is None and start < date.today():
        raise TrekError("Start date cannot be in the past.")
    duration = (end - start).days + 1
    if duration > MAX_DURATION_DAYS:
        raise TrekError(f"A trek can last at most {MAX_DURATION_DAYS} days.")
    clean.update(start_date=start, end_date=end, duration_days=duration)

    total = parse_int(data.get("total_slots"))
    if total is None or total < 1 or total > MAX_SLOTS:
        raise TrekError(f"Total slots must be a whole number from 1 to {MAX_SLOTS}.")
    clean["total_slots"] = total

    price = data.get("price", 0)
    try:
        price = round(float(price or 0), 2)
    except (TypeError, ValueError):
        raise TrekError("Price must be a number.")
    if price < 0:
        raise TrekError("Price cannot be negative.")
    clean["price"] = price

    status = data.get("status") or (trek.status if trek else "Pending")
    if status not in ADMIN_STATUSES:
        raise TrekError("Status must be Pending, Approved, Open or Closed.")
    clean["status"] = status

    staff_id = data.get("assigned_staff_id")
    if staff_id in (None, "", 0, "0"):
        clean["assigned_staff_id"] = None
    else:
        staff_id = parse_int(staff_id)
        if staff_id is None:
            raise TrekError("Assigned staff must be a staff ID.")
        if not trek or trek.assigned_staff_id != staff_id:
            find_assignable_staff(staff_id)
        clean["assigned_staff_id"] = staff_id

    return clean


def create_trek(data):
    clean = validate_trek_payload(data)
    trek = Trek(**clean, available_slots=clean["total_slots"])
    db.session.add(trek)
    db.session.commit()
    return trek


def update_trek(trek, data):
    if trek.status == "Completed":
        raise TrekError("Completed treks cannot be edited.", 409)
    clean = validate_trek_payload(data, trek)

    if trek.started_at:
        if clean["start_date"] != trek.start_date or clean["end_date"] != trek.end_date:
            raise TrekError("Dates cannot change after the trek has started.", 409)
        if clean["status"] not in STAFF_STATUSES:
            raise TrekError("A started trek can only be Open or Closed.", 409)

    booked = active_booking_count(trek.id)
    if clean["total_slots"] < booked:
        raise TrekError(
            f"Total slots cannot be lower than the {booked} active booking(s).", 409
        )

    for key, value in clean.items():
        setattr(trek, key, value)
    trek.available_slots = clean["total_slots"] - booked
    db.session.commit()
    return trek


def delete_trek(trek):
    # Keep treks with booking history.
    if trek.bookings.count():
        raise TrekError(
            "This trek has bookings, so deleting it would erase history. Set it to Closed instead.",
            409,
        )
    db.session.delete(trek)
    db.session.commit()


