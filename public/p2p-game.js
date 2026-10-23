import {newGame,updateGame,gameSnapshot,changeDriver,changeGunner,restartGame} from './sim.js';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');let ws=null,state=null,role='driver',joined=false,keys={},mouse={x:0,y:0},aim=0,drag=null,shotId=0,shell='AP',joy={x:0,y:0},mobileAim={x:0,y:-1},lastSend=0;const PI=Math.PI*2;const visualEnemies=new Map();let visualFrameAt=0;
$('shellAP').onclick=()=>selectShell('AP');$('shellHE').onclick=()=>selectShell('HE');
function selectShell(v){shell=v;$('shellAP').classList.toggle('active',v==='AP');$('shellHE').classList.toggle('active',v==='HE');}
$('driver').onclick=()=>choose('driver');$('gunner').onclick=()=>choose('gunner');function choose(r){role=r;$('driver').classList.toggle('active',r==='driver');$('gunner').classList.toggle('active',r==='gunner');}
const touchDevice=matchMedia('(pointer: coarse)').matches;
let viewScale=1;
const activeTouches=new Map();let pinch=null,turnTouch=null,turnValue=0,throttleValue=0,reverseHeld=false,buttonTurn=0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function updateZoom(next){viewScale=clamp(next,0.48,1.55);const label=$('zoomLabel');label.textContent=`画角 ${Math.round(viewScale*100)}%`;}
canvas.addEventListener('wheel',e=>{if(!joined)return;e.preventDefault();updateZoom(viewScale*Math.exp(-e.deltaY*.0013));},{passive:false});
function pinchDistance(){const a=[...activeTouches.values()];return a.length>=2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0;}
canvas.addEventListener('pointerdown',e=>{if(!joined||e.pointerType!=='touch')return;activeTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(activeTouches.size>=2){pinch={d:pinchDistance(),z:viewScale};drag=null;}});
canvas.addEventListener('pointermove',e=>{if(!activeTouches.has(e.pointerId))return;activeTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch&&activeTouches.size>=2)updateZoom(pinch.z*pinchDistance()/Math.max(1,pinch.d));});
function endTouch(e){activeTouches.delete(e.pointerId);if(activeTouches.size<2)pinch=null;}
canvas.addEventListener('pointerup',endTouch);canvas.addEventListener('pointercancel',endTouch);
$('throttle').addEventListener('input',e=>{throttleValue=Number(e.target.value)/100;$('throttleLabel').textContent=`速度 ${Math.round(throttleValue*100)}%`;});
// Hold-to-reverse: never latch, and reset if touch is cancelled or app loses focus.
const reverse=$('reverse');
function setReverse(v){reverseHeld=v;reverse.classList.toggle('pressed',v);reverse.setAttribute('aria-pressed',String(v));}
reverse.addEventListener('pointerdown',e=>{reverse.setPointerCapture(e.pointerId);setReverse(true);e.preventDefault();});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])reverse.addEventListener(ev,()=>setReverse(false));
window.addEventListener('blur',()=>{setReverse(false);buttonTurn=0;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){setReverse(false);buttonTurn=0;}});
for(const [id,sign] of [['turnLeft',-1],['turnRight',1]]){
 const btn=$(id);
 btn.addEventListener('pointerdown',e=>{btn.setPointerCapture(e.pointerId);buttonTurn=sign;btn.classList.add('pressed');e.preventDefault();});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(ev,()=>{if(buttonTurn===sign)buttonTurn=0;btn.classList.remove('pressed');});
}
function showSteeringButtons(){
 $('turnButtons').style.display=joined&&role==='driver'&&touchDevice?'flex':'none';
 buttonTurn=0;
}
$('settingsButton').onclick=()=>{$('settingsOverlay').style.display='flex';buttonTurn=0;};
$('closeSettings').onclick=()=>{$('settingsOverlay').style.display='none';};
let signal=null,peer=null,channel=null,game=null,host=false,netOk=false,netCode='',timer=null;
const note=msg=>{$('msg').textContent=msg; if(joined)$('hint').textContent=msg;};
// The host owns the authoritative simulation; both roles can request a reset.
let lastResetAt=0;
function resetLocalControls(){
 shotId=0;drag=null;aim=0;shell='AP';$('shellAP').classList.add('active');$('shellHE').classList.remove('active');
 keys={};buttonTurn=0;turnValue=0;throttleValue=0;reverseHeld=false;
 $('throttle').value='0';$('throttleLabel').textContent='速度 0%';
 $('reverse').classList.remove('pressed');$('turnLeft').classList.remove('pressed');$('turnRight').classList.remove('pressed');
 visualEnemies.clear();lastSend=0;
}
function applyFreshGame(){
 if(!host)return;
 game=restartGame(game);
 state=gameSnapshot(game);
 resetLocalControls();
 if(channel?.readyState==='open')channel.send(JSON.stringify({type:'match-reset',state}));
 note('新しい対戦を開始しました');
}
function requestReset(){
 if(!joined)return;
 if(!window.confirm('2人ともWAVE 1・HP満タン・初期弾薬からやり直します。よろしいですか？'))return;
 $('settingsOverlay').style.display='none';
 if(host)applyFreshGame();
 else if(channel?.readyState==='open')channel.send(JSON.stringify({type:'reset-request'}));
 else note('相手と接続してからリセットしてください');
}
$('resetMatch').onclick=requestReset;

