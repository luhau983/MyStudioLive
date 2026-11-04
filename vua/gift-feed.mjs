const clean=(value,max)=>String(value??'').replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,max);
export class GiftFeed{
  constructor(now=Date.now){this.now=now;this.sequence=0;this.queue=[];this.seen=new Map();}
  accept(data,{simulated=false}={}){
    const userId=clean(data.user?.uniqueId||data.user?.displayId||data.uniqueId,128);if(!userId)return null;
    // Streak updates are cumulative; announce once when the streak is complete.
    if(Number(data.giftDetails?.giftType??data.gift?.type??data.giftType)===1&&data.repeatEnd!==true&&Number(data.repeatEnd)!==1)return null;
    const count=Number(data.repeatCount??1);if(!Number.isSafeInteger(count)||count<1||count>1000000)return null;
    const giftId=clean(data.giftId||data.gift?.id,64),group=clean(data.groupId,128),message=clean(data.common?.msgId||data.msgId,128);
    const key=group&&group!=='0'?`${userId}:${giftId}:${group}`:message&&message!=='0'?`${userId}:${giftId}:${message}`:null;
    const now=this.now();for(const [id,at] of this.seen)if(now-at>120000)this.seen.delete(id);
    if(key&&this.seen.has(key))return null;
    if(key){this.seen.set(key,now);if(this.seen.size>1000)this.seen.delete(this.seen.keys().next().value);}
    const event={seq:++this.sequence,userId,nickname:clean(data.user?.nickname||data.nickname||userId,40),giftName:clean(data.giftDetails?.giftName||data.gift?.name||data.giftName||data.extendedGiftInfo?.name||'món quà',60),count,simulated,at:now};
    this.snapshot();this.queue.push(event);if(this.queue.length===1)this.until=now+4500;
    if(this.queue.length>20)this.queue.splice(1,1);
    return event;
  }
  snapshot(){
    const now=this.now();while(this.queue.length&&(now>=this.until||now-this.queue[0].at>60000)){this.queue.shift();this.until=now+4500;}
    return this.queue.length?{...this.queue[0],remaining:this.until-now}:null;
  }
  clear(){this.queue=[];this.seen.clear();}
}
