(() => {
'use strict';
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', {alpha:false});
const sky=document.createElement('canvas'),skyCtx=sky.getContext('2d',{alpha:false});
const fpsLabel=document.getElementById('fps');
const panel=document.getElementById('inspector'), mini=document.getElementById('neighborhood'), miniCtx=mini.getContext('2d');
let selected=-1,perceptionClock=Infinity;
const mouse={active:false,x:0,y:0,screenX:0,screenY:0};
const MOUSE_RADIUS=100,MOUSE_REPULSION=600;
const mouseForce=new Float32Array(2);
const defaults={separation:.5,alignment:1,cohesion:3},strengths={...defaults};
const effectiveStrengths={...defaults};
const ruleKeys=['separation','alignment','cohesion'];
const variations={separation:{value:1,target:1,next:0},alignment:{value:1,target:1,next:0},cohesion:{value:1,target:1,next:0}};
let fluctuationEnabled=true;
try{
 const saved=JSON.parse(localStorage.getItem('murmuration-rule-strengths')||'null');
 for(const key of ruleKeys){if(saved&&typeof saved[key]==='number'&&Number.isFinite(saved[key]))strengths[key]=Math.max(0,Math.min(4*defaults[key],saved[key]));}
 if(!localStorage.getItem('murmuration-normalized-preset-v4')){
  if(saved&&((saved.separation===.2&&saved.alignment===2&&saved.cohesion===4)||(saved.separation===1&&saved.alignment===1&&(saved.cohesion===2||saved.cohesion===3)))){
   Object.assign(strengths,defaults);localStorage.setItem('murmuration-rule-strengths',JSON.stringify(strengths));
  }
  localStorage.setItem('murmuration-normalized-preset-v4','1');
 }
 fluctuationEnabled=localStorage.getItem('murmuration-random-strengths')!=='0';
}catch{}
Object.assign(effectiveStrengths,strengths);
function updateFluctuationButton(){
 const button=document.getElementById('toggle-fluctuation');button.textContent=fluctuationEnabled?'浮动 开':'浮动 关';button.setAttribute('aria-pressed',String(fluctuationEnabled));
}
document.getElementById('toggle-fluctuation').addEventListener('click',()=>{
 fluctuationEnabled=!fluctuationEnabled;
 for(const key of ruleKeys){variations[key].value=1;variations[key].target=1;variations[key].next=0;effectiveStrengths[key]=strengths[key];}
 perceptionClock=Infinity;updateFluctuationButton();
 try{localStorage.setItem('murmuration-random-strengths',fluctuationEnabled?'1':'0');}catch{}
});
updateFluctuationButton();
function updateEffectiveStrengths(dt){
 const response=1-Math.exp(-dt/3);
 for(const key of ruleKeys){
  const variation=variations[key];
  if(fluctuationEnabled){
   if(time>=variation.next){variation.target=.9+Math.random()*.2;variation.next=time+6+Math.random()*6;}
   variation.value+=(variation.target-variation.value)*response;
  }else variation.value=1;
  effectiveStrengths[key]=strengths[key]*variation.value;
 }
}

function updateStrengthControls(){
 for(const key of Object.keys(strengths)){
  document.getElementById(`strength-${key}`).value=String(strengths[key]/defaults[key]);
  document.getElementById(`value-${key}`).textContent=`${(strengths[key]/defaults[key]).toFixed(2).replace(/0$/,'')}×`;
 }
}
function saveStrengths(){try{localStorage.setItem('murmuration-rule-strengths',JSON.stringify(strengths));}catch{}}
for(const key of Object.keys(strengths)){
 document.getElementById(`strength-${key}`).addEventListener('input',event=>{
  const value=Number(event.target.value);if(!Number.isFinite(value))return;
  strengths[key]=defaults[key]*Math.max(0,Math.min(4,value));perceptionClock=Infinity;updateStrengthControls();saveStrengths();
 });
}
document.getElementById('reset-strengths').addEventListener('click',()=>{Object.assign(strengths,defaults);perceptionClock=Infinity;updateStrengthControls();saveStrengths();});
const controls=document.getElementById('controls'),controlsToggle=document.getElementById('toggle-controls');
function updateControlsToggle(){
 const collapsed=controls.classList.contains('collapsed');
 controlsToggle.textContent=collapsed?'规则':'收起';
 controlsToggle.setAttribute('aria-expanded',String(!collapsed));
 controlsToggle.setAttribute('aria-label',collapsed?'展开规则控制':'收起规则控制');
}
controlsToggle.addEventListener('click',()=>{
 const collapsed=controls.classList.toggle('collapsed');
 controls.classList.toggle('button-visible',collapsed);updateControlsToggle();
});
function dismissControlsButton(){controls.classList.remove('button-visible');}
addEventListener('pointermove',event=>{
 if(event.pointerType==='touch'||!controls.classList.contains('collapsed'))return;
 const rect=controls.getBoundingClientRect(),margin=28;
 const nearby=event.clientX>=rect.left-margin&&event.clientX<=rect.right+margin&&event.clientY>=rect.top-margin&&event.clientY<=rect.bottom+margin;
 controls.classList.toggle('button-visible',nearby);
},{passive:true});
controls.addEventListener('focusin',()=>{if(controls.classList.contains('collapsed'))controls.classList.add('button-visible');});
controls.addEventListener('focusout',event=>{if(!controls.contains(event.relatedTarget))dismissControlsButton();});
addEventListener('blur',dismissControlsButton);
updateStrengthControls();
const TAU=Math.PI*2, N=innerWidth<700?1800:3000, CELL=85;
let WORLD_X=18*CELL,WORLD_Y=8*CELL;
let BOUND_X=WORLD_X*.5-5,BOUND_Y=WORLD_Y*.5-5;
const WALL_RANGE=110,WALL_REPULSION=1800;
const wallForce=new Float32Array(2);
const SAFE_DISTANCE=17,REPULSION=500;
let COLS=Math.ceil(WORLD_X/SAFE_DISTANCE),ROWS=Math.ceil(WORLD_Y/SAFE_DISTANCE);
const forceX=new Float32Array(N),forceY=new Float32Array(N);
const anticipationX=new Float32Array(N),anticipationY=new Float32Array(N);
let cellHeads=new Int32Array(COLS*ROWS);
const nextBird=new Int32Array(N);
const ALIGN_GAIN=1.6,MAX_TURN_RATE=1.2;
const headingX=new Float32Array(N),headingY=new Float32Array(N);
const centerX=new Float32Array(N),centerY=new Float32Array(N);
const unitX=new Float32Array(N),unitY=new Float32Array(N);
const directionSumX=new Float64Array(N),directionSumY=new Float64Array(N);
const positionSumX=new Float64Array(N),positionSumY=new Float64Array(N),neighborCounts=new Uint16Array(N);
const COHESION_GAIN=.18,MAX_COHESION_FORCE=12;
let headingCols=Math.ceil(WORLD_X/CELL),headingRows=Math.ceil(WORLD_Y/CELL);
let headingHeads=new Int32Array(headingCols*headingRows);
const nextHeading=new Int32Array(N);
const headingKey=(cx,cy)=>cx<0||cy<0||cx>=headingCols||cy>=headingRows?-1:cx+cy*headingCols;
const cellKey=(cx,cy)=>cx<0||cy<0||cx>=COLS||cy>=ROWS?-1:cx+cy*COLS;
const MAX_ACCELERATION=120,FORCE_RESPONSE=.18,AVOIDANCE_LOOKAHEAD=.65;
const MAX_ANTICIPATION=40,CRUISE_SPEED=45,CRUISE_RESPONSE=.9;
const accelerationX=new Float32Array(N),accelerationY=new Float32Array(N);
const x=new Float32Array(N), y=new Float32Array(N);
const vx=new Float32Array(N), vy=new Float32Array(N);
const phase=new Float32Array(N), shade=new Float32Array(N);
// Groups are connected components of the real neighbour graph, not just
// the count inside one bird's local view. Reuse the perception pair scan.
const SMALL_GROUP_LIMIT=100;
const groupParent=new Int32Array(N),groupSize=new Uint16Array(N);
const groupVelocityX=new Float32Array(N),groupVelocityY=new Float32Array(N);
const exploreSpeed=new Float32Array(N).fill(CRUISE_SPEED);
const exploreHeading=new Float32Array(N),exploreNext=new Float32Array(N);
let groupRefreshAt=0;
function groupRoot(i){
 while(groupParent[i]!==i){groupParent[i]=groupParent[groupParent[i]];i=groupParent[i];}return i;
}
function joinGroups(i,j){const a=groupRoot(i),b=groupRoot(j);if(a!==b)groupParent[Math.max(a,b)]=Math.min(a,b);}
function finishGroups(){
 groupSize.fill(0);groupVelocityX.fill(0);groupVelocityY.fill(0);
 for(let i=0;i<N;i++){const root=groupRoot(i);groupParent[i]=root;groupSize[root]++;groupVelocityX[root]+=vx[i];groupVelocityY[root]+=vy[i];}
 for(let root=0;root<N;root++){
  if(!groupSize[root])continue;
  if(groupSize[root]>=SMALL_GROUP_LIMIT){exploreSpeed[root]=CRUISE_SPEED;exploreNext[root]=0;continue;}
  if(time>=exploreNext[root]){
   exploreSpeed[root]=32+Math.random()*36;
   exploreHeading[root]=Math.atan2(groupVelocityY[root],groupVelocityX[root])+(Math.random()-.5)*1.8;
   exploreNext[root]=time+5+Math.random()*6;
  }
 }
 groupRefreshAt=time+1;
}
const foods=[];
let nextFoodAt=12+Math.random()*8;
const FOOD_DETECTION=CELL,FOOD_RESPONSE=.08;
const FOOD_HALF_SIZE=8,FOOD_EAT_PADDING=4,FOOD_BITE_INTERVAL=1;
function spawnFood(px,py){
 if(foods.length>=3)return null;
 const margin=60,radius=FOOD_HALF_SIZE;
 const randomPosition=!Number.isFinite(px)||!Number.isFinite(py);
 const food={
  x:randomPosition?(Math.random()*2-1)*Math.max(0,BOUND_X-margin):Math.max(-BOUND_X+radius,Math.min(BOUND_X-radius,px)),
  y:randomPosition?(Math.random()*2-1)*Math.max(0,BOUND_Y-margin):Math.max(-BOUND_Y+radius,Math.min(BOUND_Y-radius,py)),
  radius,capacity:250+Math.floor(Math.random()*201),consumed:0,nextBiteAt:new Float64Array(N)
 };
 foods.push(food);return food;
}
function updateFoods(){
 if(time>=nextFoodAt){spawnFood();nextFoodAt=time+24+Math.random()*20;}
 for(let f=foods.length-1;f>=0;f--){
  const food=foods[f];
  for(let i=0;i<N;i++){
   // A bird can eat again after one second, including while remaining in
   // the food area. Counting bites prevents both permanent trapping and
   // frame-rate-dependent consumption.
   if(Math.abs(x[i]-food.x)<=food.radius+FOOD_EAT_PADDING&&Math.abs(y[i]-food.y)<=food.radius+FOOD_EAT_PADDING&&time>=food.nextBiteAt[i]){
    food.consumed++;food.nextBiteAt[i]=time+FOOD_BITE_INTERVAL;
   }
   if(food.consumed>=food.capacity){foods.splice(f,1);break;}
  }
 }
}
const projected=Array.from({length:N},()=>({x:0,y:0,dx:0,dy:0,a:0,s:0,motionX:0,motionY:0,ready:false}));
let width=0,height=0,dpr=1,viewScale=1,backdrop,time=0,last=0,accumulator=0;
let fpsStart=0,fpsFrames=0,nextRenderAt=0;
function resize(){
 mouse.active=false;perceptionClock=Infinity;
 const previousWorldX=WORLD_X,previousWorldY=WORLD_Y;
 width=innerWidth;height=innerHeight;
 viewScale=Math.min(width/1650,height/820);
 // The simulation domain is the entire visible webpage, not an inner box.
 WORLD_X=width/viewScale;WORLD_Y=height/viewScale;
 BOUND_X=WORLD_X*.5-5;BOUND_Y=WORLD_Y*.5-5;
 COLS=Math.ceil(WORLD_X/SAFE_DISTANCE);ROWS=Math.ceil(WORLD_Y/SAFE_DISTANCE);
 headingCols=Math.ceil(WORLD_X/CELL);headingRows=Math.ceil(WORLD_Y/CELL);
 cellHeads=new Int32Array(COLS*ROWS);headingHeads=new Int32Array(headingCols*headingRows);
 for(const food of foods){food.x*=WORLD_X/previousWorldX;food.y*=WORLD_Y/previousWorldY;}
 groupRefreshAt=0;
 for(let i=0;i<N;i++){
  x[i]=Math.max(-BOUND_X,Math.min(BOUND_X,x[i]*WORLD_X/previousWorldX));
  y[i]=Math.max(-BOUND_Y,Math.min(BOUND_Y,y[i]*WORLD_Y/previousWorldY));
 }
 dpr=Math.min(devicePixelRatio||1,1.5,Math.sqrt(3000000/(width*height)));
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
 sky.width=canvas.width;sky.height=canvas.height;skyCtx.setTransform(dpr,0,0,dpr,0,0);
 for(const bird of projected)bird.ready=false;
 // Paint the unchanged sky once, then copy it instead of evaluating a
 // full-screen radial gradient on every frame.
 backdrop=skyCtx.createRadialGradient(width*.49,height*.47,0,width*.5,height*.5,Math.max(width,height)*.68);
 backdrop.addColorStop(0,'#101a29');backdrop.addColorStop(.48,'#0b121e');backdrop.addColorStop(1,'#030508');
 skyCtx.fillStyle=backdrop;skyCtx.fillRect(0,0,width,height);
}

addEventListener('resize',resize,{passive:true});resize();
function dismiss(){selected=-1;panel.hidden=true;}
document.getElementById('close').addEventListener('click',dismiss);
addEventListener('keydown',e=>{if(e.key==='Escape')dismiss();});
function updateMouse(event){
 const bounds=canvas.getBoundingClientRect(),fit=viewScale;
 mouse.screenX=event.clientX-bounds.left;mouse.screenY=event.clientY-bounds.top;
 mouse.x=(mouse.screenX-width*.5)/fit;mouse.y=(mouse.screenY-height*.5)/fit;mouse.active=true;
}
canvas.addEventListener('pointermove',updateMouse,{passive:true});
canvas.addEventListener('pointerenter',updateMouse,{passive:true});
canvas.addEventListener('pointerleave',()=>{mouse.active=false;});
canvas.addEventListener('pointercancel',()=>{mouse.active=false;});
addEventListener('blur',()=>{mouse.active=false;});
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==undefined&&e.button!==0)return;
 const bounds=canvas.getBoundingClientRect(),px=e.clientX-bounds.left,py=e.clientY-bounds.top;
 let nearest=-1,best=22*22;
 for(let i=0;i<N;i++){const b=projected[i];if(b.a<.025)continue;const d=(b.x-px)**2+(b.y-py)**2;if(d<best){best=d;nearest=i;}}
 if(nearest>=0){selected=nearest;panel.hidden=false;}
 else spawnFood((px-width*.5)/viewScale,(py-height*.5)/viewScale);
});
for(let i=0;i<N;i++){
 const a=Math.random(), b=Math.random()*TAU, r=Math.sqrt(Math.random());
 x[i]=(a-.5)*1320;y[i]=Math.sin(a*5.2-1.6)*135+Math.sin(b)*r*110;
 const heading=Math.random()*TAU;
 vx[i]=Math.cos(heading)*45;vy[i]=Math.sin(heading)*45;
 phase[i]=Math.random()*TAU;shade[i]=.6+Math.random()*.4;
}
function computeSeparation(){
 forceX.fill(0);forceY.fill(0);if(effectiveStrengths.separation===0)return;cellHeads.fill(-1);
 for(let i=0;i<N;i++){
  const key=cellKey(Math.floor((x[i]+WORLD_X*.5)/SAFE_DISTANCE),Math.floor((y[i]+WORLD_Y*.5)/SAFE_DISTANCE));
  nextBird[i]=cellHeads[key];cellHeads[key]=i;
 }
 for(let i=0;i<N;i++){
  const cx=Math.floor((x[i]+WORLD_X*.5)/SAFE_DISTANCE),cy=Math.floor((y[i]+WORLD_Y*.5)/SAFE_DISTANCE);
  for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
   const key=cellKey(cx+ox,cy+oy);if(key<0)continue;let j=cellHeads[key];
   while(j!==-1){
    // Each pair is evaluated once, with equal and opposite forces.
    if(j>i){
     const dx=(x[i]-x[j]),dy=(y[i]-y[j]),squared=dx*dx+dy*dy;
     if(squared<SAFE_DISTANCE*SAFE_DISTANCE){
      const distance=Math.sqrt(squared);
      let ux,uy;
      if(distance>.00001){ux=dx/distance;uy=dy/distance;}
      else{const angle=((i*137+j*73)%360)*Math.PI/180;ux=Math.cos(angle);uy=Math.sin(angle);}
      const strength=REPULSION*effectiveStrengths.separation*(1-distance/SAFE_DISTANCE)**2;
      const fx=ux*strength,fy=uy*strength;
      forceX[i]+=fx;forceY[i]+=fy;forceX[j]-=fx;forceY[j]-=fy;
     }
    }
    j=nextBird[j];
   }
  }
 }
}
function computeAlignment(){
 const refreshGroups=time>=groupRefreshAt;
 if(refreshGroups)for(let i=0;i<N;i++)groupParent[i]=i;
 anticipationX.fill(0);anticipationY.fill(0);
 headingHeads.fill(-1);headingX.fill(0);headingY.fill(0);centerX.fill(0);centerY.fill(0);
 directionSumX.fill(0);directionSumY.fill(0);positionSumX.fill(0);positionSumY.fill(0);neighborCounts.fill(0);

 for(let i=0;i<N;i++){
  const speed=Math.sqrt(vx[i]*vx[i]+vy[i]*vy[i]);unitX[i]=speed>.0001?vx[i]/speed:0;unitY[i]=speed>.0001?vy[i]/speed:0;
  const key=headingKey(Math.floor((x[i]+WORLD_X*.5)/CELL),Math.floor((y[i]+WORLD_Y*.5)/CELL));
  nextHeading[i]=headingHeads[key];headingHeads[key]=i;
 }
 for(let i=0;i<N;i++){
  const cx=Math.floor((x[i]+WORLD_X*.5)/CELL),cy=Math.floor((y[i]+WORLD_Y*.5)/CELL);
  for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){
   const key=headingKey(cx+ox,cy+oy);if(key<0)continue;let j=headingHeads[key];
   while(j!==-1){
    // A neighbour pair contributes to both birds in one calculation.
    if(j>i){
     const dx=(x[j]-x[i]),dy=(y[j]-y[i]),squared=dx*dx+dy*dy;
     if(squared<CELL*CELL){
      if(refreshGroups)joinGroups(i,j);
      // Predict imminent encounters so a bird has time to turn without
      // needing a very large impulse only after entering the safety radius.
      if(effectiveStrengths.separation>0&&squared>=SAFE_DISTANCE*SAFE_DISTANCE){
       const rvx=vx[j]-vx[i],rvy=vy[j]-vy[i],closing=dx*rvx+dy*rvy,relativeSpeed=rvx*rvx+rvy*rvy;
       if(closing<0&&relativeSpeed>.0001){
        const closestTime=-closing/relativeSpeed;
        if(closestTime<AVOIDANCE_LOOKAHEAD){
         const futureX=dx+rvx*closestTime,futureY=dy+rvy*closestTime,futureSquared=futureX*futureX+futureY*futureY;
         if(futureSquared<SAFE_DISTANCE*SAFE_DISTANCE){
          const futureDistance=Math.sqrt(futureSquared);
          let ux,uy;
          if(futureDistance>.001){ux=futureX/futureDistance;uy=futureY/futureDistance;}
          else{const speed=Math.sqrt(relativeSpeed);ux=-rvy/speed;uy=rvx/speed;}
          const strength=180*effectiveStrengths.separation*(1-futureDistance/SAFE_DISTANCE)**2;
          anticipationX[i]-=ux*strength;anticipationY[i]-=uy*strength;anticipationX[j]+=ux*strength;anticipationY[j]+=uy*strength;
         }
        }
       }
      }
      positionSumX[i]+=dx;positionSumY[i]+=dy;positionSumX[j]-=dx;positionSumY[j]-=dy;
      neighborCounts[i]++;neighborCounts[j]++;
      if(effectiveStrengths.alignment!==0){
       const weight=(1-Math.sqrt(squared)/CELL)**2;
       directionSumX[i]+=unitX[j]*weight;directionSumY[i]+=unitY[j]*weight;
       directionSumX[j]+=unitX[i]*weight;directionSumY[j]+=unitY[i]*weight;
      }
     }
    }
    j=nextHeading[j];
   }
  }
 }
 for(let i=0;i<N;i++){
  const anticipated=Math.hypot(anticipationX[i],anticipationY[i]);
  if(anticipated>MAX_ANTICIPATION){const scale=MAX_ANTICIPATION/anticipated;anticipationX[i]*=scale;anticipationY[i]*=scale;}
  if(neighborCounts[i]){centerX[i]=positionSumX[i]/neighborCounts[i];centerY[i]=positionSumY[i]/neighborCounts[i];}
  const length=Math.hypot(directionSumX[i],directionSumY[i]);
  if(length>.0001){headingX[i]=directionSumX[i]/length;headingY[i]=directionSumY[i]/length;}
 }
 if(refreshGroups)finishGroups();
}

