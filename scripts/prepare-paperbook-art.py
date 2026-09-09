"""Reproducible matte cleanup and registration, not artistic image generation.

Inputs are individually generated originals. Never touch the historical skins.
The user's approved local processing removes baked checker/chroma backgrounds,
then registers each new silhouette to its old alpha bounds at the old resolution.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/paperbook-v1'

def matte(img, key):
    rgba = np.array(img.convert('RGBA'))
    if (rgba[:, :, 3] == 0).mean() > .02:
        return img.convert('RGBA'), 'native-alpha'
    rgb = rgba[:, :, :3].astype(np.int16)
    r,g,b = rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    corners = rgb[:10,:10].mean(axis=(0,1))
    if corners[0] > corners[1]+60 and corners[2] > corners[1]+60:
        bg = (r-g > 50) & (b-g > 50)
        mode = 'chroma-magenta'
    elif corners.max() < 35:
        bg = rgb.max(axis=2) < 38
        mode = 'black-matte'
    else:
        bg = (rgb.max(axis=2)-rgb.min(axis=2)<14) & (rgb.min(axis=2)>93)
        mode = 'baked-checker'
    labels, count = ndi.label(bg)
    sizes = np.bincount(labels.ravel())
    # Border-connected background plus enclosed large checker holes. Preserve
    # small pale eye highlights and garment detail inside the silhouette.
    selected = set(np.unique(np.concatenate([labels[0],labels[-1],labels[:,0],labels[:,-1]])))
    if mode == 'chroma-magenta':
        selected.update(range(1,count+1))
    else:
        selected.update(np.where(sizes > img.width*img.height*.0006)[0])
    selected.discard(0)
    mask = ~np.isin(labels, list(selected))
    # Remove tiny isolated checker remnants, preserve disconnected highlights.
    components,n = ndi.label(mask)
    cs = np.bincount(components.ravel())
    keep = np.where(cs > max(10,img.width*img.height*.00004))[0]
    keep = keep[keep != 0]
    if key == 'typhoon-window':
        keep = np.array([np.argmax(cs[1:])+1])
    mask = np.isin(components,keep)
    if key in {'kitchen-pan','kitchen-lid','kitchen-gas','kitchen-plate','kitchen-knife'}:
        mask = ndi.binary_fill_holes(mask)
    if key != 'typhoon-cable':
        mask = ndi.binary_erosion(mask, iterations=2)
    alpha = np.array(Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.55)))
    alpha[alpha<8] = 0
    alpha[alpha>248] = 255
    # Extend uncontaminated inner colors into the antialiased boundary.
    core = ndi.binary_erosion(mask, iterations=2)
    _, indices = ndi.distance_transform_edt(~core, return_indices=True)
    edge = (alpha>0) & ~core
    rgba[edge,:3] = rgba[indices[0][edge],indices[1][edge],:3]
    rgba[:,:,3] = alpha
    rgba[alpha==0,:3] = 0
    return Image.fromarray(rgba),mode

def main():
    log = json.loads((SOURCE/'generation-log.json').read_text(encoding='utf-8'))
    checks = []
    for entry in log['entries']:
        if entry.get('superseded'): continue
        key = entry.get('targetId',entry['id'])
        level, name = key.split('-',1)
        old_dir = 'kitchen-v1' if level=='kitchen' else 'typhoon-v2'
        old_name = 'room-portrait-v3' if key=='kitchen-room' else name
        old = Image.open(ROOT/f'public/levels/{old_dir}/{old_name}.png').convert('RGBA')
        raw = Image.open(SOURCE/entry['raw'])
        dest = ROOT/f'public/levels/paperbook-{level}-v1/{name}.png'
        dest.parent.mkdir(parents=True,exist_ok=True)
        if name=='room':
            final = raw.convert('RGB').resize(old.size,Image.Resampling.LANCZOS)
            mode = 'opaque-background'
        else:
            cut,mode = matte(raw,key)
            bounds = cut.getchannel('A').getbbox()
            if not bounds: raise ValueError(f'Empty matte: {key}')
            target = old.getchannel('A').getbbox()
            x0,y0,x1,y1 = target
            # Same normalized alpha bounds keep mechanical anchors stable.
            art = cut.crop(bounds).resize((x1-x0,y1-y0),Image.Resampling.LANCZOS)
            final = Image.new('RGBA',old.size)
            final.paste(art,(x0,y0))
            aa = np.array(final)
            aa[0,:,3]=aa[-1,:,3]=aa[:,0,3]=aa[:,-1,3]=0
            aa[aa[:,:,3]<5,3]=0
            final=Image.fromarray(aa)
        final.save(dest,optimize=True)
        checks.append({'id':key,'mode':mode,'size':list(final.size),'path':str(dest.relative_to(ROOT))})
    (SOURCE/'processing-report.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Prepared {len(checks)} individually generated assets')

if __name__=='__main__': main()
