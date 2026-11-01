import csv, html, json, os, random, re, sqlite3, sys, time
from collections import deque
from urllib.parse import urljoin
from scrapling.fetchers import FetcherSession

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = os.path.join(HERE, "folders.json")  # remembers the folders chosen in the dashboard
SUFFIX = "" if os.name == "nt" else "_linux"  # Windows and Ubuntu each keep their own folders in folders.json


def read_cfg():
    try:
        return json.load(open(CFG, encoding="utf-8"))
    except Exception:
        return {}


def folders():
    """{'data': folder holding nykaa.db, 'exports': folder for CSV files}. A path saved on the other OS is ignored."""
    f = {"data": HERE, "exports": os.path.join(HERE, "exports")}
    cfg = read_cfg()
    f.update({k: cfg[k + SUFFIX] for k in list(f) if cfg.get(k + SUFFIX) and os.path.isabs(cfg[k + SUFFIX])})
    return f


def save_folders(new):
    """Save this OS's folders, keeping the other OS's ones."""
    cfg = read_cfg()
    cfg.update({k + SUFFIX: v for k, v in new.items()})
    json.dump(cfg, open(CFG, "w", encoding="utf-8"), indent=1)


DB = os.path.join(folders()["data"], "nykaa.db")
EXPORTS = folders()["exports"]
BASE = "https://www.nykaa.com"
DELAY = (1.0, 2.0)
KEEP_SIZE_IF_SINGLE = False  # True = also fill `size` for products that have no variants

COLS = ["product_id", "url", "brand", "product_name", "variant_name", "variant_type",
        "shade_name", "shade_hex", "shade_swatch_image", "size", "sku",
        "mrp", "offer_price", "discount", "in_stock", "rating", "rating_count", "review_count",
        "cat_l1", "cat_l2", "cat_l3", "description", "ingredients", "how_to_use",
        "manufacturer", "packer", "importer", "origin_country",
        "gallery_images", "description_images", "variant_count"]

SIZE_RX = r"^(size|packSize|pack_size|quantity|netQuantity|netContent|weight|volume)$"
UNIT_RX = re.compile(r"\b\d+(?:\.\d+)?\s?(?:ml|g|gm|kg|l|oz|mg)\b", re.I)
IMG_RX = re.compile(r'https?://[^\s"\'<>)\\]+?\.(?:jpe?g|png|webp|avif|gif)(?:\?[^\s"\'<>)\\]*)?', re.I)
SRC_RX = re.compile(r'src=["\']((?:https?:)?//[^"\']+)["\']', re.I)
CSS_RULE_RX = re.compile(r"(?:[.#@][\w\-]+[^{}\n]*)\{[^{}]*\}")
DESC_KEY = re.compile(r"description|ingredient|how.?to.?use|usage|direction", re.I)
BAD_IMG = re.compile(r"badge|authentic|sprite|placeholder", re.I)
SWATCH_KEY = re.compile(r"swatch|shade.?(img|image|url|thumb)|colou?r.?(img|image|url|thumb)|variant.?(img|image)|thumb", re.I)
HEX_KEY = re.compile(r"hex|colou?r.?(code|value)|swatch.?colou?r", re.I)
HEX_VAL = re.compile(r"^#?[0-9a-fA-F]{6}$")
URL_VAL = re.compile(r"^(https?:)?//")


def init_db():
    con = sqlite3.connect(DB)
    con.executescript(f"""
    CREATE TABLE IF NOT EXISTS listing(
        product_id TEXT PRIMARY KEY, brand_url TEXT, brand TEXT, name TEXT,
        mrp REAL, price REAL, in_stock INTEGER, url TEXT, raw TEXT);
    CREATE TABLE IF NOT EXISTS brand_progress(
        brand_url TEXT PRIMARY KEY, last_page INTEGER, done INTEGER);
    CREATE TABLE IF NOT EXISTS product_done(product_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS variants({", ".join(COLS)}, PRIMARY KEY(product_id, sku));
    """)
    migrate_variants(con)
    return con


