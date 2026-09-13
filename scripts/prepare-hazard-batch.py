"""Compile a NEW five-target whole-scene pack, with reversible draft refresh.
Usage: python scripts/prepare-hazard-batch.py art-source/hazard-batch-v2/H06/production.json [--refresh]
This is an asset compiler, not semantic or artistic approval.
Dependencies: Pillow, numpy, scipy, opencv-python.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import binary_closing, binary_dilation, binary_erosion, binary_fill_holes, distance_transform_edt

ROOT = Path(__file__).resolve().parents[1]
VERSION = 1
LOCKS = ("APPROVED.lock", ".asset-approved")
MASK_NAMES = ("weather", "water", "sky", "fire", "smoke")
DEFAULT_COLORS = {(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255)}
IDENT = re.compile(r"^[a-z][a-z0-9_-]*$")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def scoped(value, root=None):
    root = ROOT if root is None else root
    p = (root / value).resolve()
    require(p != root and p.is_relative_to(root), f"Path outside workspace: {value}")
    return p


def polygons(values, size):
    """Rasterize approved LOGICAL-space polygons; empty is an empty mask."""
    w, h = size
    image = Image.new("L", size, 0)
    draw = ImageDraw.Draw(image)
    for poly in values or []:
        require(isinstance(poly, list) and len(poly) >= 3, "Polygon requires at least 3 points")
        points = []
        for point in poly:
            require(isinstance(point, list) and len(point) == 2, "Polygon point requires [x,y]")
            x, y = point
            require(isinstance(x, (int, float)) and isinstance(y, (int, float))
                    and np.isfinite(x) and np.isfinite(y), "Polygon coordinates must be finite")
            require(0 <= x <= w and 0 <= y <= h, "Polygon outside logical world")
            points.append((round(x), round(y)))
        draw.polygon(points, fill=255)
    return np.asarray(image) > 0


def corrected(region, conf, size, name):
    conf = conf or {}
    permitted = {"keepPolygons", "excludePolygons", "fillEnclosedHoles", "closeGapsPx",
                 "hitFillPolygons", "reason"}
    require(set(conf).issubset(permitted), f"Unknown correction for {name}")
    result = region.copy()
    if conf.get("keepPolygons"):
        result &= polygons(conf["keepPolygons"], size)
    gap = conf.get("closeGapsPx", 0)
    require(isinstance(gap, int) and not isinstance(gap, bool) and 0 <= gap <= 3,
            f"{name}: closeGapsPx must be an integer from 0 to 3")
    if gap:
        require(conf.get("fillEnclosedHoles") and bool(str(conf.get("reason", "")).strip()),
                f"{name}: closing requires reviewed solid interior and fillEnclosedHoles")
        # Repair tiny cracks in an approved SOLID object, never close gazebo/cart openings.
        # Retain all original pixels and prevent any bounding-box expansion.
        b = bounds(result)
        inside = np.zeros_like(result)
        inside[b["y"]:b["y"] + b["h"], b["x"]:b["x"] + b["w"]] = True
        result = (result | binary_closing(result, iterations=gap)) & inside
    if conf.get("fillEnclosedHoles", False):
        require(bool(str(conf.get("reason", "")).strip()), f"{name}: fill requires review reason")
        result = binary_fill_holes(result)
    # Exclusions always win, including over filled holes.
    result &= ~polygons(conf.get("excludePolygons"), size)
    return result


def bounds(region, padding=0):
    ys, xs = np.where(region)
    require(len(xs) > 0, "Empty region has no bounds")
    h, w = region.shape
    x, y = max(0, int(xs.min()) - padding), max(0, int(ys.min()) - padding)
    x1, y1 = min(w, int(xs.max()) + 1 + padding), min(h, int(ys.max()) + 1 + padding)
    return {"x": x, "y": y, "w": x1 - x, "h": y1 - y}


def crop_box(box):
    return (box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"])


def save_binary(path, region):
    Image.fromarray((region.astype(np.uint8) * 255), "L").save(path)


def interior_point(region):
    require(region.any(), "No valid sample pixels")
    # Padding also makes the metric correct for objects touching canvas edges.
    dist = distance_transform_edt(np.pad(region, 1))[1:-1, 1:-1]
    y, x = np.unravel_index(int(np.argmax(dist)), dist.shape)
    return [int(x), int(y)], float(dist[y, x])


def icon_from(scene, region, box):
    icon = scene.convert("RGBA")
    icon.putalpha(Image.fromarray(region.astype(np.uint8) * 255, "L"))
    icon = icon.crop(crop_box(box))
    icon.thumbnail((160, 160), Image.Resampling.LANCZOS)
    # Guarantee a transparent margin while preserving the source aspect ratio.
    framed = Image.new("RGBA", (icon.width + 4, icon.height + 4), (0, 0, 0, 0))
    framed.alpha_composite(icon, (2, 2))
    return framed


def validate_spec(spec, spec_path):
    require(IDENT.fullmatch(spec.get("id", "")), "id must be a stable lower-case identifier")
    generic = spec.get("pipelineVersion") == 3
    require(bool(spec.get("authorId")) if generic else re.fullmatch(r"H\d{2}", str(spec.get("authorId", ""))), "Missing author identity")
    require(spec.get("world", [720, 1280]) == [720, 1280], "Batch world must be [720,1280]")
    count = len(spec.get("targets", []))
    require(3 <= count <= 6 if generic else count == 5, "Target count outside compiler contract")
    ids = [t.get("id") for t in spec["targets"]]
    require(all(isinstance(n, str) and IDENT.fullmatch(n) for n in ids) and len(set(ids)) == count,
            "Target IDs must be unique lower-case identifiers")
    colors = [tuple(t.get("color", [])) for t in spec["targets"]]
    palette = DEFAULT_COLORS | {(0,255,255)} if generic else DEFAULT_COLORS
    require(set(colors).issubset(palette) and len(set(colors)) == count, "Unique approved RGB colors required")
    expected_output = ROOT / "public" / "levels" / "hazard-batch-v2" / spec["id"]
    expected_skin = ROOT / "content" / "scenes" / spec["id"] / "skin.json"
    source_root = ROOT / "art-source" / "hazard-batch-v2"
    if generic:
        require(re.fullmatch(r"[a-z][a-z0-9-]{0,63}", spec.get("skinName", "")), "Invalid skinName")
        expected_output = ROOT / "public" / "levels" / "hunts" / spec["id"] / spec["skinName"]
        expected_skin = ROOT / "content" / "scenes" / spec["id"] / "skins" / (spec["skinName"] + ".json")
        source_root = ROOT / "art-source" / "hunts" / spec["id"] / spec["skinName"]
    out, skin = scoped(spec["output"]), scoped(spec["skin"])
    require(out == expected_output.resolve(), "Output must be this batch/new id directory")
    require(skin == expected_skin.resolve(), "Skin path must match new id")
    require(spec_path.parent.is_relative_to(source_root), "Source directory outside declared pipeline")
    require(not spec.get("outputApproved", False), "Approved output cannot be compiled/refreshed")
    for directory in (out, spec_path.parent, skin.parent):
        require(not any((directory / lock).exists() for lock in LOCKS), "Approved asset lock found")
    corrections = spec.get("corrections", {})
    require(set(corrections).issubset({"targets", "characters"}), "Unknown corrections group")
    require(set(corrections.get("targets", {})).issubset(set(ids)), "Correction has unknown target")
    effects = spec.get("effects", {})
    require(set(effects).issubset({name + "Polygons" for name in MASK_NAMES}
                                  | {"fireSources", "smokeDrift"}), "Unknown effects field")
    require(effects.get("smokeDrift", 1) in (-1, 1), "smokeDrift must be -1 or 1")
    if effects.get("firePolygons") or effects.get("smokePolygons") or effects.get("fireSources"):
        require(bool(effects.get("firePolygons")) and bool(effects.get("smokePolygons"))
                and bool(effects.get("fireSources")),
                "Fire requires approved firePolygons, smokePolygons and nonempty fireSources together")
    for source in effects.get("fireSources", []):
        require(set(source) == {"kind", "x", "y", "w", "h"}, "Fire source fields must be kind,x,y,w,h")
        require(source["kind"] in ("flame", "ember", "fountain"), "Invalid fire source kind")
        x, y, w, h = (source[k] for k in ("x", "y", "w", "h"))
        require(all(isinstance(n, (int, float)) and np.isfinite(n) for n in (x, y, w, h)),
                "Fire source coordinates must be finite")
        require(x >= 0 and y >= 0 and w > 0 and h > 0 and x + w <= 720 and y + h <= 1280,
                "Fire source box outside world")
    return out, skin


def compile_pack(spec_path, refresh=False):
    spec_path = scoped(spec_path)
    spec = read_json(spec_path)
    src = spec_path.parent
    out, skin_path = validate_spec(spec, spec_path)
    filenames = ("scene-original.png", "mask-candidate.png", "clean-candidate.png", "ending.png")
    for name in filenames:
        require((src / name).is_file(), f"Missing input: {name}")
    source_hash = sha(src / "scene-original.png")
    require(str(spec.get("sourceSha256", "")).lower() == source_hash, "Mother SHA changed; derive new candidates")
    previous = None
    if out.exists():
        require(refresh, "Draft output exists; use --refresh with same mother SHA")
        require((out / ".compiler-owner.json").is_file(), "Existing output not owned by this compiler")
        previous = read_json(out / ".compiler-owner.json")
        require(previous.get("sourceSha256") == source_hash and previous.get("id") == spec["id"],
                "Refresh requires matching source SHA and id")
        require(previous.get("specPath") == spec_path.relative_to(ROOT).as_posix(), "Owner spec path mismatch")
        require(skin_path.is_file() and sha(skin_path) == previous.get("skinSha256"),
                "Existing skin changed outside compiler; do not overwrite")
    else:
        require(not skin_path.exists() or (spec.get("pipelineVersion") == 3 and sha(skin_path) == spec.get("draftSkinSha256")), "Existing skin would be overwritten; draft fingerprint mismatch")
    original, raw_image, plate, ending = [Image.open(src / name).convert("RGB") for name in filenames]
    require(original.size == raw_image.size == plate.size == ending.size, "All candidate dimensions must match mother")
    size = tuple(spec.get("world", [720, 1280]))
    w, h = size
    scene = original.resize(size, Image.Resampling.LANCZOS)
    rgb = np.array(scene)
    raw = np.asarray(raw_image.resize(size, Image.Resampling.NEAREST))
    color_distance = np.stack([np.max(np.abs(raw.astype(np.int16) - np.array(t["color"])), axis=2)
                               for t in spec["targets"]], axis=2)
    nearest, best = np.argmin(color_distance, axis=2), np.min(color_distance, axis=2)
    regions = {}
    corrections = spec.get("corrections", {})
    for index, target in enumerate(spec["targets"]):
        name = target["id"]
        # Classify proposal only. Runtime gets exact RGB, never tolerance matching.
        region = (nearest == index) & (best < 75)
        region = corrected(region, corrections.get("targets", {}).get(name), size, name)
        require(int(region.sum()) > 500, f"Missing/tiny target: {name}")
        b = bounds(region)
        require(not region[b["y"]:b["y"]+b["h"], b["x"]:b["x"]+b["w"]].all(),
                f"Rectangular target hotspot rejected: {name}")
        regions[name] = region
    union = np.zeros((h, w), bool)
    for name, region in regions.items():
        require(not (union & region).any(), f"Overlapping target masks: {name}")
        union |= region
    protected = binary_dilation(union, iterations=3)
    white = corrected(np.min(raw, axis=2) > 180, corrections.get("characters"), size, "characters")
    white &= ~protected
    require(int(white.sum()) > 1000, "Missing/small candidate characters")
    seed = np.full((h, w), cv2.GC_BGD, dtype=np.uint8)
    loose = binary_dilation(white, iterations=8)
    seed[loose] = cv2.GC_PR_BGD
    seed[white] = cv2.GC_PR_FGD
    core = binary_erosion(white, iterations=3)
    require(int(core.sum()) > 100, "Character proposal has no reliable interior")
    seed[core] = cv2.GC_FGD
    seed[protected] = cv2.GC_BGD
    cv2.setRNGSeed(0)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), seed, None,
                np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
    people = ((seed == cv2.GC_FGD) | (seed == cv2.GC_PR_FGD)) & loose & ~protected
    people = corrected(people, corrections.get("characters"), size, "characters") & ~protected
    require(int(people.sum()) > 1000, "Refined characters too small")
    character_excluded = polygons(corrections.get("characters", {}).get("excludePolygons"), size)
    family_alpha = np.asarray(Image.fromarray(people.astype(np.uint8) * 255, "L")
                              .filter(ImageFilter.GaussianBlur(0.25))).copy()
    family_alpha[protected] = 0
    family_alpha[character_excluded] = 0
    family_region = family_alpha > 0
    family_box = bounds(family_region, padding=3)
    family_full = scene.convert("RGBA")
    family_full.putalpha(Image.fromarray(family_alpha, "L"))
    character_allow = binary_dilation(family_region, iterations=15) & ~protected & ~character_excluded
    # Small bounded repair margin; no target pixels are supplied by inpainting.
    allowed = binary_dilation(people | white, iterations=10) & ~protected & ~character_excluded
    feather = Image.fromarray(binary_dilation(people | white, iterations=5).astype(np.uint8) * 255, "L")
    repair = np.asarray(feather.filter(ImageFilter.GaussianBlur(2))).copy()
    repair[~allowed] = 0
    clean = Image.composite(plate.resize(size, Image.Resampling.LANCZOS), scene, Image.fromarray(repair, "L"))
    require(np.array_equal(np.asarray(clean)[~allowed], rgb[~allowed]), "Outside repair changed")
    require(np.array_equal(np.asarray(clean)[protected], rgb[protected]), "Protected targets changed")
    object_mask = np.zeros((h, w, 3), np.uint8)
    id_mask = np.zeros_like(object_mask)
    hit_regions = {}
    for target in spec["targets"]:
        name, color = target["id"], target["color"]
        region = regions[name]
        object_mask[region] = color
        conf = corrections.get("targets", {}).get(name, {})
        additions = polygons(conf.get("hitFillPolygons"), size)
        if additions.any():
            require(bool(str(conf.get("reason", "")).strip()), f"{name}: hit fill requires reason")
            b = bounds(region)
            inside = np.zeros((h, w), bool)
            inside[b["y"]:b["y"]+b["h"], b["x"]:b["x"]+b["w"]] = True
            require(not (additions & ~inside).any(), f"{name}: hit fill outside entity bounds")
            require(not (additions & (union & ~region)).any(), f"{name}: hit fill overlaps other targets")
            require(not (additions & character_allow).any(), f"{name}: hit fill overlaps characters")
        hit_regions[name] = region | additions
        require(not (hit_regions[name] & np.any(id_mask != 0, axis=2)).any(), "Hit regions overlap")
        id_mask[hit_regions[name]] = color
    effect_masks = {}
    for name in MASK_NAMES:
        requested = polygons(spec.get("effects", {}).get(name + "Polygons"), size)
        # Exclude all hit targets too: a hole filled for clickability stays unobscured.
        effect_masks[name] = requested & ~binary_dilation(np.any(id_mask != 0, axis=2), iterations=3) & ~character_allow
        if spec.get("effects", {}).get(name + "Polygons"):
            require(effect_masks[name].any(), f"Approved {name} polygons leave no visible effect area")
    for source in spec.get("effects", {}).get("fireSources", []):
        x, y = int(source["x"]), int(source["y"])
        x1, y1 = int(np.ceil(source["x"] + source["w"])), int(np.ceil(source["y"] + source["h"]))
        require(effect_masks["fire"][y:y1, x:x1].any(), "Fire source has no approved visible fire area")
    out.parent.mkdir(parents=True, exist_ok=True)
    build = Path(tempfile.mkdtemp(prefix=".hazard-build-", dir=out.parent)).resolve()
    require(build.is_relative_to(out.parent.resolve()) and build.name.startswith(".hazard-build-"),
            "Unexpected staging path")
    assets, proof = build / "assets", build / "proof"
    assets.mkdir()
    proof.mkdir()
    try:
        prefix = "/" + out.relative_to(ROOT / "public").as_posix()
        scene.save(assets / "scene.webp", lossless=True, method=6)
        clean.save(assets / "clean.webp", lossless=True, method=6)
        ending.resize(size, Image.Resampling.LANCZOS).save(assets / "ending.webp", lossless=True, method=6)
        Image.fromarray(object_mask, "RGB").save(assets / "object-mask.png")
        Image.fromarray(id_mask, "RGB").save(assets / "id-mask.png")
        family_full.crop(crop_box(family_box)).save(assets / "family.png")
        Image.fromarray(repair, "L").save(proof / "repair-mask.png")
        save_binary(proof / "repair-allowed.png", allowed)
        save_binary(proof / "target-protection.png", protected)
        save_binary(proof / "family-alpha.png", family_region)
        save_binary(assets / "character-mask.png", character_allow)
        target_skin, samples, radii = {}, {}, {}
        overlay_all = scene.convert("RGBA")
        for target in spec["targets"]:
            name, color = target["id"], target["color"]
            region = regions[name]
            box = bounds(region)
            icon_from(scene, region, box).save(assets / (name + ".png"))
            overlay = Image.new("RGBA", size, tuple(color) + (0,))
            overlay.putalpha(Image.fromarray(region.astype(np.uint8) * 128, "L"))
            Image.alpha_composite(scene.convert("RGBA"), overlay).save(proof / (name + "-overlay.png"))
            overlay_all = Image.alpha_composite(overlay_all, overlay)
            target_skin[name] = {"color": color, "bounds": box, "icon": prefix + "/" + name + ".png"}
            # Choose inside the visible object, never only inside a hit-filled void.
            samples[name], radii[name] = interior_point(region)
        overlay_all.save(proof / "mask-overlay.png")
        reconstructed = clean.convert("RGBA")
        reconstructed.alpha_composite(family_full)
        reconstructed.save(proof / "reconstructed.png")
        effects_skin = {"characterMask": prefix + "/character-mask.png"}
        for name, region in effect_masks.items():
            save_binary(assets / (name + "-mask.png"), region)
            # File availability is not permission to enable an effect in the engine.
            # An all-black unapproved mask is retained only for QA, never registered.
            if spec.get("effects", {}).get(name + "Polygons"):
                effects_skin[name + "Mask"] = prefix + "/" + name + "-mask.png"
        if spec.get("effects", {}).get("fireSources"):
            effects_skin["fireSources"] = spec["effects"]["fireSources"]
            effects_skin["smokeDrift"] = spec["effects"].get("smokeDrift", 1)
        background_region = ~np.any(id_mask != 0, axis=2) & ~character_allow
        # HUD bands excluded from automatic background sample.
        background_region[:160, :] = False
        background_region[1180:, :] = False
        background, background_radius = interior_point(background_region)
        hit_samples = {"world": [w, h], "targets": samples, "background": background,
                       "targetInteriorRadius": radii, "backgroundRadius": background_radius,
                       "method": "max Euclidean distance to exterior of real object-mask; no bbox centers",
                       "visualStatus": "samples require browser/semantic confirmation"}
        write_json(assets / "hit-samples.json", hit_samples)
        skin = {"version": 1, "width": w, "height": h, "scene": prefix + "/scene.webp",
                "clean": prefix + "/clean.webp", "safe": prefix + "/ending.webp",
                "mask": prefix + "/id-mask.png", "family": prefix + "/family.png",
                "familyBox": family_box, "targets": target_skin, "effects": effects_skin}
        if spec.get("pipelineVersion") == 3:
            skin["criticalRegions"] = spec.get("criticalRegions", [])
        report = {"compilerVersion": VERSION, "id": spec["id"], "authorId": spec["authorId"],
                  "sourceSha256": source_hash, "sourceSize": list(original.size), "world": [w, h],
                  "inputHashes": {name: sha(src / name) for name in filenames},
                  "specSha256": sha(spec_path), "corrections": corrections,
                  "targetPixels": {name: int(r.sum()) for name, r in regions.items()},
                  "hitPixels": {name: int(r.sum()) for name, r in hit_regions.items()},
                  "familyBox": family_box, "familyPixels": int(family_region.sum()),
                  "effectsPixels": {name: int(r.sum()) for name, r in effect_masks.items()},
                  "unchangedOutsideAllowedRepair": True, "hazardPixelsUnchanged": True,
                  "effectMasksExcludeTargetsAndCharacters": True,
                  "objectAndHitMasksIdentical": bool(np.array_equal(object_mask, id_mask)),
                  "approval": "draft; semantic visual inspection and runtime tests pending",
                  "files": [{"path": p.name, "sha256": sha(p)} for p in sorted(assets.iterdir())]}
        write_json(build / "skin.json", skin)
        owner = {"compiler": "prepare-hazard-batch.py", "version": VERSION, "id": spec["id"],
                 "sourceSha256": source_hash, "specPath": spec_path.relative_to(ROOT).as_posix(),
                 "skinSha256": sha(build / "skin.json"), "createdAt": datetime.now(timezone.utc).isoformat()}
        write_json(assets / ".compiler-owner.json", owner)
        write_json(build / "processing.json", report)
        require(sha(src / "scene-original.png") == source_hash, "Mother changed during compilation")
        require(sha(spec_path) == report["specSha256"], "Spec changed during compilation")
        # Refresh is recoverable: retain exactly this compiler's prior draft output.
        # No source directory, repository root, or unknown output is recursively removed.
        backup = None
        if previous is not None:
            backup = src / "compiled-history" / (datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8])
            backup.mkdir(parents=True, exist_ok=False)
            out.rename(backup / "assets")
            shutil.copy2(skin_path, backup / "skin.json")
            for name in ("processing.json", "hit-samples.json"):
                if (src / name).is_file():
                    shutil.copy2(src / name, backup / name)
        try:
            assets.rename(out)
            skin_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(build / "skin.json", skin_path)
        except Exception:
            # Preserve a failed new draft, restore a prior draft when present.
            failed = src / "compiled-history" / ("failed-" + uuid.uuid4().hex[:8])
            failed.mkdir(parents=True, exist_ok=False)
            if out.exists() and (out / ".compiler-owner.json").is_file():
                if read_json(out / ".compiler-owner.json") == owner:
                    out.rename(failed / "assets")
            if skin_path.is_file() and sha(skin_path) == owner["skinSha256"]:
                skin_path.rename(failed / "skin.json")
            if backup is not None and not out.exists():
                (backup / "assets").rename(out)
                shutil.copy2(backup / "skin.json", skin_path)
            raise
        shutil.copy2(build / "processing.json", src / "processing.json")
        shutil.copy2(out / "hit-samples.json", src / "hit-samples.json")
        (src / "proof").mkdir(exist_ok=True)
        for p in proof.iterdir():
            shutil.copy2(p, src / "proof" / p.name)
        return report
    finally:
        # Only the uniquely-created temporary build, verified under the batch output parent.
        require(build.name.startswith(".hazard-build-") and build.is_relative_to(out.parent.resolve()),
                "Refuse to remove unexpected staging path")
        shutil.rmtree(build)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", help="Repo-relative production.json")
    parser.add_argument("--refresh", action="store_true", help="Replace only same-SHA compiler-owned unapproved draft")
    args = parser.parse_args()
    report = compile_pack(args.spec, args.refresh)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
