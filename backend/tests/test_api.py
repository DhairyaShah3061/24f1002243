"""API tests for the rules in the problem statement.

Run from the project root folder:
    python -m unittest discover -s backend/tests -t . -v

They need your parts (User, Trek, auth) to be written, because every test logs in.
Each test gets a fresh SQLite file and Redis caching switched off.
"""
import os
import tempfile
import threading
import unittest
from datetime import date, timedelta

from backend.app import create_app
from backend.cache import reset_state
from backend.extensions import db

ADMIN = {"email": "admin@test.local", "password": "admin-pass"}


def day(offset):
    return (date.today() + timedelta(days=offset)).isoformat()


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.export_dir = tempfile.mkdtemp()
        self.app = create_app({
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///" + self.db_path,
            "CACHE_ENABLED": False,
            "ADMIN_EMAIL": ADMIN["email"],
            "ADMIN_PASSWORD": ADMIN["password"],
            "EXPORT_DIR": self.export_dir,
        })
        self.client = self.app.test_client()
        self.admin = self.login(**ADMIN)

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.engine.dispose()
        os.remove(self.db_path)
        reset_state()

    # ------------------------------------------------------------ helpers
    def login(self, email, password, expect=200):
        res = self.client.post("/api/login", json={"email": email, "password": password})
        self.assertEqual(res.status_code, expect, res.get_json())
        return res.get_json()["data"]["token"] if expect == 200 else None

    def call(self, method, url, token=None, json=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return getattr(self.client, method)(url, json=json, headers=headers)

    def register(self, name="Trekker One", email="t1@test.local", password="secret1"):
        res = self.client.post("/api/register", json={
            "name": name, "email": email, "password": password,
            "confirm_password": password, "phone": "9876543210",
        })
        self.assertEqual(res.status_code, 201, res.get_json())
        return self.login(email, password)

    def make_staff(self, email="staff1@test.local"):
        res = self.call("post", "/api/admin/staff", self.admin, {
            "name": "Staff " + email, "email": email, "phone": "9123456780",
            "password": "staffpass", "confirm_password": "staffpass",
            "specialization": "Snow", "experience_years": 3,
        })
        self.assertEqual(res.status_code, 201, res.get_json())
        return res.get_json()["data"]["id"], self.login(email, "staffpass")

    def make_trek(self, staff_id=None, **overrides):
        body = {
            "name": "Test Trek", "location": "Uttarakhand", "difficulty": "Moderate",
            "start_date": day(10), "end_date": day(14), "total_slots": 5,
            "price": 1000, "status": "Open", "assigned_staff_id": staff_id,
        }
        body.update(overrides)
        res = self.call("post", "/api/admin/treks", self.admin, body)
        self.assertEqual(res.status_code, 201, res.get_json())
        return res.get_json()["data"]

    def book(self, token, trek_id):
        return self.call("post", "/api/bookings", token, {"trek_id": trek_id})


class AuthAndRoles(ApiTestCase):
    def test_admin_seed_runs_once(self):
        from backend.auth import seed_admin
        from backend.models import User
        with self.app.app_context():
            seed_admin()
            seed_admin()
            self.assertEqual(User.query.filter_by(role="admin").count(), 1)

    def test_register_validation(self):
        bad = [
            {"name": "", "email": "a@b.co", "password": "secret1", "confirm_password": "secret1"},
            {"name": "A", "email": "not-an-email", "password": "secret1", "confirm_password": "secret1"},
            {"name": "A", "email": "a@b.co", "password": "123", "confirm_password": "123"},
            {"name": "A", "email": "a@b.co", "password": "secret1", "confirm_password": "secret2"},
        ]
        for body in bad:
            self.assertEqual(self.client.post("/api/register", json=body).status_code, 400, body)

    def test_register_cannot_choose_role_and_duplicate_email_conflicts(self):
        res = self.client.post("/api/register", json={
            "name": "Sneaky", "email": "s@test.local", "password": "secret1",
            "confirm_password": "secret1", "role": "admin",
        })
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.get_json()["data"]["user"]["role"], "user")
        res = self.client.post("/api/register", json={
            "name": "Again", "email": "S@test.local", "password": "secret1", "confirm_password": "secret1",
        })
        self.assertEqual(res.status_code, 409)

    def test_login_returns_role(self):
        res = self.client.post("/api/login", json=ADMIN)
        self.assertEqual(res.get_json()["data"]["user"]["role"], "admin")
        self.login(ADMIN["email"], "wrong", expect=401)

    def test_no_token_is_401_and_wrong_role_is_403(self):
        self.assertEqual(self.call("get", "/api/admin/stats").status_code, 401)
        user = self.register()
        self.assertEqual(self.call("get", "/api/admin/stats", user).status_code, 403)
        self.assertEqual(self.call("get", "/api/staff/treks", user).status_code, 403)

    def test_blacklist_takes_effect_on_next_request(self):
        user = self.register()
        self.assertEqual(self.call("get", "/api/bookings/mine", user).status_code, 200)
        uid = self.call("get", "/api/profile", user).get_json()["data"]["id"]
        self.call("put", f"/api/admin/users/{uid}/blacklist", self.admin, {"blacklisted": True})
        res = self.call("get", "/api/bookings/mine", user)
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.get_json().get("code"), "ACCOUNT_BLOCKED")
        self.login("t1@test.local", "secret1", expect=403)
        self.call("put", f"/api/admin/users/{uid}/blacklist", self.admin, {"blacklisted": False})
        self.login("t1@test.local", "secret1")

    def test_deactivated_staff_cannot_log_in(self):
        staff_id, _ = self.make_staff()
        self.call("put", f"/api/admin/staff/{staff_id}/active", self.admin, {"active": False})
        self.login("staff1@test.local", "staffpass", expect=403)


