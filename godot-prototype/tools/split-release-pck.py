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
import shutil
import struct
import subprocess
import tempfile
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
    'assets/safety_choices/', 'assets/find_three/',
    'assets/scene_actions/', 'assets/scene_actions_extra/',
)
EMBEDDED_MAP_WEBP_QUALITY = 0.94


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
    find_three_skin = json.loads(bytes(indexed.get('data/find_three_skin.json', b'{}'))).get('levels', {})
    find_three_backgrounds = {
        f"assets/find_three/{skin['background']}.webp": id_ for id_, skin in find_three_skin.items()
    }
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
        elif engine == 'safety_choices':
            stem = PurePosixPath(original).stem
            pack = 'choices-shared' if stem in {'title', 'card', 'button', 'device_frame', 'device_student', 'device_point'} else 'choices-' + stem
        elif engine == 'find_three':
            pack = 'storybook-controls' if folder == 'ui' else find_three_backgrounds.get(original, 'find-three-shared')
        elif engine == 'scene_actions':
            pack = 'scene-actions-shared' if folder == 'shared' else folder
        elif engine == 'scene_actions_extra':
            pack = 'scene-actions-sprites' if folder == 'props' else 'scene-location-' + PurePosixPath(original).stem
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


def compact_map_imports(indexed, level_maps, godot, lossy_quality=EMBEDDED_MAP_WEBP_QUALITY, size_limit=0):
    """Reimport only embedded maps without changing the project's authored assets or defaults."""
    with tempfile.TemporaryDirectory(prefix='red-flower-map-import-') as temporary:
        project = Path(temporary)
        (project / 'project.godot').write_text(
            'config_version=5\n[application]\nconfig/name="Island Map Import"\n'
            '[rendering]\nrenderer/rendering_method="gl_compatibility"\n', encoding='utf-8')
        expected = []
        for map_ in level_maps:
            image = map_['image'].removeprefix('res://')
            map_import = image + '.import'
            targets = set(re.findall(r'"res://(\.godot/imported/[^"\n]+)"', bytes(indexed[map_import]).decode('utf-8')))
            if len(targets) != 1 or not next(iter(targets)).endswith('.ctex'):
                raise ValueError(f'Expected one imported texture for {image}')
            expected.extend(targets)
            copy = project / image
            copy.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(HERE.parent / image, copy)
            settings = (HERE.parent / map_import).read_text(encoding='utf-8')
            # A caller can explicitly limit texture dimensions for a preview.
            settings, mode = re.subn(r'^compress/mode=\d+$', 'compress/mode=1', settings, flags=re.M)
            settings, quality = re.subn(r'^compress/lossy_quality=.+$',
                                        f'compress/lossy_quality={lossy_quality}', settings, flags=re.M)
            if mode != 1 or quality != 1:
                raise ValueError(f'Missing texture import controls for {image}')
            if size_limit:
                settings, resized = re.subn(r'^process/size_limit=\d+$',
                                            f'process/size_limit={size_limit}', settings, flags=re.M)
                if resized != 1:
                    raise ValueError(f'Missing texture size limit for {image}')
            (project / map_import).write_text(settings, encoding='utf-8')
        result = subprocess.run([str(godot.resolve()), '--headless', '--path', str(project), '--import'],
                                capture_output=True, encoding='utf-8', errors='replace')
        if result.returncode or any(not (project / path).is_file() for path in expected):
            raise ValueError(f'Godot could not reimport the embedded maps:\n{result.stdout}\n{result.stderr}')
        return {path: (project / path).read_bytes() for path in expected}


def level_dependencies(indexed, level_maps, map_groups, owned, referenced):
    available = set(owned.values())
    groups_for = {}
    new_levels = json.loads(bytes(indexed.get('data/new_island_levels.json', b'{}'))).get('levels', {})
    choice_documents = {}
    action_skins = {}
    for map_ in level_maps:
        groups_for['map:' + map_['id']] = [map_groups[map_['id']]]
        for entry in map_['stops']:
            id_ = entry['id']
            addition = new_levels.get(id_)
            if not entry['was_playable'] and not addition:
                continue
            e = addition['engine'] if addition else entry['engine']
            if e == 'configured-v1':
                groups_for[id_] = sorted(({id_, 'configured-shared'} & available) | referenced[id_])
            elif e == 'scene-hunt':
                groups_for[id_] = [p for p in ('hunt-shared', id_) if p in available]
            elif e == 'safety-choices':
                document = addition['content_path'].removeprefix('res://')
                if document not in choice_documents:
                    choice_documents[document] = json.loads(bytes(indexed[document]))['levels']
                background = choice_documents[document][id_]['background'].removeprefix('res://')
                groups_for[id_] = [p for p in ('choices-shared', owned[background + '.import']) if p in available]
            elif e == 'find-three':
                groups_for[id_] = ['hunt-shared', 'storybook-controls', 'find-three-shared', id_]
            elif e == 'scene-actions':
                document = addition.get('skin_path', 'res://data/scene_actions_skin.json').removeprefix('res://')
                if document not in action_skins:
                    action_skins[document] = json.loads(bytes(indexed[document]))['levels']
                packs_ = {'storybook-controls'}
                for asset in links(action_skins[document][id_]):
                    package = owned.get(asset + '.import')
                    if package:
                        packs_.add(package)
                    elif asset + '.import' not in indexed:
                        raise ValueError(f'Missing action texture for {id_}: {asset}')
                groups_for[id_] = sorted(packs_)
            else:
                groups_for[id_] = [id_] if id_ in available else []
    missing = {pack for required in groups_for.values() for pack in required if pack not in available}
    if missing:
        raise ValueError(f'Missing level media packs: {", ".join(sorted(missing))}')
    return groups_for


