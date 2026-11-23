"""Refresh the project ZIP in the known WeChat-compatible 4.6.1 runtime."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import runpy
from shutil import copy2, copytree
from zipfile import ZIP_DEFLATED, ZipFile


TOOLS = Path(__file__).resolve().parent
ASSETS = TOOLS.parent / "assets"
MARKER = "data/wechat-audio.json"


def replace_once(source, before, after):
    if source.count(before) != 1:
        raise ValueError(f"Unexpected WeChat runtime revision near {before!r}")
    return source.replace(before, after, 1)


def write_project_zip(core, destination):
    parser = runpy.run_path(str(TOOLS / "split-release-pck.py"))
    entries = parser["index"](core.read_bytes())
    if MARKER in entries:
        raise ValueError("Expected a core pack shared with the Web build")
    entries[MARKER] = b'{"platform":"wechat"}\n'
    with ZipFile(destination, "w", ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in sorted(entries.items()):
            archive.writestr(name, data)
    with ZipFile(destination) as archive:
        if set(archive.namelist()) != set(entries):
            raise ValueError("WeChat resource inventory differs from core")
        for name, data in entries.items():
            if archive.read(name) != data:
                raise ValueError(f"WeChat resource differs from core: {name}")
    return len(entries)


def patch_sample_mixer(path):
    source = path.read_text(encoding="utf-8")
    # Godot PR #119027. AudioServer.add_bus() with -1 must leave
    # the new bus appended, with Master still connected to the destination.
    source = replace_once(
        source, "if(index!==newBus.getId())",
        "if(index>=0&&index!==newBus.getId())",
    )
    for channel, side in enumerate(("subLeft", "subRight")):
        source = replace_once(
            source, f"audioBuffer.copyToChannel(new Float32Array({side}),{channel},0)",
            f"audioBuffer.getChannelData({channel}).set({side})",
        )
    path.write_text(source, encoding="utf-8")


def patch_preview_dpr(out):
    adapter = out / "adapter.js"
    source = adapter.read_text(encoding="utf-8")
    # The adapter uses this value for the backing dimensions and window DPR.
    # Leave the canvas bounds and host touch events in logical pixels.
    source = replace_once(source, '''// The backing store uses host DPR for sharp rendering, and Godot maps input
// into it using the ratio of the backing size to the logical canvas bounds.''', '''// The preview caps the backing store DPR to 2. Godot maps input into it using
// the ratio of the backing size to the logical canvas bounds.''')
    source = replace_once(source,
                          "const _dpr = Number.isFinite(_reportedDpr) && _reportedDpr > 0 ? _reportedDpr : 1;",
                          "const _dpr = Math.min(2, Number.isFinite(_reportedDpr) && _reportedDpr > 0 ? _reportedDpr : 1);")
    adapter.write_text(source, encoding="utf-8")

    loader = out / "js/loader.js"
    source = loader.read_text(encoding="utf-8")
    source = replace_once(source, '''    const info = PlatformRuntime.getSystemInfo();
    const loadingDpr = Math.max(
      1,
      Number(info.pixelRatio ?? info.devicePixelRatio)
        || Number(_window.devicePixelRatio)
        || 1,
    );''', "    const loadingDpr = Number(_window.devicePixelRatio) || 1;")
    loader.write_text(source, encoding="utf-8")


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--runtime", required=True, type=Path)
    args.add_argument("--core", required=True, type=Path)
    args.add_argument("--output", required=True, type=Path)
    options = args.parse_args()
    copytree(options.runtime, options.output)
    out = options.output
    count = write_project_zip(options.core, out / "engine/godot.zip")
    patch_sample_mixer(out / "js/libs/godot.js")
    patch_preview_dpr(out)
    entrypoint = out / "game.js"
    source = entrypoint.read_text(encoding="utf-8")
    source = replace_once(source, 'import "./fetch";', '''import "./fetch";
import { installJourneyAudio } from "./js/journey_audio";
import { installSafeArea } from "./js/safe_area";
import { installPerformance } from "./js/performance";''')
    source = replace_once(source, "checkUpdate();\nconst loader", '''checkUpdate();
const gameWindow = PlatformRuntime.global.__adapter.window;
installJourneyAudio(_api, gameWindow);
installSafeArea(_api, gameWindow);
installPerformance(_api, gameWindow);
const loader''')
    entrypoint.write_text(source, encoding="utf-8")
    copy2(TOOLS / "wechat-journey-audio.js", out / "js/journey_audio.js")
    copy2(TOOLS / "wechat-safe-area.js", out / "js/safe_area.js")
    copy2(TOOLS / "wechat-performance.js", out / "js/performance.js")
    sdk = out / "js/libs/sdk.js"
    patch_userfs = runpy.run_path(str(TOOLS / "patch-wechat-userfs.py"))["patch"]
    sdk.write_text(patch_userfs(sdk.read_text(encoding="utf-8")), encoding="utf-8", newline="\n")
    audio = out / "audio/red-flower"
    audio.mkdir()
    copy2(ASSETS / "restored_ui/journey-music.mp3", audio)
    for effect in sorted((ASSETS / "journey_sfx").glob("*.wav")):
        copy2(effect, audio)

    metadata = out / ".godot-mini-game-export.json"
    template = json.loads(metadata.read_text(encoding="utf-8"))
    files = {path.relative_to(out).as_posix(): path for path in out.rglob("*")
             if path.is_file() and path != metadata}
    template["output_artifacts"] = {
        name: {"size": path.stat().st_size, "sha256": sha256(path.read_bytes()).hexdigest()}
        for name, path in sorted(files.items())
    }
    metadata.write_text(json.dumps(template, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(path.stat().st_size for path in files.values())
    main_size = metadata.stat().st_size + sum(
        path.stat().st_size for name, path in files.items() if not name.startswith(("engine/", "subpacks/"))
    )
    if main_size >= 4_000_000 or total + metadata.stat().st_size >= 30_000_000:
        raise ValueError("WeChat preview exceeds the local package budget")
    print(f"WeChat core zip verified: {count} entries; main {main_size:,} B; total {total:,} B")


if __name__ == "__main__":
    main()