def migrate_variants(con):
    """Upgrade an older variants table to the current COLS layout, keeping every row."""
    have = [r[1] for r in con.execute("PRAGMA table_info(variants)")]
    if have and have != COLS:
        print(f"  upgrading variants table: {len(have)} -> {len(COLS)} columns")
        con.execute("ALTER TABLE variants RENAME TO variants_old")
        con.execute(f"CREATE TABLE variants({', '.join(COLS)}, PRIMARY KEY(product_id, sku))")
        sel = ", ".join(c if c in have else ("image_urls" if c == "gallery_images" and "image_urls" in have else "NULL")
                        for c in COLS)
        con.execute(f"INSERT INTO variants({', '.join(COLS)}) SELECT {sel} FROM variants_old")
        con.execute("DROP TABLE variants_old")
        if "shade_swatch_image" not in have:  # old rows lack shade/swatch data: re-fetch details once
            con.execute("DELETE FROM product_done")
            print("  details will be re-fetched to add shade / swatch / split-image data")
    for pid, sku, d in con.execute("SELECT product_id, sku, description FROM variants WHERE description LIKE '%{%'").fetchall():
        con.execute("UPDATE variants SET description=? WHERE product_id=? AND sku=?", (to_text(d), pid, sku))
    con.commit()


def fetch(session, url, tries=4):
    for i in range(tries):
        try:
            page = session.get(url, stealthy_headers=True)
            if page.status == 200:
                return page
            print(f"  status {page.status}: {url}")
            if page.status in (403, 429):
                time.sleep(30 * (i + 1))
        except Exception as e:
            print("  error:", e)
        time.sleep(3 * (i + 1))
    return None


def get_state(page):
    for s in page.css("script::text").getall():
        s = s.strip()
        if s.startswith("window.__PRELOADED_STATE__"):
            try:
                obj, _ = json.JSONDecoder().raw_decode(s.split("=", 1)[1].strip())
                return obj
            except Exception as e:
                print("  state parse failed:", e)
    return None


def to_text(v):
    if v is None:
        return None
    if isinstance(v, list):
        v = "; ".join(t for t in (to_text(x) for x in v) if t)
    elif isinstance(v, dict):
        v = json.dumps(v, ensure_ascii=False)
    v = re.sub(r"<(style|script)\b[^>]*>.*?</\1\s*>", "", str(v), flags=re.I | re.S)
    v = re.sub(r"<\s*br\s*/?>|</p>|</li>|</div>", "\n", v, flags=re.I)
    v = re.sub(r"<[^>]+>", "", v)
    v = html.unescape(v)
    for _ in range(4):
        v, n = CSS_RULE_RX.subn("", v)
        if not n:
            break
    v = re.sub(r"\n\s*\n+", "\n", html.unescape(v)).strip()
    return v or None


def find_key(obj, pattern, min_len=0):
    rx = re.compile(pattern, re.I)
    q = deque([obj])
    while q:
        o = q.popleft()
        if isinstance(o, dict):
            for k, v in o.items():
                if rx.search(k) and v not in (None, "", [], {}) and len(str(v)) >= min_len:
                    return v
                if isinstance(v, (dict, list)):
                    q.append(v)
        elif isinstance(o, list):
            q.extend(o)
    return None


# ---------------- images ----------------
def collect_imgs(o, in_desc=False, g=None, d=None):
    """Split image URLs into gallery (outside description-like keys) and description."""
    g = [] if g is None else g
    d = [] if d is None else d
    if isinstance(o, dict):
        for k, v in o.items():
            collect_imgs(v, in_desc or bool(DESC_KEY.search(k)), g, d)
    elif isinstance(o, list):
        for v in o:
            collect_imgs(v, in_desc, g, d)
    elif isinstance(o, str):
        for u in IMG_RX.findall(o) + SRC_RX.findall(o):
            u = "https:" + u if u.startswith("//") else u
            if u.startswith("http"):
                (d if in_desc else g).append(u)
    return g, d


def clean_imgs(urls, product_only=False):
    """Drop badges/placeholders, and de-duplicate the same file served at several sizes."""
    seen, out = set(), []
    for u in urls:
        if BAD_IMG.search(u) or (product_only and "/catalog/product/" not in u):
            continue
        k = u.split("?")[0].rsplit("/", 1)[-1].lower()
        if k not in seen:
            seen.add(k)
            out.append(u)
    return out


# ---------------- shades / swatches ----------------
def key_urls(o, hit=False):
    """URLs stored under swatch/shade/colour/thumbnail-like keys."""
    if isinstance(o, dict):
        return [u for k, v in o.items() for u in key_urls(v, hit or bool(SWATCH_KEY.search(k)))]
    if isinstance(o, list):
        return [u for x in o for u in key_urls(x, hit)]
    if hit and isinstance(o, str) and URL_VAL.match(o.strip()):
        u = o.strip()
        return [] if BAD_IMG.search(u) else ["https:" + u if u.startswith("//") else u]
    return []


