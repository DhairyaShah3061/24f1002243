import re
from datetime import date, datetime, timezone

from flask import jsonify, request

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
PHONE_RE = re.compile(r"^\+?[0-9 \-]{7,15}$")
MIN_PASSWORD_LENGTH = 6


def is_valid_email(value):
    return bool(value) and len(value) <= 120 and bool(EMAIL_RE.match(value))


def is_valid_phone(value):
    return not value or bool(PHONE_RE.match(value))


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def ok(data=None, message=None, status=200):
    body = {"data": data}
    if message:
        body["message"] = message
    return jsonify(body), status


def err(message, status=400, **extra):
    body = {"error": message}
    body.update(extra)
    return jsonify(body), status


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def parse_date(value):
    if isinstance(value, date):
        return value
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def parse_int(value, default=None):
    if isinstance(value, bool):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_bool(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def page_args(default_per_page=10, max_per_page=50):
    page = max(parse_int(request.args.get("page"), 1) or 1, 1)
    per_page = parse_int(request.args.get("per_page"), default_per_page) or default_per_page
    per_page = min(max(per_page, 1), max_per_page)
    return page, per_page


def paginate(query, serializer, default_per_page=10):
    page, per_page = page_args(default_per_page)
    total = query.order_by(None).count()
    pages = max((total + per_page - 1) // per_page, 1)
    page = min(page, pages)
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    return {
        "items": [serializer(item) for item in items],
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": pages,
    }


def like(term):
    term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{term}%"