function computeMouseForce(px,py,velocityX,velocityY){
 mouseForce[0]=0;mouseForce[1]=0;
 if(!mouse.active)return mouseForce;
 // A visible cursor has no periodic copies on the opposite screen edge.
 const dx=px-mouse.x,dy=py-mouse.y,squared=dx*dx+dy*dy;
 if(squared>=MOUSE_RADIUS*MOUSE_RADIUS)return mouseForce;
 const distance=Math.sqrt(squared);
 let ux,uy;
 if(distance>.0001){ux=dx/distance;uy=dy/distance;}
 else{const speed=Math.hypot(velocityX,velocityY);ux=speed>.0001?-velocityX/speed:1;uy=speed>.0001?-velocityY/speed:0;}
 const strength=MOUSE_REPULSION*(1-distance/MOUSE_RADIUS)**2;
 mouseForce[0]=ux*strength;mouseForce[1]=uy*strength;
 return mouseForce;
}
function wallRange(toward,size){
 return Math.min(size*.45,Math.max(WALL_RANGE,2*(toward*toward/(2*MAX_ACCELERATION)+toward*FORCE_RESPONSE*2+SAFE_DISTANCE)));
}
function computeWallForce(px,py,velocityX=0,velocityY=0){
 const left=BOUND_X+px,right=BOUND_X-px,top=BOUND_Y+py,bottom=BOUND_Y-py;
 // Begin braking far enough ahead for the current outward speed and the
 // finite steering response. At a fixed speed, force rises as distance falls.
 const leftRange=wallRange(Math.max(0,-velocityX),WORLD_X),rightRange=wallRange(Math.max(0,velocityX),WORLD_X);
 const topRange=wallRange(Math.max(0,-velocityY),WORLD_Y),bottomRange=wallRange(Math.max(0,velocityY),WORLD_Y);
 wallForce[0]=0;wallForce[1]=0;
 if(left<leftRange)wallForce[0]+=WALL_REPULSION*(1-left/leftRange)**2;
 if(right<rightRange)wallForce[0]-=WALL_REPULSION*(1-right/rightRange)**2;
 if(top<topRange)wallForce[1]+=WALL_REPULSION*(1-top/topRange)**2;
 if(bottom<bottomRange)wallForce[1]-=WALL_REPULSION*(1-bottom/bottomRange)**2;
 return wallForce;
}

