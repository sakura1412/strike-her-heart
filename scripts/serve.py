#!/usr/bin/env python3
"""Serve only the fictional annotation demo on the local loopback interface."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit


ASSETS = Path(__file__).resolve().parents[1] / "skills" / "strike-her-heart" / "assets"


class PreviewHandler(SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404, "No directory listing")
        return None

    def translate_path(self, path):
        target = Path(super().translate_path(path)).resolve()
        if target != ASSETS and ASSETS not in target.parents:
            return str(ASSETS / ".not-a-public-resource")
        return str(target)

    def send_head(self):
        # Both GET and HEAD pass here. Check the requested path and the resolved
        # target so an ordinary-looking symlink cannot publish a hidden file.
        path = unquote(urlsplit(self.path).path)
        if any(part.startswith(".") for part in path.split("/") if part):
            self.send_error(404)
            return None
        try:
            target = Path(super().translate_path(self.path)).resolve()
            relative = target.relative_to(ASSETS.resolve())
        except (OSError, RuntimeError, ValueError):
            self.send_error(404)
            return None
        if any(part.startswith(".") for part in relative.parts):
            self.send_error(404)
            return None
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/demo.html#/leads")
            self.end_headers()
            return
        if path == "/__shh_health":
            content = json.dumps({"service": "strike-her-heart-local-preview",
                                  "version": "1.4.0", "fictionalDemo": True,
                                  "agentRuntime": "Codex"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        if any(part.startswith(".") or part == ".." for part in path.split("/") if part):
            self.send_error(404)
            return
        super().do_GET()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8768)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(PreviewHandler, directory=str(ASSETS)))
    print(f"Strike Her Heart fictional demo: http://127.0.0.1:{args.port}/demo.html#/leads", flush=True)
    print("The agent runs in Codex. This server only previews its annotation renderer.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
