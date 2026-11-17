from flask import Blueprint, current_app, request
from sqlalchemy import or_

from backend.auth import roles_required
from backend.cache import delete, get_json, invalidate_treks, set_json
from backend.models import Booking, StaffProfile, Trek, User, db
from backend.serializers import booking_to_dict, staff_to_dict, trek_to_dict, user_to_dict
from backend.services import stats_service, trek_service
from backend.services.trek_service import TREK_STATUSES, TrekError
from backend.utils import (
    MIN_PASSWORD_LENGTH,
    err,
    is_valid_email,
    is_valid_phone,
    json_body,
    like,
    ok,
    paginate,
    parse_bool,
    parse_int,
)

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


@admin_bp.before_request
@roles_required("admin")
def _only_admin():
    return None


# Dashboard.

@admin_bp.get("/stats")
def stats():
    data = get_json("admin:stats")
    if data is None:
        data = stats_service.admin_stats()
        set_json("admin:stats", data, current_app.config["CACHE_TTL_ADMIN_STATS"])
    return ok(data)


@admin_bp.get("/reports")
def reports():
    return ok(stats_service.reports())


# Treks.

def _get_trek(trek_id):
    return db.session.get(Trek, trek_id)


@admin_bp.get("/treks")
def list_treks():
    q = Trek.query
    term = request.args.get("q", "").strip()
    if term:
        pattern = like(term)
        q = q.filter(or_(Trek.name.ilike(pattern, escape="\\"), Trek.location.ilike(pattern, escape="\\")))
    status = request.args.get("status", "").strip()
    if status == "Ongoing":
        q = q.filter(Trek.started_at.isnot(None), Trek.status != "Completed")
    elif status in TREK_STATUSES:
        q = q.filter(Trek.status == status)
    q = q.order_by(Trek.start_date.desc(), Trek.id.desc())
    return ok(paginate(q, trek_to_dict))


@admin_bp.post("/treks")
def create_trek():
    try:
        trek = trek_service.create_trek(json_body())
    except TrekError as e:
        return err(e.message, e.status)
    invalidate_treks()
    return ok(trek_to_dict(trek), "Trek created.", 201)


@admin_bp.get("/treks/<int:trek_id>")
def get_trek(trek_id):
    trek = _get_trek(trek_id)
    if not trek:
        return err("Trek not found.", 404)
    data = trek_to_dict(trek)
    data["participants"] = [
        booking_to_dict(b) for b in trek.bookings.order_by(Booking.booking_date.desc()).all()
    ]
    return ok(data)


@admin_bp.put("/treks/<int:trek_id>")
def update_trek(trek_id):
    trek = _get_trek(trek_id)
    if not trek:
        return err("Trek not found.", 404)
    try:
        trek_service.update_trek(trek, json_body())
    except TrekError as e:
        db.session.rollback()
        return err(e.message, e.status)
    invalidate_treks()
    return ok(trek_to_dict(trek), "Trek updated.")


@admin_bp.delete("/treks/<int:trek_id>")
def delete_trek(trek_id):
    trek = _get_trek(trek_id)
    if not trek:
        return err("Trek not found.", 404)
    try:
        trek_service.delete_trek(trek)
    except TrekError as e:
        return err(e.message, e.status)
    invalidate_treks()
    return ok(None, "Trek deleted.")


@admin_bp.put("/treks/<int:trek_id>/assign")
def assign_staff(trek_id):
    trek = _get_trek(trek_id)
    if not trek:
        return err("Trek not found.", 404)
    try:
        trek_service.assign_staff(trek, json_body().get("staff_id"))
    except TrekError as e:
        db.session.rollback()
        return err(e.message, e.status)
    invalidate_treks()
    return ok(trek_to_dict(trek), "Staff assignment saved.")


# People helpers.

def _filter_people(q, term, status):
    if term:
        pattern = like(term)
        q = q.filter(or_(
            User.name.ilike(pattern, escape="\\"),
            User.email.ilike(pattern, escape="\\"),
            User.phone.ilike(pattern, escape="\\"),
        ))
    if status == "Active":
        q = q.filter(User.is_active.is_(True), User.is_blacklisted.is_(False))
    elif status == "Inactive":
        q = q.filter(User.is_active.is_(False))
    elif status == "Blacklisted":
        q = q.filter(User.is_blacklisted.is_(True))
    return q


def _set_flag(user, field, value):
    if user.role == "admin":
        return err("The admin account cannot be changed.", 403)
    setattr(user, field, value)
    db.session.commit()
    delete("admin:stats")
    return None


# Staff.

@admin_bp.get("/staff")
def list_staff():
    q = StaffProfile.query.join(User, StaffProfile.user_id == User.id)
    q = _filter_people(q, request.args.get("q", "").strip(), request.args.get("status", "").strip())
    q = q.order_by(StaffProfile.id.asc())
    return ok(paginate(q, staff_to_dict))


@admin_bp.get("/staff/options")
def staff_options():
    rows = (
        StaffProfile.query.join(User, StaffProfile.user_id == User.id)
        .filter(User.is_active.is_(True), User.is_blacklisted.is_(False))
        .order_by(User.name)
        .all()
    )
    return ok([
        {"id": p.id, "code": p.code, "name": p.user.name, "specialization": p.specialization}
        for p in rows
    ])


