"""Approved matte-only cleanup of generated state sprites; no scene repaint."""
from pathlib import Path
import json, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
sys.path.insert(0,str(Path(__file__).parent))
import importlib.util
spec=importlib.util.spec_from_file_location('matte',Path(__file__).with_name('prepare-paperbook-art.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
root=Path(__file__).resolve().parents[1]
raw=root/'art-source/fire-shelter-v4';out=root/'public/levels/fire-shelter-v4'
out.mkdir(parents=True,exist_ok=True)
report={}
for name in ['worried','cough','signal']:
    img=Image.open(raw/(name+'.png')).convert('RGBA')
    if name=='cough':
        a=np.array(img); alpha=a[:,:,3]
        # The generated transparent sprite contains a low-opacity colored halo.
        # Keep opaque painted subject; no color-key on cream clothing or skin.
        mask=alpha>240
        groups,_=ndi.label(mask);sizes=np.bincount(groups.ravel());sizes[0]=0
        mask=groups==sizes.argmax()
        mask=ndi.binary_fill_holes(mask)
        edge=np.array(Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.45)))
        a[:,:,3]=edge;a[edge<8]=0;cut=Image.fromarray(a);mode='native-alpha-halo-cleanup'
    else: cut,mode=module.matte(img,name)
    cut=cut.crop(cut.getchannel('A').getbbox());cut.thumbnail((850,1100),Image.Resampling.LANCZOS)
    padded=Image.new('RGBA',(cut.width+8,cut.height+8));padded.paste(cut,(4,4))
    padded.save(out/(name+'.webp'),lossless=True)
    report[name]={'mode':mode,'width':padded.width,'height':padded.height}
    for color in ['#20463e','#e6d9bc']:
        preview=Image.new('RGBA',padded.size,color);preview.alpha_composite(padded)
        preview.convert('RGB').save(raw/(name+'-'+color[1:]+'.jpg'))
(raw/'processing.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
