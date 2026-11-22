"""Keep only decorative painted UI compact; never touch world art or hit masks."""
import argparse
from pathlib import Path
import re

PROJECT = Path(__file__).resolve().parents[1]
POLICY = ('restored_ui', 'settlement_ui')
TINY_UI = {'journal-avatar', 'journal-island-sign', 'journal-island-home', 'journal-island-public',
           'journal-island-nature', 'journal-stat-flowers'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--imported-project', type=Path, default=PROJECT,
                        help='An already imported Godot copy, if the input project has no .import files yet')
    args = parser.parse_args()
    tuned = 0
    for folder in POLICY:
        for original in sorted((PROJECT / 'assets' / folder).rglob('*.webp')):
            relative = original.relative_to(PROJECT).as_posix()
            hint = Path(str(args.imported_project / relative) + '.import')
            text = hint.read_text(encoding='utf-8')
            if f'source_file="res://{relative}"' not in text or 'importer="texture"' not in text:
                raise ValueError(f'Mismatched imported texture: {relative}')
            # Native lossily compressed WebP color, lossless alpha. Preserve the
            # original artwork bytes in the source project for future editing.
            for name, value in [('compress/mode', '1'), ('compress/lossy_quality', '0.94'),
                                ('process/size_limit', '380' if original.stem in TINY_UI else '0')]:
                text, n = re.subn(rf'^{re.escape(name)}=.*$', f'{name}={value}', text, flags=re.M)
                if n != 1:
                    raise ValueError(f'Missing or repeated import option {name}: {relative}')
            target = original.with_suffix('.webp.import')
            if not target.exists() or target.read_text(encoding='utf-8') != text:
                target.write_text(text, encoding='utf-8', newline='\n')
            tuned += 1
    print(f'Set compact painted UI imports for {tuned} original textures (game masks unchanged).')


if __name__ == '__main__':
    main()
