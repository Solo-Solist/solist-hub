"""
Google Maps Scraper Dashboard  (pincode + radius grid sweep, multi-query, area presets, logs, analytics)

    pip install flask "scrapling[fetchers]" && scrapling install
    python gmaps_dashboard.py      ->  http://127.0.0.1:5000

Terminal mode (no web server):
    python gmaps_dashboard.py --run                          # Bhubaneswar + Puri + Khordha, 6 event queries -> results.csv
    python gmaps_dashboard.py --run --areas puri --queries "banquet hall,mandap" --show
    python gmaps_dashboard.py --run --pincode 751012 --radius 5 --queries "banquet hall"
    python gmaps_dashboard.py --run --resume                 # continue after Ctrl+C

Needs gmaps_scraper.py in the same folder (parser + browser actions).
"""
import csv, io, json, math, queue, random, traceback, re, sqlite3, subprocess, signal, os, sys, threading, time, urllib.error, urllib.parse, urllib.request
from flask import Flask, Response, jsonify, request
from scrapling.fetchers import DynamicSession, StealthySession
from gmaps_scraper import csv_safe, FEED, PLACE_SEL, make_scroll_action, parse_place, _accept_consent

DB = "gmaps.db"
app = Flask(__name__)
Q = queue.Queue()
STOP = set()


@app.before_request
def block_other_websites():
    origin = request.headers.get("Origin")
    if request.method not in ("GET", "HEAD") and origin and urllib.parse.urlparse(origin).netloc != request.host:
        return jsonify(error="forbidden"), 403

@app.after_request
def embeddable(resp):
    # Lets the Solist Hub show this page in its tab while the Hub is cross-origin isolated (for Solist PDF).
    resp.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    resp.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return resp


def db():
    c = sqlite3.connect(DB, timeout=30)
    c.row_factory = sqlite3.Row
    return c


