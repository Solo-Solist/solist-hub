# Nykaa Scraper

Crawls Nykaa brands into `nykaa.db`; `dashboard.py` is the browser dashboard (http://localhost:8765),
`gui.py` the older desktop window, `crawler.py` the crawler both use.

## Run on Ubuntu / Run on Windows 11

| | Ubuntu | Windows 11 |
|---|---|---|
| Install Python (once) | `sudo apt install -y python3 python3-venv python3-pip` (`python3-tk` too for `gui.py`) | `winget install -e --id Python.Python.3.12` |
| Set up (once) | `./setup.sh` (makes `.venv-linux`, installs `requirements.txt`, downloads Scrapling's browsers) | `setup.bat` (makes `.venv`) |
| Start the dashboard | `./start.sh` - Ctrl+C to stop | `start.bat` - close the window to stop |

Windows and Ubuntu keep separate environments (`.venv`, `.venv-linux`) so the same folder works from both.
The folders chosen in the dashboard are saved per system in `folders.json` (`data`/`exports` for Windows,
`data_linux`/`exports_linux` for Ubuntu); a path from the other system is ignored and the defaults
(this folder, and `exports/` in it) are used. Solist Hub starts this tool for you on either system.
