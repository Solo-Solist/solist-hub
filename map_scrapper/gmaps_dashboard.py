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
import csv, io, json, math, queue, random, traceback, re, sqlite3, subprocess, signal, os, sys, threading, time, urllib.parse, urllib.request
from flask import Flask, Response, jsonify, request
from scrapling.fetchers import DynamicSession, StealthySession
from gmaps_scraper import FEED, PLACE_SEL, make_scroll_action, parse_place, _accept_consent

DB = "gmaps.db"
app = Flask(__name__)
Q = queue.Queue()
STOP = set()

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
    except Exception:  # e.g. macOS Python missing CA certs; this is public geodata, so retry unverified
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
        action = make_scroll_action(p["max_per_cell"])
        with Session(**kw) as s:
            for q in queries:
                dry = 0
                for k, (la, lo) in enumerate(pts):
                    if jid in STOP:
                        raise KeyboardInterrupt
                    if p.get("patience", 15) and dry >= p.get("patience", 15):
                        with db() as c:
                            c.execute("UPDATE jobs SET done=done+? WHERE id=?", (len(pts) - k, jid))
                        log(jid, f"'{q}': {dry} empty cells in a row, skipping remaining {len(pts) - k}")
                        break
                    new = 0
                    try:
                        url = f"https://www.google.com/maps/search/{urllib.parse.quote_plus(q)}/@{la},{lo},{p['zoom']}z?hl=en"
                        t0 = time.time()
                        page = s.fetch(url, page_action=action)
                        req(jid, 1, t0)
                        nap(p)
                        hrefs = list(dict.fromkeys(page.css(f'{FEED} a[href*="/maps/place/"]::attr(href)').getall()))
                        if not hrefs and "/maps/place/" in page.url:
                            hrefs = [page.url]
                        new = 0
                        for h in hrefs[:p["max_per_cell"]]:
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
                            if d["lat"] and hav(lat, lng, d["lat"], d["lng"]) > p["radius"] * 1.1:
                                continue  # outside requested radius
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
        c.execute("UPDATE jobs SET status=? WHERE id=?", (status, jid))
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
             step=float(f.get("step") or 1.5), zoom=int(f.get("zoom") or 15), max_per_cell=int(f.get("max_per_cell") or 40),
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
                                   max_per_cell=40, reviews=0, stealth=False, headless=not f.get("show"),
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
            (SELECT COUNT(*) FROM places WHERE job_id=j.id AND phone IS NOT NULL) ph,
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


@app.post("/api/jobs/<int:j>/reset")
def reset(j):
    with db() as c:
        for t in ("places", "logs", "reqs"):
            c.execute(f"DELETE FROM {t} WHERE job_id=?", (j,))
        c.execute("UPDATE jobs SET status='idle', done=0 WHERE id=?", (j,))
    return jsonify(ok=1)