def init():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, created TEXT, params TEXT, status TEXT,
            done INT DEFAULT 0, total INT DEFAULT 0, center TEXT);
        CREATE TABLE IF NOT EXISTS places(id INTEGER PRIMARY KEY, job_id INT, pid TEXT, name TEXT, category TEXT,
            rating REAL, reviews_count INT, address TEXT, phone TEXT, website TEXT, lat REAL, lng REAL,
            found_by TEXT, raw TEXT, UNIQUE(job_id, pid));
        CREATE TABLE IF NOT EXISTS reqs(job_id INT, ts INT, ok INT, ms INT);
        CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY, job_id INT, ts TEXT, level TEXT, msg TEXT);
        """)
        try:  # what the job is doing right now ("Loading list: 60 places"), shown under its progress bar
            c.execute("ALTER TABLE jobs ADD COLUMN note TEXT")
        except sqlite3.OperationalError:
            pass


def note(job, text):
    with db() as c:
        c.execute("UPDATE jobs SET note=? WHERE id=?", (text, job))


def log(job, msg, level="INFO"):
    print(f"[job {job}] {level}: {msg}", flush=True)  # also show in the terminal
    with db() as c:
        c.execute("INSERT INTO logs(job_id,ts,level,msg) VALUES(?,?,?,?)", (job, time.strftime("%H:%M:%S"), level, msg))


def req(jid, ok, t0):
    with db() as c:
        c.execute("INSERT INTO reqs VALUES(?,?,?,?)", (jid, int(time.time()), ok, int((time.time() - t0) * 1000)))


def nap(p):
    lo, hi = {"fast": (.3, .8), "normal": (1, 2), "slow": (2.5, 4.5)}[p.get("delay", "normal")]
    time.sleep(random.uniform(lo, hi))


# ---------------- geo helpers ----------------
CC = {"india": "IN", "united states": "US", "usa": "US", "uk": "GB", "united kingdom": "GB",
      "canada": "CA", "australia": "AU", "germany": "DE", "france": "FR", "brazil": "BR"}


def http_json(url):
    import ssl
    req = urllib.request.Request(url, headers={"User-Agent": "gmaps-dashboard/1.0"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=20))
    except urllib.error.URLError as e:
        if not isinstance(e.reason, ssl.SSLCertVerificationError):
            raise
        # macOS python.org Python ships without CA certificates until "Install Certificates.command" is run.
        # This is public geodata only (no logins), so retry without the check and say so in the terminal.
        print("[warn] HTTPS certificates are not set up for this Python; fetching public geodata without the check", flush=True)
        return json.load(urllib.request.urlopen(req, timeout=20, context=ssl._create_unverified_context()))


def geocode(pincode, country):
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", pincode)
    if m:  # "lat,lng" typed directly
        return float(m.group(1)), float(m.group(2))
    cc = CC.get(country.strip().lower(), country.strip().upper()[:2])
    nom = "https://nominatim.openstreetmap.org/search?format=json&limit=1&"
    pick = lambda r: (float(r[0]["lat"]), float(r[0]["lon"]))
    sources = [  # Nominatim first (more precise for postal areas); Zippopotam is only a rough last resort
        (nom + urllib.parse.urlencode({"postalcode": pincode, "country": country}), pick),
        (nom + urllib.parse.urlencode({"q": f"{pincode} {country}"}), pick),
        (f"https://api.zippopotam.us/{cc}/{urllib.parse.quote(pincode)}",
         lambda r: (float(r["places"][0]["latitude"]), float(r["places"][0]["longitude"]))),
    ]
    errs = []
    for url, fn in sources:
        try:
            return fn(http_json(url))
        except Exception as e:
            errs.append(f"{type(e).__name__}: {e}")
    raise ValueError(f"Could not geocode {pincode} ({' | '.join(errs)})")


def geocode_browser(Session, kw, p):
    url = "https://www.google.com/maps/search/" + urllib.parse.quote_plus(f"{p['pincode']} {p['country']}") + "?hl=en"
    with Session(**kw) as s:
        page = s.fetch(url, page_action=_accept_consent)
        txt = page.url + " " + str(page.html_content)
    m = (re.search(r"center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)", txt) or re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", txt)
         or re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", txt))
    if not m:
        raise ValueError("Google Maps did not resolve the pincode")
    return float(m.group(1)), float(m.group(2))


def hav(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def grid(lat, lng, radius, step):
    pts, n = [], int(radius // step)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            la = lat + i * step / 111
            lo = lng + j * step / (111 * math.cos(math.radians(lat)))
            if hav(lat, lng, la, lo) <= radius + step * 0.5:
                pts.append((la, lo))
    return pts


# ---------------- worker ----------------
def run_job(jid):
    with db() as c:
        job = c.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
    p = json.loads(job["params"])
    try:
        Session = StealthySession if p["stealth"] else DynamicSession
        kw = dict(headless=p["headless"])  # no network_idle: Maps never goes idle
        if p["proxy"]:
            kw["proxy"] = p["proxy"]
        try:
            lat, lng = geocode(p["pincode"], p["country"])
        except Exception as ge:
            log(jid, f"Geocoders failed ({ge}); asking Google Maps instead", "WARN")
            lat, lng = geocode_browser(Session, kw, p)
        if p.get("mode") == "quick" or p["radius"] <= p["step"]:
            pts = [(lat, lng)]  # one search: Google's whole list for this spot (up to ~120 places)
        else:
            step = max(p["step"], p["radius"] / 8)  # cap grid density on big radii
            pts = sorted(grid(lat, lng, p["radius"], step), key=lambda t: hav(lat, lng, t[0], t[1]))  # center-out
        queries = p["queries"]
        total = len(pts) * len(queries)
        with db() as c:
            c.execute("UPDATE jobs SET status='running', total=?, center=? WHERE id=?", (total, f"{lat},{lng}", jid))
        log(jid, f"Center {lat:.4f},{lng:.4f} (check: https://www.google.com/maps/@{lat},{lng},13z) | {len(pts)} grid cells x {len(queries)} queries = {total} searches")

        Session = StealthySession if p["stealth"] else DynamicSession
        kw = dict(headless=p["headless"])  # no network_idle: Maps never goes idle
        if p["proxy"]:
            kw["proxy"] = p["proxy"]
        with Session(**kw) as s:
            for q in queries:
                dry = 0
                for k, (la, lo) in enumerate(pts):
                    where = f"search {k + 1} of {len(pts)}" if len(pts) > 1 else "search"
                    action = make_scroll_action(p["max_per_cell"], lambda n, end, q=q, w=where:
                                                note(jid, f"'{q}', {w}: {'list loaded' if end else 'scrolling the list'}, {n} places"))
                    if jid in STOP:
                        raise KeyboardInterrupt
                    if p.get("patience", 15) and dry >= p.get("patience", 15):
                        with db() as c:
                            c.execute("UPDATE jobs SET done=done+? WHERE id=?", (len(pts) - k, jid))
                        log(jid, f"'{q}': {dry} empty cells in a row, skipping remaining {len(pts) - k}")
                        break
                    new = 0
                    try:
                        zoom = p["zoom"] if len(pts) > 1 else min(p["zoom"], 13)  # one search: a wider view gives the full list
                        url = f"https://www.google.com/maps/search/{urllib.parse.quote_plus(q)}/@{la},{lo},{zoom}z?hl=en"
                        t0 = time.time()
                        page = s.fetch(url, page_action=action)
                        req(jid, 1, t0)
                        nap(p)
                        hrefs = list(dict.fromkeys(page.css(f'{FEED} a[href*="/maps/place/"]::attr(href)').getall()))
                        if not hrefs and "/maps/place/" in page.url:
                            hrefs = [page.url]
                        new = 0
                        todo = hrefs[:p["max_per_cell"]]
                        log(jid, f"'{q}' @ {la:.3f},{lo:.3f}: Google listed {len(hrefs)} places")
                        for i, h in enumerate(todo, 1):
                            note(jid, f"'{q}', {where}: opening place {i} of {len(todo)}")
                            m = re.search(r"!1s(0x[0-9a-f]+:0x[0-9a-f]+)", h)
                            pid = m.group(1) if m else h.split("?")[0]
                            with db() as c:
                                row = c.execute("SELECT found_by FROM places WHERE job_id=? AND pid=?", (jid, pid)).fetchone()
                                if row:
                                    if q not in row["found_by"].split("|"):
                                        c.execute("UPDATE places SET found_by=? WHERE job_id=? AND pid=?",
                                                  (row["found_by"] + "|" + q, jid, pid))
                                    continue
                            t0 = time.time()
                            pg = s.fetch(h + "&hl=en", wait_selector=PLACE_SEL, page_action=_accept_consent)
                            req(jid, 1, t0)
                            d = parse_place(pg, h, p["reviews"])
                            nap(p)
                            if not d["name"]:
                                log(jid, f"place page did not load: {h[:70]}", "WARN")
                                continue
                            if len(pts) > 1 and d["lat"] and hav(lat, lng, d["lat"], d["lng"]) > p["radius"] * 1.1:
                                continue  # area sweep: outside the requested radius (one search keeps Google's whole list)
                            with db() as c:
                                c.execute("INSERT OR IGNORE INTO places(job_id,pid,name,category,rating,reviews_count,address,phone,"
                                          "website,lat,lng,found_by,raw) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                          (jid, pid, d["name"], d["category"], d["rating"], d["reviews_count"], d["address"],
                                           d["phone"], d["website"], d["lat"], d["lng"], q, json.dumps(d, ensure_ascii=False)))
                            new += 1
                        log(jid, f"'{q}' @ {la:.3f},{lo:.3f}: {len(hrefs)} seen, {new} new")
                    except KeyboardInterrupt:
                        raise
                    except Exception as e:
                        req(jid, 0, time.time())
                        log(jid, f"'{q}' @ {la:.3f},{lo:.3f} failed: {type(e).__name__}: {e}", "ERROR")
                    dry = 0 if new else dry + 1
                    with db() as c:
                        c.execute("UPDATE jobs SET done=done+1 WHERE id=?", (jid,))
        status = "finished"
    except KeyboardInterrupt:
        status = "stopped"
    except Exception as e:
        traceback.print_exc()
        log(jid, f"Job crashed: {type(e).__name__}: {e} @ " + " | ".join(l.strip() for l in traceback.format_exc().splitlines()[-4:]), "ERROR")
        status = "failed"
    STOP.discard(jid)
    with db() as c:
        if status == "finished" and not c.execute("SELECT COUNT(*) FROM reqs WHERE job_id=? AND ok=1", (jid,)).fetchone()[0]:
            status = "failed"  # every search failed: say so instead of "finished" with nothing
        c.execute("UPDATE jobs SET status=?, note=NULL WHERE id=?", (status, jid))
    log(jid, f"Job {status}")


PROCS = {}


def worker():
    """Runs each job in its own process: identical to `python gmaps_dashboard.py --test`, no thread/Playwright issues."""
    while True:
        jid = Q.get()
        if jid in STOP:  # stopped while still waiting in the queue
            STOP.discard(jid)
            with db() as c:
                c.execute("UPDATE jobs SET status='stopped' WHERE id=?", (jid,))
            continue
        with db() as c:
            c.execute("UPDATE jobs SET status='running' WHERE id=?", (jid,))
        proc = subprocess.Popen([sys.executable, os.path.abspath(__file__), "--job", str(jid)])
        PROCS[jid] = proc
        rc = proc.wait()
        PROCS.pop(jid, None)
        with db() as c:
            st = c.execute("SELECT status FROM jobs WHERE id=?", (jid,)).fetchone()
            if st and st[0] in ("running", "queued"):  # process ended without reporting a result
                status = "stopped" if jid in STOP else "failed"
                c.execute("UPDATE jobs SET status=? WHERE id=?", (status, jid))
                if status == "failed":
                    log(jid, f"Job process exited unexpectedly (code {rc}); see the terminal for details", "ERROR")
        STOP.discard(jid)


# ---------------- API ----------------
@app.post("/api/jobs")
def new_job():
    f = request.json
    qs = [x.strip() for x in f.get("query", "").split(",") if x.strip()]
    p = dict(pincode=f["pincode"].strip(), country=f.get("country") or "India", radius=float(f.get("radius") or 3),
             step=float(f.get("step") or 1.5), zoom=int(f.get("zoom") or 15), max_per_cell=int(f.get("max_per_cell") or 120),
             mode="quick" if f.get("mode") == "quick" else "sweep",
             reviews=int(f.get("reviews") or 0), stealth=bool(f.get("stealth")), headless=not f.get("show"),
             proxy=(f.get("proxy") or "").strip() or None, delay=f.get("delay") or "normal", patience=int(f.get("patience") or 15), queries=qs)
    return jsonify(id=create_job(p))


def insert_job(p):
    with db() as c:
        return c.execute("INSERT INTO jobs(created,params,status) VALUES(?,?,?)",
                         (time.strftime("%Y-%m-%d %H:%M"), json.dumps(p), "queued")).lastrowid


def create_job(p):
    jid = insert_job(p)
    Q.put(jid)
    return jid


AREAS = [("Bhubaneswar", 20.2961, 85.8245, 15), ("Puri", 19.8135, 85.8312, 12), ("Khordha", 20.1822, 85.6170, 12)]
DEFAULT_Q = ["event company", "banquet hall", "decorator", "mandap", "event", "balloon"]


@app.post("/api/preset")
def preset():
    """One job per area (Bhubaneswar, Puri, Khordha), each running every query. Jobs run one after another."""
    f = request.json or {}
    qs = [x.strip() for x in (f.get("query") or "").split(",") if x.strip()] or DEFAULT_Q
    ids = []
    for name, la, lo, r in AREAS:
        ids.append(create_job(dict(pincode=f"{la},{lo}", label=name, country="India", radius=r, step=1.5, zoom=15,
                                   max_per_cell=120, reviews=0, stealth=False, headless=not f.get("show"),
                                   proxy=(f.get("proxy") or "").strip() or None, delay=f.get("delay") or "normal",
                                   patience=10, queries=qs)))
    return jsonify(ids=ids)


def W():
    j = request.args.get("job")
    return ("WHERE job_id=?", (j,)) if j and j != "all" else ("WHERE 1=1", ())


@app.get("/api/jobs")
def jobs():
    with db() as c:
        rows = c.execute("""SELECT j.*, (SELECT COUNT(*) FROM places WHERE job_id=j.id) n,
            (SELECT COUNT(*) FROM places WHERE job_id=j.id AND COALESCE(phone,'')<>'') ph,
            (SELECT COUNT(*) FROM logs WHERE job_id=j.id AND level='ERROR') err
            FROM jobs j ORDER BY id DESC""").fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/jobs/<int:j>/run")
def run(j):
    with db() as c:
        st = c.execute("SELECT status FROM jobs WHERE id=?", (j,)).fetchone()
        if not st or st[0] in ("queued", "running"):
            return jsonify(ok=0)
        c.execute("UPDATE jobs SET status='queued', done=0 WHERE id=?", (j,))
    STOP.discard(j)
    Q.put(j)  # already-scraped places are skipped, so re-running resumes/extends
    return jsonify(ok=1)


@app.post("/api/jobs/<int:j>/stop")
def stop(j):
    STOP.add(j)
    proc = PROCS.get(j)
    if proc and proc.poll() is None:
        proc.terminate() if os.name == "nt" else proc.send_signal(signal.SIGINT)  # SIGINT -> clean "stopped"
    return jsonify(ok=1)


def job_active(c, j):
    st = c.execute("SELECT status FROM jobs WHERE id=?", (j,)).fetchone()
    return bool(st) and st[0] in ("queued", "running")


@app.post("/api/jobs/<int:j>/reset")
def reset(j):
    with db() as c:
        if job_active(c, j):
            return jsonify(ok=0, error="Stop this job first")
        for t in ("places", "logs", "reqs"):
            c.execute(f"DELETE FROM {t} WHERE job_id=?", (j,))
        c.execute("UPDATE jobs SET status='idle', done=0 WHERE id=?", (j,))
    return jsonify(ok=1)


@app.post("/api/jobs/<int:j>/delete")
def delete(j):
    with db() as c:
        if job_active(c, j):
            return jsonify(ok=0, error="Stop this job first")
        for t in ("places", "logs", "reqs"):
            c.execute(f"DELETE FROM {t} WHERE job_id=?", (j,))
        c.execute("DELETE FROM jobs WHERE id=?", (j,))
    return jsonify(ok=1)


@app.get("/api/logs")
def logs():
    w, a = W()
    with db() as c:
        r = c.execute(f"SELECT ts,level,msg FROM logs {w} ORDER BY id DESC LIMIT 200", a).fetchall()
    return jsonify([dict(x) for x in r])


@app.get("/api/places")
def places():
    w, a = W()
    q = f"%{request.args.get('q', '')}%"
    with db() as c:
        r = c.execute(f"SELECT name,category,rating,reviews_count,address,phone,website FROM places {w} AND "
                      "(name LIKE ? OR category LIKE ? OR address LIKE ?) ORDER BY reviews_count DESC LIMIT 500",
                      a + (q, q, q)).fetchall()
    return jsonify([dict(x) for x in r])


@app.get("/api/stats")
def stats():
    w, a = W()
    fields = {"name": "name IS NOT NULL", "category": "category IS NOT NULL", "rating": "rating IS NOT NULL",
              "reviews": "reviews_count IS NOT NULL", "address": "address IS NOT NULL", "phone": "COALESCE(phone,'')<>''",
              "website": "website IS NOT NULL", "coordinates": "lat IS NOT NULL",
              "hours": "raw NOT LIKE '%\"hours\": null%'", "amenities": "raw NOT LIKE '%\"attributes\": null%'",
              "photo": "raw NOT LIKE '%\"photo\": null%'"}
    with db() as c:
        one = lambda sql: c.execute(sql.replace("{W}", w), a).fetchone()
        rq = one("SELECT COUNT(*), COALESCE(SUM(ok),0), COALESCE(AVG(ms),0) FROM reqs {W}")
        rpm = [dict(r) for r in c.execute(f"SELECT ts/60 m, SUM(ok) ok, SUM(1-ok) bad FROM reqs {w} GROUP BY m "
                                          "ORDER BY m DESC LIMIT 60", a)][::-1]
        return jsonify(
            total=one("SELECT COUNT(*) FROM places {W}")[0],
            avg_rating=one("SELECT ROUND(AVG(rating),2) FROM places {W}")[0],
            avg_reviews=one("SELECT AVG(reviews_count) FROM places {W}")[0],
            max_reviews=one("SELECT MAX(reviews_count) FROM places {W}")[0],
            req_total=rq[0], req_ok=rq[1], avg_ms=round(rq[2]), rpm=rpm,
            completeness={k: one(f"SELECT COUNT(*) FROM places {{W}} AND {cond}")[0] for k, cond in fields.items()},
            ratings=[dict(r) for r in c.execute(f"SELECT CAST(rating AS INT) k, COUNT(*) v FROM places {w} AND rating IS NOT "
                                                "NULL GROUP BY k ORDER BY k DESC", a)],
            categories=[dict(r) for r in c.execute(f"SELECT COALESCE(category,'?') k, COUNT(*) v FROM places {w} GROUP BY k "
                                                   "ORDER BY v DESC LIMIT 10", a)])


@app.get("/api/export")
def export():
    w, a = W()
    with db() as c:
        cur = c.execute(f"SELECT job_id,name,category,rating,reviews_count,address,phone,website,lat,lng,found_by FROM places {w}" + (" GROUP BY pid" if w == "WHERE 1=1" else ""), a)
        rows, cols = cur.fetchall(), [d[0] for d in cur.description]
    out = io.StringIO()
    wr = csv.writer(out)
    wr.writerow(cols)
    wr.writerows(csv_safe(x) for x in rows)
    return Response(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=places.csv"})


# ---------------- UI ----------------
HTML = r"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Maps Scraper</title>
<style>
:root{--page:#fbfbfb;--card:#fff;--card2:#f3f3f4;--ink:#18181b;--mute:#71717a;--line:#e6e6e9;--ac:#ff5b1f;--okbg:#fff1ea;--ok:#e2470f}
*{box-sizing:border-box}html,body{margin:0;background:var(--page);color:var(--ink);font:14px/20px Urbanist,Inter,"Segoe UI",system-ui,sans-serif}
body{padding:16px}.wrap{max-width:1280px;margin:0 auto;display:grid;gap:14px}
button,input,select{font:inherit;color:inherit}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;min-width:0}
.head{display:flex;align-items:center;gap:12px}.head .logo{width:42px;height:42px;border-radius:12px;background:var(--ac);color:#fff;display:grid;place-items:center;font-weight:700;flex:none}
.head h1{font-size:22px!important;line-height:28px!important;margin:0;font-weight:600!important}.head p{margin:0;color:var(--mute);font-size:13px}.sp{flex:1}
.pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:6px 12px;background:var(--card);font-weight:500;white-space:nowrap}
.dot{width:8px;height:8px;border-radius:50%;background:#bbb}.run .dot{background:var(--ac);animation:bl 1s infinite}@keyframes bl{50%{opacity:.3}}
h2{font-size:16px;margin:0 0 12px;font-weight:600}
label.f{display:grid;gap:6px;font-weight:500;font-size:13px;min-width:0}label.f small{color:var(--mute);font-weight:400}
input,select{width:100%;height:44px;border:1px solid var(--line);border-radius:10px;padding:0 14px;background:var(--card);outline:0}input:focus,select:focus{border-color:var(--ac)}
.row{display:grid;gap:12px;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}
.chips{display:flex;gap:8px;flex-wrap:wrap}.chip{height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);cursor:pointer;font-weight:500;text-align:left}
.chip small{color:var(--mute);font-weight:400;margin-left:4px}.chip.on{border-color:var(--ac);background:var(--okbg);color:var(--ok)}.chip.on small{color:var(--ok)}
.startrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}
html.embedded .head>.logo,html.embedded .head>div{display:none}
.btn{height:44px;padding:0 20px;border-radius:10px;border:0;background:var(--ac);color:#fff;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;text-decoration:none;white-space:nowrap}
.btn.o{background:var(--card);color:var(--ink);border:1px solid var(--line)}.btn.sm{height:32px;padding:0 12px;font-size:13px;font-weight:500}.btn:disabled{opacity:.5;cursor:default}
.hint{color:var(--mute);font-size:13px}
details.more{margin-top:12px}details.more summary{cursor:pointer;color:var(--mute);font-size:13px}.grid4{display:grid;gap:10px;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:10px}
.checks{display:flex;gap:16px;align-items:center;margin-top:10px;flex-wrap:wrap}.checks label{display:flex;gap:6px;align-items:center}.checks input{width:auto;height:auto}
.card.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:0!important;overflow:hidden}
.kpi{padding:14px 18px;border-left:1px solid var(--line)}.kpi:first-child{border-left:0}.kpi span{color:var(--mute);font-size:13px}.kpi b{display:block;font-size:26px!important;line-height:34px;font-weight:600!important}
.job{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1.4fr) auto;gap:14px;align-items:center;padding:12px 10px;border-top:1px solid var(--line);border-radius:10px;cursor:pointer}
.job:first-of-type{border-top:0}.job:hover{background:var(--card2)}.job.sel{background:var(--okbg)}
.job b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.job .q{color:var(--mute);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar{height:8px;border-radius:8px;background:var(--card2);overflow:hidden}.bar i{display:block;height:100%;background:var(--ac);border-radius:8px;transition:width .4s}
.note{font-size:12px;color:var(--mute);margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acts{display:flex;gap:6px;align-items:center}.st{font-size:12px;font-weight:600;padding:2px 8px;border-radius:6px;background:var(--card2);color:var(--mute);text-transform:capitalize}
.st.running,.st.queued{background:var(--okbg);color:var(--ok)}.st.finished{background:#e7f7ec;color:#15803d}.st.failed,.st.stopped{background:#ffe6ec;color:#e11d48}
.x{width:32px;height:32px;border-radius:8px;border:1px solid var(--line);background:var(--card);cursor:pointer;color:var(--mute)}
.rhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}.rhead h2{margin:0}.rhead input{width:220px;height:36px}
.tbl{overflow:auto;max-height:520px;border:1px solid var(--line);border-radius:10px}
table{width:100%;border-collapse:collapse;font-size:13px}th{position:sticky;top:0;background:var(--card2);text-align:left;font-weight:600;padding:9px 10px;white-space:nowrap}
td{padding:9px 10px;border-top:1px solid var(--line);vertical-align:top}td.n{white-space:nowrap}td a{color:var(--ac)}
.empty{color:var(--mute);padding:18px 4px}
details.log summary{cursor:pointer;font-weight:600}.logs{max-height:260px;overflow:auto;font:12px/18px ui-monospace,Consolas,monospace;margin-top:10px}.ERROR{color:#e11d48}.WARN{color:#b45309}
@media(max-width:860px){.row,.grid4{grid-template-columns:minmax(0,1fr)}.head p{display:none}.card.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kpi:nth-child(3){border-left:0}.job{grid-template-columns:minmax(0,1fr)}.rhead input{width:100%}}
</style>
<div class=wrap>
<div class=head><div class=logo>M</div><div><h1>Maps Scraper</h1><p>Find businesses on Google Maps and download them as a spreadsheet.</p></div><span class=sp></span><span class=pill id=stat><span class=dot></span><span id=stxt>Idle</span></span></div>

<section class=card><h2>New search</h2>
 <div class=row>
  <label class=f>What are you looking for?<input id=queries placeholder="e.g. sweet shop, bakery" autocomplete=off><small>Several things? Separate them with commas.</small></label>
  <label class=f>Where?<input id=pincode placeholder="Pincode, area, or lat,lng" autocomplete=off><small>e.g. 400050 or 19.07,72.87</small></label>
 </div>
 <div class=f style="margin-top:14px;font-weight:500;font-size:13px">How big an area?</div>
 <div class=chips id=areas style="margin-top:6px"></div>
 <div class=startrow><button class=btn id=startb onclick=add()>▶ Start search</button><span class=hint id=est></span></div>
 <details class=more><summary>More options</summary>
  <div class=grid4>
   <label class=f>Places per search<select id=max_per_cell><option value=120 selected>All (up to ~120)</option><option value=60>60</option><option value=20>20</option></select></label>
   <label class=f>Speed<select id=delay><option value=fast>Fast</option><option value=normal selected>Normal</option><option value=slow>Slow (safer)</option></select></label>
   <label class=f>Country<input id=country value=India></label>
   <label class=f>Reviews per place<input id=reviews value=0 inputmode=numeric></label>
   <label class=f>Map zoom<input id=zoom value=15 inputmode=numeric></label>
   <label class=f>Grid step (km)<input id=step value=1.5 inputmode=decimal></label>
   <label class=f>Give up after N empty searches<input id=patience value=15 inputmode=numeric></label>
   <label class=f>Proxy<input id=proxy placeholder="http://user:pass@host:port"></label>
  </div>
  <div class=checks><label><input type=checkbox id=stealth> Stealth browser</label><label><input type=checkbox id=show> Show the browser while it works</label></div>
 </details>
</section>

<section class="card kpis" id=kpis></section>

<section class=card><div class=rhead><h2>Your searches</h2><span class=sp></span><a class="btn o sm" href="/api/export?job=all">⤓ Download everything</a></div><div id=jobs></div></section>

<section class=card><div class=rhead><h2 id=rtitle>Results</h2><span class=hint id=rcount></span><span class=sp></span><input id=search placeholder="Filter by name, category, address" oninput=load()><a class="btn sm" id=exp href="/api/export?job=all">⤓ Download CSV</a></div><div class=tbl><table id=data></table></div></section>

<details class="card log"><summary>Activity log</summary><div class=logs id=logs></div></details>
</div>
<script>
const $=i=>document.getElementById(i),api=(u,o)=>fetch(u,o).then(r=>r.json()),fmt=n=>(n??0).toLocaleString('en-IN');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const AREAS=[['quick',0,'Just this spot','1 search · fastest'],['sweep',3,'Nearby','3 km'],['sweep',5,'Wider','5 km'],['sweep',10,'Whole city','10 km']];
let J='all',jobs=[],area=0;
function drawAreas(){$('areas').innerHTML=AREAS.map((a,i)=>`<button class="chip ${i===area?'on':''}" onclick="area=${i};drawAreas()">${a[2]}<small>${a[3]}</small></button>`).join('');
 const a=AREAS[area],q=$('queries').value.split(',').filter(x=>x.trim()).length||1;
 $('est').textContent=a[0]==='quick'?`Loads Google's full list for each thing you search (up to ~120 places each).`:`Covers ${a[1]} km around the spot with several searches per thing, each loading up to ~120 places. Takes longer.`}
$('queries').addEventListener('input',drawAreas);
async function add(){const b={};for(const i of['pincode','country','step','zoom','max_per_cell','reviews','proxy','delay','patience'])b[i]=$(i).value.trim();
 b.query=$('queries').value.trim();for(const i of['stealth','show'])b[i]=$(i).checked;const a=AREAS[area];b.mode=a[0];b.radius=a[0]==='quick'?2:a[1];
 if(!b.query){$('queries').focus();return}if(!b.pincode){$('pincode').focus();return}
 $('startb').disabled=true;try{const r=await api('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});J=String(r.id)}finally{$('startb').disabled=false}refresh()}
const post=u=>api(u,{method:'POST'}).then(refresh);
function pick(id){J=String(id);refresh()}
function jobRow(j){const p=JSON.parse(j.params),live=j.status==='running'||j.status==='queued',m=(j.note||'').match(/place (\d+) of (\d+)/);
 const pct=j.total?Math.min(100,Math.round((j.done+(m?m[1]/m[2]:0))/j.total*100)):0;
 const where=p.label||p.pincode,size=p.mode==='quick'?'one search':p.radius+' km';
 const note=j.note||(j.status==='queued'?'Waiting for the search before it':j.total?`${j.done} of ${j.total} searches done`:'');
 return `<div class="job ${String(j.id)===J?'sel':''}" onclick="pick(${j.id})"><div><b>${esc(p.queries.join(', '))}</b><div class=q>${esc(where)} · ${esc(size)} · ${fmt(j.n)} places, ${fmt(j.ph)} with phone</div></div>
 <div><div class=bar><i style="width:${live?Math.max(3,pct):j.status==='finished'?100:pct}%"></i></div><div class=note>${esc(note)}</div></div>
 <div class=acts onclick="event.stopPropagation()"><span class="st ${j.status}">${esc(j.status)}</span>${live?`<button class="btn o sm" onclick="post('/api/jobs/${j.id}/stop')">Stop</button>`:`<button class="btn o sm" onclick="post('/api/jobs/${j.id}/run')" title="Already saved places are skipped">${j.status==='finished'?'Run again':'Resume'}</button>`}<a class="btn o sm" href="/api/export?job=${j.id}">CSV</a><button class=x title="Delete this search and its places" onclick="confirm('Delete this search and its places?')&&post('/api/jobs/${j.id}/delete')">✕</button></div></div>`}
async function refresh(){jobs=await api('/api/jobs');const running=jobs.some(j=>j.status==='running');
 $('stat').className='pill '+(running?'run':'');$('stxt').textContent=running?'Searching…':jobs.some(j=>j.status==='queued')?'Queued':'Idle';
 if(J!=='all'&&!jobs.some(j=>String(j.id)===J))J='all';
 $('jobs').innerHTML=jobs.length?jobs.map(jobRow).join(''):'<div class=empty>No searches yet. Start one above.</div>';
 const s=await api('/api/stats?job='+J),c=s.completeness||{},n=s.total||0,pc=v=>n?Math.round(v/n*100)+'%':'–';
 $('kpis').innerHTML=[['Places found',fmt(n)],['With phone',`${fmt(c.phone)} <small style="font-size:13px;color:var(--mute);font-weight:500">${pc(c.phone)}</small>`],['With website',`${fmt(c.website)} <small style="font-size:13px;color:var(--mute);font-weight:500">${pc(c.website)}</small>`],['Average rating',s.avg_rating??'–']].map(k=>`<div class=kpi><span>${k[0]}</span><b>${k[1]}</b></div>`).join('');
 const sel=jobs.find(j=>String(j.id)===J);$('rtitle').textContent=sel?'Results: '+JSON.parse(sel.params).queries.join(', '):'All results';$('exp').href='/api/export?job='+J;
 const l=await api('/api/logs?job='+J);$('logs').innerHTML=l.map(x=>`<div class=${x.level}>${x.ts} ${esc(x.msg)}</div>`).join('')||'<span class=hint>Nothing yet.</span>';load()}
async function load(){const p=await api(`/api/places?job=${J}&q=${encodeURIComponent($('search').value)}`);$('rcount').textContent=p.length>=500?'showing the top 500 (download for all)':p.length+' shown';
 $('data').innerHTML=p.length?'<tr><th>Name<th>Category<th>Rating<th>Phone<th>Website<th>Address</tr>'+p.map(x=>`<tr><td><b>${esc(x.name)}</b><td>${esc(x.category)}<td class=n>${x.rating?'★ '+x.rating+(x.reviews_count?` <span class=hint>(${fmt(x.reviews_count)})</span>`:''):''}<td class=n>${esc(x.phone)}<td>${x.website?`<a href="${esc(x.website)}" target=_blank rel=noopener>${esc(x.website.replace(/^https?:\/\/(www\.)?/,'').split('/')[0])}</a>`:''}<td>${esc(x.address)}</tr>`).join(''):'<tr><td class=empty>No places yet.</td></tr>'}
drawAreas();refresh();setInterval(refresh,3000);
</script>
"""