def key_hex(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if HEX_KEY.search(k) and isinstance(v, str) and HEX_VAL.match(v.strip()):
                return "#" + v.strip().lstrip("#").upper()
            r = key_hex(v)
            if r:
                return r
    elif isinstance(o, list):
        for x in o:
            r = key_hex(x)
            if r:
                return r
    return None


def swatch_index(st, pp):
    """sku -> (swatch_url, hex) from the page's variant/shade data, wherever Nykaa keeps it."""
    idx = {}

    def walk(o):
        if isinstance(o, dict):
            sku = o.get("sku") or o.get("skuId")
            if sku:
                u, h = key_urls(o), key_hex(o)
                if u or h:
                    idx.setdefault(str(sku), (u[0] if u else None, h))
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)

    walk(st.get("variants"))
    walk(pp)
    return idx


def split_variant(vraw, title):
    """-> (type, shade, size). 'size' when the variant is just a quantity, otherwise a shade."""
    src = vraw or title or ""
    hit = UNIT_RX.search(src)
    if not vraw:
        return ("size", "", hit.group(0)) if hit else ("shade", "", "")
    if hit:
        rest = re.sub(r"[\s\-–,/()]+", " ", vraw[:hit.start()] + " " + vraw[hit.end():]).strip()
        return ("size", "", hit.group(0)) if not rest else ("shade", rest, hit.group(0))
    return "shade", vraw, ""


def paths(o, rx, prefix=""):
    rxc = re.compile(rx, re.I)
    if isinstance(o, dict):
        for k, v in o.items():
            p = f"{prefix}.{k}" if prefix else k
            if rxc.search(k):
                yield p, v
            if isinstance(v, (dict, list)):
                yield from paths(v, rx, p)
    elif isinstance(o, list):
        for i, v in enumerate(o[:2]):
            yield from paths(v, rx, f"{prefix}[{i}]")


def url_paths(o, p=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from url_paths(v, f"{p}.{k}" if p else k)
    elif isinstance(o, list):
        for i, v in enumerate(o[:3]):
            yield from url_paths(v, f"{p}[{i}]")
    elif isinstance(o, str) and (URL_VAL.match(o.strip()) or HEX_VAL.match(o.strip())):
        yield p, o


def slug_of(base):
    m = re.search(r"/brands/([^/]+)/", base)
    return m.group(1) if m else "brand"


def file_name(name, fallback="brand"):
    """brand -> Windows-safe file name: 'Dot & Key' -> 'Dot-&-Key' (only characters Windows forbids are removed)"""
    n = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "", str(name or "")).strip().strip(".")
    return re.sub(r"\s+", "-", n) or fallback


def safe(name):
    return re.sub(r"[^\w\-]+", "_", str(name)).strip("_") or "brand"


# ---------------- Phase 1: listings ----------------
def parse_listing(page):
    state = get_state(page) or {}
    products = (((state.get("categoryListing") or {}).get("listingData") or {}).get("products")) or []
    hrefs = {}
    for h in page.css('a[href*="/p/"]::attr(href)').getall():
        m = re.search(r"/p/(\d+)", h)
        if m:
            hrefs.setdefault(m.group(1), urljoin(BASE, h.split("?")[0]))
    return products, hrefs


def crawl_listings(con, base, total_pages):
    row = con.execute("SELECT last_page, done FROM brand_progress WHERE brand_url=?", (base,)).fetchone()
    page_no = (row[0] + 1) if row else 1
    if row and row[1]:
        print("listings already complete for this brand")
        return
    seen = set()
    print(f"== listings: {base} (page {page_no} to {total_pages})")
    with FetcherSession(impersonate="chrome") as s:
        while page_no <= total_pages:
            page = fetch(s, f"{base}?page_no={page_no}&sort=popularity")
            if page is None:
                print("  giving up on this page; rerun the same command to resume")
                return
            products, hrefs = parse_listing(page)
            ids = {str(p.get("id")) for p in products if p.get("id")}
            if not products or ids <= seen:
                print(f"  no more products at page {page_no}")
                break
            seen |= ids
            new = 0
            for p in products:
                pid = str(p.get("id"))
                price = p.get("offerPrice") or p.get("price") or p.get("finalPrice")
                url = hrefs.get(pid) or f"{BASE}/p/{pid}"
                cur = con.execute(
                    "INSERT OR IGNORE INTO listing VALUES(?,?,?,?,?,?,?,?,?)",
                    (pid, base, p.get("brandName"), p.get("name"), p.get("mrp"), price,
                     int(bool(p.get("inStock"))), url, json.dumps(p, ensure_ascii=False)))
                new += cur.rowcount
            con.execute("INSERT OR REPLACE INTO brand_progress VALUES(?,?,0)", (base, page_no))
            con.commit()
            print(f"  page {page_no}/{total_pages}: {len(products)} items, {new} new")
            page_no += 1
            time.sleep(random.uniform(*DELAY))
    con.execute("INSERT OR REPLACE INTO brand_progress VALUES(?,?,1)", (base, page_no - 1))
    con.commit()


