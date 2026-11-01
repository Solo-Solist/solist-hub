"""Solist Hub - one window for every Solist tool.

Starts / stops each tool, shows its live log and key numbers, and shows its own page inside a tab.
Serves http://localhost:9000. Standard library only. Each tool uses its own .venv in its folder.
"""
import atexit, collections, http.client, json, os, re, shutil, signal, socket, sqlite3, subprocess, sys, threading, time, webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = 9000
HUB = Path(__file__).resolve().parent
ROOT = HUB.parent                       # the "Solist Project" folder (any drive / mount point)
TOOLS_DIR = ROOT                        # each tool sits in its own folder here
LOGS = HUB / "logs"
LOGS.mkdir(exist_ok=True)
WIN = os.name == "nt"
NO_WINDOW = 0x08000000 if WIN else 0    # run tools without a console window
# Windows keeps each tool's environment in .venv; Ubuntu uses .venv-linux, so both can sit in the same shared folder.
VENV = ".venv" if WIN else ".venv-linux"


def venv_python(folder):
    """The python of the tool's own environment (made by its setup script), or None."""
    base = TOOLS_DIR / folder
    for p in ([base / ".venv" / "Scripts" / "python.exe"] if WIN else
              [base / ".venv-linux" / "bin" / "python", base / ".venv" / "bin" / "python"]):
        if p.exists():
            return p
    return None


def tools_python(folder):
    """The tool's own environment, else the Python running the Hub."""
    p = venv_python(folder)
    return str(p) if p else sys.executable


def script(name):
    """A tool's own setup/run script: name.bat on Windows, name.sh on Ubuntu."""
    return ["cmd", "/c", f"{name}.bat"] if WIN else ["bash", f"{name}.sh"]


def in_terminal(cmd, cwd):
    """Ubuntu: the command wrapped to run in its own terminal window (like a new console on Windows), or None."""
    keep = ['bash', '-c', 'cd "$1" && shift && "$@"; echo; read -rp "Press Enter to close this window... " _', 'bash', str(cwd), *cmd]
    for term, flag in (("ptyxis", "--"), ("gnome-terminal", "--"), ("konsole", "-e"), ("xfce4-terminal", "-x"),
                       ("xterm", "-e"), ("x-terminal-emulator", "-e")):
        if shutil.which(term):
            return [term, flag, *keep]
    return None


def py_script(folder, script, *args):
    """Run a tool script as __main__ with its folder importable and webbrowser.open silenced (the Hub shows the page)."""
    path = str(TOOLS_DIR / folder / script)
    boot = ("import runpy,sys,os,webbrowser;webbrowser.open=lambda *a,**k:True;"
            f"p={path!r};sys.path.insert(0,os.path.dirname(p));sys.argv=[p]+{list(args)!r};"
            "runpy.run_path(p,run_name='__main__')")
    return [tools_python(folder), "-u", "-c", boot]


def ro(db):
    """Read-only SQLite connection, or None when the file is missing."""
    return sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5) if Path(db).exists() else None


def q1(con, sql, default=0):
    try:
        r = con.execute(sql).fetchone()
        return r[0] if r and r[0] is not None else default
    except sqlite3.Error:
        return default


