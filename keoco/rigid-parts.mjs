// Merge rigid pieces attached to the same joint. Bone-driven skins stay separate.
// Cached geometry is shared across viewers and is never rebuilt during a handoff.
const cache=new WeakMap();
export function mergeRigidParts(root,T,{keep=[]}={}){
 let geometries=cache.get(T);if(!geometries){geometries=new Map();cache.set(T,geometries);}
 const parents=[];root.traverse(o=>parents.push(o));
 for(const parent of parents){
  const buckets=new Map();
  for(const m of parent.children){
   if(!m.isMesh||m.isSkinnedMesh||m.children.length||!m.visible||Array.isArray(m.material)||m.material.transparent||keep.includes(m))continue;
   const key=m.material.uuid+':'+!!m.userData.smallDetail+':'+!!m.userData.farDetail;
   if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(m);
  }
  for(const parts of buckets.values()){
   if(parts.length<2)continue;
   parts.forEach(m=>m.updateMatrix());
   const key=parts.map(m=>m.geometry.uuid+':'+m.matrix.elements.join(',')).join('|');
   let geometry=geometries.get(key);
   if(!geometry){
    const flat=parts.map(m=>(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrix));
    geometry=new T.BufferGeometry();
    for(const name of ['position','normal','uv']){
     const size=name==='uv'?2:3,data=new Float32Array(flat.reduce((n,g)=>n+g.attributes[name].array.length,0));let offset=0;
     for(const g of flat){data.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
     geometry.setAttribute(name,new T.BufferAttribute(data,size));
    }
    flat.forEach(g=>g.dispose());geometry.computeBoundingSphere();geometries.set(key,geometry);
   }
   const mesh=new T.Mesh(geometry,parts[0].material);mesh.castShadow=parts.some(m=>m.castShadow);mesh.receiveShadow=parts.some(m=>m.receiveShadow);
   mesh.userData.smallDetail=parts[0].userData.smallDetail;mesh.userData.farDetail=parts[0].userData.farDetail;mesh.userData.mainSilhouette=parts.some(m=>m.userData.mainSilhouette);
   parts.forEach(m=>parent.remove(m));parent.add(mesh);
  }
 }
}
