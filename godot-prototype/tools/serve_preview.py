"""Serve a Godot export over loopback, optionally behind a private HTTPS proxy."""
import argparse
import functools
import gzip
import shutil
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.pck': 'application/octet-stream'}

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        if urlsplit(self.path).path == '/favicon.ico':
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return None
        path = Path(self.translate_path(self.path))
        zipped = path.with_name(path.name + '.gz')
        encodings = {item.strip() for item in self.headers.get('Accept-Encoding', '').lower().split(',')}
        if path.suffix == '.wasm' and 'gzip' in encodings and path.is_file() and zipped.is_file():
            if zipped.stat().st_mtime_ns >= path.stat().st_mtime_ns:
                stream = zipped.open('rb')
                self.send_response(HTTPStatus.OK)
                self.send_header('Content-Type', 'application/wasm')
                self.send_header('Content-Encoding', 'gzip')
                self.send_header('Vary', 'Accept-Encoding')
                self.send_header('Content-Length', str(zipped.stat().st_size))
                self.end_headers()
                return stream
        return super().send_head()


def gzip_wasm(root: Path) -> None:
    for wasm in root.glob('*.wasm'):
        zipped = wasm.with_name(wasm.name + '.gz')
        if zipped.is_file() and zipped.stat().st_mtime_ns >= wasm.stat().st_mtime_ns:
            continue
        pending = zipped.with_suffix('.gz.tmp')
        with wasm.open('rb') as src, gzip.open(pending, 'wb', compresslevel=6) as dest:
            shutil.copyfileobj(src, dest)
        pending.replace(zipped)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8088)
    args = parser.parse_args()
    root = args.directory.resolve(strict=True)
    if not (root / 'index.html').is_file():
        parser.error('expected an exported index.html')
    gzip_wasm(root)
    handler = functools.partial(Handler, directory=str(root))
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(f'http://127.0.0.1:{args.port}/', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