def port_up(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


# ------------------------------------------------------------------ numbers shown for each tool
def stats_maps():
    con = ro(TOOLS_DIR / "map_scrapper" / "gmaps.db")
    if not con:
        return [["Places", 0], ["With phone", 0], ["Jobs", 0], ["Queued / running", 0]]
    with con:
        jobs = dict(con.execute("SELECT status, COUNT(*) FROM jobs GROUP BY status").fetchall())
        return [["Places", q1(con, "SELECT COUNT(*) FROM places")],
                ["With phone", q1(con, "SELECT COUNT(*) FROM places WHERE COALESCE(phone,'')<>''")],
                ["Jobs", sum(jobs.values())],
                ["Queued / running", jobs.get("queued", 0) + jobs.get("running", 0)]]


def stats_nykaa():
    con = ro(TOOLS_DIR / "nykaa-scraper" / "nykaa.db")
    if not con:
        return [["Brands", 0], ["Brands done", 0], ["Products", 0], ["Variants", 0]]
    with con:
        return [["Brands", q1(con, "SELECT COUNT(*) FROM brand_progress")],
                ["Brands done", q1(con, "SELECT COUNT(*) FROM brand_progress WHERE done=1")],
                ["Products", q1(con, "SELECT COUNT(DISTINCT product_id) FROM variants")],
                ["Variants", q1(con, "SELECT COUNT(*) FROM variants")],
                ["Failed", q1(con, "SELECT COUNT(*) FROM failures")]]


def stats_mapper():
    con = ro(TOOLS_DIR / "nykaa_mapper" / "studio.db")
    out = [["Conversions", 0], ["Rows converted", 0], ["Manual fixes", 0]]
    if con:
        with con:
            out = [["Conversions", q1(con, "SELECT COUNT(*) FROM runs")],
                   ["Rows converted", q1(con, "SELECT SUM(rows) FROM runs")],
                   ["Manual fixes", q1(con, "SELECT COUNT(*) FROM overrides")]]
    ex = TOOLS_DIR / "nykaa_mapper" / "exports"
    out.append(["Export files", len(list(ex.glob("*.csv"))) if ex.exists() else 0])
    return out


PDF = TOOLS_DIR / "pdfcraft"
PDF_OUT = PDF / "out"


def stats_pdf():
    tools = len({p.parent.name for p in (PDF_OUT / "en" / "tools").glob("*/index.html")})
    built = "–"
    if (PDF_OUT / "index.html").exists():
        built = datetime.fromtimestamp((PDF_OUT / "index.html").stat().st_mtime).strftime("%d %b %Y, %H:%M")
    return [["PDF tools", tools or "–"], ["Built", built], ["Files stay on this PC", "yes"]]


# ------------------------------------------------------------------ checklists: [label, ok?, hint, fix action, required]
def venv_ready(folder):
    return venv_python(folder) is not None


def venv_hint(folder):
    return str(Path(folder) / VENV)


def checks_maps():
    return [["Python environment", venv_ready("map_scrapper"), venv_hint("map_scrapper"), "maps_setup"]]


def checks_nykaa():
    return [["Python environment", venv_ready("nykaa-scraper"), venv_hint("nykaa-scraper"), "nykaa_setup"]]


def checks_mapper():
    return [["Python environment", venv_ready("nykaa_mapper") or venv_ready("nykaa-scraper"), venv_hint("nykaa_mapper"), "mapper_setup"]]


def checks_pdf():
    return [["Built", (PDF_OUT / "index.html").exists(), "run pdfcraft setup once (needs Node.js)", "pdf_build"]]


def checks_node(folder, built=None):
    """Node packages installed (and the app built, when it has a build step)."""
    base = TOOLS_DIR / folder
    out = [["Node.js installed", npm() is not None, "nodejs.org, version 20 or newer", None],
           ["Packages installed", (base / "node_modules").exists(), f"run {folder}/setup once", f"{folder}_setup"]]
    if built:
        out.append(["Built", (base / built).exists(), f"run {folder}/setup once", f"{folder}_setup"])
    return out


def npm():
    """npm as installed here (npm.cmd with the Node installer, npm.exe with nvm shims), or None."""
    return shutil.which("npm")


# ------------------------------------------------------------------ extra commands per tool
# id: (label, command or url, folder under tools/, how)
#   log = output in the Hub log; console = its own window to type in; folder = open it; url = open a page
def actions():
    if WIN:
        build = ["cmd", "/c", "set NEXT_PUBLIC_LOCALES=en&& npm run build"] if npm() else None
    else:
        build = ["env", "NEXT_PUBLIC_LOCALES=en", npm(), "run", "build"] if npm() else None
    return {
        "maps_setup": ("Set up Python environment", script("setup"), "map_scrapper", "console"),
        "maps_export": ("Download all places (CSV)", "http://localhost:5000/api/export?job=all", "map_scrapper", "url"),
        "maps_mumbai": ("Run Mumbai sweets sweep", script("run_mumbai_scrape"), "map_scrapper", "console"),
        "maps_out": ("Open Mumbai output", None, "map_scrapper/mumbai_scrape_output", "folder"),
        "nykaa_setup": ("Set up Python environment", script("setup"), "nykaa-scraper", "console"),
        "nykaa_export": ("Download everything (CSV)", "http://localhost:8765/export?kind=all", "nykaa-scraper", "url"),
        "nykaa_fail": ("Download failures (CSV)", "http://localhost:8765/export?kind=failures", "nykaa-scraper", "url"),
        "mapper_setup": ("Set up Python environment", script("setup"), "nykaa_mapper", "console"),
        "mapper_exports": ("Open exports folder", None, "nykaa_mapper/exports", "folder"),
        "mapper_inbox": ("Open inbox folder", None, "nykaa_mapper/inbox", "folder"),
        "upi-id_setup": ("Install packages", script("setup"), "upi-id", "console"),
        "accounting_setup": ("Install and build", script("setup"), "accounting", "console"),
        "pdf_build": ("Rebuild Solist PDF (needs Node.js)", build, "pdfcraft", "log"),
        "pdf_out": ("Open built files", None, "pdfcraft/out", "folder"),
    }


THEME = str(HUB / "solist-theme.html")
TOOLS = [
    dict(id="maps", name="Maps Scraper", group="Lead scraping", folder="map_scrapper", port=5000,
         desc="Google Maps places by area and query; jobs, results and CSV export.",
         cmd=lambda: py_script("map_scrapper", "gmaps_dashboard.py"), stats=stats_maps, checks=checks_maps,
         actions=["maps_export", "maps_mumbai", "maps_out"]),
    dict(id="nykaa", name="Nykaa Scraper", group="Nykaa catalogue", folder="nykaa-scraper", port=8765,
         desc="Crawls Nykaa brands into nykaa.db: queue, progress, failures, CSV export.",
         cmd=lambda: py_script("nykaa-scraper", "dashboard.py"), stats=stats_nykaa, checks=checks_nykaa,
         actions=["nykaa_export", "nykaa_fail"]),
    dict(id="studio", name="Nykaa Mapper", group="Nykaa catalogue", folder="nykaa_mapper", port=8766,
         desc="Converts scraped Nykaa data to the redSales import template; review and exports.",
         cmd=lambda: py_script("nykaa_mapper", "studio.py"), stats=stats_mapper, checks=checks_mapper,
         env={"NYKAA_SRC_DB": str(TOOLS_DIR / "nykaa-scraper" / "nykaa.db")}, actions=["mapper_exports", "mapper_inbox"]),
    dict(id="pdf", name="Solist PDF", group="Documents", folder="pdfcraft", port=8090,
         desc="Merge, split, compress, convert, sign and edit PDFs. Everything runs on this PC.",
         cmd=lambda: [sys.executable, str(HUB / "static_server.py"), str(PDF_OUT), "8090"],
         stats=stats_pdf, checks=checks_pdf, actions=["pdf_build", "pdf_out"]),
    dict(id="upi", name="UPI Gateway", group="Payments", folder="upi-id", port=8091,
         desc="YouPI payment gateway running locally: control center, checkout, merchant admin.",
         cmd=lambda: script("start"), stats=lambda: [["Mode", "localhost"]],
         checks=lambda: checks_node("upi-id"), actions=["upi-id_setup"]),
    dict(id="accounting", name="GST Billing", group="Documents", folder="accounting", port=8092,
         desc="GST invoices, clients, products and expenses. Data stays in accounting/data.",
         cmd=lambda: script("start"), stats=lambda: [["Data folder", "accounting/data"]],
         checks=lambda: checks_node("accounting", "dist/index.html"), actions=["accounting_setup"]),
]
BY_ID = {t["id"]: t for t in TOOLS}

EVENTS = collections.deque(maxlen=300)


def event(level, tool, msg):
    EVENTS.appendleft((datetime.now().strftime("%Y-%m-%d %H:%M:%S"), tool, level, msg))


def open_folder(path):
    (os.startfile if WIN else lambda f: subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", f]))(str(path))


class Proc:
    def __init__(self, tool):
        self.tool, self.p, self.started = tool, None, 0
        self.lines = collections.deque(maxlen=3000)
        self.seq = 0
        self.lock = threading.Lock()

    def add(self, text):
        with self.lock:
            self.seq += 1
            self.lines.append((self.seq, datetime.now().strftime("%H:%M:%S"), text))
        try:
            with open(LOGS / f"{self.tool['id']}.log", "a", encoding="utf-8") as f:
                f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {text}\n")
        except OSError:
            pass

    def running(self):
        return self.p is not None and self.p.poll() is None

    def start(self):
        if self.running():
            return "already running"
        t = self.tool
        if port_up(t["port"]):
            return f"port {t['port']} is already in use by another program - close it first"
        bad = [c[0] for c in t["checks"]() if not c[1] and (len(c) < 5 or c[4])]
        if bad:
            return "Not ready yet: " + ", ".join(bad)
        cmd = t["cmd"]()
        env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8", "BROWSER": "none",
               "SOLIST_THEME": THEME, **t.get("env", {})}
        self.add(f"── start: {t['name']}")
        # Ubuntu: a process group of its own, so Stop also ends whatever the tool started (like taskkill /T on Windows).
        own = dict(creationflags=NO_WINDOW) if WIN else dict(start_new_session=True)
        try:
            self.p = subprocess.Popen(cmd, cwd=TOOLS_DIR / t.get("cwd", t["folder"]), env=env, stdout=subprocess.PIPE,
                                      stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, **own)
        except OSError as e:
            self.add(f"could not start: {e}")
            return str(e)
        self.started = time.time()
        threading.Thread(target=self.pump, args=(self.p,), daemon=True).start()
        return "ok"

    def pump(self, p):
        for raw in iter(p.stdout.readline, b""):
            self.add(raw.decode("utf-8", "replace").rstrip())
        code = p.wait()
        self.add(f"── stopped (exit code {code})")
        if code not in (0, 1, -signal.SIGTERM):            # taskkill /F gives 1, SIGTERM -15: a normal Stop
            event("error", self.tool["name"], f"exited (code {code})")

    def action(self, aid):
        label, cmd, folder, how = actions()[aid]
        cwd = TOOLS_DIR / folder if folder else ROOT
        if how == "folder":
            cwd.mkdir(parents=True, exist_ok=True)
            open_folder(cwd)
            return "ok"
        if how == "url":
            return "url:" + cmd
        if cmd is None:
            return "Install Node.js first (nodejs.org), then try again."
        if how == "detach":
            subprocess.Popen(cmd, cwd=cwd)
            return "ok"
        if how == "console" and not WIN:                    # no terminal app found: show the output in the Hub log
            wrapped = in_terminal(cmd, cwd)
            cmd, how = (wrapped, how) if wrapped else (cmd, "log")
        if how == "console":
            self.add(f"── {label}: opened in its own window")
            subprocess.Popen(cmd, cwd=cwd, creationflags=subprocess.CREATE_NEW_CONSOLE if WIN else 0)
            event("info", self.tool["name"], f"{label} (own window)")
            return "ok"
        self.add(f"── {label}")
        event("info", self.tool["name"], label)

        def go():
            try:
                q = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                     env={**os.environ, "PYTHONIOENCODING": "utf-8", "FORCE_COLOR": "0"},
                                     creationflags=NO_WINDOW)
            except OSError as e:
                self.add(f"could not run: {e}")
                return
            for raw in iter(q.stdout.readline, b""):
                self.add(raw.decode("utf-8", "replace").rstrip())
            code = q.wait()
            self.add(f"── {label}: {'done' if code == 0 else 'failed (code %s)' % code}")
            event("ok" if code == 0 else "error", self.tool["name"], f"{label}: {'done' if code == 0 else 'failed'}")
        threading.Thread(target=go, daemon=True).start()
        return "ok"

    def stop(self):
        if not self.running():
            return "not running"
        if WIN:
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(self.p.pid)], capture_output=True, creationflags=NO_WINDOW)
        else:
            self.kill_group(signal.SIGTERM)
        try:
            self.p.wait(10)
        except subprocess.TimeoutExpired:
            self.p.kill() if WIN else self.kill_group(signal.SIGKILL)
        return "ok"

    def kill_group(self, sig):
        """Ubuntu: signal the tool's whole process group (it was started in a session of its own)."""
        try:
            os.killpg(self.p.pid, sig)
        except OSError:
            self.p.send_signal(sig)


