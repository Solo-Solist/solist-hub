"""Serves a built static web app (for example pdfcraft/out) for Solist Hub.

    python static_server.py <folder> <port>

Follows the app's own nginx.conf: clean URLs (/x -> x.html or x/index.html), locale-prefixed
worker paths, the right types for WebAssembly, and the cross-origin isolation headers its
LibreOffice converter needs. It sends no X-Frame-Options, so the Hub can show it in a tab.
Standard library only.
"""
import mimetypes
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(sys.argv[1]).resolve()
PORT = int(sys.argv[2])

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/json", ".json")
TYPES = {"soffice.wasm.bin": "application/wasm", "soffice.data.bin": "application/octet-stream"}
LOCALE_ASSET = re.compile(r"^/[A-Za-z-]+/(workers|pymupdf-wasm)/(.+)$")


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if args and str(args[1])[:1] in "45":            # only log failures
            sys.stdout.write(f"{self.command} {self.path} -> {args[1]}\n")
            sys.stdout.flush()

    def resolve(self):
        path = unquote(urlparse(self.path).path)
        m = LOCALE_ASSET.match(path)
        if m:
            path = f"/{m.group(1)}/{m.group(2)}"
        target = (ROOT / path.lstrip("/")).resolve()
        if ROOT not in target.parents and target != ROOT:
            return None
        for candidate in (target, target.with_name(target.name + ".html"), target / "index.html"):
            if candidate.is_file():
                return candidate
        return None

    def send_file(self, head_only=False):
        file = self.resolve()
        if file is None:
            missing = ROOT / "404.html"
            body = missing.read_bytes() if missing.is_file() else b"Not found"
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.common()
            self.end_headers()
            if not head_only:
                self.wfile.write(body)
            return
        # A directory URL without its slash: redirect like nginx, so relative links work.
        url = urlparse(self.path)
        if file.name == "index.html" and not url.path.endswith("/") and not url.path.endswith("index.html"):
            self.send_response(301)
            self.send_header("Location", url.path + "/" + (f"?{url.query}" if url.query else ""))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        ctype = TYPES.get(file.name) or mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        gz = file.suffix == ".gz" and file.parent.name == "libreoffice-wasm"
        if gz:
            ctype = TYPES.get(file.name[:-3], "application/octet-stream")
        data = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") else ""))
        if gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(data)))
        immutable = "/_next/static/" in url.path or "libreoffice-wasm" in url.path
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if immutable else "no-cache")
        self.common()
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def common(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")

    def handle(self):
        try:
            super().handle()
        except ConnectionError:                            # the browser cancelled a request: harmless
            pass

    def do_GET(self):
        self.send_file()

    def do_HEAD(self):
        self.send_file(head_only=True)


if __name__ == "__main__":
    if not (ROOT / "index.html").is_file():
        sys.exit(f"No built site in {ROOT}. Build it first.")
    print(f"Serving {ROOT} at http://localhost:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
