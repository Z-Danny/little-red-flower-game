import type {Point,Pose} from './schema';
export type BeamAttachment={object:string;origin:Point;axis:Point;length:number;spread:number;aperture:number};
/** Lens origin and barrel axis live in sprite-local coordinates. One rigid
 * transform moves all four corners; the axis cannot bend toward a target. */
export function attachedBeam(pose:Pose,b:BeamAttachment){
 const pivot=pose.pivot??{x:.5,y:.5},a=pose.rotation??0,c=Math.cos(a),s=Math.sin(a);
 const dx=(b.origin.x-pivot.x)*pose.w,dy=(b.origin.y-pivot.y)*pose.h;
 const origin={x:pose.x+pose.w*pivot.x+dx*c-dy*s,y:pose.y+pose.h*pivot.y+dx*s+dy*c};
 const ax=b.axis.x*pose.w,ay=b.axis.y*pose.h,len=Math.hypot(ax,ay);
 const direction={x:(ax*c-ay*s)/len,y:(ax*s+ay*c)/len};
 const end={x:origin.x+direction.x*b.length,y:origin.y+direction.y*b.length},normal={x:-direction.y,y:direction.x};
 const near=b.aperture/2,far=near+Math.tan(b.spread)*b.length;
 const offset=(p:Point,n:number)=>({x:p.x+normal.x*n,y:p.y+normal.y*n});
 return{origin,end,direction,corners:[offset(origin,near),offset(end,far),offset(end,-far),offset(origin,-near)]};
}