PROCS = {t["id"]: Proc(t) for t in TOOLS}
atexit.register(lambda: [p.stop() for p in PROCS.values()])


def state():
    acts = actions()
    out = []
    for t in TOOLS:
        p = PROCS[t["id"]]
        mine, up = p.running(), port_up(t["port"])
        status = ("running" if up else "starting") if mine else ("external" if up else "stopped")
        try:
            stats = t["stats"]()
        except Exception as e:  # noqa: BLE001
            stats = [["Stats error", str(e)[:60]]]
        try:
            checks = t["checks"]()
        except Exception as e:  # noqa: BLE001
            checks = [["Check failed", False, str(e)[:80], None]]
        checks = [c[:4] + [acts[c[3]][0] if c[3] else None, c[4] if len(c) > 4 else True] for c in checks]
        url = f"http://localhost:{t['port']}"
        out.append(dict(id=t["id"], name=t["name"], group=t["group"], desc=t["desc"], port=t["port"],
                        url=url, frame=url, embed=True, checks=checks,
                        actions=[[a, acts[a][0], acts[a][3]] for a in t.get("actions", [])],
                        status=status, pid=p.p.pid if mine else None,
                        uptime=int(time.time() - p.started) if mine else 0, stats=stats,
                        folder=str(TOOLS_DIR / t["folder"])))
    return out


