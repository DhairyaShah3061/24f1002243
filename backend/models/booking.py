from backend.extensions import db
from backend.utils import utcnow


class Booking(db.Model):

    __tablename__ = "booking"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    trek_id = db.Column(db.Integer, db.ForeignKey("trek.id"), nullable=False, index=True)
    booking_date = db.Column(db.DateTime, nullable=False, default=utcnow)
    status = db.Column(db.String(20), nullable=False, default="Booked")
    payment_status = db.Column(db.String(20), nullable=False, default="Pending")
    amount = db.Column(db.Float, nullable=False, default=0.0)  # trek price when booked
    paid_on = db.Column(db.DateTime)
    cancelled_on = db.Column(db.DateTime)
    completed_on = db.Column(db.DateTime)

    # Link bookings to both models.
    user = db.relationship("User", backref=db.backref("bookings", lazy="dynamic"))
    trek = db.relationship("Trek", backref=db.backref("bookings", lazy="dynamic"))

    __table_args__ = (
        # Allow one active booking per trek.
        db.Index(
            "uq_active_booking",
            "user_id",
            "trek_id",
            unique=True,
            sqlite_where=db.text("status = 'Booked'"),
        ),
        db.Index("ix_booking_status", "status"),
    )


class ReminderLog(db.Model):

    __tablename__ = "reminder_log"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(
        db.Integer, db.ForeignKey("booking.id", ondelete="CASCADE"), nullable=False
    )
    sent_on = db.Column(db.Date, nullable=False)
    channel = db.Column(db.String(20), nullable=False, default="email")
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    __table_args__ = (db.UniqueConstraint("booking_id", "sent_on", name="uq_reminder_per_day"),)
