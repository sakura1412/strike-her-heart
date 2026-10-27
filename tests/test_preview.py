"""HTTP boundary checks for the loopback-only fictional demo preview.

Uses a temporary copy of public assets, artificial private markers and a random
loopback port. No persistent server, user browser, or real private file is used.
Run: python3 -m unittest discover -s tests -p 'test_preview.py' -v
"""

from functools import partial
from html.parser import HTMLParser
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import threading
import unittest
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("strike_her_heart_preview", ROOT / "scripts" / "serve.py")
PREVIEW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREVIEW)


class ScriptSources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            source = dict(attrs).get("src")
            if source:
                self.sources.append(source)


class QuietHandler(PREVIEW.PreviewHandler):
    def log_message(self, format, *args):
        pass


class PreviewBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="shh-preview-test-")
        cls.fixture = Path(cls.temporary.name)
        cls.assets = cls.fixture / "public-assets"
        shutil.copytree(PREVIEW.ASSETS, cls.assets)
        cls.original_assets = PREVIEW.ASSETS
        PREVIEW.ASSETS = cls.assets.resolve()
        cls.private_marker = b"SHH-ARTIFICIAL-PRIVATE-FILE-52719"
        private = cls.fixture / "private"
        private.mkdir()
        (private / "task.json").write_bytes(cls.private_marker)
        (cls.fixture / "agents").mkdir()
        (cls.fixture / "agents" / "strike-her-heart.toml").write_bytes(cls.private_marker)
        (cls.fixture / ".git").mkdir()
        (cls.fixture / ".git" / "config").write_bytes(cls.private_marker)
        (cls.assets / ".private.txt").write_bytes(cls.private_marker)
        (cls.assets / ".git").mkdir()
        (cls.assets / ".git" / "config").write_bytes(cls.private_marker)
        (cls.assets / "directory").mkdir()
        (cls.assets / "directory" / "listing-marker.txt").write_bytes(cls.private_marker)
        cls.symlinks_available = True
        try:
            (cls.assets / "outside-file").symlink_to(private / "task.json")
            (cls.assets / "outside-directory").symlink_to(private, target_is_directory=True)
            (cls.assets / "hidden-alias").symlink_to(cls.assets / ".private.txt")
        except (NotImplementedError, OSError):
            cls.symlinks_available = False
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(cls.assets)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)
        PREVIEW.ASSETS = cls.original_assets
        cls.temporary.cleanup()
        if cls.thread.is_alive():
            raise AssertionError("The temporary preview server did not stop")

    def request(self, path, method="GET"):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            # http.client keeps raw ../ and percent-encoded segments intact.
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, response.headers, response.read()
        finally:
            connection.close()

    def assert_denied(self, path, method="GET"):
        status, _, content = self.request(path, method)
        self.assertIn(status, (400, 403, 404), (method, path, status))
        self.assertNotIn(self.private_marker, content, (method, path))

    def test_root_redirects_to_the_fictional_demo(self):
        status, headers, content = self.request("/")
        self.assertEqual(status, 302)
        self.assertEqual(headers["Location"], "/demo.html#/leads")
        self.assertEqual(content, b"")
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_health_reports_a_local_fictional_preview(self):
        status, headers, content = self.request("/__shh_health?probe=1")
        self.assertEqual(status, 200)
        health = json.loads(content)
        self.assertEqual(health["service"], "strike-her-heart-local-preview")
        self.assertIs(health["fictionalDemo"], True)
        self.assertTrue(health["version"])
        self.assertIn("application/json", headers["Content-Type"])
        self.assertEqual(int(headers["Content-Length"]), len(content))
        self.assertNotIn(str(self.fixture).encode(), content)

    def test_demo_and_its_actual_script_assets_load(self):
        status, headers, content = self.request("/demo.html?route=preview")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertEqual(content, (self.assets / "demo.html").read_bytes())
        sources = ScriptSources()
        sources.feed(content.decode())
        self.assertTrue(sources.sources)
        for source in sources.sources:
            with self.subTest(source=source):
                parsed = urlsplit(source)
                self.assertFalse(parsed.netloc, "The demo must not require external script hosts")
                target = "/" + parsed.path.lstrip("./")
                asset_status, asset_headers, asset_body = self.request(target)
                self.assertEqual(asset_status, 200)
                self.assertEqual(asset_body, (self.assets / parsed.path).read_bytes())
                self.assertEqual(asset_headers["X-Content-Type-Options"], "nosniff")
                self.assertEqual(asset_headers["Cache-Control"], "no-store")
                self.assertIn("javascript", asset_headers["Content-Type"])

    def test_directories_do_not_publish_a_file_listing(self):
        for directory in ("/directory/", "/extension/", "/site-adapters/"):
            for method in ("GET", "HEAD"):
                with self.subTest(directory=directory, method=method):
                    self.assert_denied(directory, method)

    def test_traversal_and_repository_sources_are_not_public(self):
        paths = (
            "/../agents/strike-her-heart.toml", "/%2e%2e/agents/strike-her-heart.toml",
            "/%2E%2E%2f.git/config", "/directory/../../.git/config",
            "/%252e%252e/agents/strike-her-heart.toml", "/agents/strike-her-heart.toml",
            "/.git/config", "/%2egit/config", "/scripts/serve.py", "/tests/test_preview.py",
            "/private/task.json",
        )
        for path in paths:
            for method in ("GET", "HEAD"):
                with self.subTest(path=path, method=method):
                    self.assert_denied(path, method)

    def test_hidden_files_are_not_public_for_get_or_head(self):
        for method in ("GET", "HEAD"):
            with self.subTest(method=method):
                self.assert_denied("/.private.txt", method)

    def test_symlinks_cannot_escape_or_publish_a_hidden_target(self):
        if not self.symlinks_available:
            self.skipTest("This platform does not permit temporary symlinks")
        for path in ("/outside-file", "/outside-directory/task.json", "/hidden-alias"):
            for method in ("GET", "HEAD"):
                with self.subTest(path=path, method=method):
                    self.assert_denied(path, method)


if __name__ == "__main__":
    unittest.main()