# Solist Hub shared look: added on top of this page's own style when ../hub/solist-theme.html exists
try:
    from pathlib import Path as _P
    _T = _P(__file__).resolve().parent.parent / "hub" / "solist-theme.html"
    if _T.exists():
        HTML = HTML.replace("</style>", "</style>" + _T.read_text(encoding="utf-8"), 1)
except OSError:
    pass


@app.get("/")
def index():
    return HTML


def cli_run(argv):
    """Scrape straight from the terminal (no web server), then write a CSV."""
    import argparse
    ap = argparse.ArgumentParser(prog="python gmaps_dashboard.py --run", description="Terminal scraper")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--areas", default="all", help="bhubaneswar,puri,khordha or all (default: all)")
    ap.add_argument("--pincode", help="custom area instead of --areas: a pincode or 'lat,lng'")
    ap.add_argument("--radius", type=float, default=3, help="km, only with --pincode")
    ap.add_argument("--queries", default="", help="comma separated; default = the 6 event queries")
    ap.add_argument("--delay", default="normal", choices=["fast", "normal", "slow"])
    ap.add_argument("--patience", type=int, default=10, help="stop a query after N empty cells in a row (0 = never)")
    ap.add_argument("--show", action="store_true", help="show the browser window")
    ap.add_argument("--proxy")
    ap.add_argument("--resume", action="store_true", help="reuse the previous job for the same area+queries (skips saved places)")
    ap.add_argument("--out", default="results.csv")
    a = ap.parse_args(argv)

    qs = [x.strip() for x in a.queries.split(",") if x.strip()] or DEFAULT_Q
    if a.pincode:
        areas = [(a.pincode, a.pincode, a.radius)]
    else:
        want = [x.strip().lower() for x in a.areas.split(",")]
        areas = [(f"{la},{lo}", n, r) for n, la, lo, r in AREAS if "all" in want or n.lower() in want or n.lower()[:4] in [w[:4] for w in want]]
    if not areas:
        sys.exit("No matching area. Use --areas bhubaneswar,puri,khordha (or --pincode).")

    jids, labels = [], {}
    for pin, label, radius in areas:
        base = dict(pincode=pin, label=label, country="India", radius=radius, step=1.5, zoom=15, max_per_cell=120, reviews=0,
                    stealth=False, headless=not a.show, proxy=a.proxy, delay=a.delay, patience=a.patience, queries=qs)
        jid = None
        if a.resume:
            with db() as c:
                for r in c.execute("SELECT id, params FROM jobs ORDER BY id DESC"):
                    q = json.loads(r["params"])
                    if q.get("label") == label and q["queries"] == qs:
                        jid = r["id"]
                        c.execute("UPDATE jobs SET done=0 WHERE id=?", (jid,))
                        break
        jid = jid or insert_job(base)
        jids.append(jid)
        labels[jid] = label
        print(f"\n=== {label} (job {jid}) | {radius} km | queries: {', '.join(qs)} ===", flush=True)
        run_job(jid)
        with db() as c:
            if c.execute("SELECT status FROM jobs WHERE id=?", (jid,)).fetchone()[0] == "stopped":
                print("Stopped. Run again with --resume to continue.")
                break

    marks = ",".join("?" * len(jids))
    with db() as c:
        rows = c.execute(f"SELECT job_id,name,category,rating,reviews_count,address,phone,website,lat,lng,found_by "
                         f"FROM places WHERE job_id IN ({marks}) GROUP BY pid ORDER BY job_id, reviews_count DESC", jids).fetchall()
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["area", "name", "category", "rating", "reviews", "address", "phone", "website", "lat", "lng", "found_by"])
        for r in rows:
            w.writerow(csv_safe([labels[r["job_id"]]] + list(tuple(r)[1:])))
    print(f"\nDone: {len(rows)} unique places -> {a.out}  (also in gmaps.db, viewable in the dashboard)")


if __name__ == "__main__":
    init()
    if "--run" in sys.argv:
        cli_run(sys.argv[1:])
        sys.exit()
    if "--job" in sys.argv:  # child process started by the dashboard worker
        run_job(int(sys.argv[sys.argv.index("--job") + 1]))
        sys.exit()
    if "--test" in sys.argv:  # run one small job right here in the terminal, no web server
        tp = dict(pincode="751012", country="India", radius=3, step=1.5, zoom=15, max_per_cell=5, reviews=0, stealth=False,
                  headless=False, proxy=None, delay="fast", patience=2, queries=["banquet hall"])
        with db() as c:
            tid = c.execute("INSERT INTO jobs(created,params,status) VALUES(?,?,?)",
                            (time.strftime("%Y-%m-%d %H:%M"), json.dumps(tp), "queued")).lastrowid
        run_job(tid)
        sys.exit()
    with db() as c:  # jobs left "running"/"queued" by a previous server session can never finish; free them
        c.execute("UPDATE jobs SET status='stopped' WHERE status IN ('running','queued')")
    threading.Thread(target=worker, daemon=True).start()
    app.run(port=5000)