# ---------------- Phase 2: product details (one row per variant) ----------------
def parse_product(page, pid, url):
    st = get_state(page)
    if not st:
        return None
    pp = (st.get("productPage") or {}).get("product") or {}
    dl = (st.get("dataLayer") or {}).get("product") or {}
    if not pp:
        return None
    cat = dl.get("categoryLevel") or {}
    variants = pp.get("variants") or [pp]
    multi = len(variants) > 1
    sw_idx = swatch_index(st, pp) if multi else {}

    p_desc = to_text(pp.get("description"))
    p_ing = to_text(find_key(pp, r"ingredient", 10))
    p_how = to_text(find_key(pp, r"how.?to.?use|direction|usage", 10))
    pg, pd = collect_imgs({k: x for k, x in pp.items() if k != "variants"})

    rows = []
    for i, v in enumerate(variants):
        mlist = v.get("manufacture") or pp.get("manufacture") or []
        m = mlist[0] if mlist else {}
        vraw = v.get("variantName") or ""
        vtype = shade = size = hexv = swatch = ""
        if multi:
            vtype, shade, size = split_variant(vraw, v.get("title") or v.get("name"))
            size = size or to_text(find_key(v, SIZE_RX)) or ""
            su, sh = sw_idx.get(str(v.get("sku") or ""), (None, None))
            swatch = next(iter(key_urls(v)), None) or su or ""
            hexv = key_hex(v) or sh or ""
        elif KEEP_SIZE_IF_SINGLE:
            hit = UNIT_RX.search(f"{pp.get('name') or ''} {v.get('title') or ''}")
            size = to_text(find_key(v, SIZE_RX)) or (hit.group(0) if hit else "")
        disc = v.get("discount") if v.get("discount") is not None else pp.get("discount")
        vg, vd = collect_imgs(v)
        desc_imgs = clean_imgs(vd + pd)
        raw_gallery = [u for u in (vg or pg) if u != swatch]
        gallery = [u for u in (clean_imgs(raw_gallery, True) or clean_imgs(raw_gallery)) if u not in desc_imgs]
        rows.append((
            pid, url,
            v.get("brandName") or pp.get("brandName") or dl.get("brandName"),
            pp.get("name") or dl.get("name"),
            vraw or v.get("name"), vtype, shade, hexv, swatch, size, v.get("sku") or f"{pid}-{i}",
            v.get("mrp"), v.get("offerPrice"), disc, int(bool(v.get("inStock"))),
            dl.get("rating"), dl.get("ratingCount"), dl.get("reviewCount"),
            (cat.get("l1") or {}).get("name"), (cat.get("l2") or {}).get("name"), (cat.get("l3") or {}).get("name"),
            to_text(v.get("description")) or p_desc,
            to_text(find_key(v, r"ingredient", 10)) or p_ing,
            to_text(find_key(v, r"how.?to.?use|direction|usage", 10)) or p_how,
            m.get("manufacturerName"), m.get("packerName"), m.get("importerName"), m.get("originOfCountryName"),
            " | ".join(gallery), " | ".join(desc_imgs), len(variants),
        ))
    return rows


def crawl_details(con, base):
    todo = con.execute(
        "SELECT product_id, url FROM listing WHERE brand_url=? "
        "AND product_id NOT IN (SELECT product_id FROM product_done)", (base,)).fetchall()
    print(f"== details: {len(todo)} products to fetch")
    ph = ",".join("?" * len(COLS))
    with FetcherSession(impersonate="chrome") as s:
        for i, (pid, url) in enumerate(todo, 1):
            page = fetch(s, url)
            rows = parse_product(page, pid, url) if page else None
            if rows:
                con.executemany(f"INSERT OR REPLACE INTO variants VALUES({ph})", rows)
                con.execute("INSERT OR REPLACE INTO product_done VALUES(?)", (pid,))
                con.commit()
                print(f"[{i}/{len(todo)}] {rows[0][3]} -> {len(rows)} variants")
            else:
                print(f"[{i}/{len(todo)}] FAILED {url}")
            time.sleep(random.uniform(*DELAY))


