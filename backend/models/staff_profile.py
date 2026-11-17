from backend.extensions import db
from backend.utils import utcnow


class StaffProfile(db.Model):

    __tablename__ = "staff_profile"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    contact = db.Column(db.String(20))
    experience_years = db.Column(db.Integer, nullable=False, default=0)
    specialization = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    # Adds `user.staff_profile` (one-to-one) to the User model.
    user = db.relationship(
        "User", backref=db.backref("staff_profile", uselist=False, cascade="all, delete-orphan")
    )
    # Adds `trek.assigned_staff` to the Trek model.
    treks = db.relationship("Trek", backref="assigned_staff", lazy="dynamic")

    @property
    def code(self):
        return f"TS{self.id:03d}"

    @property
    def status(self):
        if self.user.is_blacklisted:
            return "Blacklisted"
        if not self.user.is_active:
            return "Inactive"
        return "Active"
