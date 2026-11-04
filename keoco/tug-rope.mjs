// One reusable tube: taut between the last grips, slack tails resting on the floor.
// Fixed buffers avoid allocating TubeGeometry or running a physics solver per frame.
export function createTugRope(T,{material,radius=.075,tailLength=2.2,groundY=.085}={}){
 const steps=20,radial=10,rings=steps*2+2,stride=radial+1,count=rings*stride;
 const position=new T.Float32BufferAttribute(new Float32Array((count+2)*3),3),normal=new T.Float32BufferAttribute(new Float32Array((count+2)*3),3),uv=new T.Float32BufferAttribute(new Float32Array((count+2)*2),2);
 const path=new Float64Array(rings*3),indices=[];
 for(let i=0;i<rings-1;i++)for(let j=0;j<radial;j++){const a=i*stride+j,b=a+stride;indices.push(a,a+1,b,a+1,b+1,b);}
 for(let j=0;j<radial;j++){indices.push(count,j+1,j);const a=(rings-1)*stride+j;indices.push(count+1,a,a+1);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',position);geometry.setAttribute('normal',normal);geometry.setAttribute('uv',uv);geometry.setIndex(indices);
 for(const attr of [position,normal,uv])attr.setUsage(T.DynamicDrawUsage);
 const mesh=new T.Mesh(geometry,material);mesh.name='tug-rope';mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;
 const profile={left:-4.4,right:4.4,height:groundY,groundY,tailLength,path};let lastLeft,lastRight,lastHeight;
 const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 function update({left=-4.4,right=4.4,height=groundY}={}){
  if(Math.abs(left-lastLeft)<.0001&&Math.abs(right-lastRight)<.0001&&Math.abs(height-lastHeight)<.0001)return;
  lastLeft=left;lastRight=right;lastHeight=height;profile.left=left;profile.right=right;profile.height=height;
  // Centre height is supplied by the shared pickup/drop clock. Tails stay on the floor.
  for(let i=0;i<rings;i++){
   const leftSide=i<=steps,u=leftSide?1-i/steps:(i-steps-1)/steps;
   const anchor=leftSide?left:right,sign=leftSide?-1:1;
   path[i*3]=anchor+sign*tailLength*u;
   path[i*3+1]=(groundY-height)*ease(u/.68);
   path[i*3+2]=.4*ease((u-.48)/.52);
  }
  let arc=0;
  for(let i=0;i<rings;i++){
   const k=i*3,a=Math.max(0,i-1)*3,b=Math.min(rings-1,i+1)*3;
   let tx=path[b]-path[a],ty=path[b+1]-path[a+1],tz=path[b+2]-path[a+2];
   const length=Math.hypot(tx,ty,tz)||1;tx/=length;ty/=length;tz/=length;
   const xy=Math.hypot(tx,ty)||1,nx=-ty/xy,ny=tx/xy,bx=-tz*ny,by=tz*nx,bz=tx*ny-ty*nx;
   if(i)arc+=Math.hypot(path[k]-path[k-3],path[k+1]-path[k-2],path[k+2]-path[k-1]);
   for(let j=0;j<=radial;j++){
    const angle=j/radial*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle),x=nx*c+bx*s,y=ny*c+by*s,z=bz*s,v=i*stride+j;
    position.setXYZ(v,path[k]+radius*x,path[k+1]+radius*y,path[k+2]+radius*z);normal.setXYZ(v,x,y,z);uv.setXY(v,j/radial,arc/.38);
   }
   if(i===0||i===rings-1){const end=i===0?count:count+1,sign=i===0?-1:1;position.setXYZ(end,path[k],path[k+1],path[k+2]);normal.setXYZ(end,sign*tx,sign*ty,sign*tz);uv.setXY(end,.5,arc/.38);}
  }
  position.needsUpdate=normal.needsUpdate=uv.needsUpdate=true;
 }
 update();return {mesh,update,profile};
}
