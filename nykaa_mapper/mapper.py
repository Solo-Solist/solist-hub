#!/usr/bin/env python3
"""
Nykaa -> redSales import mapper
===============================
Reads the products your scraper saved (nykaa_products.csv, or a SQLite table in nykaa.db)
and writes a file in the redSales IMPORT TEMPLATE column order, with
    category / subCategory / itemName   from the controlled taxonomy (taxonomy.csv)
    hsnCode / gstRate                   looked up from the item name
    size / title / images / prices ...  cleaned the way your existing export is filled

Usage (PowerShell, from the project folder):
    python mapper.py nykaa_products.csv                 -> out/import_ready.csv + out/review.csv
    python mapper.py --db nykaa.db --table products
    python mapper.py nykaa_products.csv --inspect       -> shows which columns it detected
    python mapper.py nykaa_products.csv --col title=product_name --col mrp=list_price

Everything that could not be decided confidently goes to out/review.csv instead of being guessed.
"""
import argparse
import csv
import html
import json
import re
import sqlite3
import sys
import unicodedata
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from rules import (BRAND_HINTS, KIT_LEAF, LEAF_MAP, RULES, KIT_WORDS, NO_KIT, KIT_BY_ITEM, PRO_BRANDS, BABY_BRANDS,  # noqa: E402
                   BABY_WORDS, PRO_WORDS, BABY_REMAP)

TEMPLATE_COLUMNS = (['barcodeId', 'Image', 'productCode', 'productTitle', 'hsnCode', 'productDescription', 'brand',
                     'category', 'subCategory', 'itemName', 'series', 'shade', 'size', 'ingredients', 'manufacturer',
                     'marketedBy', 'countryOfOrigin', 'expiryDate', 'mrpPrice', 'gstRate', 'sellingPrice',
                     'parlourSellingPrice', 'standardPack', 'standardPackPrice', 'masterPack', 'MasterPackPrice',
                     'availableQty'] + [f'image{i}' for i in range(1, 15)])

# ----------------------------------------------------------------------------------------
# 1. Column auto-detection (your scraper's header names are matched loosely)
# ----------------------------------------------------------------------------------------
SYNONYMS = {
    'title': ['title', 'name', 'productname', 'producttitle', 'product', 'itemname', 'pname'],
    'brand': ['brand', 'brandname', 'manufacturerbrand'],
    'mrp': ['mrp', 'mrpprice', 'listprice', 'originalprice', 'regularprice', 'maxprice', 'priceold', 'mrpvalue'],
    'price': ['price', 'sellingprice', 'offerprice', 'saleprice', 'discountedprice', 'finalprice', 'currentprice', 'nykaaprice'],
    'size': ['size', 'packsize', 'quantity', 'netquantity', 'netcontent', 'unit', 'volume', 'weight', 'netwt', 'variant'],
    'shade': ['shade', 'shadename', 'color', 'colour', 'variantname', 'tone', 'shadenumber'],
    'description': ['description', 'productdescription', 'desc', 'about', 'details', 'longdescription'],
    'ingredients': ['ingredients', 'ingredient', 'keyingredients'],
    'manufacturer': ['manufacturer', 'manufacturedby', 'manufacturername', 'mfg'],
    'marketed_by': ['marketedby', 'marketer', 'marketedbyaddress', 'marketername'],
    'country': ['countryoforigin', 'origincountry', 'country', 'origin'],
    'expiry': ['expirydate', 'expiry', 'expdate', 'bestbefore', 'shelflife'],
    'barcode': ['barcode', 'barcodeid', 'ean', 'gtin', 'upc', 'ean13'],
    'category': ['category', 'categories', 'breadcrumb', 'breadcrumbs', 'categorypath', 'categorytree', 'producttype', 'type', 'subcategory'],
    'images': ['galleryimages', 'productimages', 'imagegallery', 'images', 'imageurls', 'imagelist', 'gallery', 'photos', 'imageurl', 'image', 'mainimage', 'img'],
    'packer': ['packer', 'packedby', 'packername'],
    'importer': ['importer', 'importedby', 'importername'],
    'sku': ['sku', 'skuid', 'skucode'],
    'product_id': ['productid', 'pid', 'id'],
    'stock': ['stock', 'instock', 'availability', 'available', 'stockstatus', 'outofstock', 'inventory'],
    'url': ['url', 'link', 'producturl', 'pageurl'],
}
MULTI_FIELDS = {'category', 'images'}          # these may be several columns


def _key(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())


