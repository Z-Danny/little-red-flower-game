"""Reproducible local cutout cleanup, explicitly allowed by the user.
Only removes generated checker backgrounds; original drawings stay unaltered.
Run with --props --characters --room. Sources are never overwritten.
"""
from pathlib import Path
import argparse
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/levels/kitchen-v1'
REVIEW = ROOT / 'outputs/kitchen-review'

def cutout(image, enclosed=False, seeds=(), trim_halo=False):
    rgb = np.array(image.convert('RGB'))
    v = rgb.astype(np.int16)
    neutral = (v.min(2) > 218) & (v.max(2) - v.min(2) < 17)
    labels, _ = ndi.label(neutral)
    border = np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])))
    bg = np.isin(labels, border[border != 0])
    seeded_bg = np.zeros_like(bg)
    for x, y in seeds:
        if labels[y, x] > 0:
            seeded_bg |= labels == labels[y, x]
    if seeded_bg.any():
        # Include only the pale anti-aliased matte around a seeded checker island;
        # dark ink outlines and coloured skin/clothes are deliberately preserved.
        near_neutral = (v.min(2) > 180) & (v.max(2) - v.min(2) < 42)
        bg |= seeded_bg | (ndi.binary_dilation(seeded_bg, iterations=3) & near_neutral)
    # Optional large checker holes bounded by a prop silhouette.
    for idx, region in enumerate(ndi.find_objects(labels) if enclosed else [], 1):
        if region is None or bg[labels == idx].any():
            continue
        ys, xs = region
        block = rgb[ys, xs]
        if (labels == idx).sum() > 150 and (block.max(2) - block.min(2)).mean() < 6 and block.std() > 7:
            bg |= labels == idx
    opaque = ~bg
    if trim_halo:
        # Generated RGB atlases carry a 1–2px checker matte outside the ink.
        # Shrink only that outside fringe, then reconstruct a clean alpha edge.
        opaque = ndi.binary_dilation(ndi.binary_erosion(opaque, iterations=3), iterations=1)
    # Remove disconnected background flecks, preserving the single object silhouette.
    groups, _ = ndi.label(opaque)
    sizes = np.bincount(groups.ravel()); sizes[0] = 0
    if sizes.size > 1:
        opaque &= np.isin(groups, np.where(sizes >= max(12, sizes.max() * .0003))[0])
    core = ndi.binary_erosion(opaque, iterations=2)
    _, nearest_fg = ndi.distance_transform_edt(~core, return_indices=True)
    _, nearest_bg = ndi.distance_transform_edt(opaque, return_indices=True)
    original = rgb.astype(float); fg = original[nearest_fg[0], nearest_fg[1]]; back = original[nearest_bg[0], nearest_bg[1]]
    denom = ((fg - back) ** 2).sum(2)
    alpha = np.clip(((original - back) * (fg - back)).sum(2) / np.maximum(denom, 1), 0, 1)
    edge = opaque & ~ndi.binary_erosion(opaque) & (rgb.min(2) > 95)
    a = opaque.astype(float); a[edge] = alpha[edge]
    original[edge] = np.clip((original[edge] - (1 - a[edge, None]) * back[edge]) / np.maximum(a[edge, None], .03), 0, 255)
    rgba = np.dstack((original.astype(np.uint8), (a * 255).astype(np.uint8)))
    rgba[rgba[:, :, 3] < 8] = 0
    return Image.fromarray(rgba)

def main():
    p = argparse.ArgumentParser(); p.add_argument('--props', required=True); p.add_argument('--characters', required=True); p.add_argument('--room', required=True); p.add_argument('--water')
    args = p.parse_args(); OUT.mkdir(parents=True, exist_ok=True); REVIEW.mkdir(parents=True, exist_ok=True)
    props = Image.open(args.props)
    assert props.size == (1254, 1254), 'Recheck manually defined atlas crops if regenerated size changes.'
    boxes = {'pan': (12, 120, 492, 320), 'lid': (493, 123, 850, 319), 'water': (950, 88, 1150, 355),
             'cloth': (70, 530, 359, 730), 'extinguisher': (510, 416, 760, 790), 'gas': (914, 506, 1158, 750),
             'plate': (20, 908, 420, 1135), 'knife': (468, 830, 817, 1170), 'flame': (863, 807, 1220, 1178)}
    report = {}
    for name, box in boxes.items():
        result = cutout(props.crop(box), name == 'extinguisher')
        bbox = result.getchannel('A').getbbox()
        result = result.crop((max(0, bbox[0] - 3), max(0, bbox[1] - 3), min(result.width, bbox[2] + 3), min(result.height, bbox[3] + 3)))
        result.save(OUT / f'{name}.png')
        report[name] = {'crop': box, 'size': result.size, 'alpha': result.getchannel('A').getextrema()}
    if args.water:
        result = cutout(Image.open(args.water), False, [(1070, 620)])
        result = result.crop(result.getchannel('A').getbbox())
        result.thumbnail((220, 220))
        padded = Image.new('RGBA', (result.width + 6, result.height + 6)); padded.paste(result, (3, 3)); result = padded
        result.save(OUT / 'water.png')
        report['water'] = {'source': args.water, 'size': result.size, 'alpha': result.getchannel('A').getextrema()}
    people = Image.open(args.characters)
    # Equal head anchors/feet baselines, rather than stretching each tight crop independently.
    character_seeds = {
        # Two checker islands trapped between the raised right hand, hair and apron.
        # Precise seeds avoid deleting the character's white eyes and teeth.
        'panicked': [(331, 121), (309, 164), (204, 123)],
    }
    for name, box in {'worried': (140, 10, 610, 610), 'panicked': (635, 10, 1105, 610),
                      'focused': (150, 617, 620, 1217), 'relieved': (625, 617, 1095, 1217)}.items():
        result = cutout(people.crop(box), True, seeds=character_seeds.get(name, ()), trim_halo=True)
        result.save(OUT / f'{name}.png')
        report[name] = {'crop': box, 'size': result.size, 'alpha': result.getchannel('A').getextrema()}
    Image.open(args.room).convert('RGB').resize((900, 1200), Image.Resampling.LANCZOS).save(OUT / 'room.png', optimize=True)
    preview = Image.new('RGB', (1200, 1050), '#244f4b'); draw = ImageDraw.Draw(preview)
    for i, name in enumerate(report):
        img = Image.open(OUT / f'{name}.png'); img.thumbnail((270, 270))
        x, y = i % 4 * 300, i // 4 * 262
        preview.paste(img, (x + (300 - img.width) // 2, y + 15), img)
        draw.text((x + 10, y + 241), name, fill='white')
    preview.save(REVIEW / 'alpha-contact-sheet.png')
    (REVIEW / 'asset-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))

if __name__ == '__main__': main()