def _staff_fields(data):
    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    contact = (data.get("contact") or phone).strip()
    specialization = (data.get("specialization") or "").strip()
    experience = parse_int(data.get("experience_years", 0), None)
    if not name or len(name) > 100:
        return None, "Name is required (max 100 characters)."
    if not is_valid_phone(phone) or not is_valid_phone(contact):
        return None, "Phone number must be 7-15 digits."
    if experience is None or not 0 <= experience <= 60:
        return None, "Experience must be a whole number of years from 0 to 60."
    if len(specialization) > 120:
        return None, "Specialization must be at most 120 characters."
    return {
        "name": name,
        "phone": phone or None,
        "contact": contact or None,
        "specialization": specialization or None,
        "experience_years": experience,
    }, None


@admin_bp.post("/staff")
def create_staff():
    data = json_body()
    fields, error = _staff_fields(data)
    if error:
        return err(error)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not is_valid_email(email):
        return err("Enter a valid email address.")
    if len(password) < MIN_PASSWORD_LENGTH:
        return err(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if password != (data.get("confirm_password") or ""):
        return err("Passwords do not match.")
    if User.query.filter_by(email=email).first():
        return err("An account with this email already exists.", 409)

    user = User(name=fields["name"], email=email, phone=fields["phone"], role="staff")
    user.set_password(password)
    profile = StaffProfile(
        user=user,
        contact=fields["contact"],
        specialization=fields["specialization"],
        experience_years=fields["experience_years"],
    )
    if data.get("status") == "Inactive":
        user.is_active = False
    db.session.add_all([user, profile])
    db.session.commit()
    delete("admin:stats")
    return ok(staff_to_dict(profile), "Staff account created.", 201)


@admin_bp.put("/staff/<int:staff_id>")
def update_staff(staff_id):
    profile = db.session.get(StaffProfile, staff_id)
    if not profile:
        return err("Staff member not found.", 404)
    fields, error = _staff_fields(json_body())
    if error:
        return err(error)
    profile.user.name = fields["name"]
    profile.user.phone = fields["phone"]
    profile.contact = fields["contact"]
    profile.specialization = fields["specialization"]
    profile.experience_years = fields["experience_years"]
    db.session.commit()
    invalidate_treks()  # staff name appears inside cached trek data
    return ok(staff_to_dict(profile), "Staff details saved.")


@admin_bp.put("/staff/<int:staff_id>/blacklist")
def blacklist_staff(staff_id):
    profile = db.session.get(StaffProfile, staff_id)
    if not profile:
        return err("Staff member not found.", 404)
    flag = parse_bool(json_body().get("blacklisted", True))
    failure = _set_flag(profile.user, "is_blacklisted", flag)
    if failure:
        return failure
    return ok(staff_to_dict(profile), "Staff blacklisted." if flag else "Staff whitelisted.")


@admin_bp.put("/staff/<int:staff_id>/active")
def activate_staff(staff_id):
    profile = db.session.get(StaffProfile, staff_id)
    if not profile:
        return err("Staff member not found.", 404)
    flag = parse_bool(json_body().get("active", True))
    failure = _set_flag(profile.user, "is_active", flag)
    if failure:
        return failure
    return ok(staff_to_dict(profile), "Staff activated." if flag else "Staff deactivated.")


# Trekkers.

def _trekker_to_dict(user):
    data = user_to_dict(user)
    counts = dict(
        db.session.query(Booking.status, db.func.count())
        .filter(Booking.user_id == user.id)
        .group_by(Booking.status)
        .all()
    )
    data["bookings"] = {
        "Booked": counts.get("Booked", 0),
        "Completed": counts.get("Completed", 0),
        "Cancelled": counts.get("Cancelled", 0),
    }
    return data


@admin_bp.get("/users")
def list_users():
    q = User.query.filter(User.role == "user")
    q = _filter_people(q, request.args.get("q", "").strip(), request.args.get("status", "").strip())
    q = q.order_by(User.id.asc())
    return ok(paginate(q, _trekker_to_dict))


def _get_trekker(user_id):
    user = db.session.get(User, user_id)
    return user if user and user.role == "user" else None


@admin_bp.put("/users/<int:user_id>/blacklist")
def blacklist_user(user_id):
    user = _get_trekker(user_id)
    if not user:
        return err("Trekker not found.", 404)
    flag = parse_bool(json_body().get("blacklisted", True))
    failure = _set_flag(user, "is_blacklisted", flag)
    if failure:
        return failure
    return ok(_trekker_to_dict(user), "Trekker blacklisted." if flag else "Trekker whitelisted.")


@admin_bp.put("/users/<int:user_id>/active")
def activate_user(user_id):
    user = _get_trekker(user_id)
    if not user:
        return err("Trekker not found.", 404)
    flag = parse_bool(json_body().get("active", True))
    failure = _set_flag(user, "is_active", flag)
    if failure:
        return failure
    return ok(_trekker_to_dict(user), "Trekker activated." if flag else "Trekker deactivated.")


# Bookings.

@admin_bp.get("/bookings")
def list_bookings():
    q = Booking.query.join(User, Booking.user_id == User.id).join(Trek, Booking.trek_id == Trek.id)
    term = request.args.get("q", "").strip()
    if term:
        pattern = like(term)
        q = q.filter(or_(
            User.name.ilike(pattern, escape="\\"),
            User.email.ilike(pattern, escape="\\"),
            Trek.name.ilike(pattern, escape="\\"),
        ))
    status = request.args.get("status", "").strip()
    if status in ("Booked", "Cancelled", "Completed"):
        q = q.filter(Booking.status == status)
    trek_id = parse_int(request.args.get("trek_id"))
    if trek_id:
        q = q.filter(Booking.trek_id == trek_id)
    q = q.order_by(Booking.booking_date.desc())
    return ok(paginate(q, booking_to_dict, default_per_page=15))
