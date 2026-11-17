
from backend.services.trek_info import trek_guide

PLACEHOLDER_IMAGE = "/static/assets/trek-placeholder.svg"


def iso(value):
    return value.isoformat() if value else None


def user_status(user):
    if user.is_blacklisted:
        return "Blacklisted"
    if not user.is_active:
        return "Inactive"
    return "Active"


def user_to_dict(user):
    data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "is_active": bool(user.is_active),
        "is_blacklisted": bool(user.is_blacklisted),
        "status": user_status(user),
        "created_at": iso(user.created_at),
    }
    if user.role == "staff" and user.staff_profile:
        profile = user.staff_profile
        data["staff_profile"] = {
            "id": profile.id,
            "code": profile.code,
            "contact": profile.contact,
            "experience_years": profile.experience_years,
            "specialization": profile.specialization,
        }
    return data


def staff_to_dict(profile):
    user = profile.user
    treks = profile.treks.all()
    return {
        "id": profile.id,
        "code": profile.code,
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "contact": profile.contact,
        "experience_years": profile.experience_years,
        "specialization": profile.specialization,
        "status": profile.status,
        "is_active": bool(user.is_active),
        "is_blacklisted": bool(user.is_blacklisted),
        "assigned_treks": [{"id": t.id, "name": t.name, "status": t.status} for t in treks],
        "created_at": iso(profile.created_at),
    }


def trek_is_ongoing(trek):
    return trek.started_at is not None and trek.status != "Completed"


def trek_display_status(trek):
    return "Ongoing" if trek_is_ongoing(trek) else trek.status


def trek_to_dict(trek):
    staff = trek.assigned_staff
    return {
        "id": trek.id,
        "name": trek.name,
        "location": trek.location,
        "difficulty": trek.difficulty,
        "duration_days": trek.duration_days,
        "total_slots": trek.total_slots,
        "available_slots": trek.available_slots,
        "booked_count": trek.total_slots - trek.available_slots,
        "status": trek.status,
        "display_status": trek_display_status(trek),
        "is_ongoing": trek_is_ongoing(trek),
        "start_date": iso(trek.start_date),
        "end_date": iso(trek.end_date),
        "started_at": iso(trek.started_at),
        "completed_at": iso(trek.completed_at),
        "price": trek.price,
        "description": trek.description,
        "image_url": trek.image_url or PLACEHOLDER_IMAGE,
        "assigned_staff_id": trek.assigned_staff_id,
        "assigned_staff": (
            {"id": staff.id, "code": staff.code, "name": staff.user.name} if staff else None
        ),
        "created_at": iso(trek.created_at),
        "guide": trek_guide(trek),
    }


def booking_to_dict(booking):
    trek = booking.trek
    user = booking.user
    return {
        "id": booking.id,
        "status": booking.status,
        "payment_status": booking.payment_status,
        "amount": booking.amount,
        "booking_date": iso(booking.booking_date),
        "paid_on": iso(booking.paid_on),
        "cancelled_on": iso(booking.cancelled_on),
        "completed_on": iso(booking.completed_on),
        "user": {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone},
        "trek": {
            "id": trek.id,
            "name": trek.name,
            "location": trek.location,
            "difficulty": trek.difficulty,
            "start_date": iso(trek.start_date),
            "end_date": iso(trek.end_date),
            "status": trek.status,
            "display_status": trek_display_status(trek),
            "is_ongoing": trek_is_ongoing(trek),
        },
    }