function step(dt){
 time+=dt;updateEffectiveStrengths(dt);updateFoods();computeSeparation();perceptionClock+=dt;
 // Perception refreshes at 30 Hz; integration, close separation, cursor and
 // walls stay at 60 Hz. The magnified view still copies every rendered frame.
 if(perceptionClock>=1/30-1e-8){computeAlignment();perceptionClock=0;}
 for(let i=0;i<N;i++){
  const avoidanceX=forceX[i]+anticipationX[i],avoidanceY=forceY[i]+anticipationY[i];
  let ax=avoidanceX,ay=avoidanceY;
  const speed=Math.hypot(vx[i],vy[i]);
  if(speed>.0001&&(headingX[i]!==0||headingY[i]!==0)){
   const ux=vx[i]/speed,uy=vy[i]/speed;
   const angle=Math.atan2(ux*headingY[i]-uy*headingX[i],ux*headingX[i]+uy*headingY[i]);
      const turn=Math.max(-MAX_TURN_RATE*effectiveStrengths.alignment,Math.min(MAX_TURN_RATE*effectiveStrengths.alignment,angle*ALIGN_GAIN*effectiveStrengths.alignment))*dt;
   const cs=Math.cos(turn),sn=Math.sin(turn);
   // Alignment proposes acceleration; it never replaces the velocity.
   ax+=(vx[i]*cs-vy[i]*sn-vx[i])/dt;
   ay+=(vx[i]*sn+vy[i]*cs-vy[i])/dt;
  }
  const centerDistance=Math.hypot(centerX[i],centerY[i]);
  const cohesionScale=centerDistance>.0001?Math.min(COHESION_GAIN,MAX_COHESION_FORCE/centerDistance)*effectiveStrengths.cohesion:0;
  ax+=centerX[i]*cohesionScale;ay+=centerY[i]*cohesionScale;
  const root=groupParent[i],smallGroup=groupSize[root]<SMALL_GROUP_LIMIT;
  let cruiseTarget=smallGroup?exploreSpeed[root]:CRUISE_SPEED;
  if(smallGroup){
   // A shared mild search turn keeps a small group together. All changes
   // pass through the same bounded inertial acceleration as flock rules.
   ax+=Math.cos(exploreHeading[root])*12;ay+=Math.sin(exploreHeading[root])*12;
  }
  let closestFood=null,foodDistance=FOOD_DETECTION;
  for(const food of foods){const distance=Math.hypot(food.x-x[i],food.y-y[i]);if(distance<foodDistance){closestFood=food;foodDistance=distance;}}
  if(closestFood&&foodDistance>.001){
   const pull=110+70*(1-foodDistance/FOOD_DETECTION);
   ax+=(closestFood.x-x[i])/foodDistance*pull;ay+=(closestFood.y-y[i])/foodDistance*pull;
   cruiseTarget*=.6+.4*Math.min(1,foodDistance/80);
  }
  // Birds gently maintain a similar cruising speed; different headings
  // and all avoidance still evolve through forces rather than a speed reset.
  if(speed>.0001){
   const drive=CRUISE_RESPONSE*(cruiseTarget*cruiseTarget-speed*speed)/(2*cruiseTarget);
   ax+=vx[i]/speed*drive;ay+=vy[i]/speed*drive;
  }
  if(mouse.active){computeMouseForce(x[i],y[i],vx[i],vy[i]);ax+=mouseForce[0];ay+=mouseForce[1];}
  // Crowded-neighbour forces cannot overpower a nearby wall simply through
  // their count: budget flock steering first, then apply wall avoidance.
  const flockMagnitude=Math.hypot(ax,ay);
  if(flockMagnitude>MAX_ACCELERATION){const scale=MAX_ACCELERATION/flockMagnitude;ax*=scale;ay*=scale;}
  computeWallForce(x[i],y[i],vx[i],vy[i]);ax+=wallForce[0];ay+=wallForce[1];
  // Bound the total acceleration, then give force changes a finite response
  // time. Velocity carries forward as momentum, including at close range.
  const magnitude=Math.hypot(ax,ay);
  if(magnitude>MAX_ACCELERATION){const scale=MAX_ACCELERATION/magnitude;ax*=scale;ay*=scale;}
  const response=1-Math.exp(-dt/(closestFood?FOOD_RESPONSE:FORCE_RESPONSE));
  accelerationX[i]+=(ax-accelerationX[i])*response;
  accelerationY[i]+=(ay-accelerationY[i])*response;
  vx[i]+=accelerationX[i]*dt;vy[i]+=accelerationY[i]*dt;
  const nextX=x[i]+vx[i]*dt,nextY=y[i]+vy[i]*dt;
  x[i]=Math.max(-BOUND_X,Math.min(BOUND_X,nextX));y[i]=Math.max(-BOUND_Y,Math.min(BOUND_Y,nextY));
  // Actual wall contact removes only outward motion; it does not flip the
  // velocity. Tangential motion and gradual steering remain intact.
  if(nextX>BOUND_X){vx[i]=Math.min(vx[i],0);accelerationX[i]=Math.min(accelerationX[i],0);}
  else if(nextX< -BOUND_X){vx[i]=Math.max(vx[i],0);accelerationX[i]=Math.max(accelerationX[i],0);}
  if(nextY>BOUND_Y){vy[i]=Math.min(vy[i],0);accelerationY[i]=Math.min(accelerationY[i],0);}
  else if(nextY< -BOUND_Y){vy[i]=Math.max(vy[i],0);accelerationY[i]=Math.max(accelerationY[i],0);}
 }
}

