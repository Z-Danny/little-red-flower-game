"""Make a portable, editable project zip without editor caches or exports."""
import argparse
import zipfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(PROJECT):
        parser.error('put the archive outside the source project')
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(PROJECT.rglob('*')):
            relative = file.relative_to(PROJECT)
            if not file.is_file() or any(part in {'.godot', '__pycache__', 'export_credentials.cfg'} for part in relative.parts):
                continue
            archive.write(file, Path('little-red-flower-godot') / relative)
    print(f'{output} ({output.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
