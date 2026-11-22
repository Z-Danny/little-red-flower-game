"""Copy originally shipped, repository-owned journey art into the Godot project."""
import hashlib
import json
from pathlib import Path
from shutil import copyfile

from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parent
DEST = PROJECT / 'assets' / 'restored_ui'

ART = {
    'title-primary.webp': 'public/levels/journey-map/cover-v2/button-primary.png',
    'title-secondary.webp': 'public/levels/journey-map/cover-v2/button-secondary.png',
    'settings-panel.webp': 'public/ui/painted-settings-v1/panel.png',
    'entry-panel.webp': 'public/ui/painted-v1/modal-panel-v2.webp',
    'entry-button.webp': 'public/ui/painted-v1/modal-button-v2.webp',
    'hud-back.webp': 'public/ui/painted-v1/back.webp',
    'hud-hint.webp': 'public/ui/painted-v1/hint.webp',
    'hud-pause.webp': 'public/ui/painted-v1/pause.webp',
    'journey-music.mp3': 'public/audio/journey-v1/busy-rescue-loop.mp3',
    'button-cue.wav': 'art-source/settlement-audio-v1/approved/03-button-a-warm.wav',
    'level-introductions.json': 'content/level-introductions.json',
}
for name in ('frame-header', 'frame-body', 'frame-footer', 'avatar', 'stat-flowers', 'island-sign', 'island-home', 'island-public', 'island-nature'):
    ART['journal-' + name + '.webp'] = 'public/ui/painted-journal-v1/' + name + '.webp'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    record = {}
    for name, path in ART.items():
        source, target = ROOT / path, DEST / name
        if source.suffix == '.png' and target.suffix == '.webp':
            with Image.open(source) as image:
                image = image.convert('RGBA')
                if name.startswith('title-'):
                    # The Web home button uses the painted border itself as its
                    # frame, no huge padded canvas around the hitbox.
                    image = image.crop(image.getbbox(alpha_only=True))
                image.thumbnail((800, 1100), Image.Resampling.LANCZOS)
                image.save(target, format='WEBP', quality=94, method=6, exact=True)
        else:
            copyfile(source, target)
        record[name] = {'source': path, 'sourceSha256': sha(source), 'godotSha256': sha(target)}
    (DEST / 'sources.json').write_text(json.dumps(record, indent=2, sort_keys=True) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
