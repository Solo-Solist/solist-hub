import json, re
from scrapling.fetchers import Fetcher

PRODUCT_URL = "https://www.nykaa.com/m-a-c-mini-studio-fix-fluid/p/27958026?productId=27958026"
LIST_URL = "https://www.nykaa.com/luxe/brands/mac/c/3899?page_no=2&sort=popularity"
KEYS = re.compile(r"price|mrp|discount|rating|review|brand|ingredient|description|sku|title|name|stock|category", re.I)

def get_state(page, var="__PRELOADED_STATE__"):
    for s in page.css("script::text").getall():
        s = s.strip()
        if s.startswith(f"window.{var}"):
            body = s.split("=", 1)[1].strip()
            try:
                obj, _ = json.JSONDecoder().raw_decode(body)
                return obj
            except Exception as e:
                print("JSON parse failed:", e, "|", body[:200])
    return None

def walk(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            p = f"{path}.{k}" if path else k
            if isinstance(v, (dict, list)):
                yield from walk(v, p)
            elif KEYS.search(k):
                yield p, v
    elif isinstance(o, list):
        for i, v in enumerate(o[:3]):
            yield from walk(v, f"{path}[{i}]")

def find_lists(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from find_lists(v, f"{path}.{k}" if path else k)
    elif isinstance(o, list):
        if len(o) >= 10 and isinstance(o[0], dict):
            yield path, len(o), list(o[0].keys())[:15]
        for i, v in enumerate(o[:2]):
            yield from find_lists(v, f"{path}[{i}]")

# --- Product page ---
p = Fetcher.get(PRODUCT_URL, impersonate="chrome", stealthy_headers=True)
state = get_state(p)
if state:
    json.dump(state, open("product_state.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("PRODUCT state top-level keys:", list(state.keys()))
    print("\n--- key fields found ---")
    for i, (path, val) in enumerate(walk(state)):
        if i >= 80:
            break
        print(f"{path} = {str(val)[:80]}")

print("\n--- JSON-LD ---")
for raw in p.css('script[type="application/ld+json"]::text').getall():
    print(raw[:1500])

# --- Listing page ---
l = Fetcher.get(LIST_URL, impersonate="chrome", stealthy_headers=True)
lstate = get_state(l)
print("\nLISTING state found:", bool(lstate))
if lstate:
    json.dump(lstate, open("list_state.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("top-level keys:", list(lstate.keys()))
    for path, n, keys in find_lists(lstate):
        print(f"list at {path}: {n} items, keys={keys}")