PAGE = HUB / "hub.html"

# ------------------------------------------------------------------ tool pages through the Hub's own port (for the ngrok link)
# /t/<tool>/... is forwarded to that tool on 127.0.0.1:<its port> - only the tools' own ports, never any other host.
# The tools' pages use root paths ('/api/...'); in HTML they get the /t/<tool> prefix, and a small script catches the rest.
# Solist PDF (a Next.js site full of /_next/... paths) is not prefixed: paths the Hub does not use go to it as they are.
HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding",
       "upgrade", "host", "accept-encoding", "content-length"}
ROOT_REF = re.compile(r'''([=(]\s*)(["'`])/(?=[A-Za-z_?])''')
SHIM = ("<script>(()=>{const P=%s,f=u=>typeof u=='string'&&u[0]=='/'&&u[1]!='/'&&!u.startsWith(P+'/')?P+u:u;"
        "const F=window.fetch;window.fetch=(u,o)=>F(f(u),o);const X=XMLHttpRequest.prototype.open;"
        "XMLHttpRequest.prototype.open=function(m,u,...a){return X.call(this,m,f(u),...a)};"
        "const O=window.open;window.open=(u,...a)=>O(f(u),...a)})()</script>")


def via_hub(url):
    """http://localhost:<tool port>/x -> the same page through the Hub (/t/<tool>/x, or /x for Solist PDF)."""
    u = urlparse(url)
    t = next((t for t in TOOLS if t["port"] == u.port), None)
    if not t or u.hostname not in ("localhost", "127.0.0.1"):
        return url
    return ("" if t["id"] == "pdf" else f"/t/{t['id']}") + (u.path or "/") + (f"?{u.query}" if u.query else "")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def proxy(self, port, path, prefix=""):
        """Forward this request to a tool on 127.0.0.1:<port>; HTML is rewritten for /t/<tool>, the rest streams through."""
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else None
        hdrs = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        if body is not None:
            hdrs["Content-Length"] = str(n)
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=600)
        try:
            conn.request(self.command, path, body, hdrs)
            r = conn.getresponse()
        except OSError as e:
            conn.close()
            return self.send(json.dumps({"error": f"the tool on port {port} is not answering ({e})"}), code=502)
        html = bool(prefix) and (r.getheader("Content-Type") or "").startswith("text/html")
        self.send_response(r.status)
        for k, v in r.getheaders():
            if k.lower() in HOP - {"content-length"} or (html and k.lower() == "content-length"):
                continue
            if k.lower() == "location":
                v = via_hub(v)
                v = prefix + v if prefix and v.startswith("/") and not v.startswith(("//", prefix + "/")) else v
            self.send_header(k, v)
        try:
            if html:
                text = ROOT_REF.sub(lambda m: f"{m[1]}{m[2]}{prefix}/", r.read().decode("utf-8", "surrogateescape"))
                shim = SHIM % json.dumps(prefix)
                i = text.lower().find("<head>")
                text = text[:i + 6] + shim + text[i + 6:] if i >= 0 else shim + text
                out = text.encode("utf-8", "surrogateescape")
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(out)
            else:
                self.end_headers()
                while self.command != "HEAD" and (chunk := r.read1(65536)):
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except ConnectionError:                              # the browser went away: nothing to do
            pass
        finally:
            conn.close()

    def tool_route(self):
        """Handle /t/<tool>/... ; True when it was one."""
        m = re.match(r"^/t/([a-z]+)(/.*)?$", self.path)
        if not m or m[1] not in BY_ID or m[1] == "pdf":
            return False
        if not m[2]:                                         # /t/maps -> /t/maps/ so relative links resolve
            self.send_response(301)
            self.send_header("Location", f"/t/{m[1]}/")
            self.send_header("Content-Length", "0")
            self.end_headers()
        else:
            self.proxy(BY_ID[m[1]]["port"], m[2], f"/t/{m[1]}")
        return True

    def do_HEAD(self):
        self.tool_route() or self.proxy(BY_ID["pdf"]["port"], self.path)

    do_PUT = do_PATCH = do_DELETE = lambda self: self.tool_route() or self.send('{"error":"not found"}', code=404)

    def send(self, body, ctype="application/json", code=200):
        b = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "SAMEORIGIN")   # the Hub frames its own Transcribed page; other sites still can't
        self.end_headers()
        self.wfile.write(b)

    def local(self):
        """True when the page was opened on this computer, False through a tunnel (ngrok sends its own Host)."""
        return urlparse("//" + (self.headers.get("Host") or "")).hostname in ("localhost", "127.0.0.1", "::1")

    def do_GET(self):
        if self.tool_route():
            return
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == "/":
            self.send(PAGE.read_text(encoding="utf-8"), "text/html; charset=utf-8")
        elif u.path == "/api/state":
            tools = state()
            if not self.local():                          # through ngrok: the tools' pages come through the Hub's port
                for t in tools:
                    t.update(url=via_hub(t["url"]) + ("en/" if t["id"] == "pdf" else ""), remote=True)
                    t["frame"] = t["url"].rstrip("/")
            self.send(json.dumps(tools))
        elif u.path == "/api/events":
            self.send(json.dumps(list(EVENTS)))
        elif u.path == "/api/logs" and q.get("id") in PROCS:
            p, after = PROCS[q["id"]], int(q.get("after", 0) or 0)
            with p.lock:
                rows = [l for l in p.lines if l[0] > after]
            self.send(json.dumps(rows[-1000:]))
        elif port_up(BY_ID["pdf"]["port"]):              # a Solist PDF path (/en/..., /_next/...)
            self.proxy(BY_ID["pdf"]["port"], self.path)
        else:
            self.send('{"error":"not found"}', code=404)

    def do_POST(self):
        if self.tool_route():
            return
        # Only the Hub's own page sends this header. A web page elsewhere cannot add it
        # without the browser asking first, so it cannot start, stop or run anything here.
        if self.headers.get("X-Solist-Hub") != "1":
            return self.send('{"error":"forbidden"}', code=403)
        u = urlparse(self.path)
        tid = parse_qs(u.query).get("id", [""])[0]
        if tid not in PROCS:
            return self.send('{"error":"unknown tool"}', code=404)
        p, act = PROCS[tid], u.path.rsplit("/", 1)[-1]
        name = BY_ID[tid]["name"]
        if act in ("start", "restart"):
            if act == "restart":
                p.stop()
            r = p.start()
            event("ok" if r == "ok" else "warn", name, ("started" if act == "start" else "restarted") if r == "ok" else r)
        elif act == "action":
            aid = parse_qs(u.query).get("a", [""])[0]
            allowed = BY_ID[tid].get("actions", []) + [c[3] for c in BY_ID[tid]["checks"]() if c[3]]
            if aid not in allowed:
                return self.send('{"error":"unknown action"}', code=400)
            r = p.action(aid)
            if not self.local() and r.startswith("url:"):
                r = "url:" + via_hub(r[4:])
        elif act == "stop":
            r = p.stop()
            if r == "ok":
                event("info", name, "stopped")
        elif act == "folder":
            open_folder(TOOLS_DIR / BY_ID[tid]["folder"])
            r = "ok"
        elif act == "clear":
            with p.lock:
                p.lines.clear()
            r = "ok"
        else:
            return self.send('{"error":"unknown action"}', code=400)
        self.send(json.dumps({"result": r}))