function showGame(){
 joined=true;$('menu').style.display='none';$('hud').style.display='flex';$('fs').style.display='block';$('hint').style.display='block';
 showSteeringButtons();
 $('throttlePanel').style.display=role==='driver'&&touchDevice?'flex':'none';
 $('settingsButton').disabled=false;$('zoomLabel').style.display='block';$('shellPicker').style.display=role==='gunner'?'flex':'none';
 $('hint').textContent=role==='driver'?'操縦手：旋回／アクセル／R長押しで後退':'砲手：自機からドラッグして射撃';
}
function wirePeer(){
 peer=new RTCPeerConnection({iceServers:[]});
 peer.onicecandidate=e=>{if(e.candidate&&signal?.readyState===1)signal.send(JSON.stringify({type:'ice',candidate:e.candidate}));};
 peer.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(peer.connectionState)){note('P2P接続が切断されました。ページを再読み込みして再接続してください。');netOk=false;}};
 if(host){ channel=peer.createDataChannel('game',{ordered:true});wireData();}
 else peer.ondatachannel=e=>{channel=e.channel;wireData();};
}
function wireData(){
 channel.onopen=()=>{netOk=true;note('P2P接続成功');if(!joined)showGame();};
 channel.onclose=()=>{netOk=false;note('P2P通信が切断されました');};
 channel.onmessage=e=>{
  let m;try{m=JSON.parse(e.data);}catch{return;}
  if(host){
   if(m.type==='reset-request')applyFreshGame();
   else if(m.type==='input'&&role==='driver')changeGunner(game,m.aim,m.shotId,m.shell);
  }else{
   if(m.type==='match-reset'){state=m.state;resetLocalControls();$('settingsOverlay').style.display='none';note('相手が新しい対戦を開始しました');}
   else if(m.type==='state'){state=m;}
  }
 };
}
function sendSignal(m){if(signal?.readyState===1)signal.send(JSON.stringify(m));}
$('join').onclick=()=>{
 let code=$('code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(code.length<4){note('部屋番号は4文字以上にしてください');return;}
 $('join').disabled=true;netCode=code;host=role==='driver';
 if(host){game=newGame(code);state=gameSnapshot(game);showGame();}
 const protocol=location.protocol==='https:'?'wss':'ws';
 signal=new WebSocket(`${protocol}://${location.host}/p2p-signal`);
 signal.onopen=()=>{sendSignal({type:'join',role,code});if(!host)note('ホストの入室を待っています…');};
 signal.onerror=()=>note('接続用サーバーへ接続できません');
 signal.onclose=()=>{if(!netOk)note('接続サーバーが切断されました');};
 signal.onmessage=async e=>{
  let m;try{m=JSON.parse(e.data);}catch{return;}
  try{
   if(m.type==='error'){note(m.message);$('join').disabled=false;return;}
   if(m.type==='ready'&&host){
    wirePeer();await peer.setLocalDescription(await peer.createOffer());sendSignal({type:'offer',sdp:peer.localDescription});
   }else if(m.type==='offer'&&!host){
    wirePeer();await peer.setRemoteDescription(m.sdp);await peer.setLocalDescription(await peer.createAnswer());sendSignal({type:'answer',sdp:peer.localDescription});
   }else if(m.type==='answer'&&host&&peer){await peer.setRemoteDescription(m.sdp);}
   else if(m.type==='ice'&&peer){
    if(peer.remoteDescription)await peer.addIceCandidate(m.candidate);
    else pendingIce.push(m.candidate);
   }else if(m.type==='peer-left'){netOk=false;note('相手の接続が切れました');}
   if(peer?.remoteDescription&&pendingIce.length){for(const ice of pendingIce.splice(0))await peer.addIceCandidate(ice);}
  }catch(err){note('P2P接続エラー：'+err.message);}
 };
};
const pendingIce=[];
// The host smartphone runs simulation locally. WebSocket is signaling only.
setInterval(()=>{
 if(!host||!game)return;
 updateGame(game);state=gameSnapshot(game);
 if(netOk&&channel?.readyState==='open'&&channel.bufferedAmount<250000 && Math.floor(game.elapsed*30)%2===0){
  channel.send(JSON.stringify(state));
 }
},1000/30);
function sendInput(m){
 if(host){if(m.type==='input')changeDriver(game,m.drive,m.turn);else if(m.type==='restart'&&game.tank.hp<=0){game=restartGame(game);state=gameSnapshot(game);}}
 else if(netOk&&channel?.readyState==='open')channel.send(JSON.stringify(m));
}
$('fs').onclick=async()=>{try{if(!document.fullscreenElement){if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else note('このブラウザは全画面表示に対応していません');}else await document.exitFullscreen();}catch{note('全画面にできません。ブラウザの全画面機能をお試しください');}};
document.addEventListener('fullscreenchange',()=>{$('fs').textContent='⛶';$('fs').title=document.fullscreenElement?'全画面解除':'全画面';});window.addEventListener('keydown',e=>{keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='KeyR'&&state?.tank.hp<=0)sendInput({type:'restart'});});window.addEventListener('keyup',e=>keys[e.code]=false);// Aim gesture starts only near the player tank. Releasing fires one round.
function worldAim(e){if(!state)return;const dx=e.clientX-innerWidth/2,dy=e.clientY-innerHeight/2;if(Math.hypot(dx,dy)>14)aim=Math.atan2(dy,dx);}
canvas.addEventListener('pointerdown',e=>{if(role!=='gunner'||!joined||!state||state.tank.hp<=0||activeTouches.size>=2)return;
 const dx=e.clientX-innerWidth/2,dy=e.clientY-innerHeight/2;
 if(Math.hypot(dx,dy)>Math.max(45,Math.min(innerWidth,innerHeight)*.14))return;
 drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);e.preventDefault();});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId||pinch)return;
 drag.x=e.clientX;drag.y=e.clientY;worldAim(e);e.preventDefault();});