def detect_columns(columns, overrides=None, df=None):
    """Return {field: [source columns]} using the header names (and, for images, the CELL CONTENT)."""
    columns = list(columns)
    norm = {c: _key(c) for c in columns}
    found = OrderedDict()
    for field, syns in SYNONYMS.items():
        hits = []
        for syn in syns:                       # earlier synonym = stronger
            for c, n in norm.items():
                if n == syn and c not in hits:
                    hits.append(c)
        if hits:
            found[field] = hits if field in MULTI_FIELDS else hits[:1]
    # Nykaa breadcrumb levels  cat_l1 / cat_l2 / cat_l3  (most specific level first)
    lv = sorted((c for c in columns if re.match(r'^(cat|category)[_ ]?(l|level)?[_ ]?[1-9]$', str(c).strip(), re.I)), key=lambda c: str(c)[-1], reverse=True)
    if lv:
        found['category'] = lv + [c for c in found.get('category', []) if c not in lv]
    # numbered image columns: image1, image_2, images[0], img3 ...
    numbered = sorted(((int(m.group(2)), c) for c in columns
                       if (m := re.match(r'^(image|images|img|photo)[\s_\[\.\-]*(\d+)\]?$', str(c).strip(), re.I))),
                      key=lambda t: t[0])
    if numbered:
        found['image_cols'] = [c for _, c in numbered]
    NOT_PRODUCT_IMAGES = re.compile(r'swatch|description|desc|thumb|icon|logo|banner|aplus|a\+|video|brand|shade', re.I)
    if 'images' in found:                                # never treat swatch / description / banner columns as the product gallery
        found['images'] = [c for c in found['images'] if not NOT_PRODUCT_IMAGES.search(str(c))] or found['images']
    if df is not None and not found.get('images') and not found.get('image_cols'):   # fallback: look at cell CONTENT
        taken = {c for f, cs in found.items() if f not in ('images', 'image_cols') for c in cs}
        extra = []
        for c in columns:
            if c in taken or NOT_PRODUCT_IMAGES.search(str(c)):
                continue
            vals = [v for v in df[c].head(300).astype(str) if v.strip()]
            if vals and sum(1 for v in vals if extract_image_urls(v)) / len(vals) >= 0.3:
                extra.append(c)
        if extra:
            found['images'] = found.get('images', []) + extra
            found['_content_image_cols'] = extra
    for ov in overrides or []:
        field, _, col = ov.partition('=')
        if col not in columns:
            sys.exit(f'--col {ov}: column "{col}" not found. Columns are: {list(columns)}')
        found[field.strip()] = [col]
    return found


# ----------------------------------------------------------------------------------------
# 2. Small cleaners
# ----------------------------------------------------------------------------------------
def s(v):
    """any cell -> clean str (also repairs UTF-8 text that was read as Windows-1252, e.g. 'â€“')"""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ''
    t = str(v)
    if 'â€' in t or 'Ã' in t:
        try:
            t = t.encode('cp1252').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return re.sub(r'\s+', ' ', t).strip()


def to_money(v):
    t = re.sub(r'[^\d.]', '', s(v).replace(',', ''))
    try:
        x = float(t) if t else None
    except ValueError:
        x = None
    return x if x and x > 0 else None


def strip_html(v):
    v = html.unescape(str(v or ''))
    v = re.sub(r'<\s*br\s*/?>|</p>|</li>', ' ', v, flags=re.I)
    v = re.sub(r'<[^>]+>', ' ', v)
    return re.sub(r'\s+', ' ', v).strip()


def clean_brand(b):
    b = s(b)
    if not b:
        return ''
    if ' ' not in b and '-' in b:
        b = b.replace('-', ' ')
    if b.islower() or b.isupper():
        b = b.title()
    return b


COUNTRY_FIX = {'india': 'India', 'p.r.c': 'China', 'prc': 'China', 'p.r.c.': 'China', 'china': 'China', 'usa': 'USA', 'u.s.a': 'USA',
               'united states': 'USA', 'united states of america': 'USA', 'uk': 'UK', 'u.k': 'UK', 'united kingdom': 'UK',
               'south korea': 'South Korea', 'korea': 'South Korea', 'republic of korea': 'South Korea', 'uae': 'UAE'}


def clean_country(c):
    c = s(c)
    return COUNTRY_FIX.get(c.lower(), c.title() if c.islower() else c)


