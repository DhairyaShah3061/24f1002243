import json
import logging
import time

from flask import current_app

log = logging.getLogger(__name__)

RETRY_AFTER = 30

_client = None
_client_url = None
_skip_until = 0.0


def _redis():
    global _client, _client_url, _skip_until
    if not current_app.config.get("CACHE_ENABLED", True):
        return None
    if time.monotonic() < _skip_until:
        return None
    url = current_app.config["REDIS_URL"]
    if _client is None or _client_url != url:
        import redis

        _client = redis.Redis.from_url(
            url, decode_responses=True, socket_connect_timeout=0.5, socket_timeout=0.5
        )
        _client_url = url
    return _client


def _mark_down(exc):
    global _skip_until
    _skip_until = time.monotonic() + RETRY_AFTER
    log.warning("Redis unavailable, serving without cache for %ss: %s", RETRY_AFTER, exc)


def get_json(key):
    client = _redis()
    if client is None:
        return None
    try:
        raw = client.get(key)
    except Exception as exc:  # any redis/socket error -> behave as a cache miss
        _mark_down(exc)
        return None
    return json.loads(raw) if raw else None


def set_json(key, value, ttl):
    client = _redis()
    if client is None:
        return
    try:
        client.setex(key, ttl, json.dumps(value))
    except Exception as exc:
        _mark_down(exc)


def delete(*keys):
    client = _redis()
    if client is None or not keys:
        return
    try:
        client.delete(*keys)
    except Exception as exc:
        _mark_down(exc)


def delete_prefix(prefix):
    client = _redis()
    if client is None:
        return
    try:
        keys = list(client.scan_iter(match=f"{prefix}*", count=200))
        if keys:
            client.delete(*keys)
    except Exception as exc:
        _mark_down(exc)


def invalidate_treks():
    delete_prefix("treks:")
    delete("admin:stats")


def reset_state():
    global _client, _client_url, _skip_until
    _client = None
    _client_url = None
    _skip_until = 0.0
