from flask import Blueprint, g, request

from backend.auth import roles_required
from backend.models import Booking, db
from backend.serializers import booking_to_dict
from backend.services import booking_service
from backend.services.booking_service import BookingError
from backend.utils import err, json_body, ok, parse_bool, parse_int

bookings_bp = Blueprint("bookings", __name__, url_prefix="/api/bookings")


@bookings_bp.before_request
@roles_required("user")
def _only_trekkers():
    return None


def _own_booking(booking_id):
    booking = db.session.get(Booking, booking_id)
    # Hide other users' bookings.
    if not booking or booking.user_id != g.user.id:
        return None
    return booking


@bookings_bp.post("")
def book():
    trek_id = parse_int(json_body().get("trek_id"))
    if not trek_id:
        return err("trek_id is required.")
    try:
        booking = booking_service.create_booking(g.user, trek_id)
    except BookingError as e:
        return err(e.message, e.status)
    return ok(booking_to_dict(booking), f"Seat booked on {booking.trek.name}.", 201)


@bookings_bp.get("/mine")
def mine():
    q = Booking.query.filter_by(user_id=g.user.id)
    if parse_bool(request.args.get("history", "0")):
        q = q.filter(Booking.status.in_(("Completed", "Cancelled")))
    else:
        status = request.args.get("status", "").strip()
        if status in ("Booked", "Cancelled", "Completed"):
            q = q.filter(Booking.status == status)
    bookings = q.order_by(Booking.booking_date.desc()).all()
    return ok([booking_to_dict(b) for b in bookings])


@bookings_bp.put("/<int:booking_id>/cancel")
def cancel(booking_id):
    booking = _own_booking(booking_id)
    if not booking:
        return err("Booking not found.", 404)
    try:
        booking_service.cancel_booking(booking)
    except BookingError as e:
        return err(e.message, e.status)
    return ok(booking_to_dict(booking), "Booking cancelled. Your seat has been released.")


@bookings_bp.put("/<int:booking_id>/pay")
def pay(booking_id):
    booking = _own_booking(booking_id)
    if not booking:
        return err("Booking not found.", 404)
    try:
        booking_service.pay_booking(booking)
    except BookingError as e:
        return err(e.message, e.status)
    return ok(booking_to_dict(booking), "Payment received (simulation).")
