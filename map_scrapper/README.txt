MUMBAI MMR GOOGLE MAPS SCRAPER RUNNER

Files
- run_mumbai_scrape.py: query generator, sequential runner, resume logic, CSV merge/deduplication.
- run_mumbai_scrape.bat: double-click launcher.

Install/use
1. Copy both files into:
   E:\Solist Project\map_scrapper\
   beside gmaps_scraper.py.
2. Make sure your existing .venv and Scrapling installation work.
3. Double-click run_mumbai_scrape.bat.
4. Leave the console open until "ALL QUERIES FINISHED."

Output
mumbai_scrape_output\
- one CSV and JSON per query
- query_status.csv
- mumbai_mmr_sweets_bakery_namkeen_farsan.csv (merged and deduplicated)

Notes
- The runner currently opens Chromium for each query (matches the --no-headless setup).
- It generates 52 locality terms x 8 categories = 416 queries. This can take many hours,
  depending on how many places each query returns and how fast pages load.
- To reduce runtime, edit AREAS or CATEGORIES in run_mumbai_scrape.py.
- It resumes queries whose CSV already exists and is non-empty. Delete a query's CSV/JSON
  if you want that query to run again.
- This collects public business information exposed by Google Maps. It does not guarantee
  every business or 500 results per query; Google Maps may limit results or change its UI.
- Avoid running repeated high-volume scrapes too quickly. Follow applicable website terms
  and privacy requirements.

RUN ON UBUNTU / RUN ON WINDOWS 11

Ubuntu
- Once: sudo apt install -y python3 python3-venv python3-pip
- ./setup.sh   (makes .venv-linux, installs requirements.txt, downloads Scrapling's browsers)
- ./start.sh   (dashboard at http://localhost:5000, Ctrl+C to stop)
- ./run_mumbai_scrape.sh   (same as run_mumbai_scrape.bat)
- If the browser complains about missing system libraries:
  sudo ./.venv-linux/bin/python -m playwright install-deps chromium

Windows 11
- Once: winget install -e --id Python.Python.3.12  (or python.org, tick "Add python.exe to PATH")
- setup.bat   (makes .venv, installs requirements.txt, downloads Scrapling's browsers)
- start.bat   (dashboard at http://localhost:5000, close the window to stop)
- run_mumbai_scrape.bat

Windows and Ubuntu each keep their own Python environment in this folder (.venv and .venv-linux),
so the same drive works from both. Solist Hub starts this tool for you on either system.
