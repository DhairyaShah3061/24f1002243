from backend.extensions import db
from backend.utils import utcnow


class Trek(db.Model):

    __tablename__ = "trek"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    location = db.Column(db.String(100), nullable=False, index=True)
    difficulty = db.Column(db.String(10), nullable=False, index=True)
    duration_days = db.Column(db.Integer, nullable=False)
    total_slots = db.Column(db.Integer, nullable=False)
    available_slots = db.Column(db.Integer, nullable=False)
    assigned_staff_id = db.Column(
        db.Integer, db.ForeignKey("staff_profile.id", ondelete="SET NULL"), index=True
    )
    status = db.Column(db.String(15), nullable=False, default="Pending", index=True)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)
    price = db.Column(db.Float, nullable=False, default=0)
    description = db.Column(db.Text)
    image_url = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    __table_args__ = (
        db.CheckConstraint(
            "available_slots >= 0 AND available_slots <= total_slots", name="ck_trek_slots"
        ),
        db.CheckConstraint("end_date >= start_date", name="ck_trek_dates"),
    )

    def __repr__(self):
        return f"<Trek {self.id} {self.name} ({self.status})>"