canvas.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId||pinch)return;
 const distance=Math.hypot(e.clientX-innerWidth/2,e.clientY-innerHeight/2);
 if(distance>Math.max(35,Math.min(innerWidth,innerHeight)*.1)&&state?.tank.reload<=0&&(shell==='AP'?state?.tank.ammoAP:state?.tank.ammoHE)>0)shotId++;
 drag=null;e.preventDefault();});
canvas.addEventListener('pointercancel',()=>{drag=null;});
function stick(id,knob,fn){let el=$(id);el.addEventListener('pointerdown',e=>{el.setPointerCapture(e.pointerId);update(e);});el.addEventListener('pointermove',e=>{if(el.hasPointerCapture(e.pointerId))update(e);});for(let ev of ['pointerup','pointercancel'])el.addEventListener(ev,()=>{fn(0,0);$(knob).style.transform='translate(0px,0px)';});function update(e){let r=el.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),mag=Math.hypot(dx,dy),lim=r.width*.34;if(mag>lim){dx*=lim/mag;dy*=lim/mag;}$(knob).style.transform=`translate(${dx}px,${dy}px)`;fn(dx/lim,dy/lim);}}
const delta=(a,b,n)=>{let d=a-b;return d-Math.round(d/n)*n};function resize(){let d=devicePixelRatio||1;canvas.width=Math.round(innerWidth*d);canvas.height=Math.round(innerHeight*d);ctx.setTransform(d,0,0,d,0,0);}window.addEventListener('resize',resize);resize();
function box(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}function tank(x,y,a,turret,color,scale=1){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(scale,scale);box(-20,-13,40,26,'#1b2520');box(-16,-16,9,32,'#303a32');box(7,-16,9,32,'#303a32');box(-17,-11,34,22,color);box(-8,-7,15,14,'#a2b29555');ctx.restore();ctx.save();ctx.translate(x,y);ctx.rotate(turret);box(0,-4,27,8,'#d6cc9b');ctx.beginPath();ctx.arc(0,0,10*scale,0,PI);ctx.fillStyle=color;ctx.fill();ctx.restore();}
function render(){
 requestAnimationFrame(render);
 const now=performance.now(),dt=visualFrameAt?Math.min(.08,(now-visualFrameAt)/1000):1/60;
 visualFrameAt=now;
 const blend=1-Math.exp(-dt*13);
 const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);box(0,0,w,h,'#566c54');if(!state)return;const t=state.tank,map=state.map;let zoom=Math.max(.48,Math.min(.85,w/1250,h/690))*viewScale; // wider battlefield / small tank
