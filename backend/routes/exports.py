import logging
import re

from celery.result import AsyncResult
from flask import Blueprint, g

from backend.auth import roles_required
from backend.jobs.celery_app import celery
from backend.jobs.tasks import export_bookings_csv
from backend.utils import err, ok

log = logging.getLogger(__name__)

exports_bp = Blueprint("exports", __name__, url_prefix="/api/export")

TASK_ID_RE = re.compile(r"^[0-9a-fA-F-]{8,64}$")
NOT_FOUND = "Export not found."
UNAVAILABLE = "The export service is not available right now. Please try again later."


def _own_result(task_id):
    if not TASK_ID_RE.match(task_id):
        return None, err(NOT_FOUND, 404)
    try:
        res = AsyncResult(task_id, app=celery)
        state = res.state
        value = res.result if state == "SUCCESS" else None
    except Exception:
        log.exception("Could not read export task %s", task_id)
        return None, err(UNAVAILABLE, 503)
    if state == "SUCCESS" and (not isinstance(value, dict) or value.get("user_id") != g.user.id):
        return None, err(NOT_FOUND, 404)
    return res, None


@exports_bp.post("")
@roles_required("user")
def start_export():
    try:
        task = export_bookings_csv.delay(g.user.id)
    except Exception:
        log.exception("Could not queue export for user %s", g.user.id)
        return err(UNAVAILABLE, 503)
    return ok({"task_id": task.id}, "Export started. The CSV will be emailed to you.", 202)


@exports_bp.get("/<task_id>")
@roles_required("user")
def export_status(task_id):
    res, error = _own_result(task_id)
    if error:
        return error
    data = {"state": res.state}
    if res.state == "SUCCESS":
        data["emailed"] = bool(res.result.get("emailed"))
    return ok(data)
