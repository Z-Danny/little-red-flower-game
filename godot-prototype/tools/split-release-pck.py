"""Split Godot 4.6.2's exported PCK into trusted code/data and media-only packs.

The result serves unchanged texture/audio imports. Never put runtime scripts or
rules in a downloadable resource pack. All hashes are pinned in the core pack.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import runpy
import struct
from urllib.parse import urlsplit

HERE = Path(__file__).resolve().parent
WECHAT = runpy.run_path(str(HERE / 'assemble-wechat.py'))
HEADER = struct.Struct('<4sIIIIIQQ')
ITEM = struct.Struct('<QQ16sI')
U32 = struct.Struct('<I')
MEDIA_EXTENSIONS = {'.png', '.webp', '.jpg', '.jpeg', '.svg', '.wav', '.ogg', '.mp3', '.atlastex'}
IMPORTED_EXTENSIONS = {'.ctex', '.sample', '.oggvorbisstr', '.mp3str'}
GROUP_PREFIXES = (
    'assets/oil_fire/', 'assets/hunt_runner/', 'assets/configured_runner/',
    'assets/cpr_runner/', 'assets/disaster_runner/', 'assets/island_maps/',
)


def index(data):
    """Full input validation (including internal MD5) precedes selection."""
    WECHAT['validate_pck'](data)
    *_, base, offset = HEADER.unpack_from(data)
    count = U32.unpack_from(data, offset)[0]
    offset += U32.size
    result = {}
    buf = memoryview(data)
    for _ in range(count):
        length = U32.unpack_from(data, offset)[0]
        offset += U32.size
        name = bytes(buf[offset:offset + length]).rstrip(b'\0').decode('utf-8').removeprefix('res://')
        offset += length
        start, size, _hash, _flags = ITEM.unpack_from(data, offset)
        offset += ITEM.size
        result[name] = buf[base + start:base + start + size]
    return result


def encode(entries):
    """Godot load_resource_pack expects the same pck v3 relative offsets."""
    filebase = 112
    out = bytearray(filebase)
    records = []
    for name, data in sorted(entries.items()):
        if not data:
            start = len(out) - filebase
        else:
            out.extend(bytes((-len(out)) % 16))
            start = len(out) - filebase
            out.extend(data)
        padded = name.encode('utf-8') + b'\0'
        padded += bytes((-len(padded)) % 4)
        records.append((padded, start, len(data), hashlib.md5(data, usedforsecurity=False).digest(), 0))
    directory = len(out)
    out.extend(U32.pack(len(records)))
    for name, start, size, digest, flags in records:
        out.extend(U32.pack(len(name)))
        out.extend(name)
        out.extend(ITEM.pack(start, size, digest, flags))
    HEADER.pack_into(out, 0, b'GDPC', 3, 4, 6, 2, 2, filebase, directory)
    return out


def links(document):
    if isinstance(document, str) and document.startswith('res://'):
        yield document[6:]
    elif isinstance(document, dict):
        for value in document.values():
            yield from links(value)
    elif isinstance(document, list):
        for value in document:
            yield from links(value)


def groups(indexed):
    referenced = defaultdict(set)
    for name, data in indexed.items():
        if name.startswith('assets/configured_runner/levels/') and name.endswith('.json'):
            id_ = PurePosixPath(name).stem
            for ref in links(json.loads(bytes(data))):
                referenced[ref].add(id_)
    owned = {}
    by_level = defaultdict(set)
    for name, data in indexed.items():
        if not name.startswith(GROUP_PREFIXES) or not name.endswith('.import'):
            continue
        original = name.removesuffix('.import')
        if PurePosixPath(original).suffix not in MEDIA_EXTENSIONS:
            continue
        prefix, engine, folder, *_ = original.split('/')
        if engine == 'island_maps':
            pack = 'map-' + PurePosixPath(original).stem
        elif engine == 'oil_fire':
            pack = 'oil-fire'
        elif engine == 'cpr_runner':
            pack = 'first-aid-cpr'
        elif engine == 'disaster_runner':
            pack = folder
        elif engine == 'hunt_runner':
            pack = 'hunt-shared' if folder == 'shared' else folder
        elif engine == 'configured_runner':
            ids = referenced[original]
            pack = next(iter(ids)) if len(ids) == 1 else 'configured-shared'
            for id_ in ids:
                by_level[id_].add(pack)
        else:
            continue
        prior = owned.setdefault(name, pack)
        if prior != pack:
            raise ValueError(f'Duplicate ownership: {name}')
        imported = re.findall(r'"res://(\.godot/imported/[^"\n]+)"', bytes(data).decode('utf-8'))
        if not imported:
            raise ValueError(f'No path in imported resource: {original}')
        for asset in imported:
            if asset not in indexed or PurePosixPath(asset).suffix not in IMPORTED_EXTENSIONS:
                raise ValueError(f'Missing or non-media import target: {asset}')
            if owned.setdefault(asset, pack) != pack:
                raise ValueError(f'Media import spans incompatible groups: {asset}')
    return owned, by_level


def make(args):
    original = args.pck.read_bytes()
    indexed = index(original)
    owned, referenced = groups(indexed)
    if not owned:
        raise ValueError('No shareable media in exported project')
    selections = defaultdict(dict)
    for name, data in indexed.items():
        selections[owned.get(name, '')][name] = data
    output = args.output.resolve()
    if output.exists():
        raise FileExistsError(output)
    packs = output / 'packs'
    packs.mkdir(parents=True)
    details = {}
    for name, entries in sorted(selections.items()):
        if not name:
            continue
        packed = encode(entries)
        digest = hashlib.sha256(packed).hexdigest()
        file = f'{name}-{digest[:16]}.pck'
        (packs / file).write_bytes(packed)
        details[name] = {'file': file, 'bytes': len(packed), 'sha256': digest}
    groups_for = {}
    for map_ in json.loads(bytes(indexed['data/original_levels.json']))['maps']:
        map_name = 'map-' + map_['id']
        groups_for['map:' + map_['id']] = [map_name] if map_name in details else []
        for entry in map_['stops']:
            if not entry['was_playable']:
                continue
            id_ = entry['id']
            e = entry['engine']
            if e == 'configured-v1':
                groups_for[id_] = sorted(({id_, 'configured-shared'} & details.keys()) | referenced[id_])
            elif e == 'scene-hunt':
                groups_for[id_] = list(p for p in ('hunt-shared', id_) if p in details)
            else:
                groups_for[id_] = [id_] if id_ in details else []
    manifest = {'schemaVersion': 1, 'base_url': args.base_url, 'packs': details, 'levels': groups_for}
    core = selections['']
    core['data/asset-packs.json'] = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode('utf-8')
    core_pack = encode(core)
    report = WECHAT['validate_pck'](core_pack)
    (output / 'core.pck').write_bytes(core_pack)
    report.update(original_bytes=len(original), core_bytes=len(core_pack), remote_bytes=sum(d['bytes'] for d in details.values()), packs=len(details), remote_manifest=manifest)
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k != 'remote_manifest'}, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pck', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--base-url', required=True, help='Trusted HTTPS folder, ending in a slash.')
    args = parser.parse_args()
    endpoint = urlsplit(args.base_url)
    if endpoint.scheme != 'https' or not endpoint.hostname or endpoint.username or endpoint.query or endpoint.fragment or not endpoint.path.endswith('/'):
        parser.error('use an HTTPS origin and the exact packs directory with trailing slash')
    make(args)


if __name__ == '__main__':
    main()
