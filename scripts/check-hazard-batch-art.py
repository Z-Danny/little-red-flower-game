"""Read-only structural/pixel QA for a compiled five-target batch pack.
Usage: python scripts/check-hazard-batch-art.py art-source/hazard-batch-v2/H06/production.json
Does NOT certify semantic accuracy, visual appeal, audibility or browser play.
"""
from __future__ import annotations
import argparse
import importlib.util
import json
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_dilation

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.util.spec_from_file_location("hazard_asset_compiler", Path(__file__).with_name("prepare-hazard-batch.py"))
compiler = importlib.util.module_from_spec(loader)
loader.loader.exec_module(compiler)
require = compiler.require


def check_pack(spec_file):
    spec_path = compiler.scoped(spec_file)
    spec = compiler.read_json(spec_path)
    src = spec_path.parent
    # Unlike compile, read-only QA is permitted for an approved pack.
    out = compiler.scoped(spec["output"])
    skin_path = compiler.scoped(spec["skin"])
    count = len(spec["targets"])
    generic = spec.get("pipelineVersion") == 3
    require((3 <= count <= 6 if generic else count == 5) and len({t["id"] for t in spec["targets"]}) == count, "Need unique targets")
    expected_colors = {tuple(t["color"]) for t in spec["targets"]}
    require(expected_colors.issubset(compiler.DEFAULT_COLORS | {(0,255,255)}) if generic else expected_colors == compiler.DEFAULT_COLORS, "Unexpected target colors")
    skin = compiler.read_json(skin_path)
    report = compiler.read_json(src / "processing.json")
    require(report["id"] == spec["id"] and report["authorId"] == spec["authorId"], "Report identity mismatch")
    source_hash = compiler.sha(src / "scene-original.png")
    require(source_hash == str(spec["sourceSha256"]).lower() == report["sourceSha256"], "Mother SHA mismatch")
    require(report["specSha256"] == compiler.sha(spec_path), "Spec changed after compile")
    for name, digest in report["inputHashes"].items():
        require(compiler.sha(src / name) == digest, "Derived input changed: " + name)
    require((skin["width"], skin["height"]) == (720, 1280), "World dimensions")
    size = (720, 1280)

    def read_asset(key, mode="RGBA"):
        path = (ROOT / "public" / skin[key].lstrip("/")).resolve()
        require(path.is_relative_to(out) and path.is_file(), "Asset not in this output: " + key)
        return Image.open(path).convert(mode)

    scene, clean, ending, id_image = [read_asset(k) for k in ("scene", "clean", "safe", "mask")]
    object_image = Image.open(out / "object-mask.png").convert("RGBA")
    require(all(image.size == size for image in (scene, clean, ending, id_image, object_image)), "Whole-image size mismatch")
    original = Image.open(src / "scene-original.png").convert("RGB").resize(size, Image.Resampling.LANCZOS)
    a, b, ids, obj = [np.asarray(image) for image in (scene, clean, id_image, object_image)]
    require(np.array_equal(a[:, :, :3], np.asarray(original)), "Compiled scene differs from normalized mother")
    require(not np.array_equal(a, np.asarray(ending)), "Ending is identical to original")
    for mask in (ids, obj):
        require(np.all(mask[:, :, 3] == 255), "ID/object masks must be opaque")
        unique = set(map(tuple, np.unique(mask[:, :, :3].reshape(-1, 3), axis=0)))
        require(unique == expected_colors | {(0, 0, 0)}, "Mask must contain black plus exactly five RGB colors")
    require(set(skin["targets"]) == {t["id"] for t in spec["targets"]}, "Skin IDs differ from spec")
    union, hit_union = np.any(obj[:, :, :3] != 0, axis=2), np.any(ids[:, :, :3] != 0, axis=2)
    protected = binary_dilation(union, iterations=3)
    samples = compiler.read_json(src / "hit-samples.json")
    require(samples == compiler.read_json(out / "hit-samples.json"), "Source/runtime samples diverge")
    require(set(samples["targets"]) == set(skin["targets"]), "Sample count mismatch")
    per_target = {}
    raw = np.asarray(Image.open(src / "mask-candidate.png").convert("RGB").resize(size, Image.Resampling.NEAREST))
    distances = np.stack([np.max(np.abs(raw.astype(np.int16) - np.array(t["color"])), axis=2)
                          for t in spec["targets"]], axis=2)
    nearest, best = np.argmin(distances, axis=2), np.min(distances, axis=2)
    for index, target in enumerate(spec["targets"]):
        name, color = target["id"], target["color"]
        region = np.all(obj[:, :, :3] == color, axis=2)
        hit = np.all(ids[:, :, :3] == color, axis=2)
        require(int(region.sum()) > 500 and np.all(hit[region]), "Missing target/object pixels: " + name)
        require(np.array_equal(a[region], b[region]), "Inpaint changed target: " + name)
        box = compiler.bounds(region)
        require(skin["targets"][name]["bounds"] == box, "Bounds not derived from entity pixels")
        rectangle = region[box["y"]:box["y"]+box["h"], box["x"]:box["x"]+box["w"]]
        require(not rectangle.all(), "Rectangular hotspot: " + name)
        conf = spec.get("corrections", {}).get("targets", {}).get(name, {})
        expected_entity = compiler.corrected((nearest == index) & (best < 75), conf, size, name)
        require(np.array_equal(region, expected_entity), "Entity differs from reviewed candidate corrections: " + name)
        expected_hit = region | compiler.polygons(conf.get("hitFillPolygons"), size)
        require(np.array_equal(hit, expected_hit), "Hit shape contains unapproved expansion: " + name)
        icon_path = (ROOT / "public" / skin["targets"][name]["icon"].lstrip("/")).resolve()
        require(icon_path.is_relative_to(out), "Icon path outside new pack")
        icon = Image.open(icon_path).convert("RGBA")
        expected_icon = compiler.icon_from(original, region, box)
        require(icon.size == expected_icon.size and np.array_equal(np.asarray(icon), np.asarray(expected_icon)),
                "Icon not mechanically extracted from original: " + name)
        alpha = np.asarray(icon)[:, :, 3]
        require(alpha.min() == 0 and alpha.max() == 255 and np.any(alpha > 0), "Icon lacks real alpha")
        x, y = samples["targets"][name]
        require(isinstance(x, int) and isinstance(y, int) and 0 <= x < 720 and 0 <= y < 1280,
                "Sample outside world")
        require(region[y, x], "Sample is not on actual visible entity")
        expected_point, radius = compiler.interior_point(region)
        require([x, y] == expected_point, "Sample is not actual maximum interior distance")
        per_target[name] = {"objectPixels": int(region.sum()), "hitPixels": int(hit.sum()),
                            "interiorPoint": [x, y], "interiorRadius": radius, "iconSourcePixelsVerified": True}
    family = read_asset("family")
    family_box = skin["familyBox"]
    require(family.size == (family_box["w"], family_box["h"]), "Family crop dimensions")
    fa = np.asarray(family)
    require(fa[:, :, 3].min() == 0 and fa[:, :, 3].max() == 255, "Family lacks true transparency")
    x, y, w, h = (family_box[key] for key in ("x", "y", "w", "h"))
    require(0 <= x and 0 <= y and x + w <= 720 and y + h <= 1280, "Family box outside world")
    visible = fa[:, :, 3] > 0
    require(np.array_equal(fa[:, :, :3][visible], a[y:y+h, x:x+w, :3][visible]), "Family RGB not from original")
    family_region = np.zeros((1280, 720), bool)
    family_region[y:y+h, x:x+w] = visible
    require(not (family_region & protected).any(), "Family overlaps protected targets")

    def proof_mask(name):
        image = Image.open(src / "proof" / name).convert("L")
        require(image.size == size, "Proof mask dimensions")
        return np.asarray(image)

    repair, allowed = proof_mask("repair-mask.png"), proof_mask("repair-allowed.png") > 0
    require(set(np.unique(proof_mask("repair-allowed.png"))).issubset({0, 255}), "Repair allowed not binary")
    require(not ((repair > 0) & ~allowed).any(), "Repair extends beyond approved silhouette area")
    require(not (allowed & protected).any(), "Repair overlaps target protection")
    require(np.array_equal(a[repair == 0], b[repair == 0]), "Non-repair pixels changed")
    require(np.array_equal(a[protected], b[protected]), "Protected pixels changed")
    require(np.array_equal(proof_mask("target-protection.png") > 0, protected), "Protection proof mismatch")
    require(np.array_equal(proof_mask("family-alpha.png") > 0, family_region), "Family proof mismatch")
    white = compiler.corrected(np.min(raw, axis=2) > 180, spec.get("corrections", {}).get("characters"),
                               size, "characters") & ~protected
    character_excluded = compiler.polygons(spec.get("corrections", {}).get("characters", {}).get("excludePolygons"), size)
    require(not (family_region & character_excluded).any(), "Family includes excluded foreground/static pixels")
    maximum_repair = binary_dilation(family_region | white, iterations=10) & ~protected & ~character_excluded
    require(not (allowed & ~maximum_repair).any(), "Repair exceeds silhouette + 10px boundary")
    # Reconstruct base from exact candidate and repair alpha, not just report booleans.
    plate = Image.open(src / "clean-candidate.png").convert("RGB").resize(size, Image.Resampling.LANCZOS)
    expected_base = Image.composite(plate, original, Image.fromarray(repair, "L"))
    require(np.array_equal(b[:, :, :3], np.asarray(expected_base)), "Clean base not bounded candidate composite")
    effects = skin["effects"]
    expected_character_allow = binary_dilation(family_region, iterations=15) & ~protected & ~character_excluded

    def effect_mask(key, filename=None):
        path = ((ROOT / "public" / effects[key].lstrip("/")).resolve()
                if key in effects else (out / filename).resolve())
        require(path.is_relative_to(out), "Effect mask outside this pack")
        image = Image.open(path).convert("L")
        require(image.size == size, "Effect mask dimensions")
        pixels = np.asarray(image)
        require(set(np.unique(pixels)).issubset({0, 255}), "Effect mask not black/white")
        return pixels > 0

    character_allow = effect_mask("characterMask")
    require(np.array_equal(character_allow, expected_character_allow), "Character allowance not alpha + 15px minus targets")
    require(not (character_allow & protected).any(), "Character motion allowance overlaps targets")
    effect_counts = {}
    registered_keys = {"characterMask"}
    for name in compiler.MASK_NAMES:
        has_permission = bool(spec.get("effects", {}).get(name + "Polygons"))
        require((name + "Mask" in effects) == has_permission,
                "Skin must register only approved nonempty polygon effects: " + name)
        if has_permission:
            registered_keys.add(name + "Mask")
        mask = effect_mask(name + "Mask", name + "-mask.png")
        expected = compiler.polygons(spec.get("effects", {}).get(name + "Polygons"), size)
        expected &= ~binary_dilation(hit_union, iterations=3) & ~character_allow
        require(np.array_equal(mask, expected), "Effect mask not from approved polygons: " + name)
        require(not (mask & (hit_union | character_allow)).any(), "Effect overlaps target/person: " + name)
        require(not has_permission or mask.any(), "Registered effect is entirely masked out")
        effect_counts[name] = int(mask.sum())
    if spec.get("effects", {}).get("fireSources"):
        registered_keys.update(("fireSources", "smokeDrift"))
        require(effects.get("fireSources") == spec["effects"]["fireSources"], "Fire sources changed")
        require(effects.get("smokeDrift") == spec["effects"].get("smokeDrift", 1), "Smoke direction changed")
        require("fireMask" in effects and "smokeMask" in effects, "Fire sources lack permitted masks")
    else:
        require(not ({"fireSources", "smokeDrift", "fireMask", "smokeMask"} & set(effects)),
                "Non-fire skin must not register any fire/smoke settings")
    require(set(effects) == registered_keys, "Unapproved effect keys in skin")
    x, y = samples["background"]
    require(not hit_union[y, x] and not character_allow[y, x], "Background sample hits target or people")
    for entry in report["files"]:
        path = (out / entry["path"]).resolve()
        require(path.is_relative_to(out) and compiler.sha(path) == entry["sha256"], "Output hash mismatch")
    owner = compiler.read_json(out / ".compiler-owner.json")
    require(owner["skinSha256"] == compiler.sha(skin_path), "Skin hash mismatch")
    return {"id": spec["id"], "authorId": spec["authorId"], "world": [720, 1280], "targets": per_target,
            "status": "pixel_structure_pass", "exactRgbMasks": True, "sameSourceAlpha": True,
            "protectedPixelsUnchanged": True, "outsideRepairUnchanged": True,
            "effectMasksExcludeTargetsAndCharacters": True, "effectPixels": effect_counts,
            "notTested": ["semantic correctness of generated objects", "image registration by visual anchors",
                          "phone visual recognizability", "browser interactions", "audio listening",
                          "file/HTTP offline flow"]}


