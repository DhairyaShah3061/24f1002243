from datetime import date

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from backend.cache import invalidate_treks
from backend.models import Booking, Trek, db
from backend.services.trek_service import STAFF_STATUSES, MAX_SLOTS, active_booking_count
from backend.utils import parse_int, utcnow


class BookingError(Exception):
    def __init__(self, message, status=409):
        super().__init__(message)
        self.message = message
        self.status = status


def create_booking(user, trek_id):
    trek = db.session.get(Trek, trek_id)
    if not trek:
        raise BookingError("Trek not found.", 404)
    if trek.status != "Open":
        raise BookingError(f"This trek is {trek.status}. Only Open treks can be booked.")
    if trek.started_at:
        raise BookingError("This trek has already started.")
    if trek.start_date < date.today():
        raise BookingError("This trek's start date has passed.")

    already = Booking.query.filter_by(user_id=user.id, trek_id=trek.id, status="Booked").first()
    if already:
        raise BookingError("You already have an active booking for this trek.")

    # Reserve one free seat.
    result = db.session.execute(
        update(Trek)
        .where(
            Trek.id == trek.id,
            Trek.available_slots > 0,
            Trek.status == "Open",
            Trek.started_at.is_(None),
        )
        .values(available_slots=Trek.available_slots - 1)
    )
    if result.rowcount != 1:
        db.session.rollback()
        raise BookingError("Sorry, this trek is fully booked.")

    booking = Booking(user_id=user.id, trek_id=trek.id, amount=trek.price or 0)
    db.session.add(booking)
    try:
        db.session.commit()
    except IntegrityError:
        # Undo a duplicate booking.
        db.session.rollback()
        raise BookingError("You already have an active booking for this trek.")
    invalidate_treks()
    return booking


def _release_seat(trek_id):
    db.session.execute(
        update(Trek)
        .where(Trek.id == trek_id, Trek.available_slots < Trek.total_slots)
        .values(available_slots=Trek.available_slots + 1)
    )


def cancel_booking(booking):
    if booking.status != "Booked":
        raise BookingError(f"This booking is already {booking.status}.")
    trek = booking.trek
    if trek.started_at or trek.status == "Completed":
        raise BookingError("Bookings cannot be cancelled after the trek has started.")

    _release_seat(trek.id)
    booking.status = "Cancelled"
    booking.cancelled_on = utcnow()
    db.session.commit()
    invalidate_treks()
    return booking


def pay_booking(booking):
    if booking.status != "Booked":
        raise BookingError("Only active bookings can be paid.")
    if booking.payment_status == "Paid":
        raise BookingError("This booking is already paid.")
    booking.payment_status = "Paid"
    booking.paid_on = utcnow()
    db.session.commit()
    return booking


def staff_update_trek(trek, data):
    if trek.status == "Completed":
        raise BookingError("Completed treks cannot be changed.")

    if "status" in data and data["status"] != trek.status:
        new_status = data["status"]
        if new_status not in STAFF_STATUSES:
            raise BookingError("Staff can only set a trek to Open or Closed.", 400)
        if trek.status == "Pending":
            raise BookingError("This trek is waiting for admin approval.")
        trek.status = new_status

    if "available_slots" in data:
        free = parse_int(data["available_slots"])
        if free is None or free < 0:
            raise BookingError("Available slots must be 0 or more.", 400)
        booked = active_booking_count(trek.id)
        if booked + free > MAX_SLOTS:
            raise BookingError(f"Capacity cannot exceed {MAX_SLOTS}.", 400)
        trek.available_slots = free
        trek.total_slots = booked + free

    db.session.commit()
    invalidate_treks()
    return trek


def start_trek(trek):
    if trek.status == "Completed":
        raise BookingError("This trek is already completed.")
    if trek.started_at:
        raise BookingError("This trek is already marked as started.")
    if trek.status not in ("Open", "Closed"):
        raise BookingError("Only Open or Closed treks can be started.")
    trek.started_at = utcnow()
    db.session.commit()
    invalidate_treks()
    return trek


def complete_trek(trek):
    if trek.status == "Completed":
        raise BookingError("This trek is already completed.")
    if not trek.started_at:
        raise BookingError("Mark the trek as started before completing it.")
    now = utcnow()
    trek.status = "Completed"
    trek.completed_at = now
    Booking.query.filter_by(trek_id=trek.id, status="Booked").update(
        {"status": "Completed", "completed_on": now}, synchronize_session=False
    )
    db.session.commit()
    invalidate_treks()
    return trek
