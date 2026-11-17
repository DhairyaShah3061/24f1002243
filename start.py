import os
import shutil
import socket
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
CELERY = [PY, "-m", "celery", "-A", "backend.jobs.celery_app"]


def port_open(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def find_redis():
    for folder in (os.environ.get("REDIS_HOME"), r"C:\Users\ASUS\redis"):
        if folder:
            exe = os.path.join(folder, "redis-server.exe" if os.name == "nt" else "redis-server")
            if os.path.isfile(exe):
                return exe, folder
    exe = shutil.which("redis-server")
    return (exe, ROOT) if exe else (None, None)


def pump(name, proc):
    for line in proc.stdout:
        print(f"[{name}] {line.rstrip()}", flush=True)


def launch(name, cmd, cwd=ROOT):
    env = dict(os.environ, PYTHONUNBUFFERED="1")
    proc = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, errors="replace")
    threading.Thread(target=pump, args=(name, proc), daemon=True).start()
    return proc


def main():
    procs = {}
    if port_open(6379):
        print("[start] Redis already running on port 6379, reusing it.")
    else:
        exe, folder = find_redis()
        if not exe:
            raise SystemExit("Redis not found. Install it or set REDIS_HOME to its folder.")
        procs["redis"] = launch("redis", [exe, "--save", ""], cwd=folder)
        for _ in range(20):
            if port_open(6379):
                break
            time.sleep(0.25)

    procs["api"] = launch("api", [PY, "-m", "backend.app"])
    procs["worker"] = launch("worker", CELERY + ["worker", "-l", "info", "-P", "solo"])
    procs["beat"] = launch("beat", CELERY + ["beat", "-l", "info"])
    print("[start] App: http://127.0.0.1:5000   (Ctrl+C to stop everything)", flush=True)

    try:
        while True:
            for name, proc in procs.items():
                if proc.poll() is not None:
                    print(f"[start] {name} exited with code {proc.returncode}; stopping the rest.")
                    return
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[start] Stopping...")
    finally:
        for proc in procs.values():
            if proc.poll() is None:
                proc.terminate()
        for proc in procs.values():
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
