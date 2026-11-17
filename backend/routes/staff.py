from flask import Blueprint, g

from backend.auth import roles_required
from backend.models import Booking, Trek, db
from backend.serializers import booking_to_dict, trek_to_dict
from backend.services import booking_service, stats_service
from backend.services.booking_service import BookingError
from backend.utils import err, json_body, ok

staff_bp = Blueprint("staff", __name__, url_prefix="/api/staff")


@staff_bp.before_request
@roles_required("staff")
def _only_staff():
    return None


def _profile():
    return g.user.staff_profile


def _my_trek(trek_id):
    profile = _profile()
    if not profile:
        return None, err("Your staff profile is missing. Contact the admin.", 403)
    trek = db.session.get(Trek, trek_id)
    if not trek:
        return None, err("Trek not found.", 404)
    if trek.assigned_staff_id != profile.id:
        return None, err("This trek is not assigned to you.", 403)
    return trek, None


def _with_counts(trek, counts):
    data = trek_to_dict(trek)
    data["registered"] = counts[trek.id]
    return data


@staff_bp.get("/stats")
def stats():
    profile = _profile()
    if not profile:
        return err("Your staff profile is missing. Contact the admin.", 403)
    return ok(stats_service.staff_stats(profile))


@staff_bp.get("/treks")
def my_treks():
    profile = _profile()
    if not profile:
        return err("Your staff profile is missing. Contact the admin.", 403)
    treks = profile.treks.order_by(Trek.start_date.asc()).all()
    counts = stats_service.registered_counts([t.id for t in treks])
    return ok([_with_counts(t, counts) for t in treks])


@staff_bp.get("/treks/<int:trek_id>")
def trek_detail(trek_id):
    trek, failure = _my_trek(trek_id)
    if failure:
        return failure
    counts = stats_service.registered_counts([trek.id])
    data = _with_counts(trek, counts)
    data["participants"] = [
        booking_to_dict(b)
        for b in trek.bookings.order_by(Booking.status, Booking.booking_date).all()
    ]
    return ok(data)


@staff_bp.put("/treks/<int:trek_id>")
def update_trek(trek_id):
    trek, failure = _my_trek(trek_id)
    if failure:
        return failure
    try:
        booking_service.staff_update_trek(trek, json_body())
    except BookingError as e:
        db.session.rollback()
        return err(e.message, e.status)
    return ok(trek_to_dict(trek), "Trek updated.")


@staff_bp.put("/treks/<int:trek_id>/participants/<int:booking_id>/cancel")
def cancel_participant(trek_id, booking_id):
    trek, failure = _my_trek(trek_id)
    if failure:
        return failure
    booking = db.session.get(Booking, booking_id)
    if not booking or booking.trek_id != trek.id:
        return err("Booking not found on this trek.", 404)
    try:
        booking_service.cancel_booking(booking)
    except BookingError as e:
        return err(e.message, e.status)
    return ok(booking_to_dict(booking), "Participant removed and seat released.")


@staff_bp.put("/treks/<int:trek_id>/start")
def start(trek_id):
    trek, failure = _my_trek(trek_id)
    if failure:
        return failure
    try:
        booking_service.start_trek(trek)
    except BookingError as e:
        return err(e.message, e.status)
    return ok(trek_to_dict(trek), "Trek marked as started.")


@staff_bp.put("/treks/<int:trek_id>/complete")
def complete(trek_id):
    trek, failure = _my_trek(trek_id)
    if failure:
        return failure
    try:
        booking_service.complete_trek(trek)
    except BookingError as e:
        return err(e.message, e.status)
    return ok(trek_to_dict(trek), "Trek completed. All active bookings are now Completed.")
