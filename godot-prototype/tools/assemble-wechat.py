#!/usr/bin/env python3
"""Assemble an offline WeChat Mini Game directory from Godot 4.6.2 data only."""

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import struct
import tempfile
from zipfile import BadZipFile, ZipFile

RELEASE = "https://github.com/godothub/godot-minigame/releases/tag/4.6.2"
TEMPLATE_NAME = "minigame4.6.2.5.tpz"
TEMPLATE_SHA256 = "577484dad9ef070dcf5a3346729fe81f8cdb723d506efb0fdd0f4a1f39f29ae7"
TEMPLATE_BYTES = 9_959_583
PACK_NAME = "engine/demo-pck.bin"  # Upstream startGame path; contains unmodified PCK bytes.
ENGINE_ROOT = "engine/"
DEMO_APPID = "wxf40904ea6120ad08"
TOURIST_APPID = "touristappid"
# Conservative decimal thresholds. The official docs specify 4M and 30M;
# DevTools' actual compiler/upload accounting is a separate check.
MAIN_LIMIT = 4_000_000
TOTAL_LIMIT = 30_000_000
TEMPLATE_FILES = (
    "game.js", "game.json", "project.config.json", "glx-config.js",
    "godot-loader.js", "weapp-adapter.js", "images/background.jpg", "images/logo.png",
    "engine/game.js", "engine/godot-sdk.js", "engine/godot.js", "engine/godot.wasm.br",
)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def json_bytes(obj):
    return (json.dumps(obj, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def read_exact(stream, size):
    data = stream.read(size)
    require(len(data) == size, "Truncated PCK or project.binary")
    return data


def read_u32(stream):
    return struct.unpack("<I", read_exact(stream, 4))[0]


def project_settings(data):
    # Read only the two String variants needed here. Other variants are opaque.
    stream = io.BytesIO(data)
    require(read_exact(stream, 4) == b"ECFG", "Invalid project.binary signature")
    settings = {}
    for _ in range(read_u32(stream)):
        key = read_exact(stream, read_u32(stream)).decode("utf-8")
        val = read_exact(stream, read_u32(stream))
        if key in ("application/run/main_scene", "rendering/renderer/rendering_method",
                   "rendering/renderer/rendering_method.web"):
            var_type, strlen = struct.unpack("<II", val[:8])
            require(var_type == 4 and strlen <= len(val) - 8, f"Invalid String setting: {key}")
            settings[key] = val[8:8 + strlen].decode("utf-8")
    require(stream.tell() == len(data), "Unexpected trailing project.binary data")
    return settings


def validate_pck(pck):
    # PCK v3 header and index layout from Godot 4.6.2 EditorExportPlatform.
    stream = io.BytesIO(pck)
    signature, pack_version, major, minor, patch, flags, filebase, directory = struct.unpack(
        "<4sIIIIIQQ", read_exact(stream, 40)
    )
    require(signature == b"GDPC", "Input is not a standalone PCK (missing GDPC signature)")
    require((pack_version, major, minor, patch) == (3, 4, 6, 2), "Expected Godot 4.6.2 PCK v3")
    require(flags == 2, "Expected plain relative offsets (no encrypted/sparse directories)")
    require(104 <= filebase <= directory <= len(pck) - 4, "Invalid PCK header offsets")
    stream.seek(directory)
    count = read_u32(stream)
    require(0 < count <= (len(pck) - stream.tell()) // 44, "Invalid PCK file count")
    entries = {}
    names = set()
    spans = []
    data = memoryview(pck)
    for _ in range(count):
        name_size = read_u32(stream)
        require(name_size >= 4 and name_size % 4 == 0, "Invalid PCK path length")
        name = read_exact(stream, name_size).rstrip(b"\0").decode("utf-8").removeprefix("res://")
        require(bool(name) and "\\" not in name and ":" not in name and "\0" not in name
                and not any(part in ("", ".", "..") for part in name.split("/")),
                f"Unsupported resource path: {name!r}")
        folded = name.casefold()
        require(folded not in names, f"Duplicate resource path: {name}")
        names.add(folded)
        require(PurePosixPath(folded).suffix not in {".gdextension", ".so", ".dll", ".dylib", ".exe", ".cs", ".wasm"},
                f"Native or non-GDScript resource is unsupported: {name}")
        relative, size, md5, file_flags = struct.unpack("<QQ16sI", read_exact(stream, 36))
        require(file_flags == 0, f"Encrypted, delta, or removed entry: {name}")
        start = filebase + relative
        end = start + size
        require(filebase <= start <= end <= directory, f"Out-of-range resource extent: {name}")
        require(hashlib.md5(data[start:end], usedforsecurity=False).digest() == md5, f"PCK entry checksum failed: {name}")
        entries[name] = (start, end)
        if size:
            spans.append((start, end))
    require(stream.tell() == len(pck), "Unexpected trailing PCK data")
    spans.sort()
    require(all(x[1] <= y[0] for x, y in zip(spans, spans[1:])), "Overlapping PCK entries")
    require("project.binary" in entries, "Expected an exported project PCK with project.binary")
    require(any(name.endswith((".gd", ".gdc")) for name in entries), "Expected a GDScript project")
    settings = project_settings(pck[slice(*entries["project.binary"])])
    renderer = settings.get("rendering/renderer/rendering_method")
    web_renderer = settings.get("rendering/renderer/rendering_method.web", renderer)
    require(renderer == web_renderer == "gl_compatibility", "Project must set Compatibility renderer for Web")
    scene = settings.get("application/run/main_scene", "")
    if scene.startswith("res://"):
        path = scene[6:]
        require(path in entries or path + ".remap" in entries, f"Main scene missing from pack: {scene}")
    else:
        require(scene.startswith("uid://") and ".godot/uid_cache.bin" in entries, "Invalid or missing main scene")
    media_host = None
    pack_manifest = entries.get("data/asset-packs.json")
    if pack_manifest:
        external = json.loads(pck[slice(*pack_manifest)])
        require(external.get("schemaVersion") == 1 and isinstance(external.get("base_url"), str)
                and external["base_url"].startswith("https://") and isinstance(external.get("packs"), dict),
                "Invalid external media manifest")
        media_host = external["base_url"]
    return {"format_version": pack_version, "engine_version": f"{major}.{minor}.{patch}",
            "file_count": count, "main_scene": scene, "renderer": renderer, "all_file_md5": "pass",
             "external_media_base_url": media_host}


def use_template(template):
    require(template.stat().st_size == TEMPLATE_BYTES, f"Unexpected size for {TEMPLATE_NAME}")
    raw = template.read_bytes()
    digest = sha256(raw)
    require(digest == TEMPLATE_SHA256, f"Template SHA-256 mismatch: {digest}")
    # Do not extract arbitrary archive paths. The pinned release's allowlist is enough.
    with ZipFile(io.BytesIO(raw)) as archive:
        return {name: archive.read(name) for name in TEMPLATE_FILES}


def replace_once(data, old, new):
    require(data.count(old) == 1, f"Expected exactly one upstream marker: {old!r}")
    return data.replace(old, new, 1)


def assemble(files, pck, args):
    game = json.loads(files["game.json"])
    packages = game["subpackages"]
    require(packages == [{"name": "engine", "root": ENGINE_ROOT}], "Expected one ordinary engine subpackage")
    game["deviceOrientation"] = args.orientation
    files["game.json"] = json_bytes(game)

    config = json.loads(files["project.config.json"])
    require(config["compileType"] == "game" and config["appid"] == DEMO_APPID, "Unexpected template project config")
    config.update(appid=args.appid, isGameTourist=args.appid == TOURIST_APPID, projectname=args.project_name)
    config["setting"].update(urlCheck=True, ignoreDevUnusedFiles=False, ignoreUploadUnusedFiles=False)
    config["packOptions"]["include"] = [{"type": "folder", "value": name} for name in ("engine", "images")]
    files["project.config.json"] = json_bytes(config)

    # Keep the released load order and paths. Strip the demo helper and the
    # production update-manager prompt from this local-only project shell.
    entry = files["engine/game.js"]
    setup, rest = entry.split(b"GODOTSDK.load_pack1 = function(path){", 1)
    require(b"const exe = '/engine/godot';" in setup and b"const pack = '/engine/demo-pck.bin';" in setup,
            "Unexpected engine startup paths")
    require(rest.endswith(b"GODOTSDK.startGame(exe, pack)"), "Unexpected engine entrypoint")
    files["engine/game.js"] = setup + b"\nGODOTSDK.startGame(exe, pack);\n"
    root = files["game.js"]
    start = root.index(b"function checkUpdate()")
    end = root.index(b"// Configuration", start)
    files["game.js"] = root[:start] + root[end:]

    # The loader owns devicePixelRatio. The SDK's iOS write throws against its getter.
    sdk = replace_once(files["engine/godot-sdk.js"],
                       b"if(B&&D&&j&&z&&!_&&console.error(",
                       b"if(B&&D&&j&&z&&!_)console.error(")
    files["engine/godot-sdk.js"] = replace_once(sdk,
                                              b"),D)window.devicePixelRatio=1;else if(T)",
                                              b");\nif(T)")
    if args.webgl2:
        files["glx-config.js"] = replace_once(files["glx-config.js"],
                                               b"__GODOT_DISABLE_WXGLX = false;", b"__GODOT_DISABLE_WXGLX = true;")
    files[PACK_NAME] = pck
    files["LICENSES.txt"] = Path(__file__).with_name("wechat-licenses.txt").read_bytes()
    return files


def document(files, pck_info, args):
    inventory = {name: {"bytes": len(data), "sha256": sha256(data)} for name, data in sorted(files.items())}
    main = sum(item["bytes"] for name, item in inventory.items() if not name.startswith(ENGINE_ROOT))
    total = sum(item["bytes"] for item in inventory.values())
    return {
        "structure": "pass",
        "template": {"name": TEMPLATE_NAME, "release": RELEASE, "sha256": TEMPLATE_SHA256, "bytes": TEMPLATE_BYTES},
        "pck": {**inventory[PACK_NAME], **pck_info},
        "main_package_size": {"status": "pass" if main <= MAIN_LIMIT else "fail", "bytes": main, "budget_bytes": MAIN_LIMIT},
        "engine_subpackage": {"kind": "ordinary", "bytes": total - main, "individual_limit": None},
        "total_package_size": {"status": "pass" if total <= TOTAL_LIMIT else "fail", "bytes": total, "budget_bytes": TOTAL_LIMIT},
        "size_basis": "Local file bytes, including metadata and licenses; not DevTools compiled package size.",
        "wechat_devtools_import": "not_run",
        "wechat_simulator": "not_run",
        "real_device": "not_run",
        "wechat_devtools_compiled_size": "not_run",
        "hosting": "required" if pck_info.get("external_media_base_url") else "not_needed",
        "wx_rendering": "force_webgl2" if args.webgl2 else "default_glx_with_webgl2_fallback",
        "files": inventory,
    }


def save_report(path, manifest):
    if path is not None:
        with path.open("xb") as out:
            out.write(json_bytes(manifest))


def run(args):
    require(args.appid == TOURIST_APPID or re.fullmatch(r"wx[0-9a-f]{16}", args.appid) is not None,
            "Use touristappid or a WeChat Mini Game AppID")
    require(args.appid != DEMO_APPID, "Do not use the template owner's AppID")
    require(1 <= len(args.project_name.strip()) <= 80, "Provide a project name of 1–80 characters")
    output = args.output.resolve()
    report = args.report.resolve() if args.report is not None else None
    require(not output.exists() and not args.output.is_symlink(), f"Output must be a new directory: {output}")
    if report is not None:
        require(not report.is_relative_to(output), "Keep the report outside the mini-game directory")
        require(not report.exists() and not args.report.is_symlink(), f"Report must be a new file: {report}")
        require(report.parent.is_dir(), f"Create the report parent first: {report.parent}")
    files = use_template(args.template)
    require(args.pck.stat().st_size <= TOTAL_LIMIT, "PCK alone exceeds the complete local code package budget")
    pck = args.pck.read_bytes()
    pck_info = validate_pck(pck)
    files = assemble(files, pck, args)
    manifest = document(files, pck_info, args)
    if any(manifest[key]["status"] != "pass" for key in ("main_package_size", "total_package_size")):
        manifest["project_output_written"] = False
        save_report(report, manifest)
        raise ValueError(f"Local size budget failed: main={manifest['main_package_size']['bytes']} B, "
                         f"total={manifest['total_package_size']['bytes']} B; no game directory written")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".wechat-build-", dir=output.parent) as tmp:
        stage = Path(tmp) / "project"
        for name, data in files.items():
            dest = stage / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            require(sha256(dest.read_bytes()) == manifest["files"][name]["sha256"], f"Write error: {name}")
        require(not output.exists(), f"Output exists: {output}")
        stage.rename(output)
    manifest["project_output_written"] = True
    save_report(report, manifest)
    print(json_bytes(manifest).decode("utf-8"), end="")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=Path, required=True, help=f"pinned release ZIP: {TEMPLATE_NAME}")
    parser.add_argument("--pck", type=Path, required=True, help="unencrypted Godot 4.6.2 Web preset PCK")
    parser.add_argument("--output", type=Path, required=True, help="new directory to import into DevTools")
    parser.add_argument("--report", type=Path, help="write JSON inventory and checks outside the game directory")
    parser.add_argument("--project-name", default="Godot Prototype")
    parser.add_argument("--appid", default=TOURIST_APPID, help="local tourist placeholder by default; never the template sample AppID")
    parser.add_argument("--orientation", choices=("portrait", "landscape"), default="portrait")
    parser.add_argument("--webgl2", action="store_true", help="disable GLX for compatibility diagnosis; still requires WebGL2")
    try:
        run(parser.parse_args())
    except (OSError, EOFError, ValueError, BadZipFile, KeyError, struct.error) as error:
        parser.exit(1, f"assemble-wechat: {error}\n")


if __name__ == "__main__":
    main()
