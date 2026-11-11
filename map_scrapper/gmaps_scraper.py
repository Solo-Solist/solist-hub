"""
Small, versatile Google Maps scraper built on Scrapling.

Install:
    pip install "scrapling[fetchers]"
    scrapling install

Usage:
    python gmaps_scraper.py "coffee shops in Thane" -n 30
    python gmaps_scraper.py "dentist near Powai Mumbai" -n 50 --reviews 10 --stealth
    python gmaps_scraper.py --url "https://www.google.com/maps/place/..."   # single place
    python gmaps_scraper.py "pizza in Pune" --no-headless                    # watch it work

Output: <out>.json and <out>.csv (default: results.*)
"""
import argparse
import csv
import json
import re
from urllib.parse import quote_plus

from scrapling.fetchers import DynamicSession, StealthySession

FEED = 'div[role="feed"]'
PLACE_SEL = '[data-item-id="address"], h1.DUwDvf'  # a real place panel (not the "Results" heading)


# --------------------------------------------------------------------------
# Browser-side actions (run inside Playwright via page_action)
# --------------------------------------------------------------------------
def _accept_consent(page):
    """Dismiss the cookie/consent wall (shows up mostly in the EU)."""
    for label in ("Accept all", "Reject all", "I agree"):
        try:
            btn = page.locator(f'button:has-text("{label}")')
            if btn.count():  # check without waiting: most pages have no consent wall, so this costs nothing
                btn.first.click(timeout=1500)
                page.wait_for_timeout(800)
                return page
        except Exception:
            pass
    return page



# Runs in the page: scrolls the results list to its end the way a person would, and reports what is loaded.
# Google Maps only loads the next ~20 results when the list's own scroll box reaches its bottom. That box is
# usually the feed's parent (not the feed itself), so find whichever ancestor actually scrolls.
_SCROLL_JS = """(feedSel) => {
  const feed = document.querySelector(feedSel);
  if (!feed) return {count: 0, end: false, found: false};
  let box = feed;
  while (box && box !== document.body) {
    const s = getComputedStyle(box);
    if (/(auto|scroll)/.test(s.overflowY) && box.scrollHeight > box.clientHeight + 5) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) box = feed;
  const links = [...new Set([...feed.querySelectorAll('a[href*="/maps/place/"]')].map(a => a.href))];
  const last = [...feed.querySelectorAll('a[href*="/maps/place/"]')].pop();
  if (last) last.scrollIntoView({block: 'end'});
  box.scrollTop = box.scrollHeight;
  const text = (feed.innerText || '').toLowerCase();
  const end = text.includes("reached the end of the list") || text.includes("end of the list") || !!feed.querySelector('.HlvSq');
  const r = box.getBoundingClientRect();
  return {count: links.length, end, found: true,
          x: Math.round(r.left + r.width / 2), y: Math.round(Math.min(r.bottom - 40, window.innerHeight - 40))};
}"""


def make_scroll_action(max_results, on_progress=None):
    """Scroll the Google Maps results list until it ends (Google stops at about 120) or max_results are loaded.

    on_progress(count, done) is called whenever the number of loaded places changes, and once at the end.
    """

    def action(page):
        _accept_consent(page)

        try:
            page.wait_for_selector(FEED, timeout=15000)
        except Exception:
            return page  # Google opened a single place page instead of a list

        count, best, idle_ms, end = 0, 0, 0, False
        deadline = 240_000  # never more than 4 minutes on one list
        spent = 0
        while spent < deadline:
            try:
                st = page.evaluate(_SCROLL_JS, FEED)
            except Exception:
                break
            count, end = st.get("count", 0), st.get("end", False)
            # A real wheel over the list as well: some builds only load more on user-like scroll events.
            try:
                if st.get("found"):
                    page.mouse.move(st["x"], st["y"])
                    page.mouse.wheel(0, 3000)
            except Exception:
                pass
            if count > best:
                best, idle_ms = count, 0
                if on_progress:
                    on_progress(count, False)
                print(f"\rGoogle Maps list: {count} places loaded (target {max_results})", end="", flush=True)
            if count >= max_results or end:
                break
            # Nothing new yet: wait a bit longer each time, and nudge the list up and down to wake the loader.
            if idle_ms >= 15_000:
                break  # 15 s without a single new result: the list is done
            if idle_ms and idle_ms % 3000 < 1000:
                try:
                    page.mouse.wheel(0, -600)
                    page.wait_for_timeout(250)
                    page.mouse.wheel(0, 3000)
                except Exception:
                    pass
            page.wait_for_timeout(1000)
            idle_ms += 1000
            spent += 1000

        if on_progress:
            on_progress(count, True)
        print(f"\nGoogle Maps list finished: {count} places loaded{' (end of list)' if end else ''}")
        return page

    return action


