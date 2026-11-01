from scrapling.fetchers import Fetcher, StealthyFetcher

LIST_URL = "https://www.nykaa.com/luxe/brands/mac/c/3899?page_no=2&sort=popularity"
PRODUCT_URL = "https://www.nykaa.com/m-a-c-mini-studio-fix-fluid/p/27958026?productId=27958026"
PID = "27958026"

def probe(label, page):
    print(f"\n=== {label} === status={page.status}")
    links = page.css('a[href*="/p/"]::attr(href)').getall()
    print("product links found:", len(links), links[:3])
    scripts = page.css('script::text').getall()
    print("script blocks:", len(scripts))
    for s in scripts:
        if PID in s:
            print("-> script containing product id, length", len(s))
            print("   starts with:", s[:200].replace("\n", " "))
    ld = page.css('script[type="application/ld+json"]::text').getall()
    print("JSON-LD blocks:", len(ld))

# Test 1: plain HTTP (fastest)
probe("Fetcher listing", Fetcher.get(LIST_URL, impersonate="chrome", stealthy_headers=True))
probe("Fetcher product", Fetcher.get(PRODUCT_URL, impersonate="chrome", stealthy_headers=True))

# Test 2: stealth browser (fallback)
probe("Stealthy listing", StealthyFetcher.fetch(LIST_URL, headless=True, network_idle=True))