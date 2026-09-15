#!/usr/bin/env python3
"""Read-only PNG checks for the archipelago artwork review.

Images are only opened and decoded in memory. This script never crops, converts,
saves, or otherwise modifies image files. Its optional output is a JSON report.
Pixel-edge checks detect potential clipping, not the completeness of the drawing;
visual review remains required for silhouettes, style and map content.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

from PIL import Image


ASSETS = {
    "entry-island.png": "transparent",
    "nature-island.png": "transparent",
    "public-island.png": "transparent",
    "home-island.png": "transparent",
    "wood-plaque.png": "transparent",
    "current-flag.png": "transparent",
    "sky-background.png": "opaque",
}


def inspect_asset(file_path: Path, expectation: str, minimum_dimension: int) -> dict:
    report = {
        "file": file_path.name,
        "path": str(file_path.resolve()),
        "expected_background": expectation,
        "status": "failed",
        "errors": [],
        "warnings": [],
    }
    errors, warnings = report["errors"], report["warnings"]
    if not file_path.is_file():
        errors.append("Required asset is missing.")
        return report

    try:
        raw = file_path.read_bytes()
        report["sha256"] = hashlib.sha256(raw).hexdigest()
        report["file_bytes"] = len(raw)
        if raw[:8] != b"\x89PNG\r\n\x1a\n":
            errors.append("File signature is not PNG.")

        with Image.open(file_path) as image:
            report["format"] = image.format
            report["mode"] = image.mode
            report["bands"] = list(image.getbands())
            report["metadata_keys"] = sorted(image.info.keys())
            report["has_alpha_storage"] = "A" in image.getbands() or "transparency" in image.info
            report["frames"] = getattr(image, "n_frames", 1)
            width, height = image.size
            report["width"], report["height"] = width, height
            report["aspect_ratio"] = round(width / height, 6)
            if image.format != "PNG":
                errors.append("Decoded format is not PNG.")
            if report["frames"] != 1:
                errors.append("Expected one static PNG frame.")
            if min(width, height) < minimum_dimension:
                errors.append(f"Image dimension is below {minimum_dimension} px.")

            # Palette transparency and grayscale+alpha are resolved in memory.
            alpha = image.convert("RGBA").getchannel("A")
            histogram = alpha.histogram()
            pixels = width * height
            visible = alpha.point(lambda value: 255 if value >= 16 else 0)
            bbox = alpha.getbbox()
            visible_bbox = visible.getbbox()
            margins = None if visible_bbox is None else {
                "left": visible_bbox[0], "top": visible_bbox[1],
                "right": width - visible_bbox[2], "bottom": height - visible_bbox[3],
            }
            edge_ranges = {
                "top": (0, 0, width, 1), "right": (width - 1, 0, width, height),
                "bottom": (0, height - 1, width, height), "left": (0, 0, 1, height),
            }
            edges = {}
            for side, rectangle in edge_ranges.items():
                edge = alpha.crop(rectangle)
                values = edge.histogram()
                edges[side] = {
                    "maximum_alpha": edge.getextrema()[1],
                    "nonzero_pixels": sum(values[1:]),
                    "visible_pixels_alpha_ge_16": sum(values[16:]),
                }
            corner_alpha = [
                alpha.getpixel((0, 0)), alpha.getpixel((width - 1, 0)),
                alpha.getpixel((0, height - 1)), alpha.getpixel((width - 1, height - 1)),
            ]
            edge_clipping = any(edge["visible_pixels_alpha_ge_16"] > 0 for edge in edges.values())
            report["alpha"] = {
                "minimum": alpha.getextrema()[0], "maximum": alpha.getextrema()[1],
                "fully_transparent_pixels": histogram[0],
                "fully_transparent_fraction": round(histogram[0] / pixels, 8),
                "partially_transparent_pixels": sum(histogram[1:255]),
                "partially_transparent_fraction": round(sum(histogram[1:255]) / pixels, 8),
                "fully_opaque_pixels": histogram[255],
                "fully_opaque_fraction": round(histogram[255] / pixels, 8),
                "bbox_nonzero_xyxy_exclusive": list(bbox) if bbox else None,
                "bbox_alpha_ge_16_xyxy_exclusive": list(visible_bbox) if visible_bbox else None,
                "visible_margins_px": margins,
                "corner_values_tl_tr_bl_br": corner_alpha,
                "edges": edges,
                "potential_clipping_at_canvas_edge": edge_clipping if expectation == "transparent" else None,
            }

            if expectation == "transparent":
                if not report["has_alpha_storage"]:
                    errors.append("Cutout PNG has no alpha channel or PNG transparency metadata.")
                if histogram[0] / pixels < 0.05:
                    errors.append("Less than 5% of the canvas is truly transparent (alpha = 0).")
                if visible_bbox is None:
                    errors.append("Cutout contains no visible artwork.")
                if edge_clipping:
                    errors.append("Visible artwork reaches a canvas edge; inspect for clipped content.")
                if margins and min(margins.values()) < 8:
                    warnings.append("Visible artwork has less than 8 px padding on at least one side.")
                if any(value > 1 for value in corner_alpha):
                    warnings.append("One or more corner pixels have alpha above 1.")
                if any(edge["maximum_alpha"] > 0 for edge in edges.values()) and not edge_clipping:
                    warnings.append("Low-alpha residue exists at an outer edge; visual review should check halos.")
            elif histogram[255] != pixels:
                errors.append("Sky background contains non-opaque pixels.")

        report["status"] = "failed" if errors else "passed"
    except Exception as error:
        errors.append(f"Cannot read image: {type(error).__name__}: {error}")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=Path(__file__).resolve().parent / "assets")
    parser.add_argument("--output", type=Path, help="Optional JSON report path; must end in .json.")
    parser.add_argument("--minimum-dimension", type=int, default=128)
    args = parser.parse_args()
    if args.minimum_dimension < 1:
        parser.error("--minimum-dimension must be positive")
    if args.output and args.output.suffix.lower() != ".json":
        parser.error("--output must be a .json file; image files are never overwritten")

    records = [inspect_asset(args.assets / name, expectation, args.minimum_dimension) for name, expectation in ASSETS.items()]
    passed = all(record["status"] == "passed" for record in records)
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "passed" if passed else "failed",
        "assets_directory": str(args.assets.resolve()),
        "expected_asset_count": len(ASSETS),
        "passed_asset_count": sum(record["status"] == "passed" for record in records),
        "read_only_image_verification": True,
        "checks": "PNG metadata, decode, dimensions, SHA256, true alpha, visible bounding box and outer edges",
        "limitations": [
            "Alpha checks cannot determine artistic quality, unwanted painted background inside the silhouette, or semantic completeness.",
            "Single-line Chinese titles require HTML layout verification; lettering is not checked in PNGs.",
            "Potential clipping means alpha >= 16 at the outer edge; visual review is still required.",
        ],
        "visual_review": "not_run",
        "browser_review": "not_run",
        "physical_device": "not_run",
        "human_audio": "not_run",
        "assets": records,
    }
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding="utf-8")
    sys.stdout.write(serialized)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
