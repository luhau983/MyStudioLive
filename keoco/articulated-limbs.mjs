// A single continuous surface spans each joint. The same two bones still drive
// the hand/foot attachments and rope IK, so there is no separate visual rig.
const cache=new WeakMap();
function geometryFor(T,{upper,lower,radius,tipRadius,depth,ripped}){
 let geometries=cache.get(T);if(!geometries){geometries=new Map();cache.set(T,geometries);}
 const key=[upper,lower,radius,tipRadius,depth,ripped].join(':');if(geometries.has(key))return geometries.get(key);
 const length=upper+lower,g=new T.CylinderGeometry(radius,tipRadius,length,16,20,false);g.translate(0,-length/2,0);
 const p=g.attributes.position,indices=[],weights=[];
 for(let i=0;i<p.count;i++){
  const distance=-p.getY(i),jointBulge=1+.035*Math.exp(-Math.pow((distance-upper)/.085,2));
  p.setXYZ(i,p.getX(i)*jointBulge,p.getY(i),p.getZ(i)*depth*jointBulge);
  const blend=T.MathUtils.smoothstep(distance,upper-radius*1.25,upper+radius*1.25);
  indices.push(0,1,0,0);weights.push(1-blend,blend,0,0);
 }
 g.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 if(ripped){
  const old=g.index,keep=[];
  for(let i=0;i<old.count;i+=3){const a=old.getX(i),b=old.getX(i+1),c=old.getX(i+2),x=(p.getX(a)+p.getX(b)+p.getX(c))/3,y=(p.getY(a)+p.getY(b)+p.getY(c))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3;
   if(!(Math.abs(x)<.085&&y<-.20&&y>-.27&&z>.105))keep.push(a,b,c);
  }g.setIndex(keep);
 }
 g.computeVertexNormals();geometries.set(key,g);return g;
}
export function addLimbSkin(parent,{THREE:T,rootBone,jointBone,material,upper=.32,lower=.34,radius=.112,tipRadius=.095,depth=1,ripped=false,shadow=false,sourceGeometry=null}){
 if(!rootBone?.isBone||!jointBone?.isBone)throw new TypeError('Limb skin needs the actual animated bones');
 let geometry=geometryFor(T,{upper,lower,radius,tipRadius,depth,ripped});
 if(sourceGeometry){geometry=sourceGeometry.clone();const p=geometry.attributes.position,indices=[],weights=[];for(let i=0;i<p.count;i++){const blend=T.MathUtils.smoothstep(-p.getY(i),upper-radius*1.25,upper+radius*1.25);indices.push(0,1,0,0);weights.push(1-blend,blend,0,0);}geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));}
 const mesh=new T.SkinnedMesh(geometry,material);
 mesh.name='continuous-limb-skin';mesh.userData.ownsGeometry=!!sourceGeometry;mesh.userData.smallDetail=!!sourceGeometry;mesh.userData.skipOutline=true;mesh.frustumCulled=true;mesh.boundingSphere=new T.Sphere(new T.Vector3(0,-upper,0),upper+lower+.22);mesh.castShadow=mesh.receiveShadow=shadow;parent.add(mesh);
 rootBone.updateWorldMatrix(true,true);mesh.bind(new T.Skeleton([rootBone,jointBone]));return mesh;
}