class AdminTreks(ApiTestCase):
    def test_trek_validation(self):
        cases = [
            {"difficulty": "Extreme"},
            {"total_slots": -2},
            {"total_slots": 0},
            {"end_date": day(5), "start_date": day(10)},
            {"start_date": day(-3), "end_date": day(1)},
            {"price": -5},
            {"name": ""},
        ]
        for override in cases:
            body = {"name": "X", "location": "Y", "difficulty": "Easy", "start_date": day(10),
                    "end_date": day(12), "total_slots": 5, "price": 10}
            body.update(override)
            self.assertEqual(self.call("post", "/api/admin/treks", self.admin, body).status_code, 400, override)

    def test_duration_is_computed_from_dates(self):
        trek = self.make_trek(start_date=day(10), end_date=day(14))
        self.assertEqual(trek["duration_days"], 5)

    def test_search_and_delete_rules(self):
        trek = self.make_trek(name="Hampta Pass")
        res = self.call("get", "/api/admin/treks?q=hampta", self.admin).get_json()["data"]
        self.assertEqual(res["total"], 1)
        user = self.register()
        self.book(user, trek["id"])
        self.assertEqual(self.call("delete", f"/api/admin/treks/{trek['id']}", self.admin).status_code, 409)
        empty = self.make_trek(name="Empty")
        self.assertEqual(self.call("delete", f"/api/admin/treks/{empty['id']}", self.admin).status_code, 200)

    def test_total_slots_cannot_go_below_bookings(self):
        trek = self.make_trek(total_slots=3)
        for i in range(2):
            self.book(self.register(email=f"u{i}@test.local"), trek["id"])
        body = dict(trek, total_slots=1, assigned_staff_id=None)
        self.assertEqual(self.call("put", f"/api/admin/treks/{trek['id']}", self.admin, body).status_code, 409)
        body["total_slots"] = 6
        res = self.call("put", f"/api/admin/treks/{trek['id']}", self.admin, body).get_json()["data"]
        self.assertEqual(res["available_slots"], 4)

    def test_cannot_assign_blacklisted_staff(self):
        staff_id, _ = self.make_staff()
        self.call("put", f"/api/admin/staff/{staff_id}/blacklist", self.admin, {"blacklisted": True})
        trek = self.make_trek()
        res = self.call("put", f"/api/admin/treks/{trek['id']}/assign", self.admin, {"staff_id": staff_id})
        self.assertEqual(res.status_code, 409)