# ---------------- Export: images and how-to steps split into their own columns ----------------
def split_list(s):
    return [x for x in (s or "").split(" | ") if x]


def split_steps(s):
    steps = [re.sub(r"^\s*(?:step\s*\d+\s*[:.\-)]?|\d{1,2}\s*[.):]|[-•*▪●])\s*", "", ln, flags=re.I).strip()
             for ln in (s or "").split("\n")]
    steps = [x for x in steps if x]
    if len(steps) == 1:  # "1. Do this 2. Do that" all on one line
        parts = [p.strip() for p in re.split(r"(?:^|\s)\d{1,2}[.)]\s+", steps[0]) if p.strip()]
        if len(parts) > 1:
            steps = parts
    return steps


def export_table(rows):
    """rows in COLS order -> (header, rows) with image_1..N, description_image_1..N, how_to_use_1..N columns."""
    ix = {c: i for i, c in enumerate(COLS)}
    g = [split_list(r[ix["gallery_images"]]) for r in rows]
    d = [split_list(r[ix["description_images"]]) for r in rows]
    h = [split_steps(r[ix["how_to_use"]]) for r in rows]
    ng, nd, nh = (max([len(x) for x in L] or [0]) for L in (g, d, h))
    hdr = []
    for c in COLS:
        if c == "how_to_use":
            hdr += [f"how_to_use_{i}" for i in range(1, nh + 1)]
        elif c == "gallery_images":
            hdr += [f"image_{i}" for i in range(1, ng + 1)]
        elif c == "description_images":
            hdr += [f"description_image_{i}" for i in range(1, nd + 1)]
        else:
            hdr.append(c)
    out = []
    for r, gi, di, hi in zip(rows, g, d, h):
        o = []
        for c in COLS:
            if c == "how_to_use":
                o += hi + [""] * (nh - len(hi))
            elif c == "gallery_images":
                o += gi + [""] * (ng - len(gi))
            elif c == "description_images":
                o += di + [""] * (nd - len(di))
            else:
                o.append(r[ix[c]])
        out.append(o)
    return hdr, out


def export(con, base):
    row = con.execute("SELECT brand FROM listing WHERE brand_url=? AND brand IS NOT NULL LIMIT 1", (base,)).fetchone()
    os.makedirs(EXPORTS, exist_ok=True)
    fn = os.path.join(EXPORTS, f"{file_name(row[0] if row else slug_of(base))}.csv")
    rows = con.execute("SELECT v.* FROM variants v JOIN listing l ON v.product_id = l.product_id WHERE l.brand_url=?",
                       (base,)).fetchall()
    hdr, out = export_table(rows)
    with open(fn, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(hdr)
        w.writerows(out)
    print(f"wrote {fn} ({len(out)} variant rows)")


def run_brand(url, pages):
    base = url.split("?")[0]
    con = init_db()
    crawl_listings(con, base, pages)
    crawl_details(con, base)
    export(con, base)


def one(url):
    m = re.search(r"/p/(\d+)", url)
    pid = m.group(1) if m else "0"
    with FetcherSession(impersonate="chrome") as s:
        page = fetch(s, url)
    if not page:
        return print("fetch failed")
    st = get_state(page)
    json.dump(st, open("product_state.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    rows = parse_product(page, pid, url) or []
    print("total variants:", len(rows))
    for r in rows[:2]:
        for c, val in zip(COLS, r):
            print(f"{c:18} {str(val)[:110]!r}")
        print("-" * 40)
    pp = (st.get("productPage") or {}).get("product") or {}
    vs = pp.get("variants") or []
    if vs:
        print("\nurl / hex fields inside variants[0] (use these to check shade swatches):")
        for p, v in list(url_paths(vs[0]))[:25]:
            print(f"  variants[0].{p} = {str(v)[:90]!r}")
    print("\nurl / hex fields in top-level state['variants']:")
    for p, v in list(url_paths(st.get("variants")))[:15]:
        print(f"  variants.{p} = {str(v)[:90]!r}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) >= 2 and a[0] == "one":
        one(a[1])
    elif len(a) >= 3 and a[0] == "brand":
        run_brand(a[1], int(a[2]))
    else:
        print('usage:\n  python crawler.py one "<product_url>"\n'
              '  python crawler.py brand "<brand_page_url>" <total_pages>')