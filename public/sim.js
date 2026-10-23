const W=2600,H=1600,TICK=1/30;
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=(v,max)=>(v%max+max)%max;
const diff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const delta=(a,b,size)=>{let d=a-b;return d-Math.round(d/size)*size;};
const distance=(a,b)=>Math.hypot(delta(a.x,b.x,W),delta(a.y,b.y,H));
function makeObstacles(){const o=[];for(let i=0;i<100;i++){let x=rand(90,W-90),y=rand(90,H-90);if(Math.hypot(delta(x,W/2,W),delta(y,H/2,H))<240)continue;const type=i%7===0?'rock':i%3===0?'concrete':'wood';o.push({id:i,x,y,r:type==='rock'?32:type==='concrete'?37:28,type,hp:type==='rock'?999: type==='concrete'?160:65,maxHp:type==='rock'?999:type==='concrete'?160:65});}return o;}
const shellStats={AP:{velocity:590,obstacleMultiplier:.24,splash:0},HE:{velocity:450,obstacleMultiplier:2.65,splash:51}};
const classes=[{type:'scout',hp:35,speed:69,damage:8,reload:2.4,range:320,r:14,mass:18,power:28},{type:'normal',hp:85,speed:60,damage:14,reload:3.3,range:410,r:17,mass:36,power:43},{type:'sniper',hp:72,speed:43,damage:30,reload:5.7,range:640,r:19,mass:46,power:35},{type:'heavy',hp:185,speed:30,damage:25,reload:5,range:430,r:24,mass:78,power:70}];
function makeRoom(code){return {code,clients:{driver:null,gunner:null},tank:{x:W/2,y:H/2,a:0,turret:0,hp:220,maxHp:220,ammo:28,ammoAP:22,ammoHE:8,shell:'AP',speed:0,reload:0,reloadDuration:3.25,r:24,mass:55,power:60},inputs:{driver:{drive:0,turn:0},gunner:{aim:0,shot:0}},enemies:[],bullets:[],obstacles:makeObstacles(),crates:[],effects:[],popups:[],wave:0,kills:0,spawnTimer:0,elapsed:0,lastActivity:Date.now(),bulletId:1,enemyId:1,crateId:1,navBudget:0,navCache:null,navCacheRevision:-1};}


// Obstacles are drawn as solid squares: collision must use the same geometry.
function collideOb(x,y,r,obstacles){
 return obstacles.find(o=>o.hp>0 && Math.hypot(
   Math.max(0,Math.abs(delta(x,o.x,W))-o.r),
   Math.max(0,Math.abs(delta(y,o.y,H))-o.r))<r+2);
}
function clearSpawn(p,r,room){return !collideOb(p.x,p.y,r+10,room.obstacles) &&
 !room.enemies.some(e=>e.hp>0&&distance(e,p)<e.r+r+12) && distance(p,room.tank)>420;}
