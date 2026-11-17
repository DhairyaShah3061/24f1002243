import hashlib
import json
from datetime import date

from flask import Blueprint, current_app, request
from sqlalchemy import or_

from backend.cache import get_json, set_json
from backend.models import Trek, db
from backend.serializers import trek_to_dict
from backend.services.trek_service import DIFFICULTIES, VISIBLE_STATUSES
from backend.utils import err, like, ok, paginate

treks_bp = Blueprint("treks", __name__, url_prefix="/api/treks")

# Duration filter buckets shown in the UI dropdown.
DURATION_BUCKETS = {"1-3": (1, 3), "4-7": (4, 7), "8+": (8, None)}


def _cached(key, ttl, build):
    payload = get_json(key)
    if payload is not None:
        return payload, "HIT"
    payload = build()
    set_json(key, payload, ttl)
    return payload, "MISS"


def _with_cache_header(response, state):
    resp, status = response
    resp.headers["X-Cache"] = state
    return resp, status


@treks_bp.get("")
def list_treks():
    filters = {
        "q": request.args.get("q", "").strip(),
        "difficulty": request.args.get("difficulty", "").strip(),
        "location": request.args.get("location", "").strip(),
        "duration": request.args.get("duration", "").strip(),
        "open_only": request.args.get("open_only", "").strip(),
        "page": request.args.get("page", "1").strip(),
        "per_page": request.args.get("per_page", "9").strip(),
    }
    if filters["difficulty"] and filters["difficulty"] not in DIFFICULTIES:
        return err("Unknown difficulty.", 400)
    if filters["duration"] and filters["duration"] not in DURATION_BUCKETS:
        return err("Duration must be 1-3, 4-7 or 8+.", 400)

    digest = hashlib.md5(json.dumps(filters, sort_keys=True).encode()).hexdigest()
    key = f"treks:list:{digest}"

    def build():
        q = Trek.query.filter(Trek.status.in_(VISIBLE_STATUSES), Trek.started_at.is_(None))
        if filters["open_only"] in ("1", "true"):
            # Keep only bookable treks.
            q = q.filter(Trek.status == "Open", Trek.available_slots > 0, Trek.start_date >= date.today())
        if filters["q"]:
            pattern = like(filters["q"])
            q = q.filter(or_(
                Trek.name.ilike(pattern, escape="\\"),
                Trek.location.ilike(pattern, escape="\\"),
                Trek.description.ilike(pattern, escape="\\"),
            ))
        if filters["difficulty"]:
            q = q.filter(Trek.difficulty == filters["difficulty"])
        if filters["location"]:
            q = q.filter(Trek.location == filters["location"])
        if filters["duration"]:
            low, high = DURATION_BUCKETS[filters["duration"]]
            q = q.filter(Trek.duration_days >= low)
            if high:
                q = q.filter(Trek.duration_days <= high)
        q = q.order_by(Trek.start_date.asc(), Trek.id.asc())
        return paginate(q, trek_to_dict, default_per_page=9)

    payload, state = _cached(key, current_app.config["CACHE_TTL_TREK_LIST"], build)
    return _with_cache_header(ok(payload), state)


@treks_bp.get("/locations")
def locations():
    def build():
        rows = (
            Trek.query.with_entities(Trek.location)
            .filter(Trek.status.in_(VISIBLE_STATUSES))
            .distinct()
            .order_by(Trek.location)
            .all()
        )
        return [r[0] for r in rows]

    payload, state = _cached("treks:locations", current_app.config["CACHE_TTL_LOCATIONS"], build)
    return _with_cache_header(ok(payload), state)


@treks_bp.get("/<int:trek_id>")
def trek_detail(trek_id):
    # Hide pending treks.
    def build():
        trek = db.session.get(Trek, trek_id)
        if not trek or trek.status == "Pending":
            return None
        return trek_to_dict(trek)

    key = f"treks:detail:{trek_id}"
    payload = get_json(key)
    state = "HIT"
    if payload is None:
        state = "MISS"
        payload = build()
        if payload is None:
            return err("Trek not found.", 404)
        set_json(key, payload, current_app.config["CACHE_TTL_TREK_DETAIL"])
    return _with_cache_header(ok(payload), state)
