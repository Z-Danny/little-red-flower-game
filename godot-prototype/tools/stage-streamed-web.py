"""Reuse Godot's stock Web runtime with a split core PCK and hashed media packs."""
import argparse
import json
from pathlib import Path
import re
from shutil import copy2, copytree

MUSIC = Path(__file__).resolve().parent.parent / 'assets/restored_ui/journey-music.mp3'
EFFECTS = MUSIC.parent.parent / 'journey_sfx'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--web', required=True, type=Path)
    parser.add_argument('--split', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    core = args.split / 'core.pck'
    shell = (args.web / 'index.html').read_text(encoding='utf-8')
    config = re.search(r'^const GODOT_CONFIG = (\{.*\});$', shell, re.M)
    if not config:
        raise ValueError('Cannot locate the Godot export configuration')
    settings = json.loads(config[1])
    settings['fileSizes']['index.pck'] = core.stat().st_size
    shell = shell[:config.start(1)] + json.dumps(settings, separators=(',', ':')) + shell[config.end(1):]
    shell = shell.replace('</head>', '<meta name="red-flower-music" content="journey-music.mp3">\n'
                          '<meta name="red-flower-sfx" content="journey-sfx/">\n</head>', 1)
    (args.output / 'index.html').write_text(shell, encoding='utf-8')
    copy2(MUSIC, args.output / 'journey-music.mp3')
    effects = args.output / 'journey-sfx'
    effects.mkdir()
    for wav in EFFECTS.glob('*.wav'):
        copy2(wav, effects / wav.name)
    copy2(core, args.output / 'index.pck')
    for file in args.web.iterdir():
        if file.is_file() and re.fullmatch(r'index\.(?:png|js|wasm|audio\.[a-z.]+\.js)', file.name):
            copy2(file, args.output / file.name)
    copytree(args.split / 'packs', args.output / 'packs')
    print(args.output.resolve())


if __name__ == '__main__':
    main()
