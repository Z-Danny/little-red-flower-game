"""Native alpha edge cleanup only; preserve the tape roll's central hole."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
root=Path(__file__).resolve().parents[1]
raw=root/'art-source/shelter-props-v5';out=root/'public/levels/shelter-props-v5'
out.mkdir(parents=True,exist_ok=True)
report={}
for name in ['tape-roll','tape-strip']:
    im=Image.open(raw/(name+'.png')).convert('RGBA');a=np.array(im)
    mask=a[:,:,3]>240
    # Remove isolated colored alpha fringes, not the cream painted body.
    groups,_=ndi.label(mask);sizes=np.bincount(groups.ravel());sizes[0]=0
    mask=groups==sizes.argmax()
    mask=ndi.binary_opening(mask,iterations=1)
    edge=np.array(Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.45)))
    a[:,:,3]=edge;a[edge<8]=0;im=Image.fromarray(a)
    im=im.crop(im.getchannel('A').getbbox());im.thumbnail((800,800),Image.Resampling.LANCZOS)
    padded=Image.new('RGBA',(im.width+4,im.height+4));padded.paste(im,(2,2))
    padded.save(out/(name+'.webp'),lossless=True)
    for color in ['#20463e','#e6d9bc']:
        bg=Image.new('RGBA',padded.size,color);bg.alpha_composite(padded);bg.convert('RGB').save(raw/(name+'-'+color[1:]+'.jpg'))
    report[name]={'width':padded.width,'height':padded.height,'method':'native alpha cleanup; no hole filling'}
(raw/'processing.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
