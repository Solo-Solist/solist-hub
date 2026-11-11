# Nykaa Studio - scrape, convert, review, export (all from one browser page)

## Start (Windows, no terminal)
1. Run **setup.bat** once (Ubuntu/macOS: `./setup.sh`), or start it from Solist Hub, which does this for you.
2. Double-click **start.bat** (Ubuntu/macOS: `./start.sh`). Your browser opens **http://localhost:8766**.
3. Leave the black window open while you work; close it to stop.

## What the page does
| Area | What you do |
|---|---|
| **Scraper ↗** (top right) | opens your existing scraper dashboard inside Studio - add brands, start, stop, retry, as before |
| **1 · Scraped brands** | every brand in `nykaa.db` with product / variant counts - tick the ones to convert |
| **2 · CSV files** | `nykaa_*.csv` in the project folder + anything you **Upload CSV** (kept in `inbox\`) |
| **Export name** | type your own name (e.g. `lakme_oct`) - files are saved as `exports\lakme_oct_import_ready.csv`, `..._template_only.csv`, `..._review.csv` |
| **3 · Settings** | selling-price rule, parlour mark-up, slugs/names, default qty, barcode start, pack tiers |
| **KPIs + charts** | rows, % matched, to review, average images, extra columns kept, item / category / GST / confidence / column completeness |
| **Review** | rows the program is unsure about: pick the right item name, **Save**, then **Re-run latest** - corrections are remembered for every future conversion |
| **Exports** | every conversion, with download buttons, delete, open folder |
| **Logs** | timeline of everything (loaded, detected columns, finished, errors), export or clear |

Folders it creates next to `crawler.py`: `exports\`, `inbox\`, `logs\studio.log`, and `studio.db` (history, logs, corrections).

## The two output files
* **`..._import_ready.csv`** - the 41 template columns first, then **every other column from the scrape** with a `src_` prefix (rating, rating_count, review_count, discount, in_stock, url, sku, how_to_use, packer, importer, cat_l1/2/3, variant_name, shade swatch, description images ...) plus `match_confidence`, `match_score`, `review_notes`.
* **`..._template_only.csv`** - exactly the template columns, for the importer.

# Command-line version (optional)
## Windows quick start (no typing)
1. Double-click **setup.bat** (once).
2. Drag your products CSV onto **run.bat**. Results open in the `out` folder.
3. If columns are not found, drag the CSV onto **inspect.bat** to see which columns it detected.

Turns the products your scraper saved into a file in the **redSales import template** column order:

`barcodeId, Image, productCode, productTitle, hsnCode, productDescription, brand, category, subCategory, itemName, series, shade, size, ingredients, manufacturer, marketedBy, countryOfOrigin, expiryDate, mrpPrice, gstRate, sellingPrice, parlourSellingPrice, standardPack, standardPackPrice, masterPack, MasterPackPrice, availableQty, image1 ... image14`

## Files
| File | What it is |
|---|---|
| `mapper.py` | the program |
| `rules.py` | the keyword rules that pick the **item name** (edit this to teach it new words) |
| `taxonomy.csv` | the 147-row tree (same structure as the redSales categories collection): category > sub category > item name, with 8-digit HSN and GST % |

## Run it from a terminal (in this folder, with its environment active)
```
python mapper.py nykaa_products.csv --inspect          # check it found your columns
python mapper.py nykaa_products.csv                    # writes out\import_ready.csv + out\review.csv
python mapper.py --db nykaa.db --table products        # same, straight from the database
python mapper.py nykaa_products.csv --limit 50          # quick test on 50 rows
```
If a column is not detected, name it yourself: `--col title=product_name --col mrp=list_price`
(fields: title, brand, mrp, price, size, shade, description, ingredients, manufacturer, marketed_by, country, expiry, barcode, category, images, stock).

## Outputs (in `out\`)
* `import_ready.csv` - the import file (UTF-8 with BOM, opens correctly in Excel).
* `summary.txt` also lists any source columns that were NOT used, so nothing is silently dropped.
* `review.csv` - rows to check by eye: low confidence, no item keyword found, missing MRP / size / images. Rows with no confident item name are left **blank** instead of guessed.
* `summary.txt` - counts.

## How each column is filled
* **category / subCategory / itemName / hsnCode / gstRate** - the item name is chosen by `rules.py` from the title + category breadcrumb. The rest comes from `taxonomy.csv`. Baby brands/words choose Personal Care > Baby Care; salon brands (Kerastase, Matrix, Schwarzkopf Professional, Streax Pro ...) choose Salon & Professional.
* **size** - written like your export: `100ml`, `50g`, `1 pc`, combos `60ml + 100g`, `NA` when unknown.
* **productTitle** - `Title - Shade(size)`, the style most of your export uses. A duplicate size/shade is removed.
* **images** - found by looking at the CELLS, not the column name: any column holding image URLs (JSON list, Python list, comma / pipe / newline separated, numbered columns) is split into image1...image14, de-duplicated, in order. `Image` = image1.
* **manufacturer / marketedBy / countryOfOrigin / ingredients / expiry / series / shade / size** - taken from their own column when there is one; otherwise searched for inside every other column as `Key: value` text or JSON (e.g. `Manufacturer: X, Marketed By: Y, Country of Origin: India`).
* **barcodeId** - the scraped EAN, else the 13 digits inside the Nykaa image file name (right ~80% of the time on your old export).
* **productDescription** - Nykaa's filler sentences ("Explore the entire range of ... Shop more ... products here") are removed.
* **mrpPrice** - whole rupees. **sellingPrice** = MRP x 0.69, **parlourSellingPrice** = selling x 1.06 (your export's medians; change with `--selling-ratio`, `--parlour-markup`, or use the scraped price with `--use-scraped-price`).
* **standardPack / masterPack** - left blank unless you add `--tiers` (12 pcs at 96% and 48 pcs at 92% of selling price).
* If there is still no EAN the cell is blank (or running numbers with `--barcode-start 1001`).
* **availableQty** - 0 when the scraper says out of stock; otherwise blank (or `--default-qty 1`).
* **productCode, series, expiryDate** - left blank (nothing in the scrape gives them).
* category / subCategory are written as **slugs** (`personal-care`, `skin-care`, `salon-and-professional`). Use `--names` for `Personal Care` style.

## Accuracy
Tested on your own 3,783 redSales products using **titles only** (no breadcrumb): 86% of item names correct, and the rows the program marks High/Medium confidence (83% of rows) are 91% correct. With real Nykaa breadcrumbs it should do better. Part of the remaining gap is inconsistent labels in the old export.
Always scan `review.csv` before importing.

## Teaching it
Open `rules.py`, find the item, add a regex with a weight, e.g. `(r'\bscalp massager\b', 9)`. Specific phrases get higher weights than general words. A negative weight lowers a score. Re-run; no other change is needed.

## Run on Ubuntu / Run on Windows 11

| | Ubuntu | Windows 11 |
|---|---|---|
| Install Python (once) | `sudo apt install -y python3 python3-venv python3-pip` | `winget install -e --id Python.Python.3.12` |
| Set up (once) | `./setup.sh` (makes `.venv-linux`) | `setup.bat` (makes `.venv`, or reuses `..\.venv`) |
| Start Studio | `./start.sh` - http://localhost:8766, Ctrl+C to stop | `start.bat` - close the window to stop |
| Command line | `.venv-linux/bin/python mapper.py nykaa_products.csv` | `run.bat` / `inspect.bat`, or `.venv\Scripts\python mapper.py ...` |

pandas 3 needs Python 3.11 or newer. Windows and Ubuntu keep separate environments (`.venv`, `.venv-linux`) so the
same folder works from both. The folders you choose on the page are saved per system in `folders.json`
(`input`/`output` for Windows, `input_linux`/`output_linux` for Ubuntu), so a Windows path such as `E:\...` is
ignored on Ubuntu instead of breaking Studio.
