"""Maps Scraper self-test against a fake Google Maps on this computer (no internet needed).

    .venv-linux/bin/python selftest_maps.py      (Windows: .venv\\Scripts\\python selftest_maps.py)

Checks that the results list is scrolled to its end (124 places, more than Google's first 20), that a place
page is read correctly, that a whole job runs with several tabs, and that empty fields raise the warning.
The root selftest.py runs this too. Prints one line per check; exit code 1 when any check fails.
"""
import json
import os
import re
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
TOTAL = 124

LIST = """<!doctype html><html><body style="margin:0;height:100vh;overflow:hidden">
<div style="width:400px;height:100vh;display:flex;flex-direction:column"><div style="height:60px">Results</div>
<div id="box" style="flex:1;overflow-y:auto"><div role="feed" aria-label="Results"></div></div></div>
<script>
const TOTAL=%d,BASE=%s;let n=0,busy=false;const feed=document.querySelector('[role=feed]'),box=document.getElementById('box');
function add(k){for(let i=0;i<k&&n<TOTAL;i++,n++){const d=document.createElement('div');d.style.height='110px';
 d.innerHTML=`<a href="${BASE}/maps/place/Shop+${n}/data=!4m7!3m6!1s0x3be7c${n.toString(16)}:0x${(4096+n).toString(16)}!8m2!3d19.07${n}!4d72.87${n}">Shop ${n}</a>`;feed.appendChild(d)}
 if(n>=TOTAL){const e=document.createElement('div');e.innerHTML='<span class="HlvSq">You\\'ve reached the end of the list.</span>';feed.appendChild(e)}}
add(20);  // like Google: 20 at first, 20 more each time the list's own scroll box reaches its bottom
box.addEventListener('scroll',()=>{if(busy||n>=TOTAL)return;if(box.scrollTop+box.clientHeight>=box.scrollHeight-150){busy=true;setTimeout(()=>{add(20);busy=false},900)}});
</script></body></html>"""


def place_html(n, phone=True):
    tel = f'<button data-item-id="phone:tel:98{n:08d}" aria-label="Phone: 98{n:08d}">x</button>' if phone else ""
    return (f'<html><body><h1 class="DUwDvf">Shop {n}</h1><button class="DkEaL">Sweet shop</button>'
            f'<div class="F7nice"><span aria-hidden="true">4.{n % 10}</span><span aria-label="{n}0 reviews">({n}0)</span></div>'
            f'<button data-item-id="address" aria-label="Address: {n} Main Road, Mumbai">x</button>{tel}'
            f'<a data-item-id="authority" href="https://shop{n}.example">site</a></body></html>')


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        nophone = self.path.startswith("/np/")              # /np/... = a Google that "changed its page": no phone
        base = f"http://127.0.0.1:{self.server.server_port}" + ("/np" if nophone else "")
        m = re.search(r"/maps/place/Shop\+(\d+)", self.path)
        body = place_html(int(m.group(1)), not nophone) if m else LIST % (TOTAL, json.dumps(base))
        b = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append(ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{'  (' + detail + ')' if detail else ''}", flush=True)


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_port}"
    print("Maps Scraper self-test (fake Google Maps, no internet)")

    from scrapling.fetchers import DynamicSession
    import gmaps_scraper as g

    with DynamicSession(headless=True) as s:
        t = time.time()
        page = s.fetch(f"{base}/maps/search/x", page_action=g.make_scroll_action(500))
        links = list(dict.fromkeys(page.css(f'{g.FEED} a[href*="/maps/place/"]::attr(href)').getall()))
        check("scrolls the whole results list", len(links) == TOTAL, f"{len(links)} of {TOTAL} in {time.time() - t:.0f} s")
        d = g.parse_place(s.fetch(f"{base}/maps/place/Shop+7/data=!3d19.077!4d72.877"), links[7] if len(links) > 7 else "")
        check("reads a place page", d["name"] == "Shop 7" and d["phone"] == "9800000007" and d["rating"] == "4.7"
              and d["reviews_count"] == 70 and d["address"] == "7 Main Road, Mumbai" and bool(d["website"]),
              f"{d['name']}, {d['phone']}, {d['rating']}, {d['reviews_count']} reviews")

    # A whole job, the way the dashboard runs it, in a scratch folder so the real gmaps.db is untouched.
    os.chdir(tempfile.mkdtemp(prefix="maps-selftest-"))
    import gmaps_dashboard as dash
    dash.init()

    def job(prefix, n):
        dash.MAPS = base + prefix
        jid = dash.insert_job(dict(pincode="19.07,72.87", country="India", radius=2, step=1.5, zoom=15, max_per_cell=n,
                                   reviews=0, stealth=False, headless=True, proxy=None, delay="fast", patience=5,
                                   queries=["sweet shop"], mode="quick"))
        t = time.time()
        dash.run_job(jid)
        with dash.db() as c:
            j = c.execute("SELECT status, note FROM jobs WHERE id=?", (jid,)).fetchone()
            n_places = c.execute("SELECT COUNT(*) FROM places WHERE job_id=?", (jid,)).fetchone()[0]
            phones = c.execute("SELECT COUNT(*) FROM places WHERE job_id=? AND COALESCE(phone,'')<>''", (jid,)).fetchone()[0]
        return j["status"], j["note"], n_places, phones, time.time() - t

    st, note, n, ph, secs = job("", 30)
    check("runs a whole job with several tabs", st == "finished" and n == 30 and ph == 30 and not note,
          f"{st}, {n} places, {ph} with phone, {secs:.0f} s")
    st, note, n, ph, secs = job("/np", 12)
    check("warns when Google's page changes", st == "finished" and n == 12 and bool(note) and "phone" in note,
          (note or "no warning")[:90])
    srv.shutdown()
    print(f"{sum(RESULTS)} of {len(RESULTS)} passed")
    return 0 if all(RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
