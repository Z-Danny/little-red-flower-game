"""Derive the Godot UI textures from the existing web project's authored art."""
from pathlib import Path
from shutil import copyfile

from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT.parent / 'public'
DEST = PROJECT / 'assets' / 'ui'


def texture(source: str, filename: str, limit: tuple[int, int], quality: int) -> None:
    with Image.open(SOURCE / source) as image:
        image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
        image.thumbnail(limit, Image.Resampling.LANCZOS)
        image.save(DEST / filename, format='WEBP', method=6, quality=quality, exact=True)


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    texture('levels/journey-map/cover-v2/background.png', 'cover.webp', (864, 1536), 89)
    texture('levels/journey-map/cover-v2/title.png', 'cover-title.webp', (720, 720), 92)
    texture('ui/archipelago-v1/sky-background.png', 'sky.webp', (720, 1280), 89)
    texture('levels/journey-map/home-island-v2-staggered.png', 'home-map.webp', (724, 2172), 89)
    texture('levels/journey-map/flower.png', 'flower.webp', (384, 384), 92)
    for number, slug in enumerate(('campus', 'home', 'traffic', 'water', 'network', 'emergency', 'social', 'food', 'outdoor'), 1):
        texture(f'ui/archipelago-nine-v1/{number:02}-{slug}-signed.png', f'island-{slug}.webp', (640, 640), 90)
    copyfile(SOURCE / 'fonts' / 'flower-ui.woff2', DEST / 'flower-ui.woff2')
    copyfile(SOURCE / 'fonts' / 'NotoSansSC-OFL.txt', DEST / 'NotoSansSC-OFL.txt')


if __name__ == '__main__':
    main()