UNIT_MAP = {'ml': 'ml', 'mls': 'ml', 'l': 'l', 'ltr': 'l', 'litre': 'l', 'liter': 'l', 'litres': 'l', 'liters': 'l',
            'g': 'g', 'gm': 'g', 'gms': 'g', 'gram': 'g', 'grams': 'g', 'gr': 'g', 'kg': 'kg', 'kgs': 'kg', 'oz': 'oz',
            'fl oz': 'oz', 'floz': 'oz', 'pc': 'pc', 'pcs': 'pc', 'piece': 'pc', 'pieces': 'pc', 'pack': 'pc',
            'tablet': 'Tablets', 'tablets': 'Tablets', 'capsule': 'Capsules', 'capsules': 'Capsules', 'wipes': 'Wipes',
            'sheet': 'Sheets', 'sheets': 'Sheets', 'patch': 'Patches', 'patches': 'Patches', 'pair': 'Pairs', 'pairs': 'Pairs',
            'n': 'N', 'nos': 'N', 'no': 'N', 'units': 'N', 'unit': 'N'}
_UNIT_RE = r'(fl\.?\s?oz|ml|mls|ltrs?|litres?|liters?|kgs?|gms?|grams?|gr|oz|pcs?|pieces?|tablets?|capsules?|wipes|sheets?|patch(?:es)?|pairs?|units?|nos?|l|g)'
_SIZE_RE = re.compile(r'(\d+(?:\.\d+)?)\s*' + _UNIT_RE + r'\b', re.I)


def _fmt_size(num, unit):
    u = UNIT_MAP.get(unit.lower().replace('.', '').replace(' ', '') if unit.lower().startswith('fl') else unit.lower().replace('.', ''), unit)
    n = num.rstrip('0').rstrip('.') if '.' in num else num
    return f'{n}{u}' if u in ('ml', 'l', 'g', 'kg', 'oz') else f'{n} {u}'


def clean_size(raw, title=''):
    """Your export mostly writes sizes as '100ml', '50g', '1 pc'; combos as '60ml + 100g'. 'NA' when unknown."""
    raw, title = s(raw), s(title)
    parts = _SIZE_RE.findall(raw)
    if not parts:
        parts = _SIZE_RE.findall(title)[-1:]       # from the title keep only the LAST size mentioned
    if parts:
        out = []
        for num, unit in parts[:3]:
            f = _fmt_size(num, unit)
            if f not in out:
                out.append(f)
        return ' + '.join(out)
    if re.fullmatch(r'\d+', raw):
        return f'{raw} pc'
    return 'NA'


def clean_title(title, shade, size):
    t = s(title)
    t = re.sub(r'\s*\(\s*\d+(?:\.\d+)?\s*[A-Za-z. ]{1,8}\)\s*$', '', t).strip()   # drop a trailing "(50ml)"
    sh = s(shade)
    if sh and sh.lower() not in t.lower():
        t = f'{t} - {sh}'
    if size and size != 'NA' and size.lower().replace(' ', '') not in t.lower().replace(' ', ''):
        t = f'{t}({size})'
    return t


_URL_RE = re.compile(r'(?:https?:)?//[^\s"\'<>\\\]\[,|;()]+', re.I)
_IMG_MARKERS = ('/media/catalog/', 'images-static', '/images/', '/image/', 'cloudinary', 'imagekit', 'cdn.shopify', 'images.', 'img.', 'media.')


def looks_like_image(u):
    path = u.lower().split('?')[0]
    return path.endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif')) or any(k in path for k in _IMG_MARKERS)


def extract_image_urls(v):
    """Pull every image URL out of ANY cell format: JSON list/dict, python list text, '|' ';' ',' or newline separated."""
    t = s(v).replace('\\/', '/').replace('\\u002F', '/')
    out = []
    for u in _URL_RE.findall(t):
        u = u.rstrip('.\'"')
        if u.startswith('//'):
            u = 'https:' + u
        if looks_like_image(u) and u not in out:
            out.append(u)
    return out


def ean_from_image(urls):
    """Nykaa file names look like  /a/b/ab12cd3 8901234567890_1.jpg  - the 13 digits are usually the EAN."""
    for u in urls:
        mt = re.search(r'/[0-9a-f]{7}(?:[A-Za-z]{2,8}_)?(\d{13})_\w+\.\w+(?:\?.*)?$', u)
        if mt:
            return mt.group(1)
    return ''


# ----- "Key: value" blobs ( Manufacturer: X, Marketed by: Y, Country of Origin: India ) and JSON specs -----
_LABELS = (r'manufactur\w*(?:\s*(?:/|&|and)\s*marketer)?(?:\s*(?:by|name|details|address))?|mfg\.?(?:\s*by)?|marketed(?:\s*(?:by|name|address))?|marketer(?:\s*(?:name|details|address))?|'
           r'distributed\s*by|imported\s*(?:and|&)?\s*(?:marketed\s*)?by|packed\s*(?:and|&)?\s*(?:marketed\s*)?by|country\s*of\s*origin|origin\s*country|made\s*in|'
           r'(?:key\s*)?ingredients?|expiry(?:\s*date)?|expiration(?:\s*date)?|best\s*before|shelf\s*life|net\s*(?:quantity|content|weight|volume)|'
           r'ean(?:\s*code)?|barcode|gtin|series|product\s*line|shade(?:\s*name)?|colou?r')
