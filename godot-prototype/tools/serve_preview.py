"""Serve a Godot export over loopback, optionally behind a private HTTPS proxy."""
import argparse
import functools
import gzip
import io
import re
import shutil
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class Handler(SimpleHTTPRequestHandler):
    audio_types = {'.mp3': 'audio/mpeg', '.wav': 'audio/wav'}
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.pck': 'application/octet-stream', **audio_types}

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
        if path.suffix in self.audio_types and path.is_file() and self.headers.get('Range'):
            return self.send_audio_range(path, self.headers['Range'])
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

    def send_audio_range(self, path: Path, header: str):
        size = path.stat().st_size
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', header)
        start, end = size, size - 1
        if match and match[1]:
            start = int(match[1])
            end = min(end, int(match[2])) if match[2] else end
        elif match and match[2]:
            start = max(0, size - int(match[2]))
        if not 0 <= start <= end < size:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        with path.open('rb') as source:
            source.seek(start)
            content = source.read(end - start + 1)
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header('Content-Type', self.audio_types[path.suffix])
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        return io.BytesIO(content)


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
