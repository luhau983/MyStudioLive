// Presentation only: back-and-forth rope surges, puller faces and sweat.
// Never feeds back into scores or the authoritative rope position.
const clamp=(x,lo=0,hi=1)=>Math.max(lo,Math.min(hi,x));
const TAU=Math.PI*2;

// Two out-of-phase heaves so the rope never settles; amplitude shrinks as one
// side runs away with the round, keeping the authoritative lead readable.
export function ropeHeave(time,position=0){
 const t=Number.isFinite(time)?time:0,amp=.32*(1-.55*clamp(Math.abs(Number(position)||0)));
 return amp*(Math.sin(TAU*t/1.9)+.45*Math.sin(TAU*t/.8+1.3))/1.45;
}

// Underdamped spring: score swings overshoot slightly before the rope settles.
export function springRope(s,target,dt,still){
 if(still||!s)return {x:target,v:0};
 let {x,v}=s,left=clamp(Number.isFinite(dt)?dt:0,0,.1);
 while(left>1e-6){const h=Math.min(left,1/120);v+=(18*(target-x)-5.5*v)*h;x+=v*h;left-=h;}
 return {x,v};
}

// Positive when the rope is moving toward the opponents, i.e. this team is
// being yanked off its feet; negative while this team is heaving it home.
export function teamDrag(side,ropeVelocity){
 return clamp((side==='red'?1:-1)*(Number(ropeVelocity)||0)/1.2,-1,1);
}

// FNV-1a plus an avalanche step: near-identical IDs (bot-red-0, bot-red-1)
// must still land far apart.
function seedOf(id){
 let h=0x811c9dc5;for(const ch of String(id??'')){h^=ch.codePointAt(0);h=Math.imul(h,0x01000193);}
 h^=h>>>16;h=Math.imul(h,0x45d9f3b);h^=h>>>16;
 return (h>>>0)/4294967296;
}

// Tile order of assets/crowd-faces/pull-atlas.png.
export const PULL_FACES=['rage','squint','scrunch','grin','wail','gasp','evil','brows'];
const MOODS={
 yanked:['gasp','shock'],
 leading:['grin','evil','happy'],
 losing:['rage','scrunch','wail','strain'],
 even:['squint','pull','rage','strain','brows'],
};

// Each puller walks its own staggered cycle through the mood's faces, so a
// team never pulls the same face in unison.
function pick(list,id,time){const seed=seedOf(id);return list[Math.floor(time/1.7+seed*list.length)%list.length];}

// strain: teamStrain (0.5 even, >0.5 losing). Holds each face briefly so it
// reads on stream instead of flickering frame to frame.
export function pullExpression(prev,{id,time=0,strain=.5,drag=0,dt=0,still=false}={}){
 const t=Math.max(0,Number(time)||0);
 const mood=drag>.45?'yanked':strain<.28?'leading':strain>.64?'losing':'even';
 const want=pick(MOODS[mood],id,t);
 const shock=mood==='yanked';
 if(still)return {expression:want,hold:0};
 const hold=Math.max(0,(prev?.hold??0)-Math.max(0,dt||0));
 if(prev?.expression&&prev.expression!==want&&hold>0&&!shock)return {expression:prev.expression,hold};
 return {expression:want,hold:prev?.expression===want?hold:.5};
}

// Result faces: winners rotate through gloating faces; losers stay within
// their defeat pose's style so a crying pose never wears a grin.
const RESULT_FACES={
 win:['victory','grin','evil','cool'],
 cry:['cry','wail'],
 sad:['sad','scrunch'],
 speechless:['speechless','brows','squint'],
};
export function resultExpression({id,time=0,win=false,style='cry'}={}){
 const list=win?RESULT_FACES.win:RESULT_FACES[style]||RESULT_FACES.cry;
 return pick(list,id,Math.max(0,Number(time)||0)*.6);
}

// 0..1: sweat builds over the round, faster for the losing side and in the
// final seconds.
export function sweatLevel({pullElapsed=0,strain=.5,secondsLeft=Infinity}={}){
 const effort=clamp((pullElapsed-3)/12)*.55+clamp((strain-.4)/.35)*.35+(secondsLeft<=10?.25:0);
 return clamp(effort);
}

// Drop i of n slides down the temple on its own cycle; visible drops scale
// with the sweat level. Returns null for hidden drops.
export function sweatDrop(i,{time=0,level=0,seed=0,count=3}={}){
 if(level<=0||i>=Math.ceil(level*count))return null;
 const period=1.1+.35*i,phase=((time+seed*period+i*.37)/period)%1;
 return {fall:phase,opacity:phase<.15?phase/.15:phase>.8?(1-phase)/.2:1};
}
