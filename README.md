# Solist Project

My local tools in one repo. Solist Hub starts and stops each one, shows its log and opens its page.
It all runs on your own machine, on Windows, macOS or Linux.

| Folder | Tool | Port | Needs |
|---|---|---|---|
| `hub/` | Solist Hub: one window to start and stop everything | 9000 | Python 3.8+ |
| `map_scrapper/` | Maps Scraper: Google Maps places, jobs and CSV export | 5000 | Python 3.10+ |
| `nykaa-scraper/` | Nykaa Scraper: crawls Nykaa brands into a local database | 8765 | Python 3.10+ |
| `nykaa_mapper/` | Nykaa Mapper: turns scraped data into the import template | 8766 | Python 3.11+ |
| `pdfcraft/` | Solist PDF: merge, split, compress, convert and sign PDFs | 8090 | Node.js 20+ to build, Python to serve |
| `upi-id/` | UPI Gateway (YouPI): local payment gateway | 8091 | Node.js 24+ |
| `accounting/` | GST Billing: invoices, clients, products, expenses | 8092 | Node.js 18+ |
| `excalidraw/` | Solist Draw: whiteboard for sketches and diagrams | 8093 | Node.js 18+ to build, Python to serve |

UPI Gateway also opens its own services on 6001, 6002, 6003, 6100, 7000 and 5010.

## 1. Install the prerequisites (once)

- **Python 3.11+**: [python.org](https://www.python.org/downloads/). Windows: `winget install -e --id Python.Python.3.12`. Ubuntu: `sudo apt install -y python3 python3-venv python3-pip`. macOS: `brew install python`.
- **Node.js 24+**: [nodejs.org](https://nodejs.org). Windows: `winget install -e --id OpenJS.NodeJS`. macOS: `brew install node`.
- **Git**: [git-scm.com](https://git-scm.com).
- Chrome or Edge is optional. With one installed, the Hub opens in its own app window.

## 2. Clone

```bash
git clone https://github.com/Solo-Solist/solist-project.git
cd solist-project
```

## 3. Set up

Each tool gets its own Python environment or Node packages inside its folder.

| OS | Command |
|---|---|
| Windows | double-click `setup.bat` |
| macOS / Linux | `./setup.sh` |

To set up only some tools, name them: `./setup.sh pdfcraft accounting`. Solist PDF takes the longest
because it builds the whole site.

## 4. Launch

| OS | Command |
|---|---|
| Windows | double-click `launch.bat` |
| macOS | double-click `launch.command`, or run `./launch.sh` |
| Linux | `./launch.sh` |

The Hub opens at <http://localhost:9000>. Press the switch next to a tool to start it. If a tool still
needs setup, its checklist has a button for that. Closing the Hub window stops every tool.

## Running one tool on its own

Every tool folder has its own `setup` and `start` scripts (`.sh` for macOS/Linux, `.bat` for Windows):

```bash
cd accounting
./start.sh        # then open http://localhost:8092
```

## What is not in the repo

Databases, scraped results, exports, invoices, logs, `.env` files and installed packages stay on the
machine that made them. A fresh clone starts empty. To move data between machines, copy those files
over yourself:

- `map_scrapper/gmaps.db`
- `nykaa-scraper/nykaa.db`
- `nykaa_mapper/studio.db`
- `accounting/data/`
- `upi-id/data/`

## Settings

`upi-id/.env` is created from `.env.example` the first time you run setup. Edit it for real merchant
details. Never commit it.

## Troubleshooting

- **"port … is already in use"**: another program is using that port. Close it, or stop the copy of the tool that is already running.
- **Python environment missing**: run that tool's `setup` script again.
- **Linux, the scraper's browser won't start**: `sudo map_scrapper/.venv-linux/bin/python -m playwright install-deps chromium`.

`upi-id` comes from [YouPI-PG](https://github.com/youpi-pg/YouPI-PG). `accounting` comes from
[Free-GST-Billing-Software](https://github.com/IamRamgarhia/Free-GST-Billing-Software). `excalidraw` is Solist Draw, a fork of
[Excalidraw](https://github.com/excalidraw/excalidraw) at dd2f8fc3. `pdfcraft` is a
fork of PDFCraft. Each keeps its own license file.