function spawnWave(room){
 room.wave++;const count=Math.min(1+room.wave,4); // Test mode: wave 1 = 2, wave 2 = 3, later waves = 4 max.
 for(let i=0;i<count;i++){
  const c=classes[Math.min(classes.length-1,Math.floor(rand(0,Math.min(classes.length,1+room.wave/2))))];
  let p=null;
  for(let k=0;k<180;k++){const q={x:rand(0,W),y:rand(0,H)};if(clearSpawn(q,c.r,room)){p=q;break;}}
  if(!p)continue; // Never spawn a tank within a wall.
  room.enemies.push({id:room.enemyId++,...p,a:rand(-Math.PI,Math.PI),turret:0,
   type:c.type,hp:c.hp,maxHp:c.hp,damage:c.damage,reload:c.reload,heStock:(c.type==='scout'?0:2),
   cooldown:rand(0,3),range:c.range,r:c.r,speed:c.speed,velocity:0,
   aiMode:'approach',reverseUntil:0,stuckFor:0,lastX:p.x,lastY:p.y,
   routeAngle:0,routeUntil:0,tactic:'hold',tacticUntil:0,tacticPoint:null,tacticNext:0,lastSeen:{x:W/2,y:H/2,a:0},lastSeenAt:room.elapsed,coverSide:Math.random()<.5?1:-1,preferredRange:c.range*(c.type==='scout'?.66:c.type==='sniper'?.83:.75),avoidSide:Math.random()<.5?1:-1,navPath:[],navAt:0,navTarget:-1,navObstacleCount:0,stuckAttempts:0,navBlockedFor:0});
 }
 room.spawnTimer=4;
}
// Sweep through motion in small steps; no enemy can teleport through walls.
// Circle-circle contact and mass/engine-based pushing. The wall check is mandatory
// for both pusher and pushed tank. Positions wrap at the map edges.
function allTanks(room){return [room.tank,...room.enemies.filter(e=>e.hp>0)];}
function contacts(a,b){return Math.hypot(delta(a.x,b.x,W),delta(a.y,b.y,H)) < a.r+b.r+.001;}
function validTankPosition(t,x,y,room){return !collideOb(x,y,t.r,room.obstacles);}
function shiftTank(t,dx,dy,room){
 const nx=wrap(t.x+dx,W),ny=wrap(t.y+dy,H);
 if(!validTankPosition(t,nx,ny,room))return false;
 t.x=nx;t.y=ny;return true;
}
function move(e,v,dt,room){
 const displacement=v*dt,n=Math.max(1,Math.ceil(Math.abs(displacement)/3));
 let moved=false,blocked=false;
 for(let i=0;i<n;i++){
  const dx=Math.cos(e.a)*displacement/n,dy=Math.sin(e.a)*displacement/n;
  const nx=wrap(e.x+dx,W),ny=wrap(e.y+dy,H);
  if(!validTankPosition(e,nx,ny,room)){blocked=true;break;}
  // Resolve contacts during the proposed motion; don't allow a tank to pass
  // through others. A stronger engine and heavier chassis can push gradually.
  const bodies=allTanks(room);
  let possible=true;
  for(const other of bodies){if(other===e||other.hp<=0)continue;
   const vx=delta(nx,other.x,W),vy=delta(ny,other.y,H);
   const dist=Math.hypot(vx,vy),minimum=e.r+other.r+1;
   if(dist>=minimum)continue;
   const overlap=minimum-dist;
   const force=(e.power||40)*Math.sqrt((e.mass||35)/40);
   const resistance=(other.power||40)*Math.sqrt((other.mass||35)/40);
   // Pushing only while actually moving into the other tank.
   const forward=(dx*(-vx)+dy*(-vy))>0;
   const share=force/(force+resistance);
   if(!forward||share<.34){possible=false;break;}
   const ux=dist>.00001?vx/dist:-Math.cos(e.a),uy=dist>.00001?vy/dist:-Math.sin(e.a);
   const push=Math.min(overlap+1,Math.hypot(dx,dy)*2);
   const ox=other.x,oy=other.y;
   if(!shiftTank(other,-ux*push,-uy*push,room)){possible=false;break;}
   // Reject push if it runs into a third tank.
   if(bodies.some(third=>third!==other&&third!==e&&third.hp>0&&contacts(other,third))){other.x=ox;other.y=oy;possible=false;break;}
   if(Math.hypot(delta(nx,other.x,W),delta(ny,other.y,H))<minimum-.5){
     other.x=ox;other.y=oy;possible=false;break;
   }
  }
  if(!possible){blocked=true;break;}
  e.x=nx;e.y=ny;moved=true;
 }
 if(blocked)e.velocity*=.55;
 return moved;
}
// Separate pre-existing overlaps after spawn/reconnection without passing through walls.
function separateTanks(room){
 const bodies=allTanks(room);
 for(let pass=0;pass<3;pass++){
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
   const a=bodies[i],b=bodies[j];if(a.hp<=0||b.hp<=0)continue;
   const dx=delta(b.x,a.x,W),dy=delta(b.y,a.y,H),dist=Math.hypot(dx,dy),min=a.r+b.r+1;
   if(dist>=min)continue;
   const nx=dist>.001?dx/dist:1,ny=dist>.001?dy/dist:0,penetration=min-dist;
   const sa=b.mass+b.mass?b.mass/(a.mass+b.mass):.5,sb=1-sa;
   const ax=a.x,ay=a.y,bx=b.x,by=b.y;
   if(!shiftTank(a,-nx*penetration*sa,-ny*penetration*sa,room) ||
      !shiftTank(b,nx*penetration*sb,ny*penetration*sb,room)){
     a.x=ax;a.y=ay;b.x=bx;b.y=by;
     if(!shiftTank(b,nx*penetration,ny*penetration,room))shiftTank(a,-nx*penetration,-ny*penetration,room);
   }
  }
 }
}
// Ray against actual solid square obstacle bounds (the same bounds as rendering).
function segmentObstructed(x0,y0,x1,y1,obstacles,pad=0){
 const dx=delta(x1,x0,W),dy=delta(y1,y0,H);
 for(const o of obstacles){if(o.hp<=0)continue;
  const ox=delta(o.x,x0,W),oy=delta(o.y,y0,H),h=o.r+pad;
  let lo=0,hi=1,hit=true;
  for(const [p,d] of [[ox,dx],[oy,dy]]){
   if(Math.abs(d)<1e-8){if(Math.abs(p)>h){hit=false;break;}continue;}
   const a=(p-h)/d,b=(p+h)/d;
   lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
   if(lo>hi){hit=false;break;}
  }
  if(hit&&hi>=0&&lo<=1)return true;
 }
 return false;
}
function fire(room,owner,e,damage,angle=e.turret,shell='AP'){
 const a=angle,velocity=shellStats[shell].velocity;
 room.bullets.push({id:room.bulletId++,owner,shell,x:wrap(e.x+Math.cos(a)*(e.r+7),W),y:wrap(e.y+Math.sin(a)*(e.r+7),H),vx:Math.cos(a)*velocity,vy:Math.sin(a)*velocity,life:2.25,damage,r:4,originX:e.x,originY:e.y,travel:0});
}
// Circle hull collision in the wrapped world, calculated along bullet travel segment.
function bulletTankHit(b,x0,y0,x1,y1,t){
 const sx=delta(t.x,x0,W),sy=delta(t.y,y0,H),dx=delta(x1,x0,W),dy=delta(y1,y0,H),len=dx*dx+dy*dy;
 const f=len>0?clamp((sx*dx+sy*dy)/len,0,1):0;
 return Math.hypot(sx-dx*f,sy-dy*f)<=t.r+3?f:null;
}
function bulletObstacleHit(x0,y0,x1,y1,o){
 const dx=delta(x1,x0,W),dy=delta(y1,y0,H),ox=delta(o.x,x0,W),oy=delta(o.y,y0,H),h=o.r+3;
 let lo=0,hi=1;
 for(const [p,d] of [[ox,dx],[oy,dy]]){
  if(Math.abs(d)<1e-8){if(Math.abs(p)>h)return null;continue;}
  const a=(p-h)/d,z=(p+h)/d;lo=Math.max(lo,Math.min(a,z));hi=Math.min(hi,Math.max(a,z));if(lo>hi)return null;
 }
 return lo>=0&&lo<=1?lo:null;
}
function armorOf(t){
 if(!t.type)return {front:72,side:44,rear:25};
 return ({scout:{front:19,side:12,rear:8},normal:{front:53,side:33,rear:18},sniper:{front:48,side:30,rear:20},heavy:{front:130,side:75,rear:39}})[t.type]||{front:55,side:35,rear:20};
}
function addPopup(room,x,y,text,color='#ffffff'){
 room.popups.push({x,y,text,color,life:0.95,vy:16});
}
function popupForHit(room,t,damage,result){
 const amount=Math.max(1,Math.round(damage));
 let text='-'+amount,color='#ffffff';
 if(result==='penetrated'){color=amount>=20?'#ff6d64':'#ffd08b';}
 else if(result==='blast'){color='#ffd08b';}
 else if(result==='ricochet'){text='-'+amount;color='#bfe7ff';}
 else if(result==='blocked'){color='#dfe4df';}
 addPopup(room,t.x,t.y-t.r-10,text,color);
}
function hitTank(room,b,t,impactX,impactY){
 const shotAngle=Math.atan2(b.vy,b.vx),relative=Math.abs(diff(shotAngle,t.a));
 // Shot arriving in the same direction as the hull facing hits the rear.
 const facing=relative>Math.PI*0.7?'front':relative<Math.PI*.3?'rear':'side';
 const armor=armorOf(t)[facing],obliquity=facing==='side'?1.12:1;
 const rangeFactor=clamp(1-b.travel/(b.shell==='AP'?2100:2700),.55,1);
 const penetration=(b.shell==='AP'?(b.owner==='player'?96:b.damage*3.2):(b.owner==='player'?25:b.damage*1.05))*rangeFactor;
 const ratio=penetration/(armor*obliquity);
 let damage=0,result='blocked';
 if(b.shell==='HE'){
   // HE causes blast/chipping even without penetrating but is weak vs heavy armor.
   damage=b.damage*(ratio>=1?.69:clamp(.09+ratio*.27,.07,.4));
   result=ratio>=1?'penetrated':'blast';
 }else if(ratio>=1){damage=b.damage*clamp(.76+(ratio-1)*.23,.76,1.15);result='penetrated';}
 else if(ratio>.72){damage=b.damage*.07;result='blocked';}
 else {damage=b.damage*.012;result='ricochet';}
 t.hp=Math.max(0,t.hp-damage);
 if(damage>0.05)popupForHit(room,t,damage,result);
 room.effects.push({x:impactX,y:impactY,kind:result,life:.45});
 if(t!==room.tank&&t.hp<=0){room.kills++;if(Math.random()<.12)room.crates.push({id:room.crateId++,x:t.x,y:t.y,ammo:rand(6,12)|0});}
}
function explode(room,b,x,y){
 const radius=shellStats.HE.splash;
 room.effects.push({x,y,kind:'explosion',life:.36});
 // Blast is heavily attenuated behind hard cover, and never passes through a solid wall.
 const tanks=b.owner==='player'?room.enemies:[room.tank];
 for(const t of tanks){if(t.hp<=0)continue;const d=distance({x,y},t);if(d>radius+t.r)continue;
  if(segmentObstructed(x,y,t.x,t.y,room.obstacles,1))continue;
  const damage=b.damage*.23*(1-clamp(d/(radius+t.r),0,1));
  t.hp=Math.max(0,t.hp-damage);
  if(damage>0.05)popupForHit(room,t,damage,'blast');
  if(t!==room.tank&&t.hp<=0){room.kills++;}
 }
}
// Toroidal navigation grid. Obstacles are expanded by each tank's collision radius.
// A* finds a complete route around buildings, not just a local steering direction.
const CELL=50, COLS=W/CELL, ROWS=H/CELL;
function navIndex(x,y){return wrap(Math.floor(wrap(x,W)/CELL),COLS)+COLS*wrap(Math.floor(wrap(y,H)/CELL),ROWS);}
function navCenter(i){return {x:(i%COLS+.5)*CELL,y:(Math.floor(i/COLS)+.5)*CELL};}
function navGrid(e,room){
 const cacheKey=e.r>=23?'large':e.r>=18?'medium':'small';
 const cached=room.navCache?.[cacheKey];if(cached)return cached;
 const blocked=new Uint8Array(COLS*ROWS);
 for(let i=0;i<blocked.length;i++){
  const p=navCenter(i);
  // Small margin prevents grazing wall edges while turning.
  if(collideOb(p.x,p.y,e.r+6,room.obstacles))blocked[i]=1;
 }
 (room.navCache??={})[cacheKey]=blocked;return blocked;
}
function heapPush(heap,node){heap.push(node);let i=heap.length-1;while(i>0){let parent=(i-1)>>1;if(heap[parent][0]<=node[0])break;heap[i]=heap[parent];i=parent;}heap[i]=node;}
function heapPop(heap){const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let a=2*i+1,b=a+1;if(a>=heap.length)break;let c=b<heap.length&&heap[b][0]<heap[a][0]?b:a;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;}
function findNavPath(e,t,room){
 const blocked=navGrid(e,room),start=navIndex(e.x,e.y),goal=navIndex(t.x,t.y);
 // Cached grid must not be mutated.
 const isBlocked=i=>i!==start&&blocked[i]!==0;
 // Target near a wall? Locate the nearest reachable free cell instead.
 let end=goal;
 if(isBlocked(end)){
  let best=Infinity;
  for(let i=0;i<blocked.length;i++)if(!isBlocked(i)){const p=navCenter(i);const d=distance(p,t);if(d<best){best=d;end=i;}}
 }
 const cost=new Float64Array(blocked.length);cost.fill(Infinity);
 const previous=new Int32Array(blocked.length);previous.fill(-1);
 const heap=[],heuristic=(i)=>{const x=i%COLS,y=(i/COLS)|0,gx=end%COLS,gy=(end/COLS)|0;const dx=Math.min(Math.abs(x-gx),COLS-Math.abs(x-gx)),dy=Math.min(Math.abs(y-gy),ROWS-Math.abs(y-gy));return (Math.max(dx,dy)+(Math.SQRT2-1)*Math.min(dx,dy))*CELL;};
 cost[start]=0;heapPush(heap,[heuristic(start),start,0]);
 const dirs=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
 while(heap.length){const [,at,g]=heapPop(heap);if(g>cost[at]+.001)continue;if(at===end)break;
  const x=at%COLS,y=(at/COLS)|0;
  for(const [dx,dy,factor] of dirs){const nx=wrap(x+dx,COLS),ny=wrap(y+dy,ROWS),next=ny*COLS+nx;
   if(isBlocked(next))continue;
   // Prevent diagonal cutting through the corner of a building.
   if(dx&&dy&&(isBlocked(y*COLS+wrap(x+dx,COLS))||isBlocked(wrap(y+dy,ROWS)*COLS+x)))continue;
   const ng=g+factor*CELL;if(ng>=cost[next])continue;
   cost[next]=ng;previous[next]=at;heapPush(heap,[ng+heuristic(next),next,ng]);
  }
 }
 if(end!==start&&previous[end]===-1)return [];
 const indices=[];let cur=end;
 while(cur!==start&&indices.length<blocked.length){indices.push(cur);cur=previous[cur];if(cur<0)return [];}
 indices.reverse();return indices.map(navCenter);
}
// Tactical position scoring runs infrequently per enemy. It is separate from movement,
// so pathfinding remains staggered and never runs for every candidate/each tick.
function clearTacticalPoint(e,p,room){return !collideOb(p.x,p.y,e.r+9,room.obstacles) &&
 !room.enemies.some(o=>o!==e&&o.hp>0&&distance(p,o)<e.r+o.r+16);}
