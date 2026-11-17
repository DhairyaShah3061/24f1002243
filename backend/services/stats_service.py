from datetime import date, datetime

from sqlalchemy import func

from backend.models import Booking, StaffProfile, Trek, User, db
from backend.serializers import booking_to_dict, trek_is_ongoing


def _month_bounds(year, month):
    start = datetime(year, month, 1)
    end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    return start, end


def previous_month(today=None):
    today = today or date.today()
    if today.month == 1:
        return today.year - 1, 12
    return today.year, today.month - 1


def _status_counts(column):
    return dict(db.session.query(column, func.count()).group_by(column).all())


def admin_stats():
    recent = Booking.query.order_by(Booking.booking_date.desc()).limit(6).all()
    return {
        "total_treks": Trek.query.count(),
        "total_users": User.query.filter_by(role="user").count(),
        "total_staff": User.query.filter_by(role="staff").count(),
        "total_bookings": Booking.query.count(),
        "treks_by_status": _status_counts(Trek.status),
        "bookings_by_status": _status_counts(Booking.status),
        "ongoing_treks": Trek.query.filter(
            Trek.started_at.isnot(None), Trek.status != "Completed"
        ).count(),
        "blocked_accounts": User.query.filter(User.is_blacklisted.is_(True)).count(),
        "recent_bookings": [booking_to_dict(b) for b in recent],
        "attention": _needs_attention(),
    }


def _needs_attention():
    upcoming = Trek.query.filter(Trek.status != "Completed", Trek.started_at.is_(None))
    pending = upcoming.filter(Trek.status == "Pending").order_by(Trek.start_date).limit(5).all()
    unassigned = (
        upcoming.filter(Trek.status != "Pending", Trek.assigned_staff_id.is_(None))
        .order_by(Trek.start_date).limit(5).all()
    )
    row = lambda t: {"id": t.id, "name": t.name, "start_date": t.start_date.isoformat()}  # noqa: E731
    return {"pending": [row(t) for t in pending], "unassigned": [row(t) for t in unassigned]}


def staff_stats(profile):
    treks = profile.treks.all()
    ids = [t.id for t in treks]
    participants = 0
    if ids:
        participants = Booking.query.filter(
            Booking.trek_id.in_(ids), Booking.status == "Booked"
        ).count()
    return {
        "assigned_treks": len(treks),
        "open_treks": sum(1 for t in treks if t.status == "Open"),
        "ongoing_treks": sum(1 for t in treks if trek_is_ongoing(t)),
        "completed_treks": sum(1 for t in treks if t.status == "Completed"),
        "total_participants": participants,
    }


def registered_counts(trek_ids):
    counts = {tid: {"Booked": 0, "Completed": 0, "Cancelled": 0} for tid in trek_ids}
    if not trek_ids:
        return counts
    rows = (
        db.session.query(Booking.trek_id, Booking.status, func.count())
        .filter(Booking.trek_id.in_(trek_ids))
        .group_by(Booking.trek_id, Booking.status)
        .all()
    )
    for trek_id, status, n in rows:
        counts[trek_id][status] = n
    return counts


def popular_treks(limit=8, since=None, until=None):
    q = (
        db.session.query(Trek.id, Trek.name, Trek.location, func.count(Booking.id).label("n"))
        .join(Booking, Booking.trek_id == Trek.id)
        .filter(Booking.status != "Cancelled")
    )
    if since:
        q = q.filter(Booking.booking_date >= since)
    if until:
        q = q.filter(Booking.booking_date < until)
    rows = q.group_by(Trek.id).order_by(func.count(Booking.id).desc(), Trek.name).limit(limit).all()
    return [{"id": r.id, "name": r.name, "location": r.location, "bookings": r.n} for r in rows]


def monthly_participation(months=12, today=None):
    today = today or date.today()
    y, m = today.year, today.month
    keys = []
    for _ in range(months):
        keys.append((y, m))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    keys.reverse()
    start, _ = _month_bounds(*keys[0])

    month_of = lambda col: func.strftime("%Y-%m", col)  # noqa: E731  (SQLite date formatting)
    booked = dict(
        db.session.query(month_of(Booking.booking_date), func.count(Booking.id))
        .filter(Booking.booking_date >= start, Booking.status != "Cancelled")
        .group_by(month_of(Booking.booking_date))
        .all()
    )
    completed = dict(
        db.session.query(month_of(Booking.completed_on), func.count(func.distinct(Booking.user_id)))
        .filter(Booking.completed_on >= start, Booking.status == "Completed")
        .group_by(month_of(Booking.completed_on))
        .all()
    )
    out = []
    for y, m in keys:
        key = f"{y:04d}-{m:02d}"
        out.append({
            "month": key,
            "label": date(y, m, 1).strftime("%b %Y"),
            "bookings": booked.get(key, 0),
            "participants": completed.get(key, 0),
        })
    return out


def monthly_activity(year, month):
    start, end = _month_bounds(year, month)
    conducted = (
        Trek.query.filter(Trek.completed_at >= start, Trek.completed_at < end)
        .order_by(Trek.completed_at)
        .all()
    )
    participants = (
        db.session.query(func.count(func.distinct(Booking.user_id)))
        .filter(
            Booking.status == "Completed",
            Booking.completed_on >= start,
            Booking.completed_on < end,
        )
        .scalar()
    )
    in_month = Booking.query.filter(Booking.booking_date >= start, Booking.booking_date < end)
    revenue = (
        db.session.query(func.coalesce(func.sum(Booking.amount), 0))
        .filter(Booking.paid_on >= start, Booking.paid_on < end, Booking.payment_status == "Paid")
        .scalar()
    )
    completed_counts = registered_counts([t.id for t in conducted])
    return {
        "year": year,
        "month": month,
        "label": date(year, month, 1).strftime("%B %Y"),
        "treks_conducted": len(conducted),
        "conducted_treks": [
            {
                "id": t.id,
                "name": t.name,
                "location": t.location,
                "start_date": t.start_date.isoformat(),
                "end_date": t.end_date.isoformat(),
                "participants": completed_counts[t.id]["Completed"],
            }
            for t in conducted
        ],
        "participants": participants or 0,
        "new_bookings": in_month.count(),
        "cancellations": Booking.query.filter(
            Booking.cancelled_on >= start, Booking.cancelled_on < end
        ).count(),
        "revenue": float(revenue or 0),
        "popular_treks": popular_treks(limit=5, since=start, until=end),
    }


def reports():
    year, month = previous_month()
    return {
        "popular_treks": popular_treks(),
        "monthly_participation": monthly_participation(),
        "treks_by_difficulty": _status_counts(Trek.difficulty),
        "treks_by_status": _status_counts(Trek.status),
        "last_month": monthly_activity(year, month),
        "staff_count": StaffProfile.query.count(),
    }
