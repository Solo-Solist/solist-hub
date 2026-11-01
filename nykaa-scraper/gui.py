"""Nykaa Scraper Control Panel.  Put next to crawler.py, then:  python gui.py"""
import csv, json, logging, os, queue, re, sqlite3, subprocess, sys, threading, traceback
import tkinter as tk
from datetime import datetime
from tkinter import filedialog, messagebox, scrolledtext, simpledialog, ttk

import crawler

QUEUE_FILE = "brands_queue.json"
LOG_DIR = "logs"
stop_event = threading.Event()
log_q = queue.Queue()


class StopRequested(Exception):
    pass


# Let the Stop button interrupt the crawler at its next request (no crawler.py change needed)
_orig_fetch = crawler.fetch


def _fetch(session, url, tries=4):
    if stop_event.is_set():
        raise StopRequested()
    return _orig_fetch(session, url, tries)


crawler.fetch = _fetch


class QWriter:
    def write(self, s):
        if s:
            log_q.put(s)

    def flush(self):
        pass


def open_path(p):
    p = os.path.abspath(p)
    os.makedirs(p, exist_ok=True) if not os.path.splitext(p)[1] else None
    if sys.platform.startswith("win"):
        os.startfile(p)
    elif sys.platform == "darwin":
        subprocess.Popen(["open", p])
    else:
        subprocess.Popen(["xdg-open", p])


def stats(base):
    con = sqlite3.connect(crawler.DB)
    try:
        r = con.execute("SELECT last_page, done FROM brand_progress WHERE brand_url=?", (base,)).fetchone() or (0, 0)
        n = con.execute("SELECT COUNT(*) FROM listing WHERE brand_url=?", (base,)).fetchone()[0]
        d = con.execute("SELECT COUNT(*) FROM listing l JOIN product_done p ON l.product_id=p.product_id "
                        "WHERE l.brand_url=?", (base,)).fetchone()[0]
        v = con.execute("SELECT COUNT(*) FROM variants v JOIN listing l ON v.product_id=l.product_id "
                        "WHERE l.brand_url=?", (base,)).fetchone()[0]
        return r[0], r[1], n, d, v
    finally:
        con.close()


