"""Compile approved same-camera masks into original-pixel sprites. No network.
New batch only; no mutation of previously shipped assets or level definitions.
Usage: python scripts/prepare-rain-flood.py street|flood
"""
from pathlib import Path
import sys, json, hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import binary_fill_holes, binary_closing, binary_dilation, distance_transform_edt, label

ROOT=Path(__file__).resolve().parents[1]
SIZE=(720,1280)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,v): p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def box(m):
    y,x=np.where(m);return dict(x=int(x.min()),y=int(y.min()),w=int(x.max()-x.min()+1),h=int(y.max()-y.min()+1))
def points(m):
    safe=m.copy();safe[:180]=False;safe[1160:]=False;safe[:,:120]=False;safe[:,610:]=False
    d=distance_transform_edt(safe if safe.any() else m);y,x=np.unravel_index(d.argmax(),d.shape);return dict(x=int(x),y=int(y))
def compile(key):
    assert key in ('street','flood')
    src=ROOT/'art-source/rain-flood-v1'/key
    spec=read(src/'production.json')
    output=ROOT/'public/levels/rain-flood-v1'/key
    output.mkdir(parents=True,exist_ok=True)
    if (output/'APPROVED.lock').exists(): raise ValueError('Approved art is immutable; create another version')
    original=Image.open(src/'scene-original.png').convert('RGB').resize(SIZE,Image.Resampling.LANCZOS)
    rgb=np.asarray(original)
    mask=np.asarray(Image.open(src/'mask-candidate.png').convert('RGB').resize(SIZE,Image.Resampling.NEAREST)).astype(np.int16)
    ids=np.zeros((*mask.shape[:2],3),dtype=np.uint8)
    region={};sprites={};samples={}
    colors=np.array([o['color'] for o in spec['objects'].values()],dtype=np.int16)
    distances=np.linalg.norm(mask[:,:,None,:]-colors[None,None,:,:],axis=3)
    nearest=distances.argmin(axis=2)
    for index,(id,obj) in enumerate(spec['objects'].items()):
        color=np.array(obj['color'],dtype=np.int16)
        m=(distances[:,:,index]<72)&(nearest==index)
        m=binary_closing(m,iterations=1)
        if obj.get('fillHoles'): m=binary_fill_holes(m)
        # Keep only meaningful generated ID islands. Valid separated limbs/parts are retained.
        labels,n=label(m)
        for i in range(1,n+1):
            if np.count_nonzero(labels==i)<5:m[labels==i]=False
        if obj.get('clip'):
            clip=Image.new('1',SIZE,0);ImageDraw.Draw(clip).polygon([tuple(p)for p in obj['clip']],fill=1);m &= np.asarray(clip,dtype=bool)
        assert m.sum()>30, f'Missing object {id}'
        region[id]=m;ids[m]=obj['color'];b=box(m);samples[id]=points(m)
        alpha=Image.fromarray((m*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.35))
        sprite=original.copy().convert('RGBA');sprite.putalpha(alpha)
        rect=(b['x'],b['y'],b['x']+b['w'],b['y']+b['h'])
        cropped=sprite.crop(rect);cropped.save(output/(id+'.png'),optimize=True)
        icon=Image.new('RGBA',SIZE,(40,38,30,0));icon.putalpha(alpha);icon=icon.crop(rect);icon.thumbnail((84,84),Image.Resampling.LANCZOS)
        framed=Image.new('RGBA',(96,96));framed.alpha_composite(icon,((96-icon.width)//2,(96-icon.height)//2));framed.save(output/(id+'-icon.png'),optimize=True)
        sprites[id]={'src':f'/levels/rain-flood-v1/{key}/{id}.png','icon':f'/levels/rain-flood-v1/{key}/{id}-icon.png','box':b,'color':obj['color'],'label':obj['label'],'input':obj.get('input','tap'),'fixed':obj.get('fixed',False)}
    Image.fromarray(ids).save(output/'mask.png',optimize=True)
    original.save(output/'scene.webp',quality=92,method=6)
    if key=='flood':
        candidate=Image.open(src/'clean-candidate.png').convert('RGB').resize(SIZE,Image.Resampling.LANCZOS)
        cut=np.logical_or.reduce([m for id,m in region.items() if not spec['objects'][id].get('fixed')])
        patch=binary_dilation(cut,iterations=16)
        feather=np.asarray(Image.fromarray((binary_dilation(cut,iterations=6)*255).astype('uint8')).filter(ImageFilter.GaussianBlur(3)),dtype=np.float32)/255
        feather[cut]=1;feather[~patch]=0
        repaired=np.rint(rgb*(1-feather[:,:,None])+np.asarray(candidate)*feather[:,:,None]).astype('uint8')
        clean=Image.fromarray(repaired)
        assert np.array_equal(repaired[~patch],rgb[~patch]),'Clean plate changed outside allowed regions'
        Image.fromarray((patch*255).astype('uint8')).save(output/'repair-allow.png')
        for id,m in region.items():
            if spec['objects'][id].get('fixed'):continue
            local=binary_dilation(m,iterations=16);b=box(local)
            alpha=np.asarray(Image.fromarray((binary_dilation(m,iterations=6)*255).astype('uint8')).filter(ImageFilter.GaussianBlur(3))).copy();alpha[m]=255;alpha[~local]=0
            protected=np.logical_or.reduce([v for other,v in region.items() if other!=id]);alpha[protected]=0
            repair=candidate.copy().convert('RGBA');repair.putalpha(Image.fromarray(alpha));repair.crop((b['x'],b['y'],b['x']+b['w'],b['y']+b['h'])).save(output/(id+'-repair.png'),optimize=True)
            sprites[id]['repair']={'src':f'/levels/rain-flood-v1/{key}/{id}-repair.png','box':b}
        # Reconstruct only source cut pixels; halo inspection is still a visual QA gate.
        proof=clean.copy().convert('RGBA')
        for id,a in sprites.items():
            if a['fixed']:continue
            proof.alpha_composite(Image.open(output/(id+'.png')),(a['box']['x'],a['box']['y']))
        proof.convert('RGB').save(output/'reconstruction-proof.webp',quality=94)
        if (src/'alert-candidate.png').exists():
            alert=Image.open(src/'alert-candidate.png').convert('RGB').resize(SIZE,Image.Resampling.LANCZOS)
            # The generated state must share the original silhouette, so no opaque tile is drawn.
            variant=alert.convert('RGBA');variant.putalpha(Image.fromarray((region['person']*255).astype('uint8')).filter(ImageFilter.GaussianBlur(.35)))
            b=sprites['person']['box'];variant.crop((b['x'],b['y'],b['x']+b['w'],b['y']+b['h'])).save(output/'person-alert.png',optimize=True)
    else:clean=original
    clean.save(output/'clean.webp',quality=92,method=6)
    Image.open(src/'ending.png').convert('RGB').resize(SIZE,Image.Resampling.LANCZOS).save(output/'ending.webp',quality=92,method=6)
    skin={'width':720,'height':1280,'scene':f'/levels/rain-flood-v1/{key}/scene.webp','clean':f'/levels/rain-flood-v1/{key}/clean.webp','ending':f'/levels/rain-flood-v1/{key}/ending.webp','mask':f'/levels/rain-flood-v1/{key}/mask.png','sprites':sprites,'zones':spec.get('zones',{}),'poses':spec.get('poses',{}),'weather':spec['weather'],'faces':{'alert':f'/levels/rain-flood-v1/{key}/person-alert.png'}if (output/'person-alert.png').exists()else{}}
    write(ROOT/'content/disaster'/spec['id']/'skin.json',skin)
    write(output/'hit-samples.json',samples)
    write(output/'provenance.json',{'compiler':'prepare-rain-flood.py','source':{p.name:sha(p)for p in src.glob('*.png')},'productionSha256':sha(src/'production.json'),'originalPixelSprites':True,'runtimeMaskPaletteExact':True,'repairOutsidePixelsUnchanged':True,'visualApproval':'pending'})
    overlay=original.convert('RGBA');colors=Image.fromarray(ids).convert('RGBA');colors.putalpha(Image.fromarray((np.any(ids>0,axis=2)*105).astype('uint8')));overlay.alpha_composite(colors);overlay.convert('RGB').save(output/'mask-proof.webp',quality=92)
    print(json.dumps({'id':spec['id'],'objects':{k:v['box']for k,v in sprites.items()},'samples':samples},ensure_ascii=False))
if __name__=='__main__':compile(sys.argv[1])
