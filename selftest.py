"""Solist self-test: one command that checks the Hub and every tool on this computer (no internet needed).

    python3 selftest.py        (Windows: python selftest.py)

Close the Hub first. This starts its own Hub without a window, checks that it answers and refuses what it should,
starts each tool that is set up, opens its page, checks that a crashed tool is reported, stops everything,
then runs the Maps Scraper test against a fake Google Maps. Prints one line per check; exit code 1 when any fails.
"""
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HUB = "http://127.0.0.1:9000"
RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append(bool(ok))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'  (' + detail + ')' if detail else ''}", flush=True)


def skip(name, why):
    print(f"  skip  {name}  ({why})", flush=True)


def call(path, method="GET", header=True, timeout=10):
    """(status, body) of a request to the Hub."""
    req = urllib.request.Request(HUB + path, method=method, data=b"" if method == "POST" else None)
    if header and method == "POST":
        req.add_header("X-Solist-Hub", "1")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def port_up(port):
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait(cond, secs):
    end = time.time() + secs
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.5)
    return False


def tools():
    return {t["id"]: t for t in json.loads(call("/api/state")[1])}


def ready(t):
    """Set up: every check that blocks starting passed."""
    return all(c[1] for c in t["checks"] if len(c) < 6 or c[5])


def hub_tests():
    print("Hub")
    if port_up(9000):
        skip("all Hub checks", "a Hub is already running on port 9000: close it and run this again")
        return
    hub = subprocess.Popen([sys.executable, str(ROOT / "hub" / "hub.py"), "--no-browser"], cwd=ROOT / "hub",
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    started = []
    try:
        check("Hub starts", wait(lambda: port_up(9000), 20))
        st, body = call("/")
        check("Hub page loads", st == 200 and "<html" in body.lower())
        ts = tools()
        check("Hub lists the tools", len(ts) >= 5, ", ".join(ts))
        check("refuses a start from another web page", call("/api/start?id=maps", "POST", header=False)[0] == 403)
        check("refuses an unknown tool", call("/api/start?id=nope", "POST")[0] == 404)
        check("refuses an unknown action", call("/api/action?id=maps&a=rm", "POST")[0] == 400)

        for tid, t in ts.items():
            if t["status"] != "stopped":
                skip(t["name"], f"already {t['status']}")
                continue
            if not ready(t):
                skip(t["name"], "not set up on this computer: run its setup first")
                continue
            call(f"/api/start?id={tid}", "POST")
            started.append(tid)
            up = wait(lambda: tools()[tid]["status"] == "running", 90)
            ok = False
            if up:
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{t['port']}/", timeout=20) as r:
                        ok = r.status == 200
                except Exception:  # noqa: BLE001
                    pass
            check(f"{t['name']} starts and its page opens", up and ok, f"port {t['port']}")

        if started:
            tid = started[0]
            pid = tools()[tid]["pid"]
            if pid:
                os.kill(pid, signal.SIGTERM if os.name == "nt" else signal.SIGKILL)
                said = wait(lambda: any(e[1] == ts[tid]["name"] and "crashed" in e[3]
                                        for e in json.loads(call("/api/events")[1])), 15)
                check("reports a tool that crashed", said, ts[tid]["name"])
                started.remove(tid)
        for tid in started:
            call(f"/api/stop?id={tid}", "POST")
        check("stops every tool", wait(lambda: all(tools()[t]["status"] == "stopped" for t in started), 30))
    finally:
        for tid in started:
            call(f"/api/stop?id={tid}", "POST")
        hub.terminate()
        hub.wait(10)


def maps_tests():
    py = ROOT / "map_scrapper" / (".venv/Scripts/python.exe" if os.name == "nt" else ".venv-linux/bin/python")
    if not py.exists():
        py = ROOT / "map_scrapper" / ".venv" / "bin" / "python"
    if not py.exists():
        print("Maps Scraper")
        skip("Maps Scraper test", "not set up on this computer: run map_scrapper's setup first")
        return
    r = subprocess.run([str(py), "selftest_maps.py"], cwd=ROOT / "map_scrapper", capture_output=True, text=True)
    lines = [l for l in r.stdout.splitlines() if l.startswith(("  PASS", "  FAIL", "Maps"))]
    print("\n".join(lines) or r.stdout[-2000:] + r.stderr[-2000:])
    RESULTS.extend(l.startswith("  PASS") for l in lines if l.startswith("  "))
    if r.returncode and not any(l.startswith("  FAIL") for l in lines):
        check("Maps Scraper test ran", False, (r.stderr.strip().splitlines() or ["no output"])[-1][:120])


if __name__ == "__main__":
    print("Solist self-test")
    hub_tests()
    maps_tests()
    print(f"\n{sum(RESULTS)} of {len(RESULTS)} passed")
    sys.exit(0 if RESULTS and all(RESULTS) else 1)