def safe(name):
    return re.sub(r"[^\w\-]+", "_", name).strip("_") or "brand"


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Nykaa Scraper Control Panel")
        self.geometry("1150x800")
        self.running = None
        self.thread = None
        self.entries = self.load_queue()
        os.makedirs(LOG_DIR, exist_ok=True)
        self.logfile = os.path.join(LOG_DIR, f"scraper_{datetime.now():%Y%m%d}.log")
        crawler.init_db().close()
        self.build_ui()
        sys.stdout = sys.stderr = QWriter()
        h = logging.StreamHandler(QWriter())
        h.setFormatter(logging.Formatter("%(message)s"))
        logging.getLogger("scrapling").addHandler(h)
        self.refresh_table()
        self.poll()
        self.protocol("WM_DELETE_WINDOW", self.on_close)

    # ---------- UI ----------
    def build_ui(self):
        f = ttk.LabelFrame(self, text="Add brand")
        f.pack(fill="x", padx=8, pady=4)
        self.v_name, self.v_url, self.v_pages = tk.StringVar(), tk.StringVar(), tk.StringVar()
        for i, (lbl, var, w) in enumerate([("Brand name", self.v_name, 20),
                                           ("Page link", self.v_url, 62),
                                           ("Total pages", self.v_pages, 6)]):
            ttk.Label(f, text=lbl).grid(row=0, column=i * 2, padx=(8, 2), pady=6)
            ttk.Entry(f, textvariable=var, width=w).grid(row=0, column=i * 2 + 1, padx=2)
        ttk.Button(f, text="Add to queue", command=self.add_brand).grid(row=0, column=6, padx=8)

        cols = ("brand", "pages", "listing", "products", "details", "variants", "status")
        heads = ("Brand", "Total pages", "Listing pages", "Products", "Details done", "Variant rows", "Status")
        widths = (200, 90, 110, 90, 110, 100, 110)
        self.tree = ttk.Treeview(self, columns=cols, show="headings", height=8, selectmode="extended")
        for c, h, w in zip(cols, heads, widths):
            self.tree.heading(c, text=h)
            self.tree.column(c, width=w, anchor="w" if c == "brand" else "center")
        self.tree.pack(fill="x", padx=8, pady=4)

        b = ttk.Frame(self)
        b.pack(fill="x", padx=8)
        self.btns = {}
        for key, txt, cmd in [("start", "Start queue", lambda: self.start(self.entries)),
                              ("sel", "Run selected", self.run_selected),
                              ("edit", "Edit pages", self.edit_pages),
                              ("remove", "Remove from queue", self.remove),
                              ("reset", "Reset brand data", self.reset)]:
            self.btns[key] = ttk.Button(b, text=txt, command=cmd)
            self.btns[key].pack(side="left", padx=3, pady=3)
        self.btn_stop = ttk.Button(b, text="Stop", command=self.stop, state="disabled")
        self.btn_stop.pack(side="left", padx=12)

        s = ttk.LabelFrame(self, text="Settings and export")
        s.pack(fill="x", padx=8, pady=4)
        self.v_dmin, self.v_dmax = tk.StringVar(value="1.0"), tk.StringVar(value="2.0")
        self.v_out = tk.StringVar(value="exports")
        ttk.Label(s, text="Delay between requests (s):").grid(row=0, column=0, padx=6, pady=4)
        ttk.Spinbox(s, from_=0.5, to=30, increment=0.5, width=5, textvariable=self.v_dmin).grid(row=0, column=1)
        ttk.Label(s, text="to").grid(row=0, column=2, padx=4)
        ttk.Spinbox(s, from_=0.5, to=60, increment=0.5, width=5, textvariable=self.v_dmax).grid(row=0, column=3)
        ttk.Label(s, text="Export folder:").grid(row=0, column=4, padx=(20, 4))
        ttk.Entry(s, textvariable=self.v_out, width=30).grid(row=0, column=5)
        ttk.Button(s, text="Browse", command=self.browse).grid(row=0, column=6, padx=4)
        e = ttk.Frame(s)
        e.grid(row=1, column=0, columnspan=8, sticky="w", pady=4)
        for txt, cmd in [("Export selected brands (CSV)", self.export_selected),
                         ("Export everything in database", self.export_all),
                         ("Open export folder", lambda: open_path(self.v_out.get())),
                         ("Open logs folder", lambda: open_path(LOG_DIR)),
                         ("Open database folder", lambda: open_path(os.path.dirname(os.path.abspath(crawler.DB))))]:
            ttk.Button(e, text=txt, command=cmd).pack(side="left", padx=3)

        lf = ttk.LabelFrame(self, text="Live log")
        lf.pack(fill="both", expand=True, padx=8, pady=4)
        self.log = scrolledtext.ScrolledText(lf, height=14, font=("Consolas", 9), wrap="word")
        self.log.pack(fill="both", expand=True, padx=4, pady=4)
        lb = ttk.Frame(lf)
        lb.pack(fill="x")
        ttk.Button(lb, text="Clear view", command=lambda: self.log.delete("1.0", "end")).pack(side="left", padx=4)
        ttk.Button(lb, text="Save log as...", command=self.save_log).pack(side="left")
        ttk.Label(lb, text=f"Auto-saved to {self.logfile}").pack(side="left", padx=10)

    # ---------- queue management ----------
    def load_queue(self):
        try:
            with open(QUEUE_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def save_queue(self):
        with open(QUEUE_FILE, "w", encoding="utf-8") as f:
            json.dump(self.entries, f, indent=1)

    def add_brand(self):
        url = self.v_url.get().strip().split("?")[0]
        if not url.startswith("http") or "nykaa.com" not in url:
            return messagebox.showerror("Invalid link", "Paste a Nykaa brand page link.")
        if any(e["url"] == url for e in self.entries):
            return messagebox.showinfo("Already added", "This brand link is already in the queue.")
        m = re.search(r"/brands/([^/]+)/", url)
        name = self.v_name.get().strip() or (m.group(1) if m else "brand")
        pg = self.v_pages.get().strip()
        pages = int(pg) if pg.isdigit() and int(pg) > 0 else 500  # blank = keep going until pages run out
        self.entries.append({"name": name, "url": url, "pages": pages})
        self.save_queue()
        self.v_name.set(""), self.v_url.set(""), self.v_pages.set("")
        self.refresh_table()

    def selected(self):
        sel = set(self.tree.selection())
        return [e for e in self.entries if e["url"] in sel]

    def edit_pages(self):
        for e in self.selected():
            n = simpledialog.askinteger("Total pages", f"Total pages for {e['name']}:", initialvalue=e["pages"], minvalue=1)
            if n:
                e["pages"] = n
        self.save_queue()
        self.refresh_table()

    def remove(self):
        sel = self.selected()
        if sel and messagebox.askyesno("Remove", "Remove from queue? (Scraped data stays in the database.)"):
            self.entries = [e for e in self.entries if e not in sel]
            self.save_queue()
            self.refresh_table()

    def reset(self):
        sel = self.selected()
        if not sel or not messagebox.askyesno("Reset", "Delete ALL scraped data and progress for the selected brands?"):
            return
        con = sqlite3.connect(crawler.DB)
        for e in sel:
            sub = "(SELECT product_id FROM listing WHERE brand_url=?)"
            con.execute(f"DELETE FROM variants WHERE product_id IN {sub}", (e["url"],))
            con.execute(f"DELETE FROM product_done WHERE product_id IN {sub}", (e["url"],))
            con.execute("DELETE FROM listing WHERE brand_url=?", (e["url"],))
            con.execute("DELETE FROM brand_progress WHERE brand_url=?", (e["url"],))
        con.commit()
        con.close()
        self.refresh_table()

    def refresh_table(self):
        prev = set(self.tree.selection())
        self.tree.delete(*self.tree.get_children())
        for e in self.entries:
            last, done, n, d, v = stats(e["url"])
            if e["url"] == self.running:
                status = "Running"
            elif done and n and d == n:
                status = "Done"
            elif n or last:
                status = "Partial"
            else:
                status = "Pending"
            self.tree.insert("", "end", iid=e["url"], values=(e["name"], e["pages"], f"{last}/{e['pages']}",
                                                             n, f"{d}/{n}", v, status))
        keep = [i for i in prev if self.tree.exists(i)]
        if keep:
            self.tree.selection_set(keep)

    # ---------- running ----------
    def set_running_ui(self, on):
        for b in self.btns.values():
            b.config(state="disabled" if on else "normal")
        self.btn_stop.config(state="normal" if on else "disabled")

    def run_selected(self):
        self.start(self.selected())

    def start(self, entries):
        if self.thread and self.thread.is_alive():
            return
        if not entries:
            return messagebox.showinfo("Nothing to run", "Add or select at least one brand.")
        try:
            lo, hi = float(self.v_dmin.get()), float(self.v_dmax.get())
        except ValueError:
            lo, hi = 1.0, 2.0
        crawler.DELAY = (lo, max(lo, hi))
        stop_event.clear()
        self.set_running_ui(True)
        self.thread = threading.Thread(target=self.worker, args=(list(entries),), daemon=True)
        self.thread.start()

    def stop(self):
        stop_event.set()
        print("\nStop requested - finishing the current request (progress is saved)...")

    def worker(self, entries):
        con = None
        try:
            for e in entries:
                if stop_event.is_set():
                    break
                self.running = e["url"]
                print(f"\n######## {e['name']} ########")
                con = crawler.init_db()
                crawler.crawl_listings(con, e["url"], e["pages"])
                crawler.crawl_details(con, e["url"])
                n = self.write_csv([e["url"]], os.path.join(self.v_out.get(), f"nykaa_{safe(e['name'])}.csv"))
                print(f"Exported {n} variant rows for {e['name']}")
        except StopRequested:
            print("Stopped by user. Press Start again to resume where it left off.")
        except Exception:
            print("ERROR:\n" + traceback.format_exc())
        finally:
            if con:
                con.close()
            self.running = None
            self.after(0, self.on_done)

    def on_done(self):
        self.set_running_ui(False)
        self.refresh_table()
        print("\n--- idle ---")

    # ---------- export ----------
    def browse(self):
        d = filedialog.askdirectory()
        if d:
            self.v_out.set(d)

    def write_csv(self, bases, path):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        con = sqlite3.connect(crawler.DB)
        try:
            if bases:
                q = ("SELECT v.* FROM variants v JOIN listing l ON v.product_id=l.product_id "
                     f"WHERE l.brand_url IN ({','.join('?' * len(bases))})")
                cur = con.execute(q, bases)
            else:
                cur = con.execute("SELECT * FROM variants")
            n = 0
            with open(path, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f)
                w.writerow(crawler.COLS)
                for r in cur:
                    w.writerow(r)
                    n += 1
            return n
        finally:
            con.close()

    def export_selected(self):
        sel = self.selected()
        if not sel:
            return messagebox.showinfo("Select brands", "Select one or more brands in the table first.")
        name = safe(sel[0]["name"]) if len(sel) == 1 else "selected_brands"
        path = os.path.join(self.v_out.get(), f"nykaa_{name}.csv")
        n = self.write_csv([e["url"] for e in sel], path)
        print(f"Exported {n} rows -> {path}")
        messagebox.showinfo("Exported", f"{n} variant rows saved to\n{os.path.abspath(path)}")

    def export_all(self):
        path = os.path.join(self.v_out.get(), "nykaa_all_brands.csv")
        n = self.write_csv(None, path)
        print(f"Exported {n} rows -> {path}")
        messagebox.showinfo("Exported", f"{n} variant rows saved to\n{os.path.abspath(path)}")

    # ---------- log ----------
    def save_log(self):
        p = filedialog.asksaveasfilename(defaultextension=".txt", initialfile="scraper_log.txt")
        if p:
            with open(p, "w", encoding="utf-8") as f:
                f.write(self.log.get("1.0", "end"))

    def poll(self):
        chunks = []
        while True:
            try:
                chunks.append(log_q.get_nowait())
            except queue.Empty:
                break
        if chunks:
            text = "".join(chunks)
            self.log.insert("end", text)
            self.log.see("end")
            if int(self.log.index("end-1c").split(".")[0]) > 5000:
                self.log.delete("1.0", "1000.0")
            with open(self.logfile, "a", encoding="utf-8") as f:
                f.write(text)
        if self.running or chunks:
            self.refresh_table()
        self.after(1000 if self.running else 300, self.poll)

    def on_close(self):
        if self.thread and self.thread.is_alive():
            if not messagebox.askyesno("Quit", "A crawl is running. Stop it and quit? (Progress is saved.)"):
                return
            stop_event.set()
        self.destroy()


if __name__ == "__main__":
    App().mainloop()