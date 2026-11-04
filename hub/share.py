"""Share Solist Hub over the internet through ngrok, always behind a username and password.

    share.sh (Ubuntu) / share.bat (Windows) / python share.py

The login is kept in hub/.share-credentials (made on first run, private to you, never commit it).
A fixed address: put  domain=<your-name>.ngrok-free.app  in that file, or set SOLIST_NGROK_DOMAIN.
Ctrl+C (or closing the window) stops the tunnel, and the Hub too if this script started it.
"""
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

HUB = Path(__file__).resolve().parent
CRED = HUB / ".share-credentials"
PORT = 9000
WIN = os.name == "nt"


def up(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def ngrok_exe():
    local = Path.home() / ".local" / "bin" / "ngrok"
    return shutil.which("ngrok") or (str(local) if local.exists() else None)


def has_token(exe):
    """True when ngrok has an authtoken (env var or its config file). The token itself is never printed."""
    if os.environ.get("NGROK_AUTHTOKEN"):
        return True
    out = subprocess.run([exe, "config", "check"], capture_output=True, text=True).stdout.strip()
    path = out.rsplit(" at ", 1)[-1] if " at " in out else ""     # "Valid configuration file at <path>"
    try:
        return any(l.strip().startswith("authtoken:") and l.split(":", 1)[1].strip()
                   for l in open(path, encoding="utf-8"))
    except OSError:
        return False


def read_credentials(text):
    c = {k.strip(): v.strip() for k, v in (l.split("=", 1) for l in text.splitlines()
                                            if "=" in l and not l.lstrip().startswith("#"))}
    user, pw = c.get("user", ""), c.get("password", "")
    if not user or ":" in user or not 8 <= len(pw) <= 128:      # ngrok's basic-auth rules
        sys.exit(f"{CRED} needs  user=<name without ':'>  and  password=<8 to 128 characters>.")
    return user, pw, os.environ.get("SOLIST_NGROK_DOMAIN") or c.get("domain", "")


def credentials():
    """(user, password, domain, made_now). The file is created owner-only (chmod 600 on Ubuntu)."""
    made = False
    if not CRED.exists():
        fd = os.open(CRED, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write("# Login for the shared Solist Hub (share.sh / share.bat). Keep it private.\n"
                    f"user=solist\npassword={secrets.token_urlsafe(18)}\n"
                    "# Fixed address from dashboard.ngrok.com > Domains (optional):\n# domain=your-name.ngrok-free.app\n")
        made = True
    return (*read_credentials(CRED.read_text(encoding="utf-8")), made)


def stop(p):
    """Stop the Hub this script started so it also stops its tools (Ctrl+C on Ubuntu, taskkill /T on Windows)."""
    if p.poll() is not None:
        return
    if WIN:
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)], capture_output=True)
    else:
        p.send_signal(signal.SIGINT)
    try:
        p.wait(15)
    except subprocess.TimeoutExpired:
        p.kill()


def main():
    exe = ngrok_exe()
    if not exe:
        sys.exit("ngrok is not installed.\n"
                 + ("  Install: winget install -e --id Ngrok.Ngrok   (or https://ngrok.com/download)" if WIN else
                    "  Install: sudo snap install ngrok   (or download it from https://ngrok.com/download into ~/.local/bin)"))
    if not has_token(exe):
        sys.exit("ngrok has no authtoken yet:\n"
                 "  1. Sign up (free) at https://dashboard.ngrok.com\n"
                 "  2. Copy your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken\n"
                 "  3. Run:  ngrok config add-authtoken <token>\n"
                 "Then start this again.")
    user, pw, domain, made = credentials()

    hub = None
    if not up(PORT):
        print("Starting Solist Hub ...", flush=True)
        log = open(HUB / "logs" / "hub-share.log", "a", encoding="utf-8")
        hub = subprocess.Popen([sys.executable, str(HUB / "hub.py"), "--no-browser"], cwd=HUB, stdout=log,
                               stderr=subprocess.STDOUT, creationflags=0x08000000 if WIN else 0)
        for _ in range(30):
            if up(PORT):
                break
            time.sleep(0.5)
        else:
            stop(hub)
            sys.exit(f"Solist Hub did not start - see {HUB / 'logs' / 'hub-share.log'}")

    # shortcut: the password is on ngrok's command line (visible to other users of this computer in the process
    # list); move it to an ngrok traffic-policy file if this computer has other accounts.
    cmd = [exe, "http", f"127.0.0.1:{PORT}", "--log", "stdout", "--log-format", "json", "--basic-auth", f"{user}:{pw}"]
    if domain:
        cmd += ["--url", domain]
    ng = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                          errors="replace")
    shown = False
    try:
        for line in ng.stdout:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if e.get("url") and not shown:
                shown = True
                print(f"\nSolist Hub is online:  {e['url']}")
                print(f"  user:      {user}")
                print(f"  password:  {pw}   (shown once; it is saved in {CRED})" if made else
                      f"  password:  in {CRED}")
                print("Tool pages (Maps, Nykaa, PDF ...) open only on this computer; start, stop and logs work online.")
                print("Press Ctrl+C or close this window to stop sharing.\n", flush=True)
            elif e.get("lvl") in ("eror", "crit") or e.get("err") not in (None, "<nil>"):
                print("ngrok:", e.get("err") or e.get("msg"), flush=True)
        print(f"ngrok stopped (exit code {ng.wait()}).")
    except KeyboardInterrupt:
        pass
    finally:
        if ng.poll() is None:
            ng.terminate()
        if hub:
            stop(hub)


if __name__ == "__main__":
    main()