def make_reviews_action(n_reviews):
    """Open the Reviews tab, sort by newest, and scroll to load n reviews."""
    def action(page):
        _accept_consent(page)
        try:
            page.locator('button[role="tab"]:has-text("Reviews")').first.click(timeout=4000)
            page.wait_for_selector("div.jftiEf", timeout=6000)
            # expand the "More" links so full text is present
            last, stale = 0, 0
            while True:
                count = page.locator("div.jftiEf").count()
                if count >= n_reviews:
                    break
                stale = stale + 1 if count == last else 0
                if stale >= 3:
                    break
                last = count
                page.locator("div.jftiEf").last.scroll_into_view_if_needed()
                page.mouse.wheel(0, 4000)
                page.wait_for_timeout(1000)
            for btn in page.locator("button.w8nwRe").all():  # "More" buttons
                try:
                    btn.click(timeout=300)
                except Exception:
                    pass
        except Exception:
            pass
        return page
    return action


# --------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------
def parse_place(page, url, n_reviews=0):
    """Extract everything useful from a place page."""
    g = lambda sel: (page.css(sel).get() or "").strip() or None

    data = {
        "name": g("h1.DUwDvf::text"),
        "category": g("button.DkEaL::text"),
        "rating": g('div.F7nice span[aria-hidden="true"]::text'),
        "reviews_count": None,
        "url": url,
    }

    m = re.search(r"\(?([\d,]+)\)?", g('div.F7nice span[aria-label*="review"]::attr(aria-label)') or "")
    data["reviews_count"] = int(m.group(1).replace(",", "")) if m else None

    # coordinates + place id are embedded in the URL
    m = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", url)
    data["lat"], data["lng"] = (float(m.group(1)), float(m.group(2))) if m else (None, None)
    m = re.search(r"!1s(0x[0-9a-f]+:0x[0-9a-f]+)", url)
    data["place_id"] = m.group(1) if m else None

    # The "scrape everything" trick: every info row (address, phone, website,
    # plus code, hours, booking links, menu, ...) carries a data-item-id.
    info = {}
    for el in page.css("[data-item-id]"):
        key = el.attrib.get("data-item-id")
        label = el.attrib.get("aria-label") or " ".join(t.strip() for t in el.css("::text").getall() if t.strip())
        if key and label:
            info[key] = label
    data["address"] = info.get("address", "").replace("Address: ", "") or None
    data["phone"] = next((v.replace("Phone: ", "") for k, v in info.items() if k.startswith("phone:")), None)
    data["plus_code"] = info.get("oloc", "").replace("Plus code: ", "") or None
    site = page.css('a[data-item-id="authority"]::attr(href)').get()
    data["website"] = site
    data["info_raw"] = info  # anything else Google shows in the info panel

    # opening hours
    hours = {}
    for row in page.css("table.eK4R0e tr, table.WgFkxc tr"):
        cells = row.css("td")
        if len(cells) >= 2:
            day = " ".join(t.strip() for t in cells[0].css("::text").getall() if t.strip())
            val = " ".join(t.strip() for t in cells[1].css("::text").getall() if t.strip())
            if day:
                hours[day] = val
    data["hours"] = hours or None

    # attributes / amenities ("Dine-in", "Wheelchair accessible", ...)
    data["attributes"] = [a.strip() for a in page.css("div.iP2t7d div.LTs0Rc::attr(aria-label)").getall()] or None

    # main photo
    data["photo"] = g('button[jsaction*="heroHeaderImage"] img::attr(src)')

    if n_reviews:
        data["reviews"] = []
        for r in page.css("div.jftiEf")[:n_reviews]:
            data["reviews"].append({
                "author": (r.css("div.d4r55::text").get() or "").strip() or None,
                "rating": (r.css("span.kvMYJc::attr(aria-label)").get() or "").strip() or None,
                "date": (r.css("span.rsqaWe::text").get() or "").strip() or None,
                "text": (r.css("span.wiI7pd::text").get() or "").strip() or None,
            })
    return data


