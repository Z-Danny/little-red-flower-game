"""Pack the source alpha > 35 test into row-aligned bits for Godot's CPU picker."""
import base64
import json
import sys
import zlib
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / 'public'


def mask(path, frame):
    with Image.open(ROOT / path) as image:
        if frame:
            x, y, w, h = (frame[k] for k in ('x', 'y', 'w', 'h'))
            if min(x, y) < 0 or min(w, h) <= 0 or x + w > image.width or y + h > image.height:
                raise ValueError(f'Invalid atlas frame: {path} {frame}')
            image = image.crop((x, y, x + w, y + h))
        if 'A' not in image.getbands() and 'transparency' not in image.info:
            return None
        alpha = image.convert('RGBA').getchannel('A')
        if alpha.getextrema()[0] > 35:
            return None
        bits = alpha.point([0] * 36 + [255] * 220, mode='1').tobytes()
        return [image.width, image.height, base64.b64encode(zlib.compress(bits, 9)).decode('ascii')]


if __name__ == '__main__':
    requests = json.load(sys.stdin)
    json.dump([mask(p, f) for p, f in requests], sys.stdout, separators=(',', ':'))