ctx.save();ctx.translate(w/2,h/2);ctx.scale(zoom,zoom);ctx.translate(-t.x,-t.y);
const drawCopies=(obj,fn)=>{for(let ix=-1;ix<=1;ix++)for(let iy=-1;iy<=1;iy++){const x=obj.x+ix*map.w,y=obj.y+iy*map.h;if(Math.abs(x-t.x)>w/zoom*.7+100||Math.abs(y-t.y)>h/zoom*.7+100)continue;fn(x,y);}};
// terrain grid is periodic
ctx.strokeStyle='#abc6a71e';ctx.lineWidth=1;for(let x=0;x<map.w;x+=100)drawCopies({x,y:t.y},(xx)=>{ctx.beginPath();ctx.moveTo(xx,t.y-h/zoom);ctx.lineTo(xx,t.y+h/zoom);ctx.stroke();});for(let y=0;y<map.h;y+=100)drawCopies({x:t.x,y},(_,yy)=>{ctx.beginPath();ctx.moveTo(t.x-w/zoom,yy);ctx.lineTo(t.x+w/zoom,yy);ctx.stroke();});
for(const o of state.obstacles)drawCopies(o,(x,y)=>{ctx.fillStyle=o.type==='rock'?'#737970':o.type==='concrete'?'#908a78':'#a28a62';ctx.strokeStyle='#333e35';ctx.lineWidth=3;ctx.beginPath();ctx.rect(x-o.r,y-o.r,o.r*2,o.r*2);ctx.fill();ctx.stroke();if(o.type==='wood'){ctx.beginPath();ctx.moveTo(x-o.r,y-o.r);ctx.lineTo(x+o.r,y+o.r);ctx.moveTo(x+o.r,y-o.r);ctx.lineTo(x-o.r,y+o.r);ctx.stroke();}});
for(const c of state.crates)drawCopies(c,(x,y)=>{box(x-12,y-12,24,24,'#cba85e');ctx.fillStyle='#264a31';ctx.font='bold 22px system-ui';ctx.fillText('+',x-8,y+8);});
const liveIds=new Set();
for(const e of state.enemies){
 liveIds.add(e.id);
 let v=visualEnemies.get(e.id);
 if(!v){v={x:e.x,y:e.y,a:e.a,turret:e.turret};visualEnemies.set(e.id,v);}
 else{
  v.x=((v.x+delta(e.x,v.x,map.w)*blend)%map.w+map.w)%map.w;
  v.y=((v.y+delta(e.y,v.y,map.h)*blend)%map.h+map.h)%map.h;
  v.a+=Math.atan2(Math.sin(e.a-v.a),Math.cos(e.a-v.a))*blend;
  v.turret+=Math.atan2(Math.sin(e.turret-v.turret),Math.cos(e.turret-v.turret))*blend;
 }
 drawCopies({...e,x:v.x,y:v.y},(x,y)=>{tank(x,y,v.a,v.turret,e.type==='scout'?'#c98f50':e.type==='heavy'?'#8b3832':e.type==='sniper'?'#b85943':'#b87a59',e.r/18);box(x-19,y-e.r-17,38,4,'#422727');box(x-19,y-e.r-17,38*e.hp/e.maxHp,4,'#e4ad75');});
}
for(const id of visualEnemies.keys())if(!liveIds.has(id))visualEnemies.delete(id);
for(const f of state.effects||[])drawCopies(f,(x,y)=>{ctx.beginPath();ctx.arc(x,y,f.kind==='explosion'?22:8,0,PI);ctx.strokeStyle=f.kind==='penetrated'?'#fa3e39':f.kind==='ricochet'?'#eef5cb':'#e9b24c';ctx.lineWidth=3;ctx.globalAlpha=Math.max(.15,Math.min(1,f.life*2));ctx.stroke();ctx.globalAlpha=1;});
for(const b of state.bullets)drawCopies(b,(x,y)=>{ctx.beginPath();ctx.arc(x,y,4.5,0,PI);ctx.fillStyle=b.owner==='player'?'#ffeb99':'#ff7456';ctx.fill();});
for(const p of state.popups||[])drawCopies(p,(x,y)=>{
 ctx.globalAlpha=Math.max(.1,Math.min(1,p.life/.95));
 ctx.font='900 42px system-ui';ctx.textAlign='center';ctx.lineWidth=5;
 ctx.strokeStyle='rgba(20,28,22,.9)';ctx.fillStyle=p.color||'#fff';
 // Keep the damage label as wide as the HP bar where possible, including at distant zoom.
 const damageText=String(p.text);
 const labelWidth=ctx.measureText(damageText).width;
 ctx.save();ctx.translate(x,y);ctx.scale(Math.max(1,44/Math.max(1,labelWidth)),1);
 ctx.strokeText(damageText,0,0);ctx.fillText(damageText,0,0);ctx.restore();
 ctx.globalAlpha=1;ctx.textAlign='left';
});
drawCopies(t,(x,y)=>{
 tank(x,y,t.a,t.turret,'#b4c98e',1.2);
 // Compact HP bar above tank. Reload is shown ONLY through the aiming line.
 const hpRatio=Math.max(0,Math.min(1,t.hp/Math.max(1,t.maxHp)));
 const hpColor=hpRatio>.5?'#65ed86':hpRatio>.25?'#f5cd60':'#ff615a';
 const barW=44,barH=5,barY=y-38;
 box(x-barW/2-1,barY-1,barW+2,barH+2,'#10211bdc');
 if(hpRatio>0)box(x-barW/2,barY,barW*hpRatio,barH,hpColor);
});ctx.restore();
if(role==='gunner'&&drag){
 const difference=Math.abs(Math.atan2(Math.sin(aim-t.turret),Math.cos(aim-t.turret)));
 const selectedStock=t.shell==='AP'?t.ammoAP:t.ammoHE;const ready=t.reload<=0&&selectedStock>0;
 const aligned=difference<.07;
 const locked=ready&&aligned;
 const ratio=selectedStock<=0?0:Math.max(0,Math.min(1,1-t.reload/Math.max(.01,t.reloadDuration||3.25)));
 const len=Math.max(Math.hypot(drag.x-w/2,drag.y-h/2),30);
 const vx=Math.cos(aim),vy=Math.sin(aim);
 const visibleLen=ready?len:len*ratio;
 if(visibleLen>0){
   ctx.beginPath();ctx.moveTo(w/2,h/2);ctx.lineTo(w/2+vx*visibleLen,h/2+vy*visibleLen);
   ctx.strokeStyle=locked?'#ff514a':'#fff';ctx.lineWidth=2.5;
   ctx.setLineDash(ready?[]:[7,6]);ctx.stroke();ctx.setLineDash([]);
 }
 // The pointer is subtle and marks the intended location, not projectile impact.
 ctx.beginPath();ctx.arc(drag.x,drag.y,8,0,PI);
 ctx.strokeStyle=locked?'#ff514a':'#e5e9e0aa';ctx.lineWidth=1.4;ctx.stroke();
 ctx.font='bold 11px system-ui';ctx.textAlign='center';
 ctx.fillStyle=locked?'#ff746c':'#fff';
 ctx.fillText(selectedStock<=0?'弾切れ':!ready?'装填中':aligned?'発射準備OK':'砲塔旋回中',drag.x,drag.y-17);
 ctx.textAlign='left';
}