def self_test(generic_count=None):
    """Generated geometric fixtures in an isolated temporary repo; NEVER real level art."""
    global ROOT
    real_root, real_compiler_root = ROOT, compiler.ROOT
    try:
        with tempfile.TemporaryDirectory(prefix="hazard-compiler-selftest-") as temporary:
            ROOT = Path(temporary).resolve()
            compiler.ROOT = ROOT
            src = ROOT / "art-source" / "hazard-batch-v2" / "H99"
            if generic_count:
                src = ROOT / "art-source" / "hunts" / "test-only-h99" / "watercolor"
            src.mkdir(parents=True)
            size = (720, 1280)
            scene = Image.new("RGB", size, (205, 193, 166))
            mask = Image.new("RGB", size, (0, 0, 0))
            drawing, mask_drawing = ImageDraw.Draw(scene), ImageDraw.Draw(mask)
            colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255)]
            boxes = [(80, 220, 210, 300), (350, 220, 470, 340), (90, 470, 220, 590),
                     (400, 450, 540, 570), (140, 800, 300, 970)]
            if generic_count:
                colors = (colors + [(0,255,255)])[:generic_count]
                boxes = (boxes + [(340,650,450,760)])[:generic_count]
            for index, (color, box) in enumerate(zip(colors, boxes)):
                drawing.ellipse(box, fill=(50 + 20 * index, 90 + 12 * index, 95))
                mask_drawing.ellipse(box, fill=color)
            clean = scene.copy()
            drawing.ellipse((460, 850, 560, 1050), fill=(149, 68, 48))
            mask_drawing.ellipse((460, 850, 560, 1050), fill=(255, 255, 255))
            end = clean.copy()
            ImageDraw.Draw(end).ellipse((460, 850, 560, 1050), fill=(125, 108, 78))
            for filename, image in (("scene-original.png", scene), ("mask-candidate.png", mask),
                                    ("clean-candidate.png", clean), ("ending.png", end)):
                image.save(src / filename)
            spec = {"id": "test-only-h99", "authorId": "H99", "sourceSha256": compiler.sha(src / "scene-original.png"),
                    "world": [720, 1280], "output": "public/levels/hazard-batch-v2/test-only-h99",
                    "skin": "content/scenes/test-only-h99/skin.json",
                    "targets": [{"id": "target_" + str(i), "color": color} for i, color in enumerate(colors)],
                    "effects": {"weatherPolygons": [[[20, 180], [700, 180], [700, 1120], [20, 1120]]],
                                "skyPolygons": [[[20, 180], [700, 180], [700, 360], [20, 360]]], "smokeDrift": -1}}
            if generic_count:
                spec.update({"pipelineVersion":3,"skinName":"watercolor",
                             "output":"public/levels/hunts/test-only-h99/watercolor",
                             "skin":"content/scenes/test-only-h99/skins/watercolor.json",
                             "criticalRegions":[{"x":470,"y":880,"w":70,"h":70}]})
                compiler.write_json(ROOT / spec["skin"], {"draft":"synthetic fixture"})
                spec["draftSkinSha256"] = compiler.sha(ROOT / spec["skin"])
            compiler.write_json(src / "production.json", spec)
            relative = "art-source/hazard-batch-v2/H99/production.json"
            if generic_count:
                relative = "art-source/hunts/test-only-h99/watercolor/production.json"
            compiler.compile_pack(relative)
            first = check_pack(relative)
            first_skin = compiler.read_json(ROOT / spec["skin"])
            require(set(first_skin["effects"]) == {"characterMask", "weatherMask", "skyMask"},
                    "Rain skin registered unapproved fire/empty masks")
            try:
                compiler.compile_pack(relative)
                raise AssertionError("Existing draft unexpectedly overwritten")
            except ValueError as exc:
                require("--refresh" in str(exc), "Unexpected guard error")
            # The same source may have its approved draft effects refined to indoor.
            spec["effects"] = {}
            compiler.write_json(src / "production.json", spec)
            compiler.compile_pack(relative, refresh=True)
            second = check_pack(relative)
            second_skin = compiler.read_json(ROOT / spec["skin"])
            require(set(second_skin["effects"]) == {"characterMask"}, "Indoor skin registered weather/fire")
            require(len(list((src / "compiled-history").glob("*/assets"))) == 1, "Refresh did not preserve draft")
            out = ROOT / spec["output"]
            (out / "APPROVED.lock").write_text("self-test only", encoding="utf-8")
            try:
                compiler.compile_pack(relative, refresh=True)
                raise AssertionError("Approved output unexpectedly overwritten")
            except ValueError as exc:
                require("lock" in str(exc).lower(), "Unexpected lock guard error")
            # A lock must not block read-only QA.
            check_pack(relative)
            return {"status": "synthetic_self_test_pass", "targets": len(first["targets"]),
                    "pixelQaBeforeAndAfterRefresh": second["status"], "draftBackupVerified": True,
                    "rainAndIndoorPermissionKeys": True,
                    "overwriteAndApprovalGuards": True, "realGameArtTested": False,
                    "fixtureLocation": "isolated temporary directory, removed after test"}
    finally:
        ROOT, compiler.ROOT = real_root, real_compiler_root


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", nargs="?")
    parser.add_argument("--self-test", action="store_true", help="Run isolated synthetic fixtures, not game art")
    parser.add_argument("--self-test-v3", action="store_true", help="Verify independent skins with 3 and 6 targets in isolated fixtures")
    args = parser.parse_args()
    if not args.self_test and not args.self_test_v3 and not args.spec:
        parser.error("spec is required unless --self-test is used")
    print(json.dumps([self_test(3),self_test(6)] if args.self_test_v3 else self_test() if args.self_test else check_pack(args.spec), ensure_ascii=False))
