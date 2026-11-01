"""Nykaa Scraper Dashboard. Put next to crawler.py, then:  python dashboard.py
Opens http://localhost:8765 - control, monitor, analyse and export everything from the browser."""
import csv, io, json, os, re, shutil, sqlite3, sys, threading, time, traceback, webbrowser
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

import crawler

PORT, QF = 8765, "brands_queue.json"
stop, LOCK = threading.Event(), threading.Lock()
ST = {"thread": None, "started": None, "running": None, "brand": None}
now = lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S")
FIELDS = ["description", "ingredients", "how_to_use", "size", "manufacturer", "packer", "importer",
          "origin_country", "gallery_images", "description_images"]


class StopRun(Exception):
    pass


def db(sql, args=()):
    with LOCK:
        c = sqlite3.connect(crawler.DB, timeout=30)
        try:
            c.execute("PRAGMA journal_mode=WAL")
            cur = c.execute(sql, args)
            c.commit()
            return cur.fetchall()
        finally:
            c.close()


def init():
    crawler.init_db().close()
    db("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, ts TEXT, brand TEXT, level TEXT, msg TEXT)")
    db("CREATE TABLE IF NOT EXISTS requests(ts TEXT, brand TEXT, url TEXT, kind TEXT, ok INTEGER, ms INTEGER)")
    db("CREATE TABLE IF NOT EXISTS failures(product_id TEXT PRIMARY KEY, url TEXT, brand_url TEXT, reason TEXT, "
       "ts TEXT, attempts INTEGER DEFAULT 1)")


def event(level, msg):
    try:
        db("INSERT INTO events(ts,brand,level,msg) VALUES(?,?,?,?)", (now(), ST["brand"], level, msg))
    except Exception:
        pass


class Out:  # captures the crawler's print() output into the events timeline
    buf = ""

    def write(self, s):
        self.buf += s
        while "\n" in self.buf:
            line, self.buf = self.buf.split("\n", 1)
            low = line.lower()
            if line.strip():
                lvl = ("error" if any(k in low for k in ("failed", "error", "status 4", "status 5")) else
                       "warn" if any(k in low for k in ("giving up", "stop")) else
                       "ok" if "->" in low and "variants" in low else "info")
                event(lvl, line.strip())

    def flush(self):
        pass


# ---- instrument the crawler: record every request + every failed / recovered product ----
_fetch0, _parse0 = crawler.fetch, crawler.parse_product


def _fail(pid, url, why):
    db("INSERT INTO failures(product_id,url,brand_url,reason,ts) VALUES(?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE "
       "SET reason=excluded.reason, ts=excluded.ts, attempts=attempts+1", (pid, url, ST["running"], why, now()))


def _fetch(session, url, tries=4):
    if stop.is_set():
        raise StopRun()
    t = time.time()
    page = _fetch0(session, url, tries)
    kind = "product" if "/p/" in url else "listing"
    db("INSERT INTO requests VALUES(?,?,?,?,?,?)",
       (now(), ST["brand"], url, kind, int(page is not None), int((time.time() - t) * 1000)))
    m = re.search(r"/p/(\d+)", url)
    if page is None and m:
        _fail(m.group(1), url, "request failed after retries (blocked / timeout / non-200)")
    return page


def _parse(page, pid, url):
    rows = _parse0(page, pid, url)
    if rows:
        db("DELETE FROM failures WHERE product_id=?", (pid,))
    else:
        _fail(pid, url, "page loaded but no product data found")
    return rows


crawler.fetch, crawler.parse_product = _fetch, _parse


# ---- queue / worker ----
def load():
    try:
        return json.load(open(QF, encoding="utf-8"))
    except Exception:
        return []


