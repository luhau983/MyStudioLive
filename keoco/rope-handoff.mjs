import {characterPose, LEG_SEGMENT} from './stage-character-poses.mjs';

export const ROPE_HELD_Y=.66, ROPE_GROUND_Y=.085;
const durations={release:.18,drop:.45,reach:.65,lift:.85};
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{const u=clamp(x);return u*u*(3-2*u);};

// Presentation only. One shared clock prevents individual arrivals from lifting
// the rope while their teammates are still running to their places.
export function advanceRopeHandoff(previous,{phase,dt=0,ready=false,hasPlayers=false,paused=false,reducedMotion=false}={}){
 let s=previous?{...previous}:{phase:null,stage:'ground',elapsed:0,height:ROPE_GROUND_Y,reach:0,crouch:0};
 if(paused)return s;
 if(phase==='pull')return sample({...s,phase,stage:'held',elapsed:0});
 if(!['result','transition','lobby','countdown'].includes(phase))return sample({...s,phase,stage:'ground',elapsed:0});
 if(phase==='result'&&s.phase!=='result')s={...s,stage:s.height>ROPE_GROUND_Y?'release':'ground',elapsed:0,dropFrom:s.height};
 s.phase=phase;
 const canPickup=phase!=='result'&&ready&&hasPlayers;
 if(reducedMotion)return sample({...s,stage:canPickup?'held':'ground',elapsed:0});
 if((s.stage==='reach'||s.stage==='lift')&&!canPickup)s={...s,stage:'ground',elapsed:0};
 if(s.stage==='ground'&&canPickup)s={...s,stage:'reach',elapsed:0};
 s.elapsed+=Math.max(0,Number.isFinite(dt)?dt:0);
 // Carry excess time across stages, including slow frames, without replaying a
 // completed drop when countdown begins or a paused round resumes.
 while(durations[s.stage]&&s.elapsed>=durations[s.stage]){
  s.elapsed-=durations[s.stage];
  s.stage={release:'drop',drop:'ground',reach:'lift',lift:'held'}[s.stage];
  if(s.stage==='ground'&&canPickup)s.stage='reach';
 }
 return sample(s);
}

function sample(s){
 const progress=durations[s.stage]?clamp(s.elapsed/durations[s.stage]):0;
 let height=ROPE_GROUND_Y,reach=0,crouch=0;
 if(s.stage==='held'){height=ROPE_HELD_Y;reach=1;}
 if(s.stage==='release'){height=s.dropFrom??ROPE_HELD_Y;reach=1-ease(progress);}
 if(s.stage==='drop')height=ROPE_GROUND_Y+((s.dropFrom??ROPE_HELD_Y)-ROPE_GROUND_Y)*(1-progress*progress);
 if(s.stage==='reach'){crouch=ease(progress);reach=ease(progress);}
 if(s.stage==='lift'){const lift=ease(progress);height=ROPE_GROUND_Y+(ROPE_HELD_Y-ROPE_GROUND_Y)*lift;reach=1;crouch=1-lift;}
 return {...s,height,reach,crouch};
}

export function ropePickupPose(handoff){
 const pose=characterPose({phase:'countdown'}),c=handoff.crouch;
 pose.thighReach=1.4*c;pose.kneeBend=2.5*c;pose.bodyPitch=.68*c;
 pose.bodyDrop=LEG_SEGMENT*(2-Math.cos(pose.thighReach)-Math.cos(pose.thighReach-pose.kneeBend));
 pose.headNod=.32*c;
 return pose;
}