$('leftInfo').innerHTML=`🚙 ${role==='driver'?'操縦手':'砲手'} | 装甲 ${Math.ceil(t.hp)}/${t.maxHp}<br>AP ${t.ammoAP} / HE ${t.ammoHE} | ${t.shell} ${t.reload>0?'装填中': '✅ 発射可能'}`;$('rightInfo').innerHTML=`WAVE ${state.wave} | 撃破 ${state.kills} | 敵 ${state.enemies.length}<br><span style="color:#dfcb82">${role==='driver'?(state.players.driver?'●':'○')+'操縦手':(state.players.gunner?'●':'○')+'砲手'}</span>`;
if(t.hp<=0){box(0,h*.42,w,h*.2,'#08150ce8');ctx.fillStyle='#fff4de';ctx.font='bold 27px system-ui';ctx.textAlign='center';ctx.fillText('戦車撃破 - GAME OVER',w/2,h*.51);ctx.font='14px system-ui';ctx.fillText('PC: Rで再挑戦',w/2,h*.57);ctx.textAlign='left';}}
setInterval(()=>{if(!joined)return;if(role==='driver'){const drive=Math.max(-1,Math.min(1,(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)+(touchDevice?(reverseHeld?-throttleValue:throttleValue):-joy.y)));const turn=Math.max(-1,Math.min(1,(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+(touchDevice?buttonTurn:joy.x)));sendInput({type:'input',drive,turn});}else{sendInput({type:'input',aim,shotId,shell});}},50);

// Start the animation loop once at initialization.
render();