def worker(entries, delay):
    crawler.DELAY = delay
    try:
        for e in entries:
            if stop.is_set():
                break
            ST["running"], ST["brand"] = e["url"], e["name"]
            event("info", f"Started brand: {e['name']}")
            c = crawler.init_db()
            crawler.crawl_listings(c, e["url"], e["pages"])
            crawler.crawl_details(c, e["url"])
            c.close()
            event("ok", f"Finished brand: {e['name']}")
    except StopRun:
        event("warn", "Stopped by user - progress saved, press Start to resume")
    except Exception:
        event("error", "Crash: " + traceback.format_exc()[-400:])
    finally:
        ST["running"] = ST["brand"] = None


# ---- folders: where nykaa.db lives and where CSV exports are saved (remembered in folders.json) ----
def set_folders(d, running):
    new = {k: os.path.abspath(os.path.expanduser(str(d.get(k) or "").strip().strip('"'))) for k in ("data", "exports")
           if str(d.get(k) or "").strip()}
    if len(new) < 2:
        return {"error": "Type both folders"}
    missing = [v for v in new.values() if not os.path.isdir(v)]
    if missing and not d.get("create"):
        return {"error": "Folder does not exist", "missing": missing}
    old = crawler.folders()
    if os.path.normcase(new["data"]) != os.path.normcase(old["data"]) and running:
        return {"error": "Stop the crawl before changing the data folder"}
    try:
        for v in new.values():
            os.makedirs(v, exist_ok=True)
    except OSError as e:
        return {"error": f"Could not create folder: {e}"}
    note, dst = "", os.path.join(new["data"], "nykaa.db")
    if not os.path.exists(dst) and os.path.exists(crawler.DB):  # bring the existing data along (copy, original kept)
        db("PRAGMA wal_checkpoint(TRUNCATE)")
        with LOCK:
            shutil.copy2(crawler.DB, dst)
        note = "Your existing data was copied into the new folder."
    crawler.save_folders(new)
    crawler.DB, crawler.EXPORTS = dst, new["exports"]
    init()
    event("info", f"Folders changed - data: {new['data']}  exports: {new['exports']}")
    return {"ok": True, "note": note, **new}


def reset(u):
    sub = "(SELECT product_id FROM listing WHERE brand_url=?)"
    for s in (f"DELETE FROM variants WHERE product_id IN {sub}", f"DELETE FROM product_done WHERE product_id IN {sub}",
              "DELETE FROM listing WHERE brand_url=?", "DELETE FROM brand_progress WHERE brand_url=?",
              "DELETE FROM failures WHERE brand_url=?"):
        db(s, (u,))