def make(args):
    output = args.output.resolve()
    if output.exists():
        raise FileExistsError(output)
    original = args.pck.read_bytes()
    indexed = index(original)
    owned, referenced = groups(indexed)
    if not owned:
        raise ValueError('No shareable media in exported project')
    level_maps = json.loads(bytes(indexed['data/original_levels.json']))['maps']
    map_groups = {}
    for map_ in level_maps:
        image = map_['image'].removeprefix('res://')
        group = owned.get(image + '.import', '')
        if not group.startswith('map-'):
            raise ValueError(f"Missing map image import for {map_['id']}: {image}")
        map_groups[map_['id']] = group
    groups_for = level_dependencies(indexed, level_maps, map_groups, owned, referenced)
    embedded_maps = set(map_groups) if args.embed_maps else set(args.embed_map)
    unknown_maps = embedded_maps - map_groups.keys()
    if unknown_maps:
        raise ValueError(f'Unknown embedded maps: {", ".join(sorted(unknown_maps))}')
    embedded_levels = set(args.embed_level)
    unknown_levels = embedded_levels - {key for key in groups_for if not key.startswith('map:')}
    if unknown_levels:
        raise ValueError(f'Unknown embedded levels: {", ".join(sorted(unknown_levels))}')
    embedded_level_groups = {group for level in embedded_levels for group in groups_for[level]}
    embedded_groups = {map_groups[id_] for id_ in embedded_maps} | embedded_level_groups
    if args.map_import_godot:
        compact_imports = compact_map_imports(indexed, [map_ for map_ in level_maps if map_['id'] in embedded_maps],
                                              args.map_import_godot, args.embedded_map_webp_quality, args.embedded_map_size_limit)
    else:
        compact_imports = {}
    selections = defaultdict(dict)
    for name, data in indexed.items():
        group = owned.get(name, '')
        selections['' if group in embedded_groups else group][name] = compact_imports.get(name, data)
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
    groups_for = {key: [group for group in required if group not in embedded_groups]
                  for key, required in groups_for.items()}
    manifest = {'schemaVersion': 1, 'base_url': args.base_url, 'packs': details, 'levels': groups_for}
    core = selections['']
    core['data/asset-packs.json'] = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode('utf-8')
    core_pack = encode(core)
    report = WECHAT['validate_pck'](core_pack, allow_web_relative=args.base_url == './packs/')
    (output / 'core.pck').write_bytes(core_pack)
    report.update(original_bytes=len(original), core_bytes=len(core_pack), remote_bytes=sum(d['bytes'] for d in details.values()), packs=len(details),
                  embedded_maps=sorted(embedded_maps), embedded_levels=sorted(embedded_levels),
                  embedded_level_groups=sorted(embedded_level_groups),
                  embedded_map_size_limit=args.embedded_map_size_limit if compact_imports else None,
                  embedded_map_webp_quality=args.embedded_map_webp_quality if compact_imports else None, remote_manifest=manifest)
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k != 'remote_manifest'}, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pck', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--base-url', required=True,
                        help='Trusted HTTPS folder ending in a slash, or ./packs/ for same-origin Web hosting.')
    maps = parser.add_mutually_exclusive_group()
    maps.add_argument('--embed-maps', action='store_true', help='Bundle all island maps in the core.')
    maps.add_argument('--embed-map', action='append', default=[], help='Bundle the given island map in the core. Repeat to include more maps.')
    parser.add_argument('--embed-level', action='append', default=[], help='Bundle all media dependencies of this level. Repeat to include more levels.')
    parser.add_argument('--map-import-godot', type=Path, help='Reimport embedded maps as WebP using this Godot editor executable.')
    parser.add_argument('--embedded-map-webp-quality', type=float, default=EMBEDDED_MAP_WEBP_QUALITY,
                        help='Lossy WebP quality for reimported maps, from 0 to 1. Default: %(default)s.')
    parser.add_argument('--embedded-map-size-limit', type=int, default=0,
                        help='Maximum texture side in pixels for reimported maps. Default: 0 (preserve original setting).')
    args = parser.parse_args()
    endpoint = urlsplit(args.base_url)
    if args.base_url != './packs/' and (
        endpoint.scheme != 'https' or not endpoint.hostname or endpoint.username
        or endpoint.query or endpoint.fragment or not endpoint.path.endswith('/')
    ):
        parser.error('use an HTTPS packs directory with trailing slash, or ./packs/ for Web')
    if args.map_import_godot and not (args.embed_maps or args.embed_map):
        parser.error('--map-import-godot requires --embed-maps or --embed-map')
    if not 0 <= args.embedded_map_webp_quality <= 1:
        parser.error('--embedded-map-webp-quality must be between 0 and 1')
    if args.embedded_map_size_limit < 0:
        parser.error('--embedded-map-size-limit cannot be negative')
    if args.embedded_map_size_limit and not args.map_import_godot:
        parser.error('--embedded-map-size-limit requires --map-import-godot')
    make(args)


if __name__ == '__main__':
    main()