// Each enemy owns a different combat sector. Positions are chosen around the
// target's hull orientation, not within a narrow arc toward its current approach.
function tacticalSector(e,room){
 const active=room.enemies.filter(other=>other.hp>0).sort((a,b)=>a.id-b.id);
 const index=active.indexOf(e);
 const sectors=[Math.PI,Math.PI*.54,-Math.PI*.54,0];
 return {index, angle:sectors[Math.max(0,index)%sectors.length], count:active.length};
}
function pickTacticalPoint(e,t,room){
 const last=e.lastSeen;
 if(!last||room.elapsed-e.lastSeenAt>7)return null;
 const {index,angle:sector}=tacticalSector(e,room);
 // Positions at 60-90% of firing range; defenders never select a near-contact goal.
 const target=last;
 const preferred=Math.max(220,Math.min(e.range*.82,e.preferredRange));
 const radii=[preferred*.88,preferred,Math.min(e.range*.92,preferred*1.12)];
 let best=null,bestScore=-Infinity;
 for(const rad of radii)for(let k=-3;k<=3;k++){
  const angle=target.a+sector+k*.18;
  const p={x:wrap(target.x+Math.cos(angle)*rad,W),y:wrap(target.y+Math.sin(angle)*rad,H)};
  if(!clearTacticalPoint(e,p,room))continue;
  const clear=!segmentObstructed(p.x,p.y,target.x,target.y,room.obstacles,6);
  if(!clear)continue;
  const travel=distance(e,p);
  let nearby=1000;
  for(const o of room.obstacles){const d=distance(p,o)-o.r;if(d<nearby)nearby=d;}
  const cover=Math.max(0,100-Math.abs(nearby-75)*1.3);
  // Sector discipline has greater weight than travel distance so flankers
  // actually cross around the target rather than choosing the shortest approach.
  let score=800-Math.abs(k)*95-travel*.12-Math.abs(rad-preferred)*.5;
  if(e.tactic==='cover')score+=cover*2;
  if(e.tactic==='sniper')score+=rad*.2;
  // Separate occupied lanes to avoid the entire group selecting the same corner.
  for(const other of room.enemies)if(other!==e&&other.hp>0&&other.tacticPoint){
   const d=distance(p,other.tacticPoint);
   score-=Math.max(0,180-d)*2.4;
  }
  if(score>bestScore){bestScore=score;best=p;}
 }
 return best;
}
function steerAI(e,t,room,dt){
 const dx=delta(t.x,e.x,W),dy=delta(t.y,e.y,H),dist=Math.hypot(dx,dy),target=Math.atan2(dy,dx);
 if(room.elapsed >= (e.nextSightAt||0)){
  e.cachedSight=!segmentObstructed(e.x,e.y,t.x,t.y,room.obstacles,7);
  e.nextSightAt=room.elapsed+0.18+(e.id%4)*0.022;
 }
 const canSeeTarget=!!e.cachedSight;
 if(canSeeTarget){e.lastSeen={x:t.x,y:t.y,a:t.a};e.lastSeenAt=room.elapsed;}
 const hasMemory=room.elapsed-e.lastSeenAt<7;
 // Enemies do not continually pursue a target they cannot see indefinitely.
 if(room.elapsed>=e.tacticUntil){
  const sector=tacticalSector(e,room);
  // Only one unit holds the frontal pressure lane; other tanks fan out.
  e.tactic=sector.index===0?'hold':(e.type==='sniper'?'sniper':sector.index===3?'cover':'flank');
  e.tacticUntil=room.elapsed+rand(18,25);
  e.tacticNext=0;
 }
 if(hasMemory && room.elapsed>=e.tacticNext){
  e.tacticPoint=pickTacticalPoint(e,t,room);
  e.tacticNext=room.elapsed+rand(3.3,5.8);
 }
 if(!hasMemory){
  // Search for contact rather than knowing the player's current hidden location.
  if(room.elapsed>=e.tacticNext){
   e.tacticPoint={x:wrap(e.x+rand(-360,360),W),y:wrap(e.y+rand(-360,360),H)};
   if(!clearTacticalPoint(e,e.tacticPoint,room))e.tacticPoint={x:e.x,y:e.y};
   e.tacticNext=room.elapsed+rand(5,9);
  }
 }
 const remembered=hasMemory?e.lastSeen:null;
 // When no line of sight, track the last known position briefly; not the live player.
 const goal=e.tacticPoint||remembered;
 const goalDistance=goal?distance(e,goal):0;
 let waypoint=null;
 if(goal && goalDistance>33){
  const obstructed=segmentObstructed(e.x,e.y,goal.x,goal.y,room.obstacles,e.r+7);
  if(obstructed){
   const goalCell=navIndex(goal.x,goal.y),count=room.obstacles.length;
   if(room.elapsed>=e.navAt&&room.navBudget>0){
    room.navBudget--;e.navPath=findNavPath(e,goal,room);
    e.navAt=room.elapsed+rand(2.8,4.2);e.navTarget=goalCell;e.navObstacleCount=count;
   }
   while(e.navPath.length>1&&!segmentObstructed(e.x,e.y,e.navPath[1].x,e.navPath[1].y,room.obstacles,e.r+7))e.navPath.shift();
   if(e.navPath.length&&distance(e,e.navPath[0])<Math.max(19,e.r))e.navPath.shift();
   waypoint=e.navPath[0]||null;
  }else{e.navPath=[];}
 }else e.navPath=[];
 const steerTarget=waypoint||goal;
 let wanted=steerTarget?Math.atan2(delta(steerTarget.y,e.y,H),delta(steerTarget.x,e.x,W)):e.a;
 let desiredSpeed=steerTarget?e.speed:0;
 // Emergency spacing is unconditional, even while following an A* waypoint.
 // Braking/turning to a retreat heading prevents driving forward into the player.
 const safetyDist=Math.max(200,Math.min(e.range*.66,e.preferredRange*.91));
 const hardLimit=safetyDist*.79;
 if(dist<hardLimit){
   const away=target+Math.PI;
   wanted=away;
   desiredSpeed=e.speed*.83;
   // A unit already facing away can withdraw immediately; otherwise slow and turn.
   if(Math.abs(diff(wanted,e.a))>.72)desiredSpeed=0;
 }else if(canSeeTarget&&dist<safetyDist){
   if(e.tactic==='hold'||goalDistance<85)desiredSpeed=0;
 }
 if(goal&&goalDistance<58&&!waypoint&&dist>=hardLimit)desiredSpeed=0;
 if(waypoint&&dist>=hardLimit&&distance(e,waypoint)<67)desiredSpeed=Math.min(desiredSpeed,e.speed*.52);
 if(e.aiMode==='reverse'&&room.elapsed>=e.reverseUntil){
  e.aiMode='approach';e.navPath=[];e.navAt=0;e.tacticNext=0;e.avoidSide*=-1;
 }
 if(e.aiMode==='reverse'){
  desiredSpeed=-e.speed*.48;wanted=e.a+e.avoidSide*.32;
 }
 const accel=e.type==='heavy'?24:e.type==='sniper'?36:e.type==='normal'?34:40;
 const maxTurn=e.type==='heavy'?.7:1.15;
 const turn=clamp(diff(wanted,e.a),-maxTurn*dt,maxTurn*dt);
 e.a+=turn;
 if(e.aiMode!=='reverse'&&Math.abs(diff(wanted,e.a))>.38)desiredSpeed=Math.min(desiredSpeed,e.speed*.24);
 e.velocity+=clamp(desiredSpeed-e.velocity,-accel*dt,accel*dt);
 if(Math.abs(turn)>dt*.4)e.velocity*=1-.24*dt;
 const oldX=e.x,oldY=e.y;
 const movedNow=move(e,e.velocity,dt,room);
 const movedDist=Math.hypot(delta(e.x,oldX,W),delta(e.y,oldY,H));
 if(movedDist<Math.abs(e.velocity)*dt*.28&&Math.abs(e.velocity)>5)e.stuckFor+=dt;
 else e.stuckFor=Math.max(0,e.stuckFor-dt*1.5);
 if(e.stuckFor>.55){
  e.stuckFor=0;e.stuckAttempts++;
  e.aiMode='reverse';e.reverseUntil=room.elapsed+Math.min(2.1,1.0+e.stuckAttempts*.22);
  e.navAt=0;e.navPath=[];e.velocity=Math.min(0,e.velocity);
 }
 if(movedNow&&e.aiMode!=='reverse'&&e.stuckAttempts>0&&Math.random()<dt*.15)e.stuckAttempts--;
 const turretTarget=canSeeTarget?target:remembered?Math.atan2(delta(remembered.y,e.y,H),delta(remembered.x,e.x,W)):e.turret;
 return {target:turretTarget,dist,canSeeTarget};
}
function step(room,dt){room.elapsed+=dt;
 room.navBudget=(Math.floor(room.elapsed/TICK)%3===0)?1:0;const obstacleRevision=room.obstacles.length;
 if(room.navCacheRevision!==obstacleRevision){room.navCache=null;room.navCacheRevision=obstacleRevision;}
const t=room.tank;if(!room.clients.driver&&!room.clients.gunner)return;
 if(t.hp>0){const d=room.inputs.driver,g=room.inputs.gunner;
 const targetSpeed=d.drive>=0?d.drive*145:d.drive*65;
 const acceleration=65,braking=95;
 t.speed+=clamp(targetSpeed-t.speed,-braking*dt,acceleration*dt);
 if(Math.abs(d.drive)<.05&&Math.abs(t.speed)<1)t.speed=0;
 t.a+=d.turn*1.85*dt*(.43+.57*Math.min(1,Math.abs(t.speed)/50));
 if(Math.abs(d.turn)>.1)t.speed*=1-.3*dt;
 move(t,t.speed,dt,room);
 const desired=Number.isFinite(g.aim)?g.aim:t.turret;
 t.turret+=clamp(diff(desired,t.turret),-1.65*dt,1.65*dt);
 t.reload=Math.max(0,t.reload-dt);
 if(g.shot>0){g.shot=0;const stock=t.shell==='AP'?t.ammoAP:t.ammoHE;
 if(t.reload===0&&stock>0){const spread=Math.abs(t.speed)/145*.07+Math.abs(d.turn)*.045;
 fire(room,'player',t,t.shell==='AP'?45:36,t.turret+rand(-spread,spread),t.shell);
 if(t.shell==='AP')t.ammoAP--;else t.ammoHE--;
 t.ammo=t.ammoAP+t.ammoHE;t.reload=t.reloadDuration*(t.shell==='HE'?1.13:1);
 }}
 }
 if(room.enemies.length===0&&room.spawnTimer<=0&&t.hp>0)spawnWave(room);
 room.spawnTimer=Math.max(0,room.spawnTimer-dt);
 for(const e of room.enemies){if(e.hp<=0)continue;
 const {target,dist,canSeeTarget}=steerAI(e,t,room,dt);
 e.turret+=clamp(diff(target,e.turret),-1.3*dt,1.3*dt);
 e.cooldown-=dt;
 if(canSeeTarget&&dist<e.range&&dist>e.r+t.r+10&&e.cooldown<=0&&t.hp>0&&Math.abs(diff(target,e.turret))<.16 && !collideOb(e.x,e.y,e.r,room.obstacles) && !segmentObstructed(e.x,e.y,t.x,t.y,room.obstacles,7)){
 // An occasional HE round from medium/heavy enemies, not every shot.
 const he=e.heStock>0&&e.type!=='scout'&&Math.random()<.16;
 fire(room,'enemy',e,e.damage,e.turret,he?'HE':'AP');if(he)e.heStock--;
 e.cooldown=e.reload+rand(-.4,.8);
 }}
for(const b of room.bullets){
 const x0=b.x,y0=b.y,x1=wrap(b.x+b.vx*dt,W),y1=wrap(b.y+b.vy*dt,H);
 b.x=x1;b.y=y1;b.life-=dt;b.travel+=Math.hypot(b.vx,b.vy)*dt;
 let earliest=2,kind=null,obj=null;
 for(const o of room.obstacles){if(o.hp<=0)continue;const at=bulletObstacleHit(x0,y0,x1,y1,o);if(at!==null&&at<earliest){earliest=at;kind='obstacle';obj=o;}}
 const targets=b.owner==='player'?room.enemies:[t];
 for(const target of targets){if(target.hp<=0)continue;const at=bulletTankHit(b,x0,y0,x1,y1,target);if(at!==null&&at<earliest){earliest=at;kind='tank';obj=target;}}
 if(!kind)continue;
 const hitX=wrap(x0+delta(x1,x0,W)*earliest,W),hitY=wrap(y0+delta(y1,y0,H)*earliest,H);
 if(kind==='obstacle'){
  if(obj.type!=='rock')obj.hp-=b.damage*shellStats[b.shell].obstacleMultiplier;
  room.effects.push({x:hitX,y:hitY,kind:b.shell==='HE'?'explosion':'blocked',life:.35});
 }else hitTank(room,b,obj,hitX,hitY);
 // HE also affects exposed nearby targets. Impacted vehicle is omitted for splash
 // when the direct hit already applied, preventing duplicate damage.
 if(b.shell==='HE'&&kind==='obstacle')explode(room,b,hitX,hitY);
 b.life=0;
}
room.effects=room.effects.filter(f=>(f.life-=dt)>0);
room.popups=room.popups.filter(p=>{p.life-=dt;p.y-=p.vy*dt;return p.life>0;});
separateTanks(room);
room.bullets=room.bullets.filter(b=>b.life>0);room.enemies=room.enemies.filter(e=>e.hp>0);room.obstacles=room.obstacles.filter(o=>o.hp>0);for(const c of room.crates){if(distance(t,c)<42){t.ammoAP=Math.min(70,t.ammoAP+Math.ceil(c.ammo*.7));t.ammoHE=Math.min(30,t.ammoHE+Math.floor(c.ammo*.3));t.ammo=t.ammoAP+t.ammoHE;c.picked=true;}}room.crates=room.crates.filter(c=>!c.picked);
if(room.crates.length<3&&Math.random()<dt*.065)room.crates.push({id:room.crateId++,x:rand(50,W-50),y:rand(50,H-50),ammo:10});
}
function state(room){return {type:'state',tank:room.tank,enemies:room.enemies.map(e=>({id:e.id,x:e.x,y:e.y,a:e.a,turret:e.turret,type:e.type,r:e.r,hp:e.hp,maxHp:e.maxHp})),bullets:room.bullets,effects:room.effects,popups:room.popups,obstacles:room.obstacles,crates:room.crates,wave:room.wave,kills:room.kills,players:{driver:!!room.clients.driver,gunner:!!room.clients.gunner},map:{w:W,h:H}};}

export function newGame(code){const room=makeRoom(code);room.clients.driver={};room.clients.gunner={};return room;}
export function updateGame(room){step(room,TICK);}
export function gameSnapshot(room){return state(room);}
export function changeDriver(room,drive,turn){room.inputs.driver={drive:clamp(Number(drive)||0,-1,1),turn:clamp(Number(turn)||0,-1,1)};}
export function changeGunner(room,aim,shotId,shell){
 const value=Number(aim);
 if(Number.isFinite(value))room.inputs.gunner.aim=value;
 if((shell==='AP'||shell==='HE')&&shell!==room.tank.shell){room.tank.shell=shell;room.tank.reload=Math.max(room.tank.reload,room.tank.reloadDuration*.8);}
 if(Number.isInteger(shotId)&&shotId>0&&shotId!==room.p2pLastShotId){room.p2pLastShotId=shotId;room.inputs.gunner.shot=1;}
}
export function restartGame(room){return newGame(room.code);}