class BookingRules(ApiTestCase):
    def test_only_open_treks_are_bookable(self):
        user = self.register()
        for status in ("Pending", "Approved", "Closed"):
            trek = self.make_trek(status=status, name=status)
            self.assertEqual(self.book(user, trek["id"]).status_code, 409, status)

    def test_duplicate_rejected_and_rebook_after_cancel(self):
        user = self.register()
        trek = self.make_trek(total_slots=2)
        first = self.book(user, trek["id"])
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.book(user, trek["id"]).status_code, 409)
        bid = first.get_json()["data"]["id"]
        self.assertEqual(self.call("put", f"/api/bookings/{bid}/cancel", user).status_code, 200)
        detail = self.client.get(f"/api/treks/{trek['id']}").get_json()["data"]
        self.assertEqual(detail["available_slots"], 2)  # seat restored
        self.assertEqual(self.book(user, trek["id"]).status_code, 201)  # rebooking allowed

    def test_full_trek_rejected(self):
        trek = self.make_trek(total_slots=1)
        self.assertEqual(self.book(self.register(email="a@test.local"), trek["id"]).status_code, 201)
        self.assertEqual(self.book(self.register(email="b@test.local"), trek["id"]).status_code, 409)

    def test_last_seat_race_only_one_wins(self):
        trek = self.make_trek(total_slots=1)
        tokens = [self.register(email=f"r{i}@test.local") for i in range(6)]
        results = []

        def attempt(token):
            client = self.app.test_client()
            res = client.post("/api/bookings", json={"trek_id": trek["id"]},
                              headers={"Authorization": f"Bearer {token}"})
            results.append(res.status_code)

        threads = [threading.Thread(target=attempt, args=(t,)) for t in tokens]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(results.count(201), 1, results)
        detail = self.client.get(f"/api/treks/{trek['id']}").get_json()["data"]
        self.assertEqual(detail["available_slots"], 0)

    def test_cannot_cancel_or_book_after_start(self):
        staff_id, staff = self.make_staff()
        trek = self.make_trek(staff_id=staff_id)
        user = self.register()
        bid = self.book(user, trek["id"]).get_json()["data"]["id"]
        self.assertEqual(self.call("put", f"/api/staff/treks/{trek['id']}/start", staff).status_code, 200)
        self.assertEqual(self.call("put", f"/api/bookings/{bid}/cancel", user).status_code, 409)
        other = self.register(email="late@test.local")
        self.assertEqual(self.book(other, trek["id"]).status_code, 409)

    def test_payment_rules(self):
        user = self.register()
        trek = self.make_trek()
        bid = self.book(user, trek["id"]).get_json()["data"]["id"]
        self.assertEqual(self.call("put", f"/api/bookings/{bid}/pay", user).status_code, 200)
        self.assertEqual(self.call("put", f"/api/bookings/{bid}/pay", user).status_code, 409)
        self.call("put", f"/api/bookings/{bid}/cancel", user)
        trek2 = self.make_trek(name="Second")
        bid2 = self.book(user, trek2["id"]).get_json()["data"]["id"]
        self.call("put", f"/api/bookings/{bid2}/cancel", user)
        self.assertEqual(self.call("put", f"/api/bookings/{bid2}/pay", user).status_code, 409)

    def test_cannot_touch_someone_elses_booking(self):
        trek = self.make_trek()
        owner = self.register(email="owner@test.local")
        bid = self.book(owner, trek["id"]).get_json()["data"]["id"]
        thief = self.register(email="thief@test.local")
        self.assertEqual(self.call("put", f"/api/bookings/{bid}/cancel", thief).status_code, 404)


