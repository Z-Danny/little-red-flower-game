"""Create lightweight map backdrops; authored marker positions keep the original coordinate system."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, default=PROJECT.parent)
    args = parser.parse_args()
    data = json.loads((PROJECT / 'data/original_levels.json').read_text(encoding='utf-8'))
    folder = PROJECT / 'assets/island_maps'
    folder.mkdir(parents=True, exist_ok=True)
    for item in data['maps']:
        source = args.repo / 'public' / item['source_image'].lstrip('/')
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if digest != item['source_sha256']:
            raise RuntimeError(f'Authored map changed: {source}')
        with Image.open(source) as image:
            if image.size != (item['width'], item['height']):
                raise ValueError(f'Invalid authored size: {source}')
            image.convert('RGB').save(folder / (item['id'] + '.webp'), format='WEBP', quality=87, method=6)
    print(f'Prepared {len(data["maps"])} authored backdrops without changing level positions')


if __name__ == '__main__':
    main()
