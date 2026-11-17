"""Measure API response times with and without the Redis cache (numbers for the report).

    redis-server                       (must be running)
    (the database must already contain treks)
    python -m backend.scripts.measure_cache   (run from the project root)

It calls the browse, detail and locations endpoints N times each, first with
caching off, then with caching on (after one warm-up call), and prints the
average time per request in milliseconds.
"""
import statistics
import time

from backend.app import create_app
from backend.cache import delete_prefix, reset_state
from backend.models import Trek

N = 50


def timed(client, url):
    start = time.perf_counter()
    res = client.get(url)
    elapsed = (time.perf_counter() - start) * 1000
    assert res.status_code == 200, (url, res.status_code)
    return elapsed, res.headers.get("X-Cache")


def run():
    app = create_app()
    client = app.test_client()
    with app.app_context():
        trek = Trek.query.filter(Trek.status.in_(("Open", "Approved"))).first()
        if not trek:
            raise SystemExit("No visible treks in the database.")
        urls = [
            "/api/treks?per_page=9",
            "/api/treks?difficulty=Moderate&duration=4-7",
            f"/api/treks/{trek.id}",
            "/api/treks/locations",
        ]
        delete_prefix("treks:")

    print(f"{'endpoint':48} {'no cache (ms)':>14} {'cached (ms)':>12} {'speed-up':>9}")
    for url in urls:
        app.config["CACHE_ENABLED"] = False
        cold = [timed(client, url)[0] for _ in range(N)]

        app.config["CACHE_ENABLED"] = True
        reset_state()
        timed(client, url)  # warm-up: fills the cache
        results = [timed(client, url) for _ in range(N)]
        hot = [ms for ms, _ in results]
        if any(state != "HIT" for _, state in results):
            raise SystemExit("Cache did not hit. Is redis-server running?")

        a, b = statistics.mean(cold), statistics.mean(hot)
        print(f"{url:48} {a:14.2f} {b:12.2f} {a / b:8.1f}x")


if __name__ == "__main__":
    run()