# ------------------------------------------------------------------ the Hub's own window
def browser_exe():
    if not WIN:
        names = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge",
                 "microsoft-edge-stable", "brave-browser")
        return next((shutil.which(n) for n in names if shutil.which(n)), None)
    bases = [os.environ.get(k, "") for k in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
    exes = [Path(b) / rel for b in bases if b
            for rel in (r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe")]
    return next((str(e) for e in exes if e.exists()), None)


# The window's browser profile. Ubuntu keeps its own in ~/.config (the Windows Edge profile in hub/.window is
# not usable by Chrome on Linux, and snap browsers cannot write to removable drives).
PROFILE = HUB / ".window" if WIN else Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "solist-hub" / "window"


def open_window():
    exe = browser_exe()
    if not exe:
        webbrowser.open(f"http://localhost:{PORT}")
        return None
    # Ubuntu: --class gives the window its own identity, so the dock shows the Solist Hub launcher's icon (StartupWMClass).
    return subprocess.Popen([exe, f"--app=http://localhost:{PORT}", f"--user-data-dir={PROFILE}", "--window-size=1500,950",
                             "--no-first-run", "--no-default-browser-check", *([] if WIN else ["--class=SolistHub"])])


def window_open():
    """True while any browser process uses the Hub's own window profile."""
    if not WIN:
        try:
            return subprocess.run(["pgrep", "-f", "--", re.escape(f"--user-data-dir={PROFILE}")],
                                  capture_output=True, timeout=10).returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            return True
    needle = str(PROFILE).replace("'", "''")
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command",
                              "(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe' or Name='chrome.exe'\" | "
                              f"? {{ $_.CommandLine -like '*{needle}*' }}).Count"],
                             capture_output=True, text=True, timeout=30, creationflags=NO_WINDOW).stdout.strip()
        return out not in ("", "0")
    except (OSError, subprocess.TimeoutExpired):
        return True


def app_window(srv):
    """Open the Hub as its own desktop window (Edge or Chrome app mode). Closing the window closes the Hub."""
    first = open_window()
    if first is None:
        return
    # The browser's launcher can return at once, so watch for the window itself. Quit only after
    # the window was seen and then closed; if it never appears, keep running in a normal browser tab.
    for _ in range(10):
        time.sleep(2)
        if window_open():
            break
    else:
        event("warn", "Hub", "The app window did not open, so the Hub opened in your browser instead")
        webbrowser.open(f"http://localhost:{PORT}")
        return
    misses = 0
    while misses < 2:
        time.sleep(3)
        misses = 0 if window_open() else misses + 1
    srv.shutdown()                                        # window closed: stop every tool and quit


if __name__ == "__main__":
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    except OSError:
        # Already running (or the port is busy): show that Hub instead of failing without a word.
        if port_up(PORT):
            open_window() if "--app" in sys.argv else webbrowser.open(f"http://localhost:{PORT}")
        sys.exit(0)
    event("ok", "Hub", "Solist Hub opened")
    print(f"Solist Hub running at http://localhost:{PORT}")
    if "--app" in sys.argv:
        threading.Thread(target=app_window, args=(srv,), daemon=True).start()
    elif "--no-browser" not in sys.argv:
        threading.Timer(1, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        for p in PROCS.values():
            p.stop()