_LABEL_RE = re.compile(r'(?<![A-Za-z])(' + _LABELS + r')\s*[:=\-\u2013]\s*', re.I)


def _label_fields(label):
    l = label.lower()
    f = []
    if 'market' in l or 'distribut' in l or 'import' in l or 'packed' in l:
        f.append('marketed_by')
    if 'manufact' in l or l.startswith('mfg'):
        f.append('manufacturer')
    if f:
        return f
    if 'origin' in l or l.startswith('made in'):
        return ['country']
    if 'ingredient' in l:
        return ['ingredients']
    if 'expir' in l or 'best before' in l or 'shelf' in l:
        return ['expiry']
    if 'net' in l:
        return ['size']
    if l.startswith(('ean', 'barcode', 'gtin')):
        return ['barcode']
    if 'series' in l or 'product line' in l:
        return ['series']
    if 'shade' in l or 'colo' in l:
        return ['shade']
    return []


def parse_kv(text):
    """-> {field: value} found inside free text or a JSON blob."""
    found = {}
    t = s(text)
    if not t:
        return found
    pairs = []
    if t[:1] in '[{':
        try:
            obj = json.loads(t)
            items = obj.items() if isinstance(obj, dict) else obj
            for it in items:
                if isinstance(it, dict):
                    k = next((it[x] for x in ('key', 'name', 'label', 'title', 'attribute') if x in it), None)
                    v = next((it[x] for x in ('value', 'val', 'text', 'values') if x in it), None)
                    if k is not None and v is not None:
                        pairs.append((str(k), v if isinstance(v, str) else ', '.join(map(str, v)) if isinstance(v, list) else str(v)))
                elif isinstance(it, (tuple, list)) and len(it) == 2:
                    pairs.append((str(it[0]), str(it[1])))
        except Exception:
            pass
    for k, v in pairs:
        for f in _label_fields(k):
            found.setdefault(f, s(v))
    hits = list(_LABEL_RE.finditer(t))
    for i, h in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(t)
        val = t[h.end():end].strip(' ,;|-\u2013\n')
        for f in _label_fields(h.group(1)):
            if val and f not in found:
                found[f] = val[:1500]
    return found


_BOILER = re.compile(r'(explore the entire range|shop more .{0,60} products here|browse through the complete world|available on nykaa\b|visit nykaa|buy .{0,60} online at nykaa)', re.I)


def clean_description(v):
    t = strip_html(v)
    parts = re.split(r'(?<=[.!?])\s+', t)
    kept = [p for p in parts if not _BOILER.search(p)]
    return ' '.join(kept).strip()


# ----------------------------------------------------------------------------------------
# 3. Taxonomy (item -> category / sub category / HSN / GST)
# ----------------------------------------------------------------------------------------
def load_taxonomy(path):
    rows = list(csv.DictReader(open(path, encoding='utf-8')))
    by_item = defaultdict(list)
    for r in rows:
        by_item[r['item_name']].append(r)
    return by_item


