"""Build local OFL fonts: python scripts/subset-ui-fonts.py /path/to/originals.

Requires fonttools and brotli. Originals: WenKai.ttf, NotoSansSC.ttf and the
two OFL files. The game and offline exporter do not need Python or networking.
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
originals = Path(sys.argv[1])
output = root / 'public/fonts'
output.mkdir(parents=True, exist_ok=True)
characters = set(range(0x20, 0x7f)) | set(range(0x2000, 0x2070)) | set(range(0x3000, 0x3040)) | set(range(0xff00, 0xfff0))
# Include GB2312's common Chinese inventory so changing level names rarely
# needs a rebuild. Also retain every Chinese character currently in the UI.
for lead in range(0xa1, 0xf8):
    for tail in range(0xa1, 0xff):
        try:
            characters.update(map(ord, bytes([lead, tail]).decode('gb2312')))
        except UnicodeDecodeError:
            pass
for directory in ['app', 'components', 'content']:
    for file in (root / directory).rglob('*'):
        if file.suffix in {'.tsx', '.ts', '.json'}:
            characters.update(ord(c) for c in file.read_text('utf-8') if 0x3400 <= ord(c) <= 0x9fff)
manifest = {'coverage': 'GB2312 + current UI Chinese + ASCII and punctuation', 'fonts': []}
for original, filename, family, source, license_file in [
    ('WenKai.ttf', 'flower-display.woff2', 'Flower Display', 'https://github.com/lxgw/LxgwWenKai-Screen/releases/tag/v1.522', 'WenKai-OFL.txt'),
    ('NotoSansSC.ttf', 'flower-ui.woff2', 'Flower UI', 'https://github.com/google/fonts/tree/main/ofl/notosanssc', 'NotoSansSC-OFL.txt'),
]:
    font = TTFont(originals / original)
    options = subset.Options()
    options.flavor = 'woff2'
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.name_legacy = True
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=characters)
    sub.subset(font)
    # Derived font families have their own names; retain copyright/license.
    for record in font['name'].names:
        names = {1: family, 2: 'Regular', 3: family + ' subset 1', 4: family,
                 6: family.replace(' ', '') + '-Regular', 16: family, 17: 'Regular'}
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    font.flavor = 'woff2'
    target = output / filename
    font.save(target)
    shutil.copyfile(originals / license_file, output / license_file)
    manifest['fonts'].append({'file': filename, 'family': family, 'source': source,
        'license': license_file, 'sourceSha256': hashlib.sha256((originals / original).read_bytes()).hexdigest(),
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'bytes': target.stat().st_size,
        'codepoints': len(font.getBestCmap())})
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', 'utf-8')
print(json.dumps(manifest, ensure_ascii=False, indent=2))