# ---- analytics ----
def state(b):
    ents = [e for e in load() if not b or e["url"] == b]
    nm = ents[0]["name"] if b and ents else None
    W, A = (("WHERE product_id IN (SELECT product_id FROM listing WHERE brand_url=?)", (b,)) if b else ("", ()))
    brands = []
    for e in ents:
        u = e["url"]
        p = db("SELECT last_page,done FROM brand_progress WHERE brand_url=?", (u,))
        q = lambda s: db(s, (u,))[0][0]
        brands.append(dict(e, last=p[0][0] if p else 0, done=p[0][1] if p else 0,
                           n=q("SELECT COUNT(*) FROM listing WHERE brand_url=?"),
                           d=q("SELECT COUNT(*) FROM listing l JOIN product_done p USING(product_id) WHERE l.brand_url=?"),
                           v=q("SELECT COUNT(*) FROM variants v JOIN listing l USING(product_id) WHERE l.brand_url=?"),
                           f=q("SELECT COUNT(*) FROM failures WHERE brand_url=?")))
    BF, BA = ((" WHERE brand=?", (nm,)) if nm else ("", ()))
    rq = db("SELECT COUNT(*),COALESCE(SUM(ok),0),COALESCE(AVG(ms),0) FROM requests" + BF, BA)[0]
    series = db("SELECT substr(ts,1,16),SUM(ok),COUNT(*)-SUM(ok) FROM requests" + BF +
                " GROUP BY 1 ORDER BY 1 DESC LIMIT 60", BA)[::-1]
    since = (datetime.now() - timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M:%S")
    rate = db("SELECT COUNT(*) FROM requests WHERE kind='product' AND ok=1 AND ts>=?", (since,))[0][0] / 5
    n, d = sum(x["n"] for x in brands), sum(x["d"] for x in brands)
    sel = ",".join(f"SUM(CASE WHEN {c} IS NOT NULL AND {c}!='' THEN 1 ELSE 0 END)" for c in FIELDS)
    r = db(f"SELECT COUNT(*),{sel},AVG(offer_price),MIN(offer_price),MAX(offer_price),AVG(discount),AVG(in_stock),"
           f"AVG(rating) FROM variants {W}", A)[0]
    tail = " AND" if W else " WHERE"
    hist = db("SELECT CASE WHEN offer_price<500 THEN '<500' WHEN offer_price<1000 THEN '500-1k' WHEN offer_price<2500 "
              "THEN '1k-2.5k' WHEN offer_price<5000 THEN '2.5k-5k' ELSE '5k+' END, COUNT(*) FROM variants " + W + tail +
              " offer_price IS NOT NULL GROUP BY 1", A)
    cats = db(f"SELECT cat_l3,COUNT(DISTINCT product_id) c FROM variants {W}{tail} cat_l3 IS NOT NULL "
              "GROUP BY 1 ORDER BY c DESC LIMIT 6", A)
    FW, FA = (("WHERE brand_url=?", (b,)) if b else ("", ()))
    return dict(
        running=ST["running"], brand=ST["brand"], elapsed=int(time.time() - ST["started"]) if ST["running"] else 0,
        brands=brands, series=series, hist=hist, cats=cats,
        k=dict(n=n, d=d, f=sum(x["f"] for x in brands), v=sum(x["v"] for x in brands), req=rq[0], ok=rq[1], ms=rq[2],
               eta=round((n - d) / rate) if rate else None,
               blocked=db("SELECT COUNT(*) FROM events WHERE msg LIKE '%status 403%' OR msg LIKE '%status 429%'")[0][0]),
        comp=[[c, (r[1 + i] or 0) / r[0] * 100 if r[0] else 0] for i, c in enumerate(FIELDS)],
        stats=dict(rows=r[0], avg=r[11], lo=r[12], hi=r[13], disc=r[14], stock=r[15], rating=r[16]) if len(r) > 16 else {},
        fails=db(f"SELECT product_id,url,reason,ts,attempts FROM failures {FW} ORDER BY ts DESC LIMIT 100", FA),
        events=db("SELECT ts,brand,level,msg FROM events" + BF + " ORDER BY id DESC LIMIT 200", BA))


def export_name(kind, u):
    if kind in ("failures", "events", "all"):
        return {"failures": "Failures", "events": "Activity-Log", "all": "All-Brands"}[kind]
    r = db("SELECT brand FROM listing WHERE brand_url=? AND brand IS NOT NULL AND brand!='' LIMIT 1", (u,))
    return crawler.file_name(r[0][0] if r else next((e["name"] for e in load() if e["url"] == u), crawler.slug_of(u)))


def export(kind, u):
    if kind == "failures":
        h, rows = ["product_id", "url", "brand_url", "reason", "time", "attempts"], db(
            "SELECT product_id,url,brand_url,reason,ts,attempts FROM failures")
    elif kind == "events":
        h, rows = ["time", "brand", "level", "message"], db("SELECT ts,brand,level,msg FROM events ORDER BY id")
    else:
        h = crawler.COLS
        rows = (db("SELECT v.* FROM variants v JOIN listing l ON v.product_id=l.product_id WHERE l.brand_url=?", (u,))
                if u else db("SELECT * FROM variants"))
    s = io.StringIO()
    w = csv.writer(s)
    w.writerow(h)
    w.writerows(rows)
    return ("\ufeff" + s.getvalue()).encode("utf-8")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body, ctype="application/json", name=None):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        if name:
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(name)}")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u, q = urlparse(self.path), parse_qs(urlparse(self.path).query)
        g = lambda k: q.get(k, [""])[0]
        if u.path == "/api/state":
            try:
                self.send(json.dumps(state(g("b"))).encode())
            except Exception:
                traceback.print_exc(file=sys.__stderr__)
                self.send(json.dumps({"error": traceback.format_exc()[-300:]}).encode())
        elif u.path == "/api/folders":
            self.send(json.dumps(crawler.folders()).encode())
        elif u.path == "/export":
            name, body = export_name(g("kind"), g("u")) + ".csv", export(g("kind"), g("u"))
            try:  # also saved in the exports folder, named after the brand; a newer export replaces the older file
                os.makedirs(crawler.EXPORTS, exist_ok=True)
                open(os.path.join(crawler.EXPORTS, name), "wb").write(body)
            except OSError as e:
                event("error", f"Could not save {name} in the exports folder (is it open in Excel?): {e}")
            self.send(body, "text/csv; charset=utf-8", name)
        else:
            self.send(PAGE.encode(), "text/html; charset=utf-8")

    def do_POST(self):
        d = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or "{}")
        p, out = urlparse(self.path).path, {"ok": True}
        running = ST["thread"] and ST["thread"].is_alive()
        if p == "/api/add":
            u = d.get("url", "").strip().split("?")[0]
            pg = str(d.get("pages", "")).strip()
            if "nykaa.com" not in u:
                out = {"error": "Paste a valid Nykaa brand link"}
            elif any(e["url"] == u for e in load()):
                out = {"error": "Brand already in queue"}
            else:
                m = re.search(r"/brands/([^/]+)/", u)
                json.dump(load() + [{"name": d.get("name", "").strip() or (m.group(1) if m else "brand"), "url": u,
                                     "pages": int(pg) if pg.isdigit() and int(pg) else 500}],
                          open(QF, "w", encoding="utf-8"), indent=1)
        elif p == "/api/run":
            if running:
                out = {"error": "A crawl is already running"}
            else:
                urls = d.get("urls") or []
                lo, hi = d.get("delay", [1, 2])
                stop.clear()
                ST["started"] = time.time()
                ST["thread"] = threading.Thread(target=worker, daemon=True, args=(
                    [e for e in load() if not urls or e["url"] in urls], (float(lo), float(hi))))
                ST["thread"].start()
        elif p == "/api/stop":
            stop.set()
            event("warn", "Stop requested")
        elif p == "/api/remove":
            json.dump([e for e in load() if e["url"] != d.get("url")], open(QF, "w", encoding="utf-8"), indent=1)
        elif p == "/api/folders":
            out = set_folders(d, running)
        elif p == "/api/reset":
            out = {"error": "Stop the crawl first"} if running else (reset(d["url"]) or out)
        self.send(json.dumps(out).encode())


