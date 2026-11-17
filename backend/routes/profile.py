from flask import Blueprint, g

from backend.auth import roles_required
from backend.cache import invalidate_treks
from backend.models import db
from backend.serializers import user_to_dict
from backend.utils import MIN_PASSWORD_LENGTH, err, is_valid_phone, json_body, ok, parse_int

profile_bp = Blueprint("profile", __name__, url_prefix="/api/profile")


@profile_bp.before_request
@roles_required("admin", "staff", "user")
def _logged_in():
    return None


@profile_bp.get("")
def get_profile():
    return ok(user_to_dict(g.user))


@profile_bp.put("")
def update_profile():
    user = g.user
    data = json_body()

    name = (data.get("name") or "").strip()
    phone = (data.get("phone") or "").strip()
    if not name or len(name) > 100:
        return err("Name is required (max 100 characters).")
    if not is_valid_phone(phone):
        return err("Phone number must be 7-15 digits.")

    new_password = data.get("new_password") or ""
    if new_password:
        if not user.check_password(data.get("current_password") or ""):
            return err("Current password is incorrect.", 400)
        if len(new_password) < MIN_PASSWORD_LENGTH:
            return err(f"New password must be at least {MIN_PASSWORD_LENGTH} characters.")
        if new_password != (data.get("confirm_password") or ""):
            return err("New passwords do not match.")

    if user.role == "staff" and user.staff_profile:
        profile = user.staff_profile
        experience = parse_int(data.get("experience_years", profile.experience_years))
        if experience is None or not 0 <= experience <= 60:
            return err("Experience must be a whole number of years from 0 to 60.")
        contact = (data.get("contact") or "").strip()
        if not is_valid_phone(contact):
            return err("Contact number must be 7-15 digits.")
        profile.contact = contact or None
        profile.specialization = (data.get("specialization") or "").strip()[:120] or None
        profile.experience_years = experience

    user.name = name
    user.phone = phone or None
    if new_password:
        user.set_password(new_password)
    db.session.commit()
    if user.role == "staff":
        invalidate_treks()  # staff names are shown inside cached trek data
    return ok(user_to_dict(user), "Profile saved.")
