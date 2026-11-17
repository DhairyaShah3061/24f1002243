import logging
import os

from flask import Flask, jsonify, render_template, request, send_from_directory
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.exceptions import HTTPException

from backend.config import INSTANCE_DIR, PROJECT_DIR, Config
from backend.extensions import db

FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")
STATIC_DIR = os.path.join(FRONTEND_DIR, "src")  # served at /static


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_connection, _record):
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_app(overrides=None):
    app = Flask(
        __name__,
        static_folder=STATIC_DIR,
        static_url_path="/static",
        template_folder="templates",
    )
    app.config.from_object(Config)
    if overrides:
        app.config.update(overrides)
    app.json.sort_keys = False

    os.makedirs(INSTANCE_DIR, exist_ok=True)
    os.makedirs(app.config["EXPORT_DIR"], exist_ok=True)
    db.init_app(app)

    # Load models and routes.
    from backend import models  # noqa: F401  (registers every table)
    from backend.auth import auth_bp, seed_admin
    from backend.routes.admin import admin_bp
    from backend.routes.bookings import bookings_bp
    from backend.routes.exports import exports_bp
    from backend.routes.profile import profile_bp
    from backend.routes.staff import staff_bp
    from backend.routes.treks import treks_bp

    for bp in (auth_bp, admin_bp, staff_bp, treks_bp, bookings_bp, profile_bp, exports_bp):
        app.register_blueprint(bp)

    # Create tables and admin.
    with app.app_context():
        db.create_all()
        seed_admin()

    _register_pages(app)
    _register_errors(app)
    return app


def _register_pages(app):
    @app.get("/sw.js")
    def service_worker():
        # Serve the service worker.
        resp = send_from_directory(FRONTEND_DIR, "sw.js", mimetype="application/javascript")
        resp.headers["Cache-Control"] = "no-cache"
        return resp

    @app.get("/manifest.webmanifest")
    def manifest():
        return send_from_directory(
            FRONTEND_DIR, "manifest.webmanifest", mimetype="application/manifest+json"
        )

    @app.get("/")
    @app.get("/<path:path>")
    def spa(path=""):
        # Serve the Vue shell.
        if path.startswith(("api/", "static/")):
            return jsonify({"error": "Not found."}), 404
        return render_template("index.html")


def _register_errors(app):
    @app.errorhandler(HTTPException)
    def http_error(exc):
        if request.path.startswith("/api/"):
            return jsonify({"error": exc.description or exc.name}), exc.code
        return exc

    @app.errorhandler(Exception)
    def server_error(exc):
        logging.getLogger(__name__).exception("Unhandled error")
        db.session.rollback()
        return jsonify({"error": "Something went wrong on the server."}), 500


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    app = create_app()
    app.run(host="127.0.0.1", port=5000, debug=True)
