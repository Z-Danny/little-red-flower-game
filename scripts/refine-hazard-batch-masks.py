"""Reviewed final mask corrections. No scene artwork is painted or regenerated.
Reproducible from immutable candidate backups; followed by compiler --refresh and QA.
"""
from pathlib import Path
import json, hashlib, shutil
import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation, binary_erosion, binary_fill_holes, label

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'art-source/hazard-batch-v2'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def backup(folder,name,out):
    p=folder/out
    if not p.exists(): shutil.copy2(folder/name,p)
    return p
def save_json(p,value): p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def corridor():
    d=BASE/'H06'; original=d/'scene-original.png'
    prior=backup(d,'mask-candidate.png','mask-before-edge-refinement.png')
    raw=np.array(Image.open(prior).convert('RGB').resize((720,1280),Image.Resampling.NEAREST))
    scene=np.array(Image.open(original).convert('RGB').resize((720,1280),Image.Resampling.LANCZOS))
    white=raw.min(axis=2)>180
    loose=binary_dilation(white,iterations=8)
    seed=np.zeros(white.shape,np.uint8)
    seed[loose]=cv2.GC_PR_BGD;seed[white]=cv2.GC_PR_FGD
    seed[binary_erosion(white,iterations=3)]=cv2.GC_FGD
    cv2.setRNGSeed(0)
    cv2.grabCut(cv2.cvtColor(scene,cv2.COLOR_RGB2BGR),seed,None,np.zeros((1,65)),np.zeros((1,65)),5,cv2.GC_INIT_WITH_MASK)
    people=((seed==cv2.GC_FGD)|(seed==cv2.GC_PR_FGD))&loose
    # A conservative 5px clearance prevents the cabinet's 3px protection from eating the guard.
    near=binary_dilation(people,iterations=5)
    magenta=(raw[:,:,0]>180)&(raw[:,:,1]<75)&(raw[:,:,2]>180)
    removed=magenta&near
    size=Image.open(prior).size
    remove_full=np.array(Image.fromarray(removed).resize(size,Image.Resampling.NEAREST))
    people_full=np.array(Image.fromarray(people).resize(size,Image.Resampling.NEAREST))
    refined=np.array(Image.open(prior).convert('RGB'))
    refined[remove_full]=0
    refined[people_full]=255
    Image.fromarray(refined).save(d/'mask-candidate.png')
    Image.fromarray(people.astype(np.uint8)*255).save(d/'proof/source-refined-person.png')
    save_json(d/'mask-refinement.json',{'method':'source RGB GrabCut seeded by original white candidate; remove target encroachment only near actual person; retain 3px compiler protection','sourceSha256':sha(original),'candidateSha256':sha(prior),'outputSha256':sha(d/'mask-candidate.png'),'removedCabinetBoundaryPixels720':int(removed.sum()),'clearancePx':5,'sceneArtworkChanged':False})

def kettle():
    d=BASE/'H04'; prior=d/'mask-candidate-1.png'; original=d/'scene-original.png'
    backup(d,'mask-candidate.png','mask-candidate-2.png')
    a=np.array(Image.open(original).convert('RGB')); refined=np.array(Image.open(prior).convert('RGB'))
    # Original-source pixels: the dark wall plug and its short upward cable only.
    # ROI ends above the damaged gap, leaving both exposed ends exactly as approved in candidate 1.
    x0,y0,x1,y1=882,1220,939,1373
    crop=a[y0:y1,x0:x1]; dark=(crop.max(axis=2)<125)
    labels,count=label(dark)
    component=labels[50,25]
    assert component>0,'Expected actual plug seed is not dark foreground'
    region=binary_fill_holes(labels==component)
    assert 800<int(region.sum())<5000,'Unexpected source plug/cable area'
    refined[y0:y1,x0:x1][region]=[255,0,255]
    Image.fromarray(refined).save(d/'mask-candidate.png')
    save_json(d/'mask-refinement.json',{'method':'retain candidate 1; source-color connected component for black plug and vertical lead only; no use of shifted candidate 2 plug','roiSourcePixels':[x0,y0,x1,y1],'thresholdMaxRgb':125,'componentSeedInRoi':[25,50],'addedSourcePixels':int(region.sum()),'sourceSha256':sha(original),'candidate1Sha256':sha(prior),'rejectedCandidate2Sha256':sha(d/'mask-candidate-2.png'),'outputSha256':sha(d/'mask-candidate.png'),'sceneArtworkChanged':False})

def street():
    p=BASE/'H09/production.json'; spec=json.loads(p.read_text(encoding='utf-8'))
    spec['corrections']['targets']['leaning_fence']={'closeGapsPx':1,'fillEnclosedHoles':True,'excludePolygons':[[[294,763],[299,758],[307,779],[301,781]]],'reason':'Fill only corrugated solid panel seams; preserve natural background triangle outside the right support brace.'}
    spec['effects']['weatherPolygons']=[[[55,0],[676,0],[676,916],[145,826],[145,710],[55,710]]]
    spec['effects']['waterPolygons']=[[[340,507],[413,513],[410,563],[360,576],[324,551]],[[535,657],[649,651],[648,705],[561,708],[541,694]]]
    save_json(p,spec)

if __name__=='__main__':
    corridor();kettle();street()
    print('H06/H04 mask candidates and H09 permissions refined. Compile and inspect before approval.')