def norm_text(t):
    t = unicodedata.normalize('NFKD', s(t)).encode('ascii', 'ignore').decode('ascii').lower().replace("'", '')
    t = re.sub(r'\bcre(a)?me\b', 'cream', t)
    t = t.replace('&', ' and ')
    t = re.sub(r'[^a-z0-9+.]+', ' ', t)
    t = re.sub(r'(?<![0-9])\.|\.(?![0-9])', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


COMPILED = {item: [(re.compile(p), w) for p, w in pairs] for item, pairs in RULES.items()}
KIT_RE = re.compile(KIT_WORDS)
EXPLICIT_KIT_RE = re.compile(r'\b(kit|kits|hamper|gift set|gift pack|gift box)\b')
HAIR_CTX = re.compile(r'\b(hair|scalp|shampoo|keratin|frizz|dandruff)\b')
SKIN_CTX = re.compile(r'\b(face|facial|skin|body|lip|eye)\b')
HAIR_SUBS = {'Serum': 'Hair Serum', 'Face Mask': 'Hair Mask & Cream', 'Face Oil': 'Hair Oil', 'Face Scrub': 'Scalp Care',
             'Toner & Mist': 'Hair Styling', 'Moisturizer': 'Hair Mask & Cream', 'Treatment': 'Scalp Care'}


def score_text(text, brand=''):
    """-> {item: score}"""
    scores = {}
    for item, pats in COMPILED.items():
        pos, neg = [], 0.0
        for rx, w in pats:
            if rx.search(text):
                if w > 0:
                    pos.append(w)
                else:
                    neg += w
        if not pos:
            continue
        pos.sort(reverse=True)
        sc = pos[0] + min(3.0, 0.25 * sum(pos[1:])) + neg
        if sc > 0:
            scores[item] = round(sc, 2)
    hint = BRAND_HINTS.get(norm_text(brand))
    if hint and scores.get(hint[0], 0) < hint[1]:
        scores[hint[0]] = hint[1]
    return scores


def classify(title, crumbs, brand, taxonomy, force_item=None, leaf=''):
    """-> dict(item, row(taxonomy row), confidence, score, alt, reasons)"""
    text = norm_text(f'{title} | {crumbs}')
    scores = {force_item: 99.0} if force_item else score_text(text, brand)
    leaf_n = norm_text(leaf)
    leaf_is_kit = bool(leaf_n and re.search(KIT_LEAF, leaf_n))
    if not force_item and leaf_n in LEAF_MAP and not leaf_is_kit:
        scores[LEAF_MAP[leaf_n]] = max(scores.get(LEAF_MAP[leaf_n], 0), 12.0) + 0       # Nykaa's own leaf category wins
    reasons = []
    if not scores:
        return dict(item='', row=None, confidence='None', score=0, alt='', reasons=['no item keyword found'])
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    best, s1 = ranked[0]
    alt, s2 = (ranked[1] if len(ranked) > 1 else ('', 0))

    # hair context: "Serum" in a hair title is a Hair Serum, etc.
    if not force_item and best in HAIR_SUBS and HAIR_CTX.search(text) and not SKIN_CTX.search(text):
        best = HAIR_SUBS[best]

    baby = bool(re.search(BABY_WORDS, text)) or norm_text(brand) in {norm_text(b) for b in BABY_BRANDS}
    pro = bool(re.search(PRO_WORDS, text)) or norm_text(brand) in {norm_text(b) for b in PRO_BRANDS}

    # kits
    if not force_item and (KIT_RE.search(text) or leaf_is_kit) and best not in NO_KIT and best not in ('Hair Kit', 'Facial Kit', 'Makeup Kit', 'Gift Set', 'Manicure Pedicure Kit', 'Baby Kit'):
        strong = [i for i, v in ranked if v >= 6]
        if EXPLICIT_KIT_RE.search(text) or leaf_is_kit or len(strong) >= 2:
            if baby:
                best = 'Baby Kit'
            else:
                for kit, members in KIT_BY_ITEM.items():
                    if best in members:
                        best = kit
                        break
    if not force_item and best == 'Perfume' and re.search(r'\b(set|combo|gift|hamper|trio|duo)\b', text):
        best = 'Gift Set'

    if not force_item and baby and best in BABY_REMAP and BABY_REMAP[best] in taxonomy:
        best = BABY_REMAP[best]

    if best not in taxonomy:                       # item exists in rules but not in the tree
        return dict(item='', row=None, confidence='None', score=s1, alt=alt, reasons=[f'"{best}" not in taxonomy'])

    rows = taxonomy[best]
    pick = None
    is_baby = lambda r: r['sub_category_id'] == 'baby-care'           # Personal Care > Baby Care
    is_pro = lambda r: r['category_id'] == 'salon-and-professional'
    if baby:
        pick = next((r for r in rows if is_baby(r)), None)
    if pick is None and pro:
        pick = next((r for r in rows if is_pro(r)), None)
    if pick is None:
        pick = next((r for r in rows if not is_baby(r) and not is_pro(r)), rows[0])

    margin = s1 - s2
    if force_item:
        return dict(item=best, row=pick, confidence='Manual', score=99, alt='', reasons=[])
    if s1 >= 8 and margin >= 2.5:
        conf = 'High'
    elif s1 >= 6.5 and margin >= 1.0:
        conf = 'Medium'
    else:
        conf = 'Low'
    if s1 < 5:
        conf = 'None'
        reasons.append('only weak keyword evidence')
    if conf == 'Low' and alt:
        reasons.append(f'close call with "{alt}"')
    return dict(item=best, row=pick, confidence=conf, score=s1, alt=alt, reasons=reasons)


# ----------------------------------------------------------------------------------------
# 4. Loading input
# ----------------------------------------------------------------------------------------
def load_input(args):
    if args.db:
        con = sqlite3.connect(args.db)
        table = args.table
        if not table:
            names = [r[0] for r in con.execute("select name from sqlite_master where type in ('table','view')")]
            if not names:
                sys.exit('No tables found in the database.')
            best, cnt = None, -1
            for n in names:                         # pick the biggest table
                try:
                    c = con.execute(f'select count(*) from "{n}"').fetchone()[0]
                except sqlite3.Error:
                    continue
                if c > cnt:
                    best, cnt = n, c
            table = best
            print(f'[info] --table not given, using "{table}" ({cnt} rows). Tables: {names}')
        return pd.read_sql_query(f'select * from "{table}"', con).astype(object)
    if not args.input:
        sys.exit('Give a CSV file or --db nykaa.db')
    return pd.read_csv(args.input, dtype=str, keep_default_na=False)


# ----------------------------------------------------------------------------------------
# 5. Row builder
# ----------------------------------------------------------------------------------------
def build(df, cols, taxonomy, args, progress=None):
    def get(row, field):
        return ' '.join(s(row.get(c, '')) for c in cols.get(field, []) if s(row.get(c, ''))) if field in MULTI_FIELDS else s(row.get(cols[field][0], '')) if field in cols else ''

    out_rows, review = [], []
    contributed = set()
    barcode_next = args.barcode_start
    used = {c for f, cs in cols.items() for c in cs}
    # unused columns are searched for hidden Key: value data (manufacturer, marketed by, country of origin ...)
    extra_cols = [c for c in df.columns if c not in used] + [c for c in cols.get('description', []) + cols.get('manufacturer', [])]
    overrides = getattr(args, 'overrides', None) or {}
    full_rows = []
    one_to_one = {c for f in ('title', 'brand', 'mrp', 'size', 'shade', 'ingredients', 'manufacturer', 'country', 'description', 'marketed_by', 'barcode', 'expiry') for c in cols.get(f, [])}
    one_to_one |= set(cols.get('images', [])) | set(cols.get('image_cols', []))
    extra_names = [c for c in df.columns if c not in one_to_one]
    total = len(df)
    for n_done, (idx, row) in enumerate(df.iterrows()):
        if progress and n_done % 25 == 0:
            progress(n_done, total)
        title, brand = get(row, 'title'), clean_brand(get(row, 'brand'))
        if not title:
            review.append(dict(source_row=idx + 2, title='', brand=brand, predicted_item='', alt_item='', score='', confidence='None',
                               reasons='row has no title - skipped'))
            continue
        crumbs = get(row, 'category')
        okey = get(row, 'sku') or norm_text(title)
        leaf = s(row.get(cols['category'][0], '')) if cols.get('category') else ''
        cl = classify(title, crumbs, brand, taxonomy, force_item=overrides.get(okey), leaf=leaf)
        reasons = list(cl['reasons'])
        notes = []                                   # information only - does not put the row in review.csv
        item_row = cl['row'] if cl['confidence'] in ('High', 'Medium', 'Low') else None

        # prices
        mrp, price = to_money(get(row, 'mrp')), to_money(get(row, 'price'))
        if not mrp and price:
            mrp = price
        if not mrp:
            reasons.append('no MRP found')
        if mrp and price and price > mrp:
            mrp = price
        selling = (round(price) if (args.use_scraped_price and price) else round(mrp * args.selling_ratio)) if mrp else None
        if mrp and selling and selling > mrp:
            selling = round(mrp)
        parlour = min(round(selling * (1 + args.parlour_markup)), round(mrp)) if selling else None
        std_q = std_p = mst_q = mst_p = ''
        if args.tiers and selling:
            std_q, std_p = args.std_qty, round(selling * args.std_ratio)
            mst_q, mst_p = args.master_qty, round(selling * args.master_ratio)

        # images: every image URL from every image column, in order, no duplicates, max 14
        clean_imgs = []
        for c in cols.get('image_cols', []) + cols.get('images', []):
            for u in extract_image_urls(row.get(c, '')):
                if u not in clean_imgs:
                    clean_imgs.append(u)
        if not clean_imgs:
            reasons.append('no images')
        if len(clean_imgs) > 14:
            notes.append(f'{len(clean_imgs)} images found, only 14 fit')
        clean_imgs = clean_imgs[:14]

        # everything else hiding in "Key: value" text / JSON in any unused column
        kv = {}
        for c in extra_cols:
            got = parse_kv(row.get(c, ''))
            if got:
                contributed.add(c)
            for f, val in got.items():
                kv.setdefault(f, val)

        def pick(field):
            v = get(row, field)
            if v and _LABEL_RE.search(v):               # e.g. a manufacturer cell that holds "Manufactured by: X Marketed by: Y"
                v = parse_kv(v).get(field) or v
            return v or kv.get(field, '')

        # barcode: scraped EAN -> kv -> 13 digits in the image file name -> running number (optional)
        bc = re.sub(r'\D', '', pick('barcode'))
        if not (8 <= len(bc) <= 14):
            bc = ean_from_image(clean_imgs)
        if not (8 <= len(bc) <= 14):
            bc = ''
            if barcode_next is not None:
                bc, barcode_next = str(barcode_next), barcode_next + 1

        # size, shade, title
        size = clean_size(pick('size'), title)
        if size == 'NA':
            notes.append('size not found')
        shade = re.sub(r'\s*\(\s*\d+(?:\.\d+)?\s*[A-Za-z]{1,4}\)\s*$', '', s(pick('shade')))   # your export leaks the size into shade
        ptitle = clean_title(title, shade, size)


        # stock
        stock_txt = get(row, 'stock').lower()
        if stock_txt and re.search(r'out of stock|unavailable|sold out|^(false|no|0)$', stock_txt):
            qty = 0
        elif re.fullmatch(r'\d+', stock_txt or ''):
            qty = int(stock_txt)
        else:
            qty = args.default_qty if args.default_qty is not None else ''

        o = OrderedDict((c, '') for c in TEMPLATE_COLUMNS)
        o.update({
            'barcodeId': bc, 'Image': clean_imgs[0] if clean_imgs else '', 'productCode': '', 'productTitle': ptitle,
            'hsnCode': item_row['hsn_code'] if item_row else '',
            'productDescription': clean_description(get(row, 'description')), 'brand': brand,
            'category': (item_row['category'] if args.names else item_row['category_id']) if item_row else '',
            'subCategory': (item_row['sub_category'] if args.names else item_row['sub_category_id']) if item_row else '',
            'itemName': item_row['item_name'] if item_row else '', 'shade': shade, 'size': size,
            'ingredients': re.sub(r'^\s*(key\s+)?ingredients\s*[:\-]\s*', '', s(pick('ingredients')), flags=re.I),
            'manufacturer': pick('manufacturer'), 'marketedBy': pick('marketed_by') or get(row, 'packer') or get(row, 'importer'),
            'countryOfOrigin': clean_country(pick('country')), 'expiryDate': pick('expiry'), 'series': pick('series'),
            'mrpPrice': round(mrp) if mrp else '', 'gstRate': item_row['gst_rate'] if item_row else '',
            'sellingPrice': selling or '', 'parlourSellingPrice': parlour or '',
            'standardPack': std_q, 'standardPackPrice': std_p, 'masterPack': mst_q, 'MasterPackPrice': mst_p, 'availableQty': qty,
        })
        for i, u in enumerate(clean_imgs, 1):
            o[f'image{i}'] = u
        out_rows.append(o)
        full = OrderedDict(o)
        for c in extra_names:                                  # every source column that has no home in the template is kept
            full['src_' + str(c)] = s(row.get(c, ''))
        full['match_confidence'], full['match_score'] = cl['confidence'], cl['score']
        full['review_notes'] = '; '.join(reasons + notes)
        full_rows.append(full)
        if reasons or cl['confidence'] in ('Low', 'None'):
            review.append(dict(key=okey, source_row=idx + 2, title=title, brand=brand, predicted_item=cl['item'], alt_item=cl['alt'],
                               score=cl['score'], confidence=cl['confidence'], reasons='; '.join(reasons)))
    unused = []
    for c in df.columns:
        if c in used or c in contributed:
            continue
        fill = (df[c].astype(str).str.strip() != '').mean()
        if fill > 0:
            unused.append((c, fill))
    if progress:
        progress(total, total)
    return pd.DataFrame(out_rows, columns=TEMPLATE_COLUMNS), pd.DataFrame(review), unused, pd.DataFrame(full_rows)


# ----------------------------------------------------------------------------------------
# 6. Main
# ----------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description='Map scraped Nykaa products to the redSales import template.')
    ap.add_argument('input', nargs='?', help='CSV from the scraper (nykaa_products.csv)')
    ap.add_argument('--db', help='SQLite file (nykaa.db) instead of a CSV')
    ap.add_argument('--table', help='table name inside the database')
    ap.add_argument('-o', '--out', default='out', help='output folder (default: out)')
    ap.add_argument('--taxonomy', default=str(HERE / 'taxonomy.csv'))
    ap.add_argument('--col', action='append', help='override a column, e.g. --col title=product_name (fields: ' + ', '.join(SYNONYMS) + ')')
    ap.add_argument('--inspect', action='store_true', help='show detected columns and exit')
    ap.add_argument('--names', action='store_true', help='write category/subCategory as names (Personal Care) instead of the default slugs (personal-care)')
    ap.add_argument('--use-scraped-price', action='store_true', help='sellingPrice = scraped price instead of MRP x ratio')
    ap.add_argument('--selling-ratio', type=float, default=0.69, help='sellingPrice = MRP x this (your export median 0.69)')
    ap.add_argument('--parlour-markup', type=float, default=0.06, help='parlour price = selling x (1+this) (median 0.06)')
    ap.add_argument('--tiers', action='store_true', help='also fill standard/master pack columns')
    ap.add_argument('--std-qty', type=int, default=12)
    ap.add_argument('--std-ratio', type=float, default=0.96)
    ap.add_argument('--master-qty', type=int, default=48)
    ap.add_argument('--master-ratio', type=float, default=0.92)
    ap.add_argument('--default-qty', type=int, default=None, help='availableQty when the scraper has no stock info')
    ap.add_argument('--barcode-start', type=int, default=None, help='generate running barcodes from this number when EAN is missing')
    ap.add_argument('--limit', type=int, default=None, help='only process the first N rows (for a quick test)')
    args = ap.parse_args()
    args.overrides = {}

    df = load_input(args)
    if args.limit:
        df = df.head(args.limit)
    cols = detect_columns(list(df.columns), args.col, df)
    print(f'[info] {len(df)} rows, {len(df.columns)} columns')
    print('[info] detected columns:')
    for f in list(SYNONYMS) + ['image_cols']:
        if f in cols:
            print(f'   {f:13s} <- {cols[f] if len(cols[f]) < 4 else cols[f][:3] + ["..."]}')
        elif f in ('title',):
            print(f'   {f:13s} <- NOT FOUND (use --col title=<your column>)')
    if args.inspect:
        mapped = {}
        for f, cs in cols.items():
            for c in cs:
                mapped.setdefault(c, []).append(f)
        print('\n[info] every source column: filled %, what the program does with it, sample')
        for c in df.columns:
            vals = df[c].astype(str).str.strip()
            fill = (vals != '').mean()
            sample = next((v for v in vals if v), '')[:60].replace('\n', ' ')
            use = ','.join(mapped.get(c, [])) or ('(searched for Key: value data)' if fill else '(empty)')
            print(f'   {str(c)[:28]:28s} {fill:5.0%}  {use[:34]:34s} {sample}')
        n_img = sum(1 for v in df.head(300).itertuples(index=False) for c in cols.get('images', [])[:1])
        return
    if 'title' not in cols:
        sys.exit('Could not find the product title column. Re-run with --col title=<column name>.')

    taxonomy = load_taxonomy(args.taxonomy)
    out, review, unused, full = build(df, cols, taxonomy, args)

    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    full.to_csv(outdir / 'import_ready.csv', index=False, encoding='utf-8-sig')       # template columns + every other source column
    out.to_csv(outdir / 'import_template_only.csv', index=False, encoding='utf-8-sig')  # exactly the template
    review.to_csv(outdir / 'review.csv', index=False, encoding='utf-8-sig')

    n = len(out)
    placed = (out['itemName'] != '').sum()
    conf = Counter(review['confidence']) if len(review) else Counter()
    lines = [f'Rows read            : {len(df)}', f'Rows written         : {n}',
             f'Item name assigned   : {placed}  ({placed / max(n, 1):.0%})', f'Rows needing review  : {len(review)}  (see review.csv)',
             f'  low-confidence     : {conf.get("Low", 0)}', f'  no item found      : {conf.get("None", 0)}', '',
             'Top item names:'] + [f'  {k:28s} {v}' for k, v in out['itemName'].replace('', '(none)').value_counts().head(15).items()]
    filled = lambda col: int((out[col].astype(str) != '').sum())
    lines += ['', 'Filled cells:'] + [f'  {c:20s} {filled(c)} / {n}' for c in ('Image', 'barcodeId', 'productDescription', 'ingredients', 'manufacturer', 'marketedBy', 'countryOfOrigin', 'shade', 'size', 'image2', 'image5')]
    if unused:
        lines += ['', 'Source columns that are NOT in the template (nothing was found in them to move):'] + [f'  {c}  ({f:.0%} filled)' for c, f in unused]
    (outdir / 'summary.txt').write_text('\n'.join(lines), encoding='utf-8')
    print('\n'.join(lines))
    print(f'\n[done] {outdir / "import_ready.csv"}  and  {outdir / "review.csv"}')


if __name__ == '__main__':
    main()