@app.post("/api/jobs/<int:j>/delete")
def delete(j):
    with db() as c:
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
              "reviews": "reviews_count IS NOT NULL", "address": "address IS NOT NULL", "phone": "phone IS NOT NULL",
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
    wr.writerows([tuple(x) for x in rows])
    return Response(out.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=places.csv"})


# ---------------- UI ----------------
HTML = r"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Maps Scraper</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel=stylesheet>
<style>
:root{--bg:#e4e3df;--panel:#f2f1ee;--card:#f8f7f5;--tx:#141414;--mut:#8b8a86;--ac:#d9694a;--line:#e5e3df}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px Inter,system-ui,sans-serif;padding:16px}
.panel{background:var(--panel);border-radius:28px;padding:28px;max-width:1500px;margin:auto}
header,.hero,.row{display:flex;align-items:center;gap:12px}header{justify-content:space-between}
.logo{width:62px;height:62px;border-radius:50%;background:#111;color:#fff;display:grid;place-items:center;font-weight:700}
.sub{color:var(--mut)}b.t{font-size:17px;display:block}
select,input{font:inherit;border:1px solid var(--line);background:#fff;border-radius:999px;padding:13px 18px;color:var(--tx);outline:0}
.pill{border:1px solid var(--line);background:#fff;border-radius:999px;padding:13px 20px;display:flex;align-items:center;gap:8px}
.dot{width:9px;height:9px;border-radius:50%;background:#bbb}.run .dot{background:var(--ac)}
.hero{justify-content:space-between;margin:14px 0 22px}
.date{width:112px;height:112px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:42px;position:relative}
.date small{position:absolute;right:-70px;font-size:14px;color:var(--mut);line-height:1.2}
.btn{background:var(--ac);color:#fff;border:0;border-radius:999px;padding:13px 22px;font:inherit;font-weight:500;cursor:pointer}
.btn.o{background:#fff;color:var(--tx);border:1px solid var(--line)}.btn.sm{padding:7px 14px;font-size:13px}.btn.k{background:#111;width:44px;padding:7px}
.hero h1{margin:0;font-size:38px;text-align:right;font-weight:600}.hero h1 span{color:#c7c5c0;display:block}
.play{width:112px;height:112px;border-radius:50%;border:0;background:#fff;font-size:38px;cursor:pointer}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:14px}
.card{background:var(--card);border-radius:26px;padding:26px;border:1px solid #fff}
.kpi .ic{width:42px;height:42px;border:1px solid var(--line);border-radius:50%;display:grid;place-items:center;margin-bottom:22px;color:#555}
.kpi b{font-size:34px;font-weight:600;display:block}.kpi .l{font-size:16px;margin-top:2px}.kpi .s{color:var(--mut);font-size:13px;margin-top:4px}.or{color:var(--ac)}
.ringc{width:296px;display:grid;place-items:center;padding:14px}
h3{margin:0 0 16px;font-size:18px;font-weight:600}h3 em{font-style:normal;font-size:13px;color:var(--mut);font-weight:400}
.form{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.form input{padding:12px 18px}
details{margin-bottom:14px;color:var(--mut)}details .form{margin-top:10px;color:var(--tx);align-items:center}
table{width:100%;border-collapse:collapse}th{color:var(--mut);font-weight:400;text-align:left;padding:10px 8px;font-size:13px}
td{padding:16px 8px;border-top:1px solid var(--line);vertical-align:middle}tr.sel td{background:#fff}
.prog{position:relative;padding-top:14px;min-width:160px}.prog small{position:absolute;right:0;top:0;color:var(--mut);font-size:12px}
.tr,.bt{height:7px;border-radius:9px;background:#e7e5e1;overflow:hidden}.tr i,.bt i{display:block;height:100%;background:var(--ac);border-radius:9px}
.st{padding:5px 12px;border-radius:999px;font-size:12px;background:#e7e5e1}.st.finished{background:#dcefe0;color:#2f7a45}.st.running{background:#fbe3da;color:var(--ac)}.st.failed,.st.stopped{background:#f3dcdc;color:#b23b3b}
.br{margin-bottom:13px}.bl{display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:5px}.bl span:last-child{color:var(--mut)}
.pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.pills div{border:1px solid var(--line);border-radius:999px;padding:10px 16px;color:var(--mut)}.pills b{color:var(--tx);margin-left:6px}
.rpm{display:flex;align-items:flex-end;gap:3px;height:150px}.rpm div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;min-width:3px}
.rpm i{background:var(--ac);border-radius:3px 3px 0 0}.rpm u{background:#111;height:4px;margin-bottom:2px;border-radius:2px}
.scroll{max-height:300px;overflow:auto;font:12.5px ui-monospace,monospace;line-height:1.7}.ERROR{color:#b23b3b}
.dt td,.dt th{font-size:13px;padding:9px 8px}
</style>
<div class=panel>
<header>
 <div class=row><div class=logo>M°</div><div><b class=t>Maps Scraper</b><span class=sub>Analytics Dashboard</span></div></div>
 <div class=row><select id=jobsel onchange="J=this.value;refresh()"><option value=all>All jobs</option></select>
  <select id=delay title="Applies to new jobs"><option value=fast>Fast 0.3–0.8s</option><option value=normal selected>Normal 1–2s</option><option value=slow>Slow 2.5–4.5s</option></select>
  <div class=pill id=stat><span class=dot></span><span id=stxt>Idle</span></div></div>
</header>
<div class=hero>
 <div class=row><div class=date><span id=day></span><small id=dm></small></div><button class=btn style="margin-left:72px" onclick="document.getElementById('queue').scrollIntoView({behavior:'smooth'})">Show my queue →</button></div>
 <div class=row><h1 id=h1>Hey, ready to scrape? 👋<span>Add a job and press start.</span></h1><button class=play id=play onclick=play()>▶</button></div>
</div>
<div class=grid id=kpis></div>
<div class=card style="width:296px;padding:14px;margin-bottom:14px"><svg viewBox="0 0 200 200" id=ring></svg></div>
<div class=card id=queue style="margin-bottom:14px"><h3>Job queue</h3>
 <div class=form><input id=pincode placeholder="Pincode" style=width:140px><input id=radius placeholder="Radius km" value=3 style=width:120px>
  <input id=queries placeholder="What to find, comma separated (e.g. banquet hall, mandap)" style="flex:1;min-width:240px">
  <button class=btn onclick=add()>Add job</button><button class="btn o" onclick=preset() title="Bhubaneswar 15km, Puri 12km, Khordha 12km. Uses the query box, or the 6 default event queries if empty">Preset: BBSR · Puri · Khordha</button><a class="btn o" id=expall href="/api/export?job=all" style=text-decoration:none>Export all CSV</a></div>
 <details><summary style=cursor:pointer>More options</summary><div class=form>
  <input id=country value=India style=width:120px placeholder=Country><input id=step value=1.5 style=width:120px placeholder="Grid step km"><input id=zoom value=15 style=width:90px placeholder=Zoom>
  <input id=max_per_cell value=40 style=width:120px placeholder="Max/search"><input id=reviews value=0 style=width:120px placeholder="Reviews/place"><input id=proxy placeholder=Proxy style=width:200px><input id=patience value=15 title="Stop a query after N empty cells in a row (0 = never)" placeholder="Stop after N empty" style=width:150px>
  <label><input type=checkbox id=stealth> Stealth</label><label><input type=checkbox id=show> Show browser</label></div></details>
 <table id=jobs></table></div>
<div class=grid style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
 <div class=card><h3>Requests per minute <em>(orange ok · black failed)</em></h3><div class=rpm id=rpm></div><div class=sub id=rpml style="margin-top:8px;font-size:13px"></div></div>
 <div class=card><h3>Data completeness</h3><div id=comp></div></div>
 <div class=card><h3>Place insights</h3><div class=pills id=pills></div><div class=sub style="margin-bottom:10px">Rating bands</div><div id=bands></div><div class=sub style="margin:14px 0 10px">Top categories</div><div id=cats></div></div>
</div>
<div class=grid style="grid-template-columns:1fr 2fr">
 <div class=card><h3>Live log</h3><div class=scroll id=logs></div></div>
 <div class=card><h3>Collected places <input id=search placeholder=Filter oninput=load() style="float:right;padding:8px 16px"></h3><div class=scroll style=font:13px/1.4Inter;max-height:300px><table class=dt id=data></table></div></div>
</div></div>
<script>
const $=i=>document.getElementById(i),api=(u,o)=>fetch(u,o).then(r=>r.json()),fmt=n=>(n??0).toLocaleString('en-IN'),post=u=>api(u,{method:'POST'}).then(refresh);
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));let J='all',jobs=[];const d=new Date();$('day').textContent=d.getDate();$('dm').innerHTML=d.toLocaleDateString('en-US',{weekday:'short'})+',<br>'+d.toLocaleDateString('en-US',{month:'long'});
const bar=(l,v,p)=>`<div class=br><div class=bl><span>${l}</span><span>${v}</span></div><div class=bt><i style="width:${Math.max(p,1)}%"></i></div></div>`;
async function preset(){const r=await api('/api/preset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:$('queries').value.trim(),proxy:$('proxy').value,delay:$('delay').value,show:$('show').checked})});J=String(r.ids[0]);refresh()}
async function add(){const b={};for(const i of['pincode','country','radius','step','zoom','max_per_cell','reviews','proxy','delay','patience'])b[i]=$(i).value;
 b.query=$('queries').value.trim();for(const i of['stealth','show'])b[i]=$(i).checked;
 if(!b.pincode||!b.query)return alert('Need a pincode and what to find');
 const r=await api('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});J=String(r.id);refresh()}
function play(){const run=jobs.filter(j=>j.status=='running');if(run.length)return run.forEach(j=>post(`/api/jobs/${j.id}/stop`));
 const t=J!='all'?J:jobs[0]?.id;if(!t){$('pincode').focus();return}post(`/api/jobs/${t}/run`)}
async function refresh(){
 jobs=await api('/api/jobs');const sel=J=='all'?jobs:jobs.filter(j=>j.id==J);const running=jobs.some(j=>j.status=='running');
 $('jobsel').innerHTML='<option value=all>All jobs</option>'+jobs.map(j=>`<option value=${j.id} ${j.id==J?'selected':''}>#${j.id} · ${esc(JSON.parse(j.params).label||JSON.parse(j.params).pincode)}</option>`).join('');
 $('stat').className='pill '+(running?'run':'');$('stxt').textContent=running?'Running':'Idle';$('play').textContent=running?'■':'▶';
 const tot=sel.reduce((a,j)=>a+j.total,0),done=sel.reduce((a,j)=>a+j.done,0),err=sel.reduce((a,j)=>a+j.err,0),pc=tot?Math.round(done/tot*100):0;
 $('h1').innerHTML=running?`Scraping… ${pc}%<span>${fmt(done)} of ${fmt(tot)} searches done.</span>`:`Hey, ready to scrape? 👋<span>Add a job and press start.</span>`;
 $('jobs').innerHTML='<tr><th>Job<th>Radius<th>Places<th>Searches<th>Failed<th>With phone<th>Status<th></tr>'+jobs.map(j=>{const p=JSON.parse(j.params);return`<tr class="${j.id==J?'sel':''}">
  <td onclick="J='${j.id}';refresh()" style=cursor:pointer><b>${esc(p.label||p.pincode)}</b><br><span class=sub>${esc(p.queries.join(', '))}</span><td>${p.radius} km<td>${fmt(j.n)}
  <td><div class=prog><small>${j.done}/${j.total}</small><div class=tr><i style="width:${j.total?j.done/j.total*100:0}%"></i></div></div><td>${j.err}<td>${j.ph}<td><span class="st ${j.status}">${j.status}</span>
  <td style=white-space:nowrap><button class="btn sm" onclick="post('/api/jobs/${j.id}/run')">Run</button> <a class="btn o sm" style=text-decoration:none href="/api/export?job=${j.id}">CSV</a> <button class="btn o sm" onclick="confirm('Clear data?')&&post('/api/jobs/${j.id}/reset')">Reset</button> <button class="btn k sm" onclick="confirm('Delete job?')&&post('/api/jobs/${j.id}/delete')">✕</button></tr>`}).join('');
 const s=await api('/api/stats?job='+J),n=s.total||1,c=s.completeness,rok=s.req_total?Math.round(s.req_ok/s.req_total*100):0;
 const K=[['▣',fmt(s.total),'Places found',`${sel.length} job(s)`],['✓',fmt(done),'Searches done',pc+'% complete'],['!',`<span class=or>${fmt(err)}</span>`,'Failed','needs retry'],
  ['◷',fmt(Math.max(tot-done,0)),'Pending','—'],['❖',fmt(c.phone),'With phone',fmt(c.website)+' with website'],['⇄',fmt(s.req_total),'Requests',`${rok}% ok · ${fmt(s.avg_ms)}ms`]];
 $('kpis').innerHTML=K.map(k=>`<div class="card kpi"><div class=ic>${k[0]}</div><b>${k[1]}</b><div class=l>${k[2]}</div><div class=s>${k[3]}</div></div>`).join('');
 const C=2*Math.PI*78;$('ring').innerHTML=`<circle cx=100 cy=100 r=98 fill=#111 /><circle cx=100 cy=100 r=78 fill=none stroke=#3a2a24 stroke-width=14 /><circle cx=100 cy=100 r=78 fill=none stroke=#d9694a stroke-width=14 stroke-linecap=round stroke-dasharray="${C*rok/100} ${C}" transform="rotate(-90 100 100)"/><text x=100 y=104 fill=#fff font-size=36 text-anchor=middle font-weight=600>${rok}%</text><text x=100 y=128 fill=#aaa font-size=13 text-anchor=middle>Fetch rate</text>`;
 const mx=Math.max(1,...s.rpm.map(r=>r.ok+r.bad));$('rpm').innerHTML=s.rpm.map(r=>`<div title="${r.ok} ok, ${r.bad} failed">${r.bad?'<u></u>':''}<i style="height:${r.ok/mx*140}px"></i></div>`).join('');
 const t=m=>new Date(m*60000).toTimeString().slice(0,5);$('rpml').textContent=s.rpm.length?`last ${s.rpm.length} active minute(s) · ${t(s.rpm[0].m)} → ${t(s.rpm.at(-1).m)}`:'No requests yet';
 $('comp').innerHTML=Object.entries(c).map(([k,v])=>bar(k,Math.round(v/n*100)+'%',v/n*100)).join('');
 $('pills').innerHTML=[['Avg rating',s.avg_rating??'–'],['Avg reviews',fmt(Math.round(s.avg_reviews||0))],['Max reviews',fmt(s.max_reviews)],['Has website',Math.round(c.website/n*100)+'%']].map(x=>`<div>${x[0]}<b>${x[1]}</b></div>`).join('');
 const rm=Math.max(1,...s.ratings.map(r=>r.v));$('bands').innerHTML=s.ratings.map(r=>bar(r.k+'.0 – '+r.k+'.9 ★',fmt(r.v),r.v/rm*100)).join('');
 const cm=Math.max(1,...s.categories.map(r=>r.v));$('cats').innerHTML=s.categories.map(r=>bar(r.k,fmt(r.v),r.v/cm*100)).join('');
 const l=await api('/api/logs?job='+J);$('logs').innerHTML=l.map(x=>`<div class=${x.level}>${x.ts} ${esc(x.msg)}</div>`).join('');load()}
async function load(){const p=await api(`/api/places?job=${J}&q=${encodeURIComponent($('search').value)}`);
 $('data').innerHTML='<tr><th>Name<th>Category<th>★<th>Phone<th>Address</tr>'+p.map(x=>`<tr><td>${esc(x.name)}<td>${esc(x.category)}<td>${x.rating??''}<td>${esc(x.phone)}<td>${esc(x.address)}</tr>`).join('')}
refresh();setInterval(refresh,4000);
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
        base = dict(pincode=pin, label=label, country="India", radius=radius, step=1.5, zoom=15, max_per_cell=40, reviews=0,
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
            w.writerow([labels[r["job_id"]]] + list(tuple(r)[1:]))
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