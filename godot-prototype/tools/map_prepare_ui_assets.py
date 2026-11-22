"""Rebuild the compact Godot map art from the original Webb map assets.

Run with Pillow: python godot-prototype/tools/map_prepare_ui_assets.py
"""
import json
from pathlib import Path
from shutil import copyfile

from PIL import Image, ImageFilter

PROJECT = Path(__file__).resolve().parents[1]
WEB = PROJECT.parent / "public"
DEST = PROJECT / "assets" / "map_ui"


def source(path):
    with Image.open(WEB / path.lstrip("/")) as image:
        return image.convert("RGBA")


def save(image, name):
    image.save(DEST / f"map_{name}.webp", method=6, quality=93, exact=True)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for button, art in (("home", "home"), ("progress", "flower-counter"), ("settings", "settings-blue")):
        image = source(f"ui/map-corner-garden-v2/{art}.png")
        image.thumbnail((192, 192), Image.Resampling.LANCZOS)
        # Match the Webb cream outline without changing the original painted face.
        edge = Image.new("RGBA", image.size, "#f6e7c5")
        edge.putalpha(image.getchannel("A").filter(ImageFilter.MaxFilter(7)))
        save(Image.alpha_composite(edge, image), f"corner_{button}")

    skin = json.loads((PROJECT.parent / "content/journey-skin.json").read_text(encoding="utf-8"))
    for name in ("bud", "flower"):
        image = source(skin[name])
        # Discard the transparent canvas so the stem ends at the catalog point.
        left, top, right, bottom = image.getchannel("A").point(lambda a: 255 if a >= 16 else 0).getbbox()
        image = image.crop((left - 4, top - 4, right + 4, bottom + 4))
        image.thumbnail((180, 200), Image.Resampling.LANCZOS)
        save(image, name)

    signs = json.loads((PROJECT.parent / "content/journey-signs.json").read_text(encoding="utf-8"))
    # Authored nine-island maps use their ID as the theme; only home has an
    # exact match, and Webb's fallback for the other eight islands is nature.
    for name in ("home", "nature"):
        texture = signs["regions"][name]
        crop = texture["bounds"]
        x, y, w, h = (crop[key] for key in ("left", "top", "width", "height"))
        image = source(texture["image"]).crop((x, y, x + w, y + h))
        image.thumbnail((540, 160), Image.Resampling.LANCZOS)
        save(image, f"plaque_{name}")
    copyfile(WEB / signs["completedStamp"].lstrip("/"), DEST / "map_plaque_stamp.svg")
    motifs = DEST / "motifs"
    motifs.mkdir(exist_ok=True)
    for level, path in signs["motifs"].items():
        copyfile(WEB / path.lstrip("/"), motifs / f"map_{level}.svg")


if __name__ == "__main__":
    main()