# --------------------------------------------------------------------------
# Main flow
# --------------------------------------------------------------------------
def scrape(query=None, url=None, max_results=120, n_reviews=0, headless=True, stealth=False, proxy=None):
    Session = StealthySession if stealth else DynamicSession
    kwargs = dict(headless=headless)  # no network_idle: Maps never goes idle
    if proxy:
        kwargs["proxy"] = proxy

    results = []
    with Session(**kwargs) as s:
        # 1) collect place links
        if url:
            place_urls = [url]
        else:
            search_url = f"https://www.google.com/maps/search/{quote_plus(query)}?hl=en"
            page = s.fetch(search_url, page_action=make_scroll_action(max_results))
            hrefs = page.css(f'{FEED} a[href*="/maps/place/"]::attr(href)').getall()
            place_urls = list(dict.fromkeys(hrefs))[:max_results]  # dedupe, keep order
            if not place_urls:  # Google jumped straight to a single place
                place_urls = [page.url]
            print(f"Found {len(place_urls)} places")

        # 2) visit each place
        for i, purl in enumerate(place_urls, 1):
            try:
                action = make_reviews_action(n_reviews) if n_reviews else _accept_consent
                if "hl=" not in purl:
                    purl += ("&" if "?" in purl else "?") + "hl=en"
                page = s.fetch(purl, wait_selector=PLACE_SEL, page_action=action)
                item = parse_place(page, purl, n_reviews)
                if not item["name"]:
                    print(f"[{i}/{len(place_urls)}] skipped (place page did not load)")
                    continue
                results.append(item)
                print(f"[{i}/{len(place_urls)}] {item['name']}")
            except Exception as e:
                print(f"[{i}/{len(place_urls)}] failed: {e}")
    return results


def csv_safe(row):
    """Stop spreadsheets running scraped text as a formula; phone numbers and negative numbers stay as they are."""
    return ["'" + v if isinstance(v, str) and v[:1] in ("=", "+", "-", "@") and not re.fullmatch(r"[+-]?[\d\s().-]+", v) else v
            for v in row]


def save(results, out):
    with open(f"{out}.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    flat_keys = ["name", "category", "rating", "reviews_count", "address", "phone",
                 "website", "lat", "lng", "plus_code", "place_id", "url"]
    with open(f"{out}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=flat_keys, extrasaction="ignore")
        w.writeheader()
        w.writerows(dict(zip(flat_keys, csv_safe(r.get(k) for k in flat_keys))) for r in results)
    print(f"Saved {len(results)} rows -> {out}.json, {out}.csv")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Google Maps scraper (Scrapling)")
    ap.add_argument("query", nargs="?", help='e.g. "coffee shops in Thane"')
    ap.add_argument("--url", help="scrape one specific place URL instead of searching")
    ap.add_argument("-n", "--max-results", type=int, default=120, help="Google shows at most about 120 per search")
    ap.add_argument("--reviews", type=int, default=0, metavar="N", help="also grab up to N reviews per place")
    ap.add_argument("--stealth", action="store_true", help="use StealthySession (anti-bot hardened)")
    ap.add_argument("--no-headless", action="store_true")
    ap.add_argument("--proxy", help="e.g. http://user:pass@host:port")
    ap.add_argument("-o", "--out", default="results")
    a = ap.parse_args()

    if not (a.query or a.url):
        ap.error("give a search query or --url")

    data = scrape(a.query, a.url, a.max_results, a.reviews, not a.no_headless, a.stealth, a.proxy)
    save(data, a.out)