class StaffRules(ApiTestCase):
    def test_staff_sees_and_manages_only_assigned_treks(self):
        s1, t1 = self.make_staff("s1@test.local")
        s2, t2 = self.make_staff("s2@test.local")
        mine = self.make_trek(staff_id=s1, name="Mine")
        self.make_trek(staff_id=s2, name="Theirs")
        listed = self.call("get", "/api/staff/treks", t1).get_json()["data"]
        self.assertEqual([t["name"] for t in listed], ["Mine"])
        self.assertEqual(self.call("put", f"/api/staff/treks/{mine['id']}", t2, {"status": "Closed"}).status_code, 403)
        self.assertEqual(self.call("put", f"/api/staff/treks/{mine['id']}/start", t2).status_code, 403)

    def test_slot_limits_for_staff(self):
        s1, staff = self.make_staff()
        trek = self.make_trek(staff_id=s1, total_slots=5)
        self.book(self.register(), trek["id"])
        url = f"/api/staff/treks/{trek['id']}"
        self.assertEqual(self.call("put", url, staff, {"available_slots": -1}).status_code, 400)
        self.assertEqual(self.call("put", url, staff, {"status": "Completed"}).status_code, 400)
        res = self.call("put", url, staff, {"available_slots": 2}).get_json()["data"]
        self.assertEqual((res["available_slots"], res["total_slots"]), (2, 3))

    def test_complete_moves_bookings_to_history(self):
        s1, staff = self.make_staff()
        trek = self.make_trek(staff_id=s1)
        user = self.register()
        self.book(user, trek["id"])
        url = f"/api/staff/treks/{trek['id']}"
        self.assertEqual(self.call("put", url + "/complete", staff).status_code, 409)  # not started yet
        self.call("put", url + "/start", staff)
        self.assertEqual(self.call("put", url + "/complete", staff).status_code, 200)
        history = self.call("get", "/api/bookings/mine?history=1", user).get_json()["data"]
        self.assertEqual(history[0]["status"], "Completed")
        self.assertIsNotNone(history[0]["completed_on"])
        all_bookings = self.call("get", "/api/admin/bookings?status=Completed", self.admin).get_json()["data"]
        self.assertEqual(all_bookings["total"], 1)


class BrowseAndCache(ApiTestCase):
    def test_browse_filters(self):
        self.make_trek(name="Easy One", difficulty="Easy", location="Sikkim", end_date=day(11))
        self.make_trek(name="Hard One", difficulty="Hard", location="Ladakh", end_date=day(19))
        self.make_trek(name="Hidden", status="Pending")
        names = lambda q: [t["name"] for t in self.client.get("/api/treks" + q).get_json()["data"]["items"]]  # noqa: E731
        self.assertEqual(sorted(names("")), ["Easy One", "Hard One"])
        self.assertEqual(names("?difficulty=Hard"), ["Hard One"])
        self.assertEqual(names("?location=Sikkim"), ["Easy One"])
        self.assertEqual(names("?duration=8%2B"), ["Hard One"])
        self.assertEqual(names("?q=easy"), ["Easy One"])
        self.assertEqual(self.client.get("/api/treks?difficulty=Extreme").status_code, 400)

    def test_works_when_redis_is_down(self):
        self.app.config.update(CACHE_ENABLED=True, REDIS_URL="redis://localhost:1/0")
        self.make_trek()
        res = self.client.get("/api/treks")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("X-Cache"), "MISS")

    def test_reports_endpoint(self):
        data = self.call("get", "/api/admin/reports", self.admin).get_json()["data"]
        self.assertEqual(len(data["monthly_participation"]), 12)
        self.assertIn("treks_conducted", data["last_month"])


if __name__ == "__main__":
    unittest.main()
