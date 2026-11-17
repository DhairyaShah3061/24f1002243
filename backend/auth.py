from datetime import timedelta
from functools import wraps

import jwt
from flask import Blueprint, current_app, g, request

from backend.models import User, db
from backend.serializers import user_to_dict
from backend.utils import (
    MIN_PASSWORD_LENGTH,
    err,
    is_valid_email,
    is_valid_phone,
    json_body,
    ok,
    utcnow,
)

auth_bp = Blueprint("auth", __name__, url_prefix="/api")

JWT_ALGORITHM = "HS256"
BLOCKED_MESSAGE = "Your account has been blocked. Please contact the admin."


def _clean(value):
    return value.strip() if isinstance(value, str) else ""


def _make_token(user, remember_me):
    cfg = current_app.config
    lifetime = (
        timedelta(days=cfg["REMEMBER_ME_DAYS"]) if remember_me else timedelta(hours=cfg["TOKEN_HOURS"])
    )
    now = utcnow()
    payload = {"sub": str(user.id), "role": user.role, "iat": now, "exp": now + lifetime}
    return jwt.encode(payload, cfg["SECRET_KEY"], algorithm=JWT_ALGORITHM)


def _is_blocked(user):
    return user.is_blacklisted or not user.is_active


@auth_bp.post("/register")
def register():
    body = json_body()
    name = _clean(body.get("name"))
    email = _clean(body.get("email")).lower()
    password = body.get("password") if isinstance(body.get("password"), str) else ""
    confirm = body.get("confirm_password") if isinstance(body.get("confirm_password"), str) else ""
    phone = _clean(body.get("phone")) or None

    if not name:
        return err("Name is required.")
    if len(name) > 100:
        return err("Name must be at most 100 characters.")
    if not is_valid_email(email):
        return err("Please enter a valid email address.")
    if len(password) < MIN_PASSWORD_LENGTH:
        return err(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if password != confirm:
        return err("Passwords do not match.")
    if not is_valid_phone(phone):
        return err("Please enter a valid phone number.")
    if User.query.filter_by(email=email).first():
        return err("An account with this email already exists.", 409)

    # New accounts are trekkers.
    user = User(name=name, email=email, phone=phone, role="user")
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return ok({"user": user_to_dict(user)}, "Registration successful. Please log in.", 201)


@auth_bp.post("/login")
def login():
    body = json_body()
    email = _clean(body.get("email")).lower()
    password = body.get("password") if isinstance(body.get("password"), str) else ""
    if not email or not password:
        return err("Email and password are required.")

    user = User.query.filter_by(email=email).first()
    # Keep login errors generic.
    if user is None or not user.check_password(password):
        return err("Invalid email or password.", 401)
    if _is_blocked(user):
        return err(BLOCKED_MESSAGE, 403, code="ACCOUNT_BLOCKED")

    remember_me = body.get("remember_me") is True or str(body.get("remember_me")).lower() == "true"
    token = _make_token(user, remember_me)
    return ok({"token": token, "user": user_to_dict(user)}, f"Welcome back, {user.name}.")


@auth_bp.post("/logout")
def logout():
    # JWT logout is client-side.
    return ok(None, "Logged out.")


def roles_required(*roles):

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            scheme, _, token = header.partition(" ")
            if scheme.lower() != "bearer" or not token.strip():
                return err("Please log in to continue.", 401)
            try:
                payload = jwt.decode(
                    token.strip(),
                    current_app.config["SECRET_KEY"],
                    algorithms=[JWT_ALGORITHM],
                    options={"require": ["sub", "exp"]},
                )
                user_id = int(payload["sub"])
            except jwt.ExpiredSignatureError:
                return err("Your session has expired. Please log in again.", 401)
            except (jwt.InvalidTokenError, ValueError, TypeError):
                return err("Invalid login token. Please log in again.", 401)

            user = db.session.get(User, user_id)
            if user is None:
                return err("Account not found. Please log in again.", 401)
            # Check account status live.
            if _is_blocked(user):
                return err(BLOCKED_MESSAGE, 403, code="ACCOUNT_BLOCKED")
            if user.role not in roles:
                return err("You do not have permission to do this.", 403)

            g.user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def seed_admin():
    if User.query.filter_by(role="admin").first():
        return None
    cfg = current_app.config
    admin = User(
        name=cfg["ADMIN_NAME"],
        email=cfg["ADMIN_EMAIL"].strip().lower(),
        role="admin",
    )
    admin.set_password(cfg["ADMIN_PASSWORD"])
    db.session.add(admin)
    db.session.commit()
    return admin