PAGE = r"""<!doctype html><html><head><meta charset="utf-8"><title>Nykaa Scraper Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--bg:#f1f1ef;--card:#f8f8f6;--ink:#141414;--mute:#8a8a86;--ac:#e8643c;--line:#e6e6e2}
*{box-sizing:border-box}body{margin:0;background:#dcdcd8;font:14px Inter,"Segoe UI",system-ui,sans-serif;color:var(--ink);padding:16px}
.app{background:var(--bg);border-radius:34px;padding:22px;max-width:1440px;margin:auto}
.card{background:var(--card);border-radius:26px;padding:18px 20px;border:1px solid #fff;min-width:0}
.g{display:grid;gap:14px;margin-top:14px}.g6{grid-template-columns:repeat(6,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g2{grid-template-columns:1.3fr 1fr}
@media(max-width:1000px){.g6,.g3,.g2{grid-template-columns:1fr 1fr}}
.top,.hero,.row{display:flex;align-items:center;gap:12px}.top{justify-content:space-between}.grow{flex:1}
.logo{width:46px;height:46px;border-radius:50%;background:#111;color:#fff;display:grid;place-items:center;font-weight:700}
.pill{border-radius:999px;background:var(--card);border:1px solid var(--line);padding:9px 16px;display:inline-flex;align-items:center;gap:8px}
.dot{width:9px;height:9px;border-radius:50%;background:#bbb}.dot.on{background:var(--ac);animation:p 1s infinite}@keyframes p{50%{opacity:.3}}
.date{width:84px;height:84px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:30px}
h1{font-size:30px;margin:0;font-weight:500}h1 span{color:#b9b9b4}h3{margin:0 0 12px;font-size:15px;font-weight:600}
.btn{border:0;border-radius:999px;padding:10px 18px;background:var(--ac);color:#fff;cursor:pointer;font:inherit}.btn.k{background:#111}
.btn.o{background:#fff;color:var(--ink);border:1px solid var(--line)}.btn.s{padding:6px 12px;font-size:12px}
.go{width:84px;height:84px;border-radius:50%;border:0;background:#fff;font-size:26px;cursor:pointer;box-shadow:0 2px 10px #0001}.go.stop{background:#111;color:#fff}
input,select{border:1px solid var(--line);border-radius:999px;padding:9px 14px;background:#fff;font:inherit;min-width:0}
.kpi .ic{width:32px;height:32px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:13px}
.kpi b{display:block;font-size:26px;margin:10px 0 2px;font-weight:600}.kpi small,.mute{color:var(--mute);font-size:12px}.bad b{color:var(--ac)}
.ring{background:#111;color:#fff;border-radius:50%;display:grid;place-items:center;aspect-ratio:1;max-width:170px;margin:auto;width:100%;padding:8px}
table{width:100%;border-collapse:collapse}th{text-align:left;color:var(--mute);font-weight:400;font-size:12px}td,th{padding:8px 6px;border-bottom:1px solid var(--line)}
.bar{height:8px;border-radius:9px;background:#e9e9e5;overflow:hidden}.bar i{display:block;height:100%;background:var(--ac);border-radius:9px}
.tag{border-radius:999px;padding:3px 10px;font-size:12px;background:#ececE8}.Running{background:var(--ac);color:#fff}.Done{background:#dff3e6;color:#1f7a45}.Retry{background:#111;color:#fff}
.tl{max-height:420px;overflow:auto;border-left:2px solid var(--line);margin-left:6px;padding-left:16px}
.ev{position:relative;padding:5px 0;font-size:12.5px}.ev i{position:absolute;left:-23px;top:10px;width:10px;height:10px;border-radius:50%;background:#b9b9b4;border:2px solid var(--bg)}
.ev.ok i{background:#2f9e5a}.ev.warn i{background:#e0a030}.ev.error i{background:#d63c3c}.ev time{color:var(--mute);margin-right:8px}.ev b{margin-right:6px}
.ev.error span{color:#b32a2a}.scroll{max-height:320px;overflow:auto}
</style></head><body><div class="app">
<div class="top"><div class="row"><div class="logo">N°</div><div><b>Nykaa Scraper</b><br><span class="mute">Analytics Dashboard</span></div></div>
<div class="row"><select id="bf" onchange="B=this.value;load()"><option value="">All brands</option></select>
<select id="sp"><option value="2,3">Gentle 2–3s</option><option value="1,2" selected>Normal 1–2s</option><option value="0.5,1">Fast 0.5–1s</option></select>
<div class="pill" id="st"></div></div></div>
<div class="hero card" style="margin-top:14px;background:transparent;border:0;padding:6px 0"><div class="date" id="dt"></div><div class="mute" id="dl"></div>
<button class="btn" onclick="location='#q'">Show my queue →</button><div class="grow"></div>
<div style="text-align:right"><h1>Hey, ready to scrape? 👋</h1><h1><span>Add a brand and press start.</span></h1></div><button class="go" id="go" onclick="toggle()">▶</button></div>
<div class="g g6"><div id="kpis" style="display:contents"></div><div class="card" style="padding:10px"><div class="ring" id="gauge"></div></div></div>
<div class="card g" id="q" style="margin-top:14px"><h3>Brand queue</h3>
<div class="row" style="flex-wrap:wrap"><input id="an" placeholder="Brand name" size="18"><input id="au" placeholder="Brand page link" size="52"><input id="ap" placeholder="Total pages" size="10">
<button class="btn" onclick="add()">Add brand</button><button class="btn o" onclick="location='/export?kind=all'">Export all CSV</button></div>
<div class="scroll"><table id="bt"></table></div></div>
<div class="card" style="margin-top:14px"><h3>Folders <span class="mute">(remembered after restart)</span></h3>
<div class="row" style="flex-wrap:wrap"><span class="mute">Data folder (nykaa.db is stored &amp; read here)</span><input id="fd" class="grow" size="40">
<span class="mute">Exports folder (CSV files saved here)</span><input id="fe" class="grow" size="40"><button class="btn k" onclick="saveFolders()">Save folders</button></div></div>
<div class="g g3"><div class="card"><h3>Requests per minute <span class="mute">(orange ok · black failed)</span></h3><div id="ch"></div></div>
<div class="card"><h3>Data completeness</h3><div id="cp"></div></div><div class="card"><h3>Catalog insights</h3><div id="in"></div></div></div>
<div class="g g2"><div class="card"><div class="row"><h3 class="grow">Failed products</h3><button class="btn s" onclick="retryAll()">Retry all failed</button>
<button class="btn s o" onclick="location='/export?kind=failures'">Export</button></div><div class="scroll" id="fl"></div></div>
<div class="card"><div class="row"><h3 class="grow">Activity timeline</h3><select id="ef" onchange="F=this.value;draw()"><option value="">All</option><option value="ok">Success</option><option value="warn">Warnings</option><option value="error">Errors</option></select>
<button class="btn s o" onclick="location='/export?kind=events'">Export</button></div><div class="tl" id="tl"></div></div></div></div>
<script>
let S=null,B='',F='';const $=s=>document.querySelector(s),n0=x=>Math.round(x||0).toLocaleString('en-IN'),
esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
dur=s=>Math.floor(s/60)+'m '+s%60+'s',delay=()=>$('#sp').value.split(',').map(Number);
const api=async(p,d)=>{const r=await(await fetch(p,{method:'POST',body:JSON.stringify(d||{})})).json();if(r.error)alert(r.error);load();return r};
async function load(){const r=await(await fetch('/api/state?b='+encodeURIComponent(B))).json();if(r.error){$('#st').textContent='Server error: '+r.error;return}S=r;draw()}
const dd=new Date();$('#dt').textContent=dd.getDate();$('#dl').innerHTML=dd.toLocaleDateString('en',{weekday:'short'})+',<br>'+dd.toLocaleDateString('en',{month:'long'});
const toggle=()=>S.running?api('/api/stop'):api('/api/run',{delay:delay(),urls:B?[B]:[]});
const add=async()=>{const r=await api('/api/add',{name:$('#an').value,url:$('#au').value,pages:$('#ap').value});if(!r.error)['#an','#au','#ap'].forEach(i=>$(i).value='')};
function act(t,i){const b=S.brands[i];if(t=='run')api('/api/run',{delay:delay(),urls:[b.url]});
 else if(t=='exp')location='/export?kind=brand&u='+encodeURIComponent(b.url);
 else if(confirm(t=='reset'?'Delete all scraped data for '+b.name+'?':'Remove '+b.name+' from queue? (data is kept)'))api('/api/'+t,{url:b.url})}
const retryAll=()=>api('/api/run',{delay:delay(),urls:S.brands.filter(b=>b.f).map(b=>b.url)});
function bars(d){const h=130,mx=Math.max(1,...d.map(x=>x[1]+x[2]));if(!d.length)return'<span class="mute">No requests yet</span>';
 return`<svg viewBox="0 0 ${d.length*10} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">`+d.map((x,i)=>{const a=x[1]/mx*(h-6),b=x[2]/mx*(h-6);
 return`<rect x="${i*10+2}" y="${h-a-b}" width="6" height="${b}" rx="2" fill="#141414"/><rect x="${i*10+2}" y="${h-a}" width="6" height="${a}" rx="2" fill="#e8643c"/>`}).join('')+'</svg>'+
 `<div class="mute">last ${d.length} active minute(s) · ${d[0][0].slice(11)} → ${d.at(-1)[0].slice(11)}</div>`}
const hb=(l,p,t)=>`<div style="margin:9px 0"><div class="row mute"><span class="grow">${esc(l)}</span><span>${t??Math.round(p)+'%'}</span></div><div class="bar"><i style="width:${Math.min(p,100)}%"></i></div></div>`;
function draw(){const k=S.k,run=!!S.running,pct=k.n?Math.round(k.d/k.n*100):0;
 if($('#bf').options.length!=S.brands.length+1&&!B)$('#bf').innerHTML='<option value="">All brands</option>'+S.brands.map(b=>`<option value="${esc(b.url)}">${esc(b.name)}</option>`).join('');
 $('#st').innerHTML=`<i class="dot ${run?'on':''}"></i>${run?'Running · '+esc(S.brand)+' · '+dur(S.elapsed):'Idle'}`;
 $('#go').textContent=run?'■':'▶';$('#go').className='go'+(run?' stop':'');
 const ok=k.req?Math.round(k.ok/k.req*100):0;
 $('#kpis').innerHTML=[['▣','Products found',k.n,S.brands.length+' brand(s)'],['✓','Fetched',k.d,pct+'% complete'],['!','Failed',k.f,k.f?'needs retry':'all clean','bad'],
 ['◷','Pending',Math.max(k.n-k.d,0),k.eta?'~'+k.eta+' min left':'—'],['❖','Variant rows',k.v,'shades & sizes'],['⇄','Requests',k.req,ok+'% ok · '+n0(k.ms)+'ms · '+k.blocked+' blocked']]
 .map(x=>`<div class="card kpi ${x[4]||''}"><div class="ic">${x[0]}</div><b>${n0(x[2])}</b>${x[1]}<br><small>${x[3]}</small></div>`).join('');
 $('#gauge').innerHTML=`<svg viewBox="0 0 140 140"><circle cx="70" cy="70" r="54" fill="none" stroke="#333" stroke-width="9"/><circle cx="70" cy="70" r="54" fill="none" stroke="#e8643c" stroke-width="9" stroke-linecap="round" stroke-dasharray="${pct*3.393} 340" transform="rotate(-90 70 70)"/><text x="70" y="72" text-anchor="middle" fill="#fff" font-size="26">${pct}%</text><text x="70" y="92" text-anchor="middle" fill="#999" font-size="11">Fetch rate</text></svg>`;
 $('#bt').innerHTML='<tr><th>Brand</th><th>Pages</th><th>Products</th><th style="width:20%">Fetched</th><th>Failed</th><th>Variants</th><th>Status</th><th></th></tr>'+S.brands.map((b,i)=>{
  const st=S.running==b.url?'Running':b.done&&b.n&&b.d==b.n?'Done':b.f&&!S.running?'Retry':b.n||b.last?'Partial':'Pending';
  return`<tr><td><b>${esc(b.name)}</b></td><td>${b.last}/${b.pages}</td><td>${n0(b.n)}</td><td>${hb('',b.n?b.d/b.n*100:0,b.d+'/'+b.n)}</td><td>${b.f}</td><td>${n0(b.v)}</td><td><span class="tag ${st}">${st}</span></td>
  <td style="white-space:nowrap"><button class="btn s" onclick="act('run',${i})">Run</button> <button class="btn s o" onclick="act('exp',${i})">CSV</button> <button class="btn s o" onclick="act('reset',${i})">Reset</button> <button class="btn s k" onclick="act('remove',${i})">✕</button></td></tr>`}).join('')||'<tr><td class="mute">Add a brand above to begin.</td></tr>';
 $('#ch').innerHTML=bars(S.series);$('#cp').innerHTML=S.comp.map(c=>hb(c[0].replace(/_/g,' '),c[1])).join('');
 const s=S.stats,o=['<500','500-1k','1k-2.5k','2.5k-5k','5k+'],hm=Object.fromEntries(S.hist),mx=Math.max(1,...S.hist.map(x=>x[1]));
 $('#in').innerHTML=`<div class="row" style="flex-wrap:wrap">${[['Avg price','₹'+n0(s.avg)],['Range','₹'+n0(s.lo)+'–'+n0(s.hi)],['Avg discount',(s.disc||0).toFixed(1)+'%'],['In stock',Math.round((s.stock||0)*100)+'%'],['Avg rating',(s.rating||0).toFixed(2)]].map(x=>`<span class="pill" style="padding:5px 12px"><span class="mute">${x[0]}</span> <b>${x[1]}</b></span>`).join('')}</div>
 <div class="mute" style="margin-top:10px">Price bands (variants)</div>${o.map(x=>hb(x,(hm[x]||0)/mx*100,n0(hm[x])) ).join('')}<div class="mute">Top categories</div>${S.cats.map(c=>hb(c[0],c[1]/Math.max(1,S.cats[0][1])*100,c[1])).join('')}`;
 $('#fl').innerHTML=S.fails.length?'<table><tr><th>Product</th><th>Reason</th><th>Tries</th><th>Last</th></tr>'+S.fails.map(f=>`<tr><td><a href="${esc(f[1])}" target="_blank">${f[0]}</a></td><td>${esc(f[2])}</td><td>${f[4]}</td><td class="mute">${f[3].slice(5,16)}</td></tr>`).join('')+'</table>':'<span class="mute">No failed products 🎉</span>';
 $('#tl').innerHTML=S.events.filter(e=>!F||e[2]==F).map(e=>`<div class="ev ${e[2]}"><i></i><time>${e[0].slice(5,19)}</time>${e[1]?'<b>'+esc(e[1])+'</b>':''}<span>${esc(e[3])}</span></div>`).join('')||'<span class="mute">No activity yet</span>'}
async function loadFolders(){const f=await(await fetch('/api/folders')).json();$('#fd').value=f.data;$('#fe').value=f.exports}
async function saveFolders(create){const r=await(await fetch('/api/folders',{method:'POST',body:JSON.stringify({data:$('#fd').value,exports:$('#fe').value,create:!!create})})).json();
 if(r.missing){if(confirm('This folder does not exist: '+r.missing.join(', ')+' - Create it?'))return saveFolders(1);return}
 if(r.error)return alert(r.error);alert('Folders saved. '+(r.note||''));loadFolders();load()}
loadFolders();load();setInterval(load,2000);
</script></body></html>"""


# Solist Hub shared look: added on top of this page's own style when ../hub/solist-theme.html exists
try:
    from pathlib import Path as _P
    _T = _P(__file__).resolve().parent.parent / "hub" / "solist-theme.html"
    if _T.exists():
        PAGE = PAGE.replace("</style>", "</style>" + _T.read_text(encoding="utf-8"), 1)
except OSError:
    pass

if __name__ == "__main__":
    init()
    sys.stdout = Out()
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    print(f"Dashboard running at http://localhost:{PORT}  (Ctrl+C to quit)", file=sys.__stdout__)
    threading.Timer(1, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        stop.set()