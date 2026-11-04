// Two-bone IK. Scratch math lives on the rig, avoiding per-frame GC spikes.
export function gripRope(c,ropeY,ropeZ,{dt=1/60,still=false,reach=1}={}){
 c.root.updateMatrixWorld(true);
 const s=c.gripScratch??=(Object.fromEntries(['down','shoulder','target','direction','bend','previous','elbow','fore','rest'].map(key=>[key,c.root.position.clone()])));
 s.inverseBody??=c.body.matrixWorld.clone();s.inverseArm??=c.root.quaternion.clone();
 s.down.set(0,-1,0);s.inverseBody.copy(c.body.matrixWorld).invert();c.gripBends??=[];
 for(let j=0;j<c.arms.length;j++){
  const arm=c.arms[j];arm.getWorldPosition(s.shoulder);
  s.target.set(s.shoulder.x,ropeY+.04,ropeZ+.10).applyMatrix4(s.inverseBody);
  if(reach<1){s.rest.copy(arm.position).addScaledVector(s.down,.66);s.target.lerpVectors(s.rest,s.target,Math.max(0,reach));}
  s.target.sub(arm.position);const d=s.target.length();
  if(d>1e-8)s.direction.copy(s.target).multiplyScalar(1/d);else s.direction.copy(s.down);
  const upper=.32,lower=.34,distance=Math.max(Math.abs(upper-lower)+1e-7,Math.min(d,upper+lower-1e-7));
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  s.bend.set(j?.85:-.85,-.12,-.3).addScaledVector(s.direction,-s.bend.dot(s.direction));
  if(s.bend.lengthSq()<1e-10)s.bend.crossVectors(s.direction,s.down);
  if(s.bend.lengthSq()<1e-10)s.bend.set(1,0,0);s.bend.normalize();
  if(c.gripBends[j]&&!still){s.previous.copy(c.gripBends[j]).addScaledVector(s.direction,-c.gripBends[j].dot(s.direction));if(s.previous.lengthSq()>1e-8)s.bend.copy(s.previous.normalize().lerp(s.bend,1-Math.exp(-12*Math.max(0,Math.min(.1,dt))))).normalize();}
  (c.gripBends[j]??=s.bend.clone()).copy(s.bend);
  s.elbow.copy(s.direction).multiplyScalar(along).addScaledVector(s.bend,height);
  arm.quaternion.setFromUnitVectors(s.down,s.fore.copy(s.elbow).normalize());
  s.fore.copy(s.direction).multiplyScalar(distance).sub(s.elbow).normalize().applyQuaternion(s.inverseArm.copy(arm.quaternion).invert());
  c.elbows[j].quaternion.setFromUnitVectors(s.down,s.fore);
 }
}