function draw(){
 ctx.drawImage(sky,0,0,width,height);
 const fit=viewScale;
 for(const food of foods){
  const px=width*.5+food.x*fit,py=height*.5+food.y*fit,radius=food.radius*fit;
  ctx.fillStyle='rgba(227,185,106,.28)';ctx.fillRect(px-radius,py-radius,radius*2,radius*2);
  ctx.strokeStyle='rgba(241,202,132,.8)';ctx.lineWidth=Math.max(.8,fit);ctx.strokeRect(px-radius,py-radius,radius*2,radius*2);
 }
 if(mouse.active){
  ctx.strokeStyle='rgba(255,194,143,.2)';ctx.lineWidth=.8;ctx.setLineDash([3,7]);
  ctx.beginPath();ctx.arc(mouse.screenX,mouse.screenY,MOUSE_RADIUS*fit,0,TAU);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle='rgba(255,213,176,.65)';ctx.beginPath();ctx.arc(mouse.screenX,mouse.screenY,3,0,TAU);ctx.stroke();
 }
 for(let i=0;i<N;i++){
  const renderX=Math.max(-BOUND_X,Math.min(BOUND_X,x[i]+vx[i]*accumulator)),renderY=Math.max(-BOUND_Y,Math.min(BOUND_Y,y[i]+vy[i]*accumulator));
  const s=fit;
  const dx=vx[i]*s,dy=vy[i]*s;
  const bird=projected[i];
  const screenX=width*.5+renderX*s,screenY=height*.5+renderY*s;
  // The silhouette follows the same 2D displacement as the visible bird.
  if(bird.ready&&Math.abs(screenX-bird.x)<width*.4&&Math.abs(screenY-bird.y)<height*.4){bird.motionX=screenX-bird.x;bird.motionY=screenY-bird.y;}
  else{bird.motionX=dx/30;bird.motionY=dy/30;bird.ready=true;}
  bird.x=screenX;bird.y=screenY;
  const movement=Math.hypot(bird.motionX,bird.motionY),streak=(2.6+shade[i]*2.8)*s;
  if(movement>.00001){bird.dx=bird.motionX/movement*streak;bird.dy=bird.motionY/movement*streak;}
  bird.a=.73*shade[i];bird.s=s;
 }
 ctx.lineCap='round';
 for(let bucket=0;bucket<5;bucket++){
  ctx.beginPath();
  for(let i=0;i<N;i++){
   const b=projected[i];if(b.a<.025||Math.min(4,Math.floor(b.a*5))!==bucket)continue;
   ctx.moveTo(b.x-b.dx*.6,b.y-b.dy*.6);ctx.lineTo(b.x+b.dx*.4,b.y+b.dy*.4);
  }
  ctx.strokeStyle=`rgba(157,199,221,${.026+bucket*.009})`;ctx.lineWidth=Math.max(1.7,fit*5.5);ctx.stroke();
  ctx.strokeStyle=`rgba(229,237,239,${.18+bucket*.15})`;ctx.lineWidth=Math.max(.58,fit*1.14);ctx.stroke();
 }
 // Tiny wing beats add life while retaining the silver streak silhouette.
 ctx.strokeStyle='rgba(211,228,232,.24)';ctx.lineWidth=Math.max(.45,fit*.7);ctx.beginPath();
 for(let i=0;i<N;i+=3){const b=projected[i];if(b.a<.04)continue;const flap=Math.sin(time*9+phase[i])*1.25*b.s;ctx.moveTo(b.x-b.dy*.24,b.y+b.dx*.24);ctx.lineTo(b.x+b.dx*.12,b.y+b.dy*.12+flap);ctx.lineTo(b.x+b.dy*.24,b.y-b.dx*.24);}
 ctx.stroke();
 if(selected>=0)drawNeighborhood();
}
function arrow(c,px,py,dx,dy,size,color){
 const length=Math.hypot(dx,dy);if(length<.00001||size<1)return;const ux=dx/length,uy=dy/length;
 c.strokeStyle=color;c.beginPath();c.moveTo(px-ux*size*.5,py-uy*size*.5);c.lineTo(px+ux*size*.5,py+uy*size*.5);c.moveTo(px+ux*size*.5-ux*3-uy*2,py+uy*size*.5-uy*3+ux*2);c.lineTo(px+ux*size*.5,py+uy*size*.5);c.lineTo(px+ux*size*.5-ux*3+uy*2,py+uy*size*.5-uy*3-ux*2);c.stroke();
}
function visibleNeighbors(index){
 const center=projected[index],radius=CELL*center.s,near=[];
 for(let i=0;i<N;i++){
  if(i===index||projected[i].a<.025)continue;
  const bird=projected[i],dx=bird.x-center.x,dy=bird.y-center.y;
  if(dx*dx+dy*dy<radius*radius)near.push(i);
 }
 return near;
}
function drawNeighborhood(){
 // One coordinate system and one frame: the inset is a live crop of the
 // actual main canvas, not a second illustration of the simulation.
 const center=projected[selected],radius=CELL*center.s,near=visibleNeighbors(selected);
 ctx.lineWidth=.7;
 ctx.strokeStyle='rgba(154,206,222,.2)';
 ctx.beginPath();
 for(const i of near){const bird=projected[i];ctx.moveTo(center.x,center.y);ctx.lineTo(bird.x,bird.y);}
 ctx.stroke();
 // Batch the real neighbour highlights into four strokes instead of
 // issuing two separate canvas strokes for every nearby bird.
 for(let group=0;group<2;group++){
  ctx.strokeStyle=group?'#ffad7d':'#8cdeeb';ctx.lineWidth=1.8;ctx.beginPath();
  for(const i of near){const bird=projected[i],dx=bird.x-center.x,dy=bird.y-center.y;
   if((dx*dx+dy*dy<SAFE_DISTANCE*SAFE_DISTANCE*center.s*center.s)!==Boolean(group))continue;
   ctx.moveTo(bird.x-bird.dx*.6,bird.y-bird.dy*.6);ctx.lineTo(bird.x+bird.dx*.4,bird.y+bird.dy*.4);
  }ctx.stroke();ctx.lineWidth=.8;ctx.beginPath();
  for(const i of near){const bird=projected[i],dx=bird.x-center.x,dy=bird.y-center.y;
   if((dx*dx+dy*dy<SAFE_DISTANCE*SAFE_DISTANCE*center.s*center.s)!==Boolean(group))continue;
   ctx.moveTo(bird.x+3.5,bird.y);ctx.arc(bird.x,bird.y,3.5,0,TAU);
  }ctx.stroke();
 }
 ctx.strokeStyle='rgba(255,173,125,.65)';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(center.x,center.y,SAFE_DISTANCE*center.s,0,TAU);ctx.stroke();
 ctx.setLineDash([3,5]);ctx.strokeStyle='rgba(172,210,225,.4)';
 ctx.beginPath();ctx.arc(center.x,center.y,radius,0,TAU);ctx.stroke();ctx.setLineDash([]);
 ctx.lineWidth=1.3;arrow(ctx,center.x,center.y,vx[selected],vy[selected],20,'#ffdf9b');
 ctx.strokeStyle='#ffdf9b';ctx.beginPath();ctx.arc(center.x,center.y,7,0,TAU);ctx.stroke();
 ctx.fillStyle='#ffe1a0';ctx.beginPath();ctx.arc(center.x,center.y,2.4,0,TAU);ctx.fill();
 const W=mini.clientWidth,H=mini.clientHeight,pixelRatio=Math.min(devicePixelRatio||1,2);
 if(mini.width!==Math.round(W*pixelRatio)||mini.height!==Math.round(H*pixelRatio)){
  mini.width=Math.round(W*pixelRatio);mini.height=Math.round(H*pixelRatio);
 }
 const c=miniCtx,ox=W/2,oy=H/2,R=Math.min(W,H)*.46;
 c.setTransform(pixelRatio,0,0,pixelRatio,0,0);c.clearRect(0,0,W,H);
 c.save();c.beginPath();c.arc(ox,oy,R,0,TAU);c.clip();
 c.fillStyle='#0b121e';c.fillRect(ox-R,oy-R,R*2,R*2);
 c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
 c.drawImage(canvas,(center.x-radius)*dpr,(center.y-radius)*dpr,radius*2*dpr,radius*2*dpr,ox-R,oy-R,R*2,R*2);
 c.restore();
 c.lineWidth=.8;c.strokeStyle='rgba(172,210,225,.4)';c.beginPath();c.arc(ox,oy,R,0,TAU);c.stroke();
}

function frame(now){
 // Avoid rendering twice as much work on 120/144 Hz displays.
 if(!nextRenderAt)nextRenderAt=now;
 if(now<nextRenderAt-1){requestAnimationFrame(frame);return;}
 nextRenderAt+=1000/60;if(nextRenderAt<=now)nextRenderAt=now+1000/60;
 if(!last)last=now;
 accumulator+=Math.min((now-last)/1000,.075);last=now;
 const tick=1/60;let loops=0;
 while(accumulator>=tick&&loops<2){step(tick);accumulator-=tick;loops++;}
 // Discard old time after a long stall rather than entering a catch-up spiral.
 if(accumulator>=tick)accumulator%=tick;
 draw();
 if(!fpsStart)fpsStart=now;fpsFrames++;
 if(now-fpsStart>=500){fpsLabel.textContent=`FPS ${Math.round((fpsFrames-1)*1000/(now-fpsStart))}`;fpsStart=now;fpsFrames=1;}
 requestAnimationFrame(frame);
}

addEventListener('visibilitychange',()=>{last=0;accumulator=0;mouse.active=false;fpsStart=0;fpsFrames=0;nextRenderAt=0;});
requestAnimationFrame(frame);
})();
