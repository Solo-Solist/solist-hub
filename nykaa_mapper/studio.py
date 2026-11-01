"""Nykaa Studio - one browser dashboard for the whole job.

    scrape (your existing dashboard, inside a tab)  ->  convert to the redSales template  ->  review  ->  named CSV exports  ->  logs

Start it by double-clicking start.bat on Windows, or ./start.sh on Ubuntu  (or:  python studio.py).  It opens http://localhost:8766
"""
import csv, io, json, os, re, sqlite3, subprocess, sys, threading, time, traceback, webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent if (HERE.parent / "crawler.py").exists() else HERE      # the scraper project folder
os.chdir(ROOT)
for p in (str(HERE), str(ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)

import mapper  # noqa: E402

PORT = 8766
EXPORTS, INBOX, LOGS = ROOT / "exports", ROOT / "inbox", ROOT / "logs"
for d in (EXPORTS, INBOX, LOGS):
    d.mkdir(exist_ok=True)
STUDIO_DB = ROOT / "studio.db"
CFG = HERE / "folders.json"                                  # remembers the input / output folders chosen on the page
SUFFIX = "" if os.name == "nt" else "_linux"                 # Windows and Ubuntu each keep their own folders in it


def read_cfg():
    try:
        return json.load(open(CFG, encoding="utf-8"))
    except Exception:                                        # noqa: BLE001
        return {}


def load_folders():
    """input = where nykaa.db and CSV files are read from (uploads land here too); output = where converted CSVs go.
    A folder saved on the other OS (E:\\... seen from Ubuntu) is not absolute here, so the defaults are kept."""
    global INBOX, EXPORTS
    f = read_cfg()
    mine = {k: Path(f[k + SUFFIX]) for k in ("input", "output") if f.get(k + SUFFIX) and Path(f[k + SUFFIX]).is_absolute()}
    try:
        INBOX, EXPORTS = mine.get("input", INBOX), mine.get("output", EXPORTS)
        for d in (INBOX, EXPORTS):
            d.mkdir(parents=True, exist_ok=True)
    except Exception:                                        # noqa: BLE001
        pass


load_folders()
LOCK = threading.Lock()
JOB = {"running": False, "name": "", "done": 0, "total": 0, "msg": ""}
now = lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# ---- the scraper dashboard (optional: Studio still works for converting if it is missing) ----
HAVE_SCRAPER, SCRAPER_ERR, dashboard = False, "", None
try:
    import dashboard  # noqa: E402
    BASE, HAVE_SCRAPER = dashboard.H, True
except Exception as e:                                       # noqa: BLE001
    BASE, SCRAPER_ERR = BaseHTTPRequestHandler, f"{type(e).__name__}: {e}"
SRC_DB = Path(getattr(getattr(dashboard, "crawler", None), "DB", "nykaa.db")) if dashboard else Path("nykaa.db")
if os.environ.get("NYKAA_SRC_DB"):                          # set by the Solist Hub: read the scraper's nykaa.db
    SRC_DB = Path(os.environ["NYKAA_SRC_DB"])
if not SRC_DB.is_absolute():
    SRC_DB = ROOT / SRC_DB
SRC_DB0 = SRC_DB


def src_db():
    """nykaa.db inside the input folder wins; otherwise the scraper's own database"""
    return INBOX / "nykaa.db" if (INBOX / "nykaa.db").exists() else SRC_DB0


def set_folders(d):
    global INBOX, EXPORTS
    new = {k: Path(os.path.expanduser(str(d.get(k) or "").strip().strip('"'))).resolve() for k in ("input", "output")
           if str(d.get(k) or "").strip()}
    if len(new) < 2:
        return {"error": "Type both folders"}
    missing = [str(v) for v in new.values() if not v.is_dir()]
    if missing and not d.get("create"):
        return {"error": "Folder does not exist", "missing": missing}
    if JOB["running"]:
        return {"error": "Wait for the conversion to finish first"}
    try:
        for v in new.values():
            v.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        return {"error": f"Could not create folder: {e}"}
    cfg = read_cfg()
    cfg.update({k + SUFFIX: str(v) for k, v in new.items()})
    json.dump(cfg, open(CFG, "w", encoding="utf-8"), indent=1)
    INBOX, EXPORTS = new["input"], new["output"]
    log("info", f"Folders changed - input: {INBOX}  output: {EXPORTS}")
    return {"ok": True}

TAXONOMY = mapper.load_taxonomy(HERE / "taxonomy.csv")
ITEMS = sorted(({"item": k, "category": v[0]["category"], "sub": v[0]["sub_category"]} for k, v in TAXONOMY.items()),
               key=lambda x: (x["category"], x["sub"], x["item"]))


# ------------------------------------------------------------------ storage
def sdb(sql, args=()):
    with LOCK:
        c = sqlite3.connect(STUDIO_DB, timeout=30)
        try:
            cur = c.execute(sql, args)
            c.commit()
            return cur.fetchall()
        finally:
            c.close()


def init():
    sdb("CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, ts TEXT, name TEXT, sources TEXT, rows INTEGER, assigned INTEGER, "
        "review INTEGER, settings TEXT, files TEXT, stats TEXT)")
    sdb("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, ts TEXT, level TEXT, msg TEXT, run_id INTEGER)")
    sdb("CREATE TABLE IF NOT EXISTS overrides(key TEXT PRIMARY KEY, item TEXT, title TEXT, ts TEXT)")


def log(level, msg, run_id=None):
    try:
        sdb("INSERT INTO events(ts,level,msg,run_id) VALUES(?,?,?,?)", (now(), level, msg, run_id))
        with open(LOGS / "studio.log", "a", encoding="utf-8") as f:
            f.write(f"{now()} [{level}] {msg}\n")
        print(f"{now()} [{level}] {msg}", file=sys.__stdout__)
    except Exception:                                        # noqa: BLE001
        pass


# ------------------------------------------------------------------ sources
_ROWS = {}


def file_rows(p):
    k = (str(p), p.stat().st_mtime)
    if k not in _ROWS:
        try:
            _ROWS[k] = len(pd.read_csv(p, usecols=[0], dtype=str, encoding="utf-8-sig", encoding_errors="replace"))
        except Exception:                                    # noqa: BLE001
            _ROWS[k] = 0
    return _ROWS[k]


def list_sources():
    brands, ok, SRC_DB = [], False, src_db()
    if SRC_DB.exists():
        try:
            c = sqlite3.connect(SRC_DB, timeout=30)
            brands = [dict(brand=r[0], variants=r[1], products=r[2]) for r in c.execute(
                "SELECT brand,COUNT(*),COUNT(DISTINCT product_id) FROM variants WHERE brand IS NOT NULL AND brand!='' GROUP BY brand ORDER BY brand")]
            c.close()
            ok = True
        except Exception:                                    # noqa: BLE001
            pass
    files = []
    for folder in dict.fromkeys((INBOX, ROOT)):
        for p in sorted(folder.glob("*.csv"), key=lambda x: -x.stat().st_mtime):
            if folder == ROOT and not p.name.lower().startswith("nykaa"):
                continue
            files.append(dict(name=p.name if folder == ROOT else "inbox/" + p.name, size=p.stat().st_size, rows=file_rows(p),
                              mtime=datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")))
    return dict(ok=ok, path=str(SRC_DB), brands=brands), files


def read_csv_any(p):
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return pd.read_csv(p, dtype=str, keep_default_na=False, encoding=enc)
        except UnicodeDecodeError:
            continue
    return pd.read_csv(p, dtype=str, keep_default_na=False, encoding="utf-8", encoding_errors="replace")


def load_source(src):
    if src["type"] == "db":
        c = sqlite3.connect(src_db(), timeout=30)
        try:
            df = pd.read_sql_query("SELECT * FROM variants WHERE brand=?", c, params=[src["name"]])
        finally:
            c.close()
        return df.astype(object).where(df.notna(), "").astype(str)
    p = (INBOX / src["name"][6:]) if src["name"].startswith("inbox/") else (ROOT / src["name"])
    return read_csv_any(p)


# ------------------------------------------------------------------ analytics
KEYCOLS = ["Image", "barcodeId", "productTitle", "hsnCode", "productDescription", "brand", "category", "subCategory", "itemName", "shade",
           "size", "ingredients", "manufacturer", "marketedBy", "countryOfOrigin", "mrpPrice", "gstRate", "sellingPrice",
           "parlourSellingPrice", "availableQty"]


def analyse(out, full, review):
    n = len(out)
    img = [f"image{i}" for i in range(1, 15)]
    ic = (out[img] != "").sum(axis=1)
    num = lambda c: pd.to_numeric(out[c], errors="coerce")
    vc = lambda s, k=12: [[str(a) or "(none)", int(b)] for a, b in s.replace("", "(none)").value_counts().head(k).items()]
    return dict(
        rows=n, assigned=int((out["itemName"] != "").sum()), review=int(len(review)),
        extras=len([c for c in full.columns if c.startswith("src_")]),
        conf={str(k): int(v) for k, v in full["match_confidence"].value_counts().items()},
        items=vc(out["itemName"], 14), cats=vc(out["category"], 8), gst=vc(out["gstRate"], 5), brands=vc(out["brand"], 6),
        images=[int((ic == i).sum()) for i in range(0, 15)], avg_images=round(float(ic.mean()), 1) if n else 0,
        complete=[[c, round(float((out[c].astype(str) != "").mean() * 100), 1) if n else 0] for c in KEYCOLS],
        price=dict(mrp=round(float(num("mrpPrice").mean() or 0)), sell=round(float(num("sellingPrice").mean() or 0))))


# ------------------------------------------------------------------ conversion job
def safe_name(n, fallback):
    """brand -> Windows-safe file name: 'Dot & Key' -> 'Dot-&-Key' (only characters Windows forbids are removed)"""
    n = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "", str(n or "")).strip().strip(".")
    return re.sub(r"\s+", "-", n)[:120] or fallback


def same_name_run(name):  # converting the same name into the same folder replaces that export (newest wins)
    for rid, fs in sdb("SELECT id,files FROM runs WHERE name=?", (name,)):
        if str(out_dir(json.loads(fs))) == str(EXPORTS):
            return rid
    return None


def unique_name(name):
    base, i = name, 2
    while any((EXPORTS / f"{name}{suf}").exists() for suf in ("_import_ready.csv", "_template_only.csv", "_review.csv")):
        name, i = f"{base}_{i}", i + 1
    return name


def convert_job(sources, name, settings, replace_id=None):
    JOB.update(running=True, name=name, done=0, total=0, msg="Reading sources")
    run_id = replace_id
    try:
        log("info", f"Conversion '{name}' started - {len(sources)} source(s): " + ", ".join(s["name"] for s in sources))
        frames = []
        for s in sources:
            df = load_source(s)
            log("info", f"Loaded {s['type']} '{s['name']}': {len(df)} rows, {len(df.columns)} columns")
            frames.append(df)
        df = pd.concat(frames, ignore_index=True).fillna("") if len(frames) > 1 else frames[0]
        cols = mapper.detect_columns(list(df.columns), None, df)
        found = {k: v for k, v in cols.items() if not k.startswith("_")}
        log("info", "Detected columns: " + ", ".join(f"{k}={'+'.join(map(str, v))}" for k, v in found.items()))
        ov = {k: i for k, i in sdb("SELECT key,item FROM overrides")}
        args = SimpleNamespace(
            selling_ratio=float(settings.get("selling_ratio", 0.69)), parlour_markup=float(settings.get("parlour_markup", 0.06)),
            use_scraped_price=settings.get("price_mode") == "scraped", tiers=bool(settings.get("tiers")),
            std_qty=12, std_ratio=0.96, master_qty=48, master_ratio=0.92, names=bool(settings.get("names")),
            default_qty=int(settings["default_qty"]) if str(settings.get("default_qty", "")).strip().isdigit() else None,
            barcode_start=int(settings["barcode_start"]) if str(settings.get("barcode_start", "")).strip().isdigit() else None,
            overrides=ov)
        if ov:
            log("info", f"Applying {len(ov)} manual item correction(s)")
        JOB["total"] = len(df)
        JOB["msg"] = "Converting"
        out, review, unused, full = mapper.build(df, cols, TAXONOMY, args, progress=lambda a, b: JOB.update(done=a, total=b))
        st = analyse(out, full, review)
        # the main import file sits in the output folder; review + template-only copies go in its "extra" subfolder
        files = dict(full=f"{name}.csv", template=f"extra/{name}_template-only.csv", review=f"extra/{name}_review.csv")
        (EXPORTS / "extra").mkdir(parents=True, exist_ok=True)
        if replace_id:
            REV.pop(replace_id, None)
        full.to_csv(EXPORTS / files["full"], index=False, encoding="utf-8-sig")
        out.to_csv(EXPORTS / files["template"], index=False, encoding="utf-8-sig")
        review.to_csv(EXPORTS / files["review"], index=False, encoding="utf-8-sig")
        st["unused"] = [[c, round(f * 100)] for c, f in unused]
        row = (now(), name, json.dumps(sources), st["rows"], st["assigned"], st["review"], json.dumps(settings),
               json.dumps(dict(files, dir=str(EXPORTS))), json.dumps(st))
        if replace_id:
            sdb("UPDATE runs SET ts=?,name=?,sources=?,rows=?,assigned=?,review=?,settings=?,files=?,stats=? WHERE id=?", row + (replace_id,))
        else:
            sdb("INSERT INTO runs(ts,name,sources,rows,assigned,review,settings,files,stats) VALUES(?,?,?,?,?,?,?,?,?)", row)
            run_id = sdb("SELECT MAX(id) FROM runs")[0][0]
        REV.pop(run_id, None)
        log("ok", f"Finished '{name}': {st['rows']} rows, {st['assigned']} with item name ({st['assigned'] * 100 // max(st['rows'], 1)}%), "
                  f"{st['review']} to review, {st['extras']} extra source columns kept, avg {st['avg_images']} images/row", run_id)
        log("ok", "Saved: " + ", ".join(files.values()), run_id)
    except Exception:                                        # noqa: BLE001
        log("error", "Conversion failed: " + traceback.format_exc()[-600:], run_id)
    finally:
        JOB.update(running=False, msg="")


REV = {}


def out_dir(files):  # each export remembers the folder it was saved in (older ones are in the original exports folder)
    return Path(files.get("dir") or ROOT / "exports")


def review_rows(run_id, files):
    if run_id not in REV:
        try:
            r = read_csv_any(out_dir(files) / files["review"])
        except Exception:                                    # noqa: BLE001
            r = pd.DataFrame()
        REV[run_id] = r
    r = REV[run_id]
    if r.empty:
        return []
    order = {"None": 0, "Low": 1, "Medium": 2, "High": 3, "Manual": 4}
    r = r.assign(_o=r["confidence"].map(order).fillna(5)).sort_values(["_o", "title"]).head(300)
    ov = dict(sdb("SELECT key,item FROM overrides"))
    return [dict(key=x.key, title=x.title, brand=x.brand, predicted=x.predicted_item, alt=x.alt_item, confidence=x.confidence,
                 reasons=x.reasons, override=ov.get(x.key, "")) for x in r.itertuples()]


# ------------------------------------------------------------------ state for the page
def state():
    runs = sdb("SELECT id,ts,name,rows,assigned,review,files,stats,sources,settings FROM runs ORDER BY id DESC LIMIT 100")
    rl = [dict(id=r[0], ts=r[1], name=r[2], rows=r[3], assigned=r[4], review=r[5], files=json.loads(r[6])) for r in runs]
    cur = None
    if runs:
        r = runs[0]
        cur = dict(id=r[0], name=r[2], ts=r[1], stats=json.loads(r[7]), settings=json.loads(r[9]))
    db_info, files = list_sources()
    return dict(
        job=JOB, scraper=HAVE_SCRAPER, scraper_err=SCRAPER_ERR, db=db_info, files=files, items=ITEMS, runs=rl, cur=cur,
        review=review_rows(runs[0][0], json.loads(runs[0][6])) if runs else [],
        events=[dict(ts=e[0], level=e[1], msg=e[2]) for e in sdb("SELECT ts,level,msg FROM events ORDER BY id DESC LIMIT 250")],
        overrides=sdb("SELECT COUNT(*) FROM overrides")[0][0], exports_dir=str(EXPORTS), folders=dict(input=str(INBOX), output=str(EXPORTS)))


# ------------------------------------------------------------------ http
class S(BASE):
    def log_message(self, *a):
        pass

    def send(self, body, ctype="application/json", name=None, code=200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        if name:
            self.send_header("Content-Disposition", f'attachment; filename="{name}"')
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        return self.rfile.read(int(self.headers.get("Content-Length", 0)))

    def do_GET(self):
        u, q = urlparse(self.path), parse_qs(urlparse(self.path).query)
        g = lambda k: q.get(k, [""])[0]
        p = u.path
        if p == "/":
            return self.send(PAGE.encode("utf-8"), "text/html; charset=utf-8")
        if p == "/scraper" and HAVE_SCRAPER:
            return self.send(dashboard.PAGE.encode("utf-8"), "text/html; charset=utf-8")
        if p == "/studio/state":
            try:
                return self.send(json.dumps(state()).encode("utf-8"))
            except Exception:                                # noqa: BLE001
                return self.send(json.dumps({"error": traceback.format_exc()[-400:]}).encode())
        if p == "/studio/download":
            r = sdb("SELECT files FROM runs WHERE id=?", (g("id"),))
            if r:
                fs = json.loads(r[0][0])
                f = fs.get(g("kind")) if g("kind") != "dir" else None
                if f and (out_dir(fs) / f).exists():
                    return self.send((out_dir(fs) / f).read_bytes(), "text/csv; charset=utf-8", Path(f).name)
            return self.send(b"not found", "text/plain", code=404)
        if p == "/studio/logs":
            s = io.StringIO()
            w = csv.writer(s)
            w.writerow(["time", "level", "message"])
            w.writerows(sdb("SELECT ts,level,msg FROM events ORDER BY id"))
            return self.send(("\ufeff" + s.getvalue()).encode("utf-8"), "text/csv; charset=utf-8", f"studio_logs_{datetime.now():%Y%m%d_%H%M}.csv")
        if HAVE_SCRAPER and not p.startswith("/studio"):
            return super().do_GET()
        self.send(b"not found", "text/plain", code=404)

    def do_POST(self):
        p = urlparse(self.path).path
        if not p.startswith("/studio/"):
            if HAVE_SCRAPER:
                return super().do_POST()
            return self.send(b"{}")
        q = parse_qs(urlparse(self.path).query)
        if p == "/studio/upload":
            name = re.sub(r"[^\w.\- ]+", "", os.path.basename(q.get("name", ["upload.csv"])[0])) or "upload.csv"
            if not name.lower().endswith(".csv"):
                name += ".csv"
            (INBOX / name).write_bytes(self.body())
            log("info", f"Uploaded file '{name}' into the inbox folder")
            return self.send(b'{"ok":true}')
        d = json.loads(self.body() or b"{}")
        out = {"ok": True}
        if p == "/studio/convert":
            if JOB["running"]:
                out = {"error": "A conversion is already running"}
            elif not d.get("sources"):
                out = {"error": "Tick at least one brand or file first"}
            else:
                srcs, st = d["sources"], d.get("settings", {})
                one = lambda s: safe_name(s["name"].replace("inbox/", "").removesuffix(".csv"), "export")
                if len(srcs) == 1:                           # one brand/file -> one export (the typed name wins)
                    jobs = [(srcs, safe_name(d.get("name") or one(srcs[0]), "export"))]
                else:                                        # several ticked -> one export per brand/file
                    jobs = [([s], one(s)) for s in srcs]
                JOB["running"] = True                       # reserved now so a second click cannot start another batch

                def batch():
                    for srcs1, name in jobs:
                        convert_job(srcs1, name, st, same_name_run(name))
                threading.Thread(target=batch, daemon=True).start()
        elif p == "/studio/rerun":
            r = sdb("SELECT id,name,sources,settings FROM runs WHERE id=?", (d.get("id"),))
            if JOB["running"]:
                out = {"error": "A conversion is already running"}
            elif not r:
                out = {"error": "Run not found"}
            else:
                threading.Thread(target=convert_job, args=(json.loads(r[0][2]), r[0][1], json.loads(r[0][3]), r[0][0]), daemon=True).start()
        elif p == "/studio/override":
            if d.get("item"):
                sdb("INSERT INTO overrides(key,item,title,ts) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET item=excluded.item, ts=excluded.ts",
                    (d["key"], d["item"], d.get("title", ""), now()))
                log("info", f"Manual correction saved: '{d.get('title', '')[:70]}' -> {d['item']}")
            else:
                sdb("DELETE FROM overrides WHERE key=?", (d["key"],))
        elif p == "/studio/delete":
            r = sdb("SELECT files,name FROM runs WHERE id=?", (d.get("id"),))
            if r:
                fs = json.loads(r[0][0])
                for k, f in fs.items():
                    try:
                        if k != "dir":
                            (out_dir(fs) / f).unlink()
                    except OSError:
                        pass
                sdb("DELETE FROM runs WHERE id=?", (d["id"],))
                REV.pop(d["id"], None)
                log("warn", f"Deleted export '{r[0][1]}'")
        elif p == "/studio/delfile":
            f = INBOX / os.path.basename(d.get("name", "").replace("inbox/", ""))
            if f.exists():
                f.unlink()
                log("warn", f"Removed uploaded file '{f.name}'")
        elif p == "/studio/folders":
            out = set_folders(d)
        elif p == "/studio/clearlogs":
            sdb("DELETE FROM events")
        elif p == "/studio/open":
            try:
                if os.name == "nt":
                    os.startfile(str(EXPORTS))
                else:
                    subprocess.Popen(["xdg-open", str(EXPORTS)])
            except Exception:                                # noqa: BLE001
                out = {"error": "Could not open the folder. It is: " + str(EXPORTS)}
        self.send(json.dumps(out).encode())


# ------------------------------------------------------------------ page
PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><title>Nykaa Studio</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--bg:#f1f1ef;--card:#f8f8f6;--ink:#141414;--mute:#8a8a86;--ac:#e8643c;--line:#e6e6e2}
*{box-sizing:border-box}body{margin:0;background:#dcdcd8;font:14px Inter,"Segoe UI",system-ui,sans-serif;color:var(--ink);padding:16px}
.app{background:var(--bg);border-radius:34px;padding:22px;max-width:1440px;margin:auto}
.card{background:var(--card);border-radius:26px;padding:18px 20px;border:1px solid #fff;min-width:0}
.g{display:grid;gap:14px;margin-top:14px}.g6{grid-template-columns:repeat(6,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g2{grid-template-columns:1.3fr 1fr}.g21{grid-template-columns:1fr 1fr}
@media(max-width:1000px){.g6,.g3,.g2,.g21{grid-template-columns:1fr 1fr}}
.top,.hero,.row{display:flex;align-items:center;gap:12px}.top{justify-content:space-between;flex-wrap:wrap}.grow{flex:1}
.logo{width:46px;height:46px;border-radius:50%;background:#111;color:#fff;display:grid;place-items:center;font-weight:700}
.pill{border-radius:999px;background:var(--card);border:1px solid var(--line);padding:9px 16px;display:inline-flex;align-items:center;gap:8px}
.dot{width:9px;height:9px;border-radius:50%;background:#bbb}.dot.on{background:var(--ac);animation:p 1s infinite}@keyframes p{50%{opacity:.3}}
.nav a{cursor:pointer;text-decoration:none;color:var(--ink)}.nav a.cur{background:#111;color:#fff}
h1{font-size:30px;margin:0;font-weight:500}h1 span{color:#b9b9b4}h3{margin:0 0 12px;font-size:15px;font-weight:600}
.btn{border:0;border-radius:999px;padding:10px 18px;background:var(--ac);color:#fff;cursor:pointer;font:inherit}.btn.k{background:#111}
.btn.o{background:#fff;color:var(--ink);border:1px solid var(--line)}.btn.s{padding:6px 12px;font-size:12px}
.go{width:84px;height:84px;border-radius:50%;border:0;background:#fff;font-size:26px;cursor:pointer;box-shadow:0 2px 10px #0001}.go.stop{background:#111;color:#fff}
input,select{border:1px solid var(--line);border-radius:999px;padding:9px 14px;background:#fff;font:inherit;min-width:0}
.kpi .ic{width:32px;height:32px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:13px}
.kpi b{display:block;font-size:26px;margin:10px 0 2px;font-weight:600}.kpi small,.mute{color:var(--mute);font-size:12px}.bad b{color:var(--ac)}
.ring{background:#111;color:#fff;border-radius:50%;display:grid;place-items:center;aspect-ratio:1;max-width:170px;margin:auto;width:100%;padding:8px}
table{width:100%;border-collapse:collapse}th{text-align:left;color:var(--mute);font-weight:400;font-size:12px}td,th{padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:middle}
.bar{height:8px;border-radius:9px;background:#e9e9e5;overflow:hidden}.bar i{display:block;height:100%;background:var(--ac);border-radius:9px}
.tag{border-radius:999px;padding:3px 10px;font-size:12px;background:#ececE8}.High,.Manual{background:#dff3e6;color:#1f7a45}.Medium{background:#fff1cf;color:#8a6200}.Low,.None{background:#111;color:#fff}
.tl{max-height:420px;overflow:auto;border-left:2px solid var(--line);margin-left:6px;padding-left:16px}
.ev{position:relative;padding:5px 0;font-size:12.5px}.ev i{position:absolute;left:-23px;top:10px;width:10px;height:10px;border-radius:50%;background:#b9b9b4;border:2px solid var(--bg)}
.ev.ok i{background:#2f9e5a}.ev.warn i{background:#e0a030}.ev.error i{background:#d63c3c}.ev time{color:var(--mute);margin-right:8px}.ev.error span{color:#b32a2a}
.scroll{max-height:340px;overflow:auto}.sel{width:100%;max-width:210px;border-radius:12px;padding:6px 8px}
#sc{position:fixed;inset:0;background:#dcdcd8;z-index:9;display:none;padding:12px}#sc iframe{width:100%;height:calc(100% - 52px);border:0;border-radius:24px;background:#fff}
label.ck{display:flex;gap:8px;align-items:center;padding:5px 0;cursor:pointer}
</style></head><body><div class="app" id="top">
<div class="top"><div class="row"><div class="logo">N°</div><div><b>Nykaa Studio</b><br><span class="mute">Scrape · Convert · Review · Export</span></div></div>
<div class="row nav"><a class="pill cur" onclick="goto('top',this)">Convert</a><a class="pill" onclick="goto('rv',this)">Review</a><a class="pill" onclick="goto('ex',this)">Exports</a><a class="pill" onclick="goto('lg',this)">Logs</a><a class="pill" id="scb" onclick="openScraper()">Scraper ↗</a>
<div class="pill" id="st"></div></div></div>
<div class="hero" style="margin:18px 0 6px"><div class="grow"><h1>Ready to convert? 👋</h1><h1><span>Tick brands or files, name the export, press start.</span></h1></div>
<input id="en" placeholder="Export name (optional)" size="26"><button class="go" id="go" onclick="start()">▶</button></div>
<div class="mute" id="jm" style="text-align:right;min-height:16px"></div>
<div class="g g6"><div id="kpis" style="display:contents"></div><div class="card" style="padding:10px"><div class="ring" id="gauge"></div></div></div>

<div class="g g21"><div class="card"><div class="row"><h3 class="grow">1 · Scraped brands <span class="mute" id="dbp"></span></h3><button class="btn s o" onclick="sel('db',1)">All</button><button class="btn s o" onclick="sel('db',0)">None</button></div><div class="scroll" id="dbl"></div></div>
<div class="card"><div class="row"><h3 class="grow">2 · CSV files <span class="mute">(every CSV in the input folder is picked up and ticked automatically)</span></h3><button class="btn s o" onclick="sel('file',1)">All</button><button class="btn s o" onclick="sel('file',0)">None</button><button class="btn s" onclick="document.getElementById('up').click()">Upload CSV</button><input type="file" id="up" accept=".csv" multiple style="display:none" onchange="upload(this.files)"></div><div class="scroll" id="fl"></div></div></div>

<div class="card g" style="margin-top:14px"><h3>3 · Settings</h3><div class="row" style="flex-wrap:wrap">
<span class="mute">Selling price</span><select id="pm"><option value="ratio">MRP × ratio</option><option value="scraped">Use scraped offer price</option></select>
<input id="sr" value="0.69" size="5" title="selling ratio"><span class="mute">Parlour mark-up</span><input id="pu" value="0.06" size="5">
<span class="mute">Category names</span><select id="nm"><option value="">slugs (personal-care)</option><option value="1">names (Personal Care)</option></select>
<span class="mute">Qty if unknown</span><input id="dq" placeholder="blank" size="6"><span class="mute">Barcode start</span><input id="bs" placeholder="blank" size="8">
<label class="ck"><input type="checkbox" id="tr" style="min-width:0"> fill standard/master pack</label></div></div>

<div class="card" style="margin-top:14px"><h3>Folders <span class="mute">(remembered after restart)</span></h3><div class="row" style="flex-wrap:wrap">
<span class="mute">Input folder (reads nykaa.db &amp; CSV files, uploads go here)</span><input id="fi" class="grow" size="40">
<span class="mute">Output folder (converted CSVs saved here)</span><input id="fo" class="grow" size="40"><button class="btn k" onclick="saveFolders()">Save folders</button></div></div>

<div class="g g3"><div class="card"><h3>Item names <span class="mute">(latest export)</span></h3><div id="it"></div></div>
<div class="card"><h3>Column completeness</h3><div id="cp" class="scroll"></div></div>
<div class="card"><h3>Quality</h3><div id="qa"></div></div></div>

<div class="card g" id="rv"><div class="row"><h3 class="grow">Review <span class="mute">· pick the right item name, Save, then Re-run</span></h3><input id="rq" placeholder="search…" oninput="drawReview(true)" size="18"><button class="btn s" id="rr" onclick="rerun()">Re-run latest with corrections</button></div>
<div class="scroll" style="max-height:420px" id="rl"></div></div>

<div class="g g2" id="ex"><div class="card"><div class="row"><h3 class="grow">Exports</h3><button class="btn s o" onclick="api('/studio/open')">Open folder</button></div><div class="scroll" id="xl"></div></div>
<div class="card" id="lg"><div class="row"><h3 class="grow">Activity log</h3><select id="ef" onchange="F=this.value;drawLog()"><option value="">All</option><option value="ok">Success</option><option value="warn">Warnings</option><option value="error">Errors</option></select>
<button class="btn s o" onclick="location='/studio/logs'">Export</button><button class="btn s o" onclick="if(confirm('Clear all log lines?'))api('/studio/clearlogs')">Clear</button></div><div class="tl" id="tl"></div></div></div></div>

<div id="sc"><div class="row" style="margin-bottom:8px"><b class="grow">Scraper dashboard</b><button class="btn k" onclick="closeScraper()">← Back to Studio</button></div><iframe id="sf"></iframe></div>
<script>
/* skip re-rendering when the HTML is identical, so scroll positions and open selects are not reset every 2 s */
(()=>{const d=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(Element.prototype,'innerHTML',{get(){return d.get.call(this)},set(v){if(this.__h!==v){this.__h=v;d.set.call(this,v)}}})})();
let S=null,PICK=new Set(),SEEN=new Set(),F='',PEND={},lastRev='',lastRun=0;
const $=s=>document.querySelector(s),n0=x=>Math.round(x||0).toLocaleString('en-IN'),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const api=async(p,d)=>{const r=await(await fetch(p,{method:'POST',body:JSON.stringify(d||{})})).json();if(r.error)alert(r.error);load();return r};
const goto=(id,a)=>{document.getElementById(id).scrollIntoView({behavior:'smooth'});document.querySelectorAll('.nav a').forEach(x=>x.classList.remove('cur'));if(a)a.classList.add('cur')};
const openScraper=()=>{if(!S.scraper){alert('The scraper dashboard could not be loaded:\n'+S.scraper_err+'\n\nPut studio.py / the nykaa_mapper folder inside the scraper project folder (next to crawler.py).');return}
 $('#sf').src='/scraper';$('#sc').style.display='block'};const closeScraper=()=>{$('#sc').style.display='none';$('#sf').src='about:blank'};
async function load(){try{const r=await(await fetch('/studio/state')).json();if(r.error){$('#st').textContent='Server error: '+r.error;return}S=r;draw()}catch(e){$('#st').textContent='Studio is not running'}}
function sel(t,v){(t=='db'?S.db.brands.map(b=>'db|'+b.brand):S.files.map(f=>'file|'+f.name)).forEach(k=>v?PICK.add(k):PICK.delete(k));draw()}
function tick(k,el){el.checked?PICK.add(k):PICK.delete(k)}
async function upload(fs){for(const f of fs){await fetch('/studio/upload?name='+encodeURIComponent(f.name),{method:'POST',body:f})}$('#up').value='';load()}
function start(){if(S.job.running)return;const sources=[...PICK].map(k=>{const i=k.indexOf('|');return{type:k.slice(0,i),name:k.slice(i+1)}});
 api('/studio/convert',{sources,name:$('#en').value,settings:{price_mode:$('#pm').value,selling_ratio:$('#sr').value,parlour_markup:$('#pu').value,names:$('#nm').value,default_qty:$('#dq').value,barcode_start:$('#bs').value,tiers:$('#tr').checked}})}
const rerun=()=>S.runs.length&&api('/studio/rerun',{id:S.runs[0].id});
const hb=(l,p,t)=>`<div style="margin:9px 0"><div class="row mute"><span class="grow">${esc(l)}</span><span>${t??Math.round(p)+'%'}</span></div><div class="bar"><i style="width:${Math.min(p,100)}%"></i></div></div>`;
async function saveOv(i){const r=S.review[i],el=document.getElementById('o'+i);await api('/studio/override',{key:r.key,item:el.value,title:r.title});delete PEND[r.key]}
function drawReview(force){const q=($('#rq').value||'').toLowerCase(),sig=JSON.stringify(S.review.map(r=>r.key+r.override))+q+S.cur?.id;if(!force&&sig==lastRev)return;lastRev=sig;
 const opts=cur=>'<option value="">— choose —</option>'+S.items.map(i=>`<option ${i.item==cur?'selected':''} value="${esc(i.item)}">${esc(i.category+' › '+i.sub+' › '+i.item)}</option>`).join('');
 const rows=S.review.map((r,i)=>[r,i]).filter(([r])=>!q||(r.title+r.brand+r.predicted).toLowerCase().includes(q));
 $('#rl').innerHTML=rows.length?'<table><tr><th>Product</th><th>Guess</th><th>Sure?</th><th>Why</th><th>Correct item</th><th></th></tr>'+rows.map(([r,i])=>`<tr><td>${esc(r.title.slice(0,70))}<br><span class="mute">${esc(r.brand)}</span></td><td>${esc(r.predicted||'—')}<br><span class="mute">alt: ${esc(r.alt||'—')}</span></td><td><span class="tag ${r.confidence}">${r.confidence}</span></td><td class="mute">${esc(r.reasons)}</td>
 <td><select class="sel" id="o${i}" onchange="PEND['${r.key.replace(/'/g,"")}']=this.value">${opts(PEND[r.key]||r.override||r.predicted)}</select></td><td><button class="btn s" onclick="saveOv(${i})">${r.override?'Saved ✓':'Save'}</button></td></tr>`).join('')+'</table>':'<span class="mute">Nothing to review 🎉</span>'}
function drawLog(){$('#tl').innerHTML=S.events.filter(e=>!F||e.level==F).map(e=>`<div class="ev ${e.level}"><i></i><time>${e.ts.slice(5,19)}</time><span>${esc(e.msg)}</span></div>`).join('')||'<span class="mute">No activity yet</span>'}
function draw(){const j=S.job,run=j.running,c=S.cur,st=c?c.stats:null;
 $('#st').innerHTML=`<i class="dot ${run?'on':''}"></i>${run?esc(j.name)+' · '+j.done+'/'+j.total:'Idle'}`;$('#go').textContent=run?'…':'▶';$('#go').className='go'+(run?' stop':'');$('#jm').textContent=run?j.msg:'';
 const pct=st&&st.rows?Math.round(st.assigned/st.rows*100):0,hm=st?((st.conf.High||0)+(st.conf.Manual||0)+(st.conf.Medium||0)):0;
 $('#kpis').innerHTML=[['▣','Rows converted',st?st.rows:0,c?esc(c.name):'—'],['✓','Item matched',st?st.assigned:0,pct+'% of rows'],['!','To review',st?st.review:0,'low / missing','bad'],
  ['▤','Avg images',st?st.avg_images:0,'per product row'],['❖','Extra columns',st?st.extras:0,'source data kept (src_…)'],['⇩','Exports',S.runs.length,S.overrides+' manual fixes']]
  .map(x=>`<div class="card kpi ${x[4]||''}"><div class="ic">${x[0]}</div><b>${typeof x[2]=='number'?n0(x[2]):x[2]}</b>${x[1]}<br><small>${x[3]}</small></div>`).join('');
 $('#gauge').innerHTML=`<svg viewBox="0 0 140 140"><circle cx="70" cy="70" r="54" fill="none" stroke="#333" stroke-width="9"/><circle cx="70" cy="70" r="54" fill="none" stroke="#e8643c" stroke-width="9" stroke-linecap="round" stroke-dasharray="${pct*3.393} 340" transform="rotate(-90 70 70)"/><text x="70" y="72" text-anchor="middle" fill="#fff" font-size="26">${pct}%</text><text x="70" y="92" text-anchor="middle" fill="#999" font-size="11">Matched</text></svg>`;
 $('#dbp').textContent=S.db.ok?'':'(no database found: '+S.db.path+')';
 $('#dbl').innerHTML=S.db.brands.length?S.db.brands.map(b=>{const k='db|'+b.brand;return`<label class="ck"><input type="checkbox" style="min-width:0" ${PICK.has(k)?'checked':''} onchange="tick('${esc(k).replace(/'/g,"&#39;")}',this)"><b class="grow">${esc(b.brand)}</b><span class="mute">${n0(b.products)} products · ${n0(b.variants)} variants</span></label>`}).join(''):'<span class="mute">No scraped brands yet - run the Scraper tab first, or upload a CSV →</span>';
 S.files.forEach(f=>{const k='file|'+f.name;if(f.name.startsWith('inbox/')&&!SEEN.has(k))PICK.add(k);SEEN.add(k)});
 $('#fl').innerHTML=S.files.length?S.files.map(f=>{const k='file|'+f.name;return`<label class="ck"><input type="checkbox" style="min-width:0" ${PICK.has(k)?'checked':''} onchange="tick('${esc(k).replace(/'/g,"&#39;")}',this)"><b class="grow">${esc(f.name)}</b><span class="mute">${n0(f.rows)} rows · ${f.mtime}</span>${f.name.startsWith('inbox/')?`<button class="btn s o" onclick="event.preventDefault();if(confirm('Delete this file from the input folder?'))api('/studio/delfile',{name:'${esc(f.name).replace(/'/g,"")}'})">✕</button>`:''}</label>`}).join(''):'<span class="mute">Upload a CSV to start (Upload CSV button)</span>';
 if(st){const mx=Math.max(1,...st.items.map(x=>x[1]));$('#it').innerHTML=st.items.map(x=>hb(x[0],x[1]/mx*100,n0(x[1]))).join('')+'<div class="mute" style="margin-top:8px">Category</div>'+st.cats.map(x=>hb(x[0],x[1]/Math.max(1,st.rows)*100,n0(x[1]))).join('');
  $('#cp').innerHTML=st.complete.map(x=>hb(x[0],x[1])).join('');
  $('#qa').innerHTML=Object.entries(st.conf).map(([k,v])=>hb(k,v/Math.max(1,st.rows)*100,n0(v))).join('')+`<div class="mute" style="margin-top:8px">GST rates</div>`+st.gst.map(x=>hb(x[0]+'%',x[1]/Math.max(1,st.rows)*100,n0(x[1]))).join('')+`<div class="mute" style="margin-top:8px">Avg MRP ₹${n0(st.price.mrp)} · selling ₹${n0(st.price.sell)}</div>`+((st.unused&&st.unused.length)?`<div class="mute" style="margin-top:8px">Unused source columns: ${st.unused.map(u=>esc(u[0])).join(', ')}</div>`:'')}
 else{$('#it').innerHTML=$('#cp').innerHTML=$('#qa').innerHTML='<span class="mute">Convert something to see the analysis</span>'}
 drawReview();
 $('#xl').innerHTML=S.runs.length?'<table><tr><th>Name</th><th>Rows</th><th>Matched</th><th>Review</th><th>Download</th><th></th></tr>'+S.runs.map(r=>`<tr><td><b>${esc(r.name)}</b><br><span class="mute">${r.ts.slice(0,16)}</span></td><td>${n0(r.rows)}</td><td>${r.rows?Math.round(r.assigned/r.rows*100):0}%</td><td>${r.review}</td>
  <td style="white-space:nowrap"><button class="btn s" onclick="location='/studio/download?id=${r.id}&kind=full'">Import-ready</button> <button class="btn s o" onclick="location='/studio/download?id=${r.id}&kind=template'">Template only</button> <button class="btn s o" onclick="location='/studio/download?id=${r.id}&kind=review'">Review</button></td>
  <td><button class="btn s k" onclick="if(confirm('Delete this export and its files?'))api('/studio/delete',{id:${r.id}})">✕</button></td></tr>`).join('')+'</table>':'<span class="mute">No exports yet</span>';
 drawLog()}
async function saveFolders(create){const r=await(await fetch('/studio/folders',{method:'POST',body:JSON.stringify({input:$('#fi').value,output:$('#fo').value,create:!!create})})).json();
 if(r.missing){if(confirm('This folder does not exist: '+r.missing.join(', ')+' - Create it?'))return saveFolders(1);return}
 if(r.error)return alert(r.error);alert('Folders saved.');FD=0;load()}
let FD=0;setInterval(()=>{if(S&&S.folders&&!FD&&document.activeElement.id!='fi'&&document.activeElement.id!='fo'){$('#fi').value=S.folders.input;$('#fo').value=S.folders.output;FD=1}},300);
load();setInterval(load,2000);
</script></body></html>"""


# Solist Hub shared look: added on top of this page's own style when ../hub/solist-theme.html exists
try:
    from pathlib import Path as _P
    _T = _P(__file__).resolve().parent.parent / "hub" / "solist-theme.html"
    if _T.exists():
        PAGE = PAGE.replace("</style>", "</style>" + _T.read_text(encoding="utf-8"), 1)
except OSError:
    pass


def main():
    init()
    if HAVE_SCRAPER:
        dashboard.init()
        sys.stdout = dashboard.Out()                          # the scraper tab shows the crawler's print() output
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), S)
    log("info", f"Nykaa Studio started - folder: {ROOT} - scraper tab: {'ON' if HAVE_SCRAPER else 'OFF (' + SCRAPER_ERR + ')'}")
    print(f"Nykaa Studio running at http://localhost:{PORT}  (close this window to stop)", file=sys.__stdout__)
    threading.Timer(1, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        if HAVE_SCRAPER:
            dashboard.stop.set()


if __name__ == "__main__":
    main()
