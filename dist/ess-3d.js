// ESS: carrinhos em 3D (estilo brinquedo, com contorno de gibi), feitos de formas simples, sem modelos baixados.
// Duas cenas: a corrida do topo da página (startRace) e a garagem para girar e escolher o carro (startShow).
// Carregado sob demanda pelo ess.js; se o navegador não tiver WebGL, a página segue com o carro desenhado.
import {Scene,PerspectiveCamera,WebGLRenderer,Mesh,Group,BoxGeometry,CylinderGeometry,SphereGeometry,CircleGeometry,ConeGeometry,ExtrudeGeometry,Shape,MeshToonMaterial,MeshBasicMaterial,DataTexture,CanvasTexture,NearestFilter,RedFormat,SRGBColorSpace,BackSide,Vector3,DirectionalLight,HemisphereLight} from './vendor/three-ess.js';

// Os carros do grid: nome, tipo, número, cor e as notas (velocidade, turbo, curvas) de 1 a 5
export const CARS=[
 {id:'faisca',name:'Faísca',kind:'Supercarro',num:1,color:'#e5231b',rim:'#ffbf1f',stats:[5,4,4]},
 {id:'trovao',name:'Trovão',kind:'Muscle car',num:7,color:'#1e63ff',rim:'#f2f2f2',stats:[4,5,3]},
 {id:'foguete',name:'Foguete',kind:'Fórmula',num:3,color:'#19a35b',rim:'#ffbf1f',stats:[5,3,5]},
 {id:'pipoca',name:'Pipoca',kind:'Rally',num:9,color:'#8a3ffc',rim:'#ffffff',stats:[3,4,5]}
];
const LEN=4.2; // comprimento de referência de um carro, em unidades da cena

// Materiais ----------------------------------------------------------------------------------------------
const ramp=new DataTexture(new Uint8Array([120,200,255]),3,1,RedFormat);ramp.minFilter=ramp.magFilter=NearestFilter;ramp.needsUpdate=true;
const toon=c=>new MeshToonMaterial({color:c,gradientMap:ramp});
const INK=new MeshBasicMaterial({color:'#141414',side:BackSide});
const M={tire:toon('#22242a'),dark:toon('#2b2d31'),glass:toon('#a8dcff'),white:toon('#ffffff'),chrome:toon('#c9ced6'),lamp:new MeshBasicMaterial({color:'#fff3b0'}),tail:new MeshBasicMaterial({color:'#ff7a1f'}),red:toon('#e5231b'),yellow:toon('#ffbf1f'),
 fire:new MeshBasicMaterial({color:'#ff7a00'}),fire2:new MeshBasicMaterial({color:'#ffe14a'})};

// Peças ---------------------------------------------------------------------------------------------------
// Contorno de gibi: a mesma peça, um pouco maior, pintada de preto por dentro
function ink(mesh,t=.045){
 const g=mesh.geometry;g.computeBoundingBox();const s=new Vector3(),c=new Vector3();g.boundingBox.getSize(s);g.boundingBox.getCenter(c);
 const o=new Mesh(g,INK);o.scale.set((s.x+2*t)/s.x,(s.y+2*t)/s.y,(s.z+2*t)/s.z);o.position.set(c.x*(1-o.scale.x),c.y*(1-o.scale.y),c.z*(1-o.scale.z));mesh.add(o);return mesh;
}
const box=(mat,w,h,d,x,y,z,line=true)=>{const m=new Mesh(new BoxGeometry(w,h,d),mat);m.position.set(x,y,z);return line?ink(m,.035):m;};
// Cilindro deitado: axis 'x' (escapamento, farol) ou 'z' (roda)
const cyl=(mat,r,len,axis,x,y,z,line=true)=>{const g=new CylinderGeometry(r,r,len,22);if(axis==='x')g.rotateZ(Math.PI/2);else g.rotateX(Math.PI/2);const m=new Mesh(g,mat);m.position.set(x,y,z);return line?ink(m,.035):m;};
const ball=(mat,r,x,y,z,sx=1,sy=1,sz=1)=>{const g=new SphereGeometry(r,18,14);g.scale(sx,sy,sz);const m=new Mesh(g,mat);m.position.set(x,y,z);return m;};
// Perfil lateral (visto de lado) esticado na largura: M mover, L linha, Q curva, A caixa de roda (meia-lua)
function slab(mat,cmds,width,bevel=.07){
 const s=new Shape();let base=0;
 cmds.forEach(([k,a,b,c,d])=>{
  if(k==='M'){s.moveTo(a,b);base=b;}else if(k==='L')s.lineTo(a,b);else if(k==='Q')s.quadraticCurveTo(a,b,c,d);
  else{s.lineTo(a+b,base);s.absarc(a,base,b,0,Math.PI,false);}
 });
 s.closePath();
 const g=new ExtrudeGeometry(s,{depth:width,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,curveSegments:10});g.translate(0,0,-width/2);
 return ink(new Mesh(g,mat),.05);
}
function wheel(r,w,rim,x,z){
 const g=new Group();g.position.set(x,r,z);
 g.add(cyl(M.tire,r,w,'z',0,0,0),cyl(toon(rim),r*.6,w+.05,'z',0,0,0,false));
 [0,Math.PI/2].forEach(a=>{const b=box(M.dark,r*1.05,r*.17,w+.09,0,0,0,false);b.rotation.z=a;g.add(b);});
 g.add(cyl(M.white,r*.16,w+.12,'z',0,0,0,false));
 return g;
}
const numTex={};
function numberDisc(n,r,x,y,z,back){
 if(!numTex[n]){const c=document.createElement('canvas');c.width=c.height=128;const k=c.getContext('2d');
  k.fillStyle='#141414';k.beginPath();k.arc(64,64,62,0,7);k.fill();k.fillStyle='#fff';k.beginPath();k.arc(64,64,50,0,7);k.fill();
  k.fillStyle='#141414';k.font='900 78px "Arial Black",Arial,sans-serif';k.textAlign='center';k.textBaseline='middle';k.fillText(String(n),64,70);
  numTex[n]=new CanvasTexture(c);numTex[n].colorSpace=SRGBColorSpace;}
 const m=new Mesh(new CircleGeometry(r,28),new MeshBasicMaterial({map:numTex[n],transparent:true}));m.position.set(x,y,z);if(back)m.rotation.y=Math.PI;return m;
}
function flame(x,y,z,size=1){
 const g=new Group();g.position.set(x,y,z);
 const a=new Mesh(new ConeGeometry(.17,.8,12),M.fire),b=new Mesh(new ConeGeometry(.09,.5,10),M.fire2);
 a.rotation.z=b.rotation.z=Math.PI/2;a.position.x=-.4;b.position.x=-.25;g.add(a,b);g.scale.setScalar(size);g.userData.size=size;return g;
}

// Os quatro modelos -----------------------------------------------------------------------------------------
function buildCar(spec){
 const car=new Group(),body=new Group(),wheels=[],P=toon(spec.color);car.add(body);
 const add=(...m)=>body.add(...m);
 const wh=(r,w,x,z)=>{const g=wheel(r,w,spec.rim,x,z);wheels.push(g);car.add(g);};
 let fl;
 if(spec.id==='faisca'){ // supercarro baixo, em cunha, com aerofólio grande
  add(slab(P,[['M',-2,.3],['L',-2.08,.7],['Q',-2.08,.98,-1.8,1],['L',.5,.98],['Q',1.6,.9,2,.62],['Q',2.12,.5,2.08,.3],['A',1.3,.58],['A',-1.3,.58]],1.76));
  add(slab(M.glass,[['M',-1.25,.98],['Q',-1,1.42,-.55,1.44],['L',.15,1.44],['Q',.6,1.3,1.05,.98]],1.36,.05),box(P,.78,.07,1.4,-.2,1.5,0));
  add(box(M.dark,.08,.4,.08,-1.72,1.15,.5),box(M.dark,.08,.4,.08,-1.72,1.15,-.5),box(P,.55,.08,2.05,-1.8,1.4,0),box(M.dark,.6,.3,.06,-1.8,1.33,1.03),box(M.dark,.6,.3,.06,-1.8,1.33,-1.03));
  add(box(M.yellow,3.5,.1,.03,-.05,.74,.96,false),box(M.yellow,3.5,.1,.03,-.05,.74,-.96,false),box(M.dark,.3,.07,1.9,2.02,.3,0));
  add(ball(M.lamp,.15,1.93,.68,.62,1,.7,1),ball(M.lamp,.15,1.93,.68,-.62,1,.7,1),box(M.tail,.06,.14,.36,-2.13,.8,.58,false),box(M.tail,.06,.14,.36,-2.13,.8,-.58,false));
  add(cyl(M.chrome,.09,.24,'x',-2.14,.46,.3),cyl(M.chrome,.09,.24,'x',-2.14,.46,-.3));
  add(numberDisc(spec.num,.3,-.35,.72,.99),numberDisc(spec.num,.3,-.35,.72,-.99,true));
  wh(.42,.4,1.3,.82);wh(.42,.4,1.3,-.82);wh(.42,.4,-1.3,.82);wh(.42,.4,-1.3,-.82);fl=flame(-2.2,.46,0);
 }else if(spec.id==='trovao'){ // muscle car: capô comprido, motor aparecendo, roda traseira maior e listras
  add(slab(P,[['M',-2.1,.34],['L',-2.15,.95],['Q',-2.15,1.08,-1.95,1.08],['L',-1.2,1.06],['L',1.9,1],['Q',2.15,.98,2.15,.8],['L',2.12,.34],['A',1.35,.56],['A',-1.3,.66]],1.82));
  add(slab(M.glass,[['M',-1.3,1.05],['L',-.95,1.5],['L',.15,1.5],['L',.6,1.03]],1.42,.05),box(P,1.06,.07,1.46,-.4,1.57,0));
  [.24,-.24].forEach(z=>{const h=box(M.white,1.35,.04,.2,1.33,1.1,z,false);h.rotation.z=-.02;add(h,box(M.white,1.04,.04,.2,-.4,1.62,z,false),box(M.white,.72,.04,.2,-1.62,1.17,z,false));});
  add(box(M.chrome,.55,.24,.52,1.1,1.2,0),box(M.dark,.62,.08,.6,1.1,1.36,0),cyl(M.chrome,.1,.5,'z',1.3,1.2,0));
  add(cyl(M.chrome,.08,1.5,'x',0,.36,.97),cyl(M.chrome,.08,1.5,'x',0,.36,-.97),box(P,.28,.09,1.7,-2.05,1.16,0));
  add(cyl(M.lamp,.15,.08,'x',2.2,.76,.6,false),cyl(M.lamp,.15,.08,'x',2.2,.76,-.6,false),box(M.dark,.06,.26,.8,2.2,.74,0,false),box(M.tail,.06,.14,.4,-2.2,.82,.58,false),box(M.tail,.06,.14,.4,-2.2,.82,-.58,false));
  add(numberDisc(spec.num,.3,-.4,.72,1.0),numberDisc(spec.num,.3,-.4,.72,-1.0,true));
  wh(.42,.4,1.35,.84);wh(.42,.4,1.35,-.84);wh(.5,.5,-1.3,.84);wh(.5,.5,-1.3,-.84);fl=flame(-.8,.36,.97,.7);
 }else if(spec.id==='foguete'){ // fórmula: rodas de fora, asas e o piloto de capacete aparecendo
  add(slab(P,[['M',-1.75,.28],['L',-1.85,.7],['Q',-1.6,.98,-1.1,.98],['L',-.35,.95],['Q',-.15,.72,.1,.7],['L',.55,.7],['Q',1.6,.6,2.25,.42],['L',2.25,.28]],.66));
  add(box(P,1.3,.38,.44,-.45,.5,.56),box(P,1.3,.38,.44,-.45,.5,-.56),box(P,.5,.34,.4,-.6,1.12,0));
  add(ball(M.white,.27,.08,1.02,0),box(M.dark,.2,.12,.42,.27,1.05,0,false),box(M.red,.5,.05,.12,.08,1.27,0,false));
  add(box(M.white,.46,.07,2.1,2.08,.3,0),box(P,.52,.3,.06,2.08,.42,1.06),box(P,.52,.3,.06,2.08,.42,-1.06));
  add(box(M.dark,.1,.5,.1,-1.8,1.02,0),box(M.white,.52,.08,1.8,-1.85,1.32,0),box(P,.62,.52,.06,-1.85,1.14,.92),box(P,.62,.52,.06,-1.85,1.14,-.92));
  add(box(M.dark,.08,.06,1.7,1.35,.5,0,false),box(M.dark,.08,.06,1.7,-1.35,.5,0,false));
  add(numberDisc(spec.num,.19,-.45,.52,.79),numberDisc(spec.num,.19,-.45,.52,-.79,true),cyl(M.chrome,.1,.2,'x',-1.9,.5,0));
  wh(.48,.46,1.35,1.0);wh(.48,.46,1.35,-1.0);wh(.5,.52,-1.35,1.0);wh(.5,.52,-1.35,-1.0);fl=flame(-2,.5,0);
 }else{ // rally: alto e redondinho, com faróis no teto e para-lamas
  add(slab(P,[['M',-1.8,.4],['L',-1.88,1],['Q',-1.88,1.12,-1.7,1.12],['L',1,1.08],['Q',1.75,1.02,1.85,.8],['L',1.85,.4],['A',1.2,.62],['A',-1.2,.62]],1.78));
  add(slab(M.glass,[['M',-1.75,1.1],['Q',-1.7,1.78,-1.3,1.8],['L',.2,1.8],['Q',.55,1.5,.9,1.08]],1.44,.05),box(P,1.5,.07,1.48,-.55,1.87,0));
  add(box(M.dark,.14,.09,1.25,.22,1.94,0));[-.45,-.15,.15,.45].forEach(z=>add(cyl(M.dark,.15,.1,'x',.27,2.07,z),cyl(M.lamp,.11,.04,'x',.33,2.07,z,false)));
  add(box(P,.38,.07,1.5,-1.6,1.95,0),box(M.red,.05,.32,.34,-1.78,.44,.8),box(M.red,.05,.32,.34,-1.78,.44,-.8),box(M.dark,.1,.26,1.5,1.93,.6,0));
  add(cyl(M.lamp,.18,.08,'x',1.9,.88,.58,false),cyl(M.lamp,.18,.08,'x',1.9,.88,-.58,false),box(M.tail,.06,.2,.3,-1.93,.9,.62,false),box(M.tail,.06,.2,.3,-1.93,.9,-.62,false));
  add(box(M.white,3.2,.12,.03,-.05,.86,.97,false),box(M.white,3.2,.12,.03,-.05,.86,-.97,false),cyl(M.chrome,.09,.24,'x',-1.95,.5,.4));
  add(numberDisc(spec.num,.3,-.3,.8,1.0),numberDisc(spec.num,.3,-.3,.8,-1.0,true));
  wh(.46,.42,1.2,.82);wh(.46,.42,1.2,-.82);wh(.46,.42,-1.2,.82);wh(.46,.42,-1.2,-.82);fl=flame(-2.05,.5,.4,.8);
 }
 car.add(fl);
 const shadow=new Mesh(new CircleGeometry(1,24),new MeshBasicMaterial({color:'#000',transparent:true,opacity:.3,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.set(2.5,1.2,1);shadow.position.y=.02;car.add(shadow);
 car.userData={spec,body,wheels,flame:fl,shadow};
 return car;
}
// Anima as peças do carro: rodas girando, carroceria balançando e a chama do escapamento
function drive(car,t,spin,fire=1){
 const u=car.userData;u.wheels.forEach(w=>{w.rotation.z=-spin;});
 u.body.position.y=Math.sin(t*26+u.spec.num)*.018;u.body.rotation.x=Math.sin(t*3.1+u.spec.num)*.02;
 const k=u.flame.userData.size*fire;u.flame.scale.set(k*(.55+.45*Math.abs(Math.sin(t*47+u.spec.num))),k*(.85+.15*Math.sin(t*61)),k);
}
function lights(scene){const d=new DirectionalLight('#fff',2.2);d.position.set(4,9,7);scene.add(new HemisphereLight('#ffffff','#b08a3a',1.25),d);}
function renderer(canvas){const r=new WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});r.setPixelRatio(Math.min(devicePixelRatio||1,2));return r;}
// Só desenha enquanto a cena está na tela e a aba está aberta
function loop(canvas,frame){
 let on=false,raf=0,last=0,seen=true;
 const tick=now=>{raf=requestAnimationFrame(tick);const dt=Math.min(.05,(now-last)/1000||0);last=now;frame(now/1000,dt);};
 const sync=()=>{const want=seen&&!document.hidden;if(want&&!on){on=true;last=performance.now();raf=requestAnimationFrame(tick);}else if(!want&&on){on=false;cancelAnimationFrame(raf);}};
 if('IntersectionObserver' in window)new IntersectionObserver(es=>{seen=es[0].isIntersecting;sync();},{rootMargin:'120px'}).observe(canvas);
 document.addEventListener('visibilitychange',sync);sync();
}

// Corrida do topo ---------------------------------------------------------------------------------------------
// layout() devolve, em pixels: largura do carro, distância da esquerda e altura da pista (para casar com o asfalto da página)
export function startRace(canvas,layout,first){
 const R=renderer(canvas),scene=new Scene(),cam=new PerspectiveCamera(13,2,1,200);lights(scene);
 const cars=Object.fromEntries(CARS.map(s=>[s.id,buildCar(s)]));Object.values(cars).forEach(c=>scene.add(c));
 const puffs=Array.from({length:5},()=>{const m=new Mesh(new SphereGeometry(.2,12,10),new MeshBasicMaterial({color:'#fff',transparent:true,depthWrite:false}));scene.add(m);return m;});
 const PITCH=.25,YAW=-.32; // câmera um pouco de cima; carros com a frente levemente virada para quem olha
 let mine=cars[first]?first:CARS[0].id,rivals=[],L={},W=0,H=0,boostAt=-9,spin=0;
 const pick=()=>{rivals=CARS.filter(s=>s.id!==mine).map(s=>cars[s.id]);};pick();
 function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;W=w;H=h;R.setSize(w,h,false);
  const l=layout(),unit=l.car/(LEN*1.3),visH=h/unit,d=visH/2/Math.tan(cam.fov*Math.PI/360),yc=(h/2-l.track/2)/(unit*Math.cos(PITCH));
  cam.aspect=w/h;cam.position.set(0,yc+d*Math.sin(PITCH),d*Math.cos(PITCH));cam.lookAt(0,yc,0);cam.updateProjectionMatrix();
  const zr=l.track/(2*Math.sin(PITCH)*unit);
  L={half:w/2/unit,x0:-w/2/unit+(l.left+l.car/2)/unit,near:zr*.22,far:-zr*.6,swing:Math.min(2.2,.05*w/unit)};
 }
 new ResizeObserver(resize).observe(canvas);resize();
 // Arrancada do turbo: recua, empina e dispara, depois volta ao lugar
 function nitro(s){if(s<0||s>1.25)return[0,0];const p=s/1.25,far=Math.min(L.half*.75,6.4);
  if(p<.14)return[-.25*(p/.14),.1*(p/.14)];
  if(p<.5){const k=(p-.14)/.36,e=1-Math.pow(1-k,3);return[-.25+(far+.25)*e,.1*(1-k)];}
  const k=(p-.5)/.5,e=k*k*(3-2*k);return[far*(1-e),0];}
 loop(canvas,(t,dt)=>{
  if(!W)return;
  const s=t-boostAt,[nx,tilt]=nitro(s),turbo=s>=0&&s<1.25;spin+=dt*(turbo?34:15);
  const me=cars[mine];me.visible=true;me.scale.setScalar(1);
  me.position.set(L.x0+(Math.sin(t*.63)*.5+.5)*L.swing+nx,0,L.near+Math.sin(t*.9)*.12);
  me.rotation.set(0,YAW+Math.sin(t*1.3)*.07+(turbo?.14:0),tilt);drive(me,t,spin,turbo?2.3:1);
  // Rivais na faixa de trás: cada um na sua vez, um ultrapassando e o outro ficando para trás
  rivals.forEach((c,i)=>{
   const period=12,ph=((t+i*4.3)%period)/period,span=L.half+LEN,run=Math.min(1,ph/.5),dir=i%2?-1:1;
   c.visible=ph<.5;c.scale.setScalar(.8);c.position.set(dir*(-span+2*span*run),0,L.far+Math.sin(t*1.1+i)*.1);
   c.rotation.set(0,YAW*.8+Math.sin(t*1.7+i*2)*.08,0);drive(c,t,spin*(dir>0?1.25:.8),.8);
  });
  // Fumaça saindo do escapamento
  const f=me.userData.flame.position;
  puffs.forEach((p,i)=>{const life=((t*.85+i/puffs.length)%1);p.position.set(me.position.x+f.x-.5-life*2.4,f.y+.05+life*.7,me.position.z+f.z+.3);p.scale.setScalar(.4+life*1.1);p.material.opacity=.85*(1-life);});
  R.render(scene,cam);
 });
 return{
  boost(){boostAt=performance.now()/1000;},
  setCar(id){if(!cars[id]||id===mine)return;mine=id;pick();Object.values(cars).forEach(c=>{c.visible=false;});}
 };
}

// Garagem: um carro por vez no palco giratório; arrastar gira ------------------------------------------------------
export function startShow(canvas,first){
 const R=renderer(canvas),scene=new Scene(),cam=new PerspectiveCamera(30,1,.5,100);lights(scene);
 const spinner=new Group();scene.add(spinner);
 // Palco: disco quadriculado
 const k=document.createElement('canvas');k.width=k.height=256;const x=k.getContext('2d');
 for(let i=0;i<8;i++)for(let j=0;j<8;j++){x.fillStyle=(i+j)%2?'#141414':'#ffffff';x.fillRect(i*32,j*32,32,32);}
 const tex=new CanvasTexture(k);tex.colorSpace=SRGBColorSpace;
 const disc=new Mesh(new CylinderGeometry(3.1,3.1,.26,48),[toon('#ffbf1f'),new MeshBasicMaterial({map:tex}),M.dark]);disc.position.y=-.13;ink(disc,.06);spinner.add(disc);
 const cars=Object.fromEntries(CARS.map(s=>{const c=buildCar(s);c.visible=false;c.userData.flame.visible=false;spinner.add(c);return[s.id,c];}));
 let now=cars[first]?first:CARS[0].id,prev=null,swapAt=-9,drag=null,vel=.6,spin=0,auto=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 cars[now].visible=true;spinner.rotation.y=-.6;
 function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;R.setSize(w,h,false);cam.aspect=w/h;
  const d=w/h<1.15?11.2:8.8;cam.position.set(0,d*.3,d);cam.lookAt(0,.7,0);cam.updateProjectionMatrix();}
 new ResizeObserver(resize).observe(canvas);resize();
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX};vel=0;canvas.setPointerCapture(e.pointerId);canvas.classList.add('grab');});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;drag.x=e.clientX;spinner.rotation.y+=dx*.012;vel=dx*.7;});
 const drop=()=>{if(drag){drag=null;canvas.classList.remove('grab');}};
 canvas.addEventListener('pointerup',drop);canvas.addEventListener('pointercancel',drop);
 // Setas do teclado giram o carro
 canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();spinner.rotation.y+=e.key==='ArrowLeft'?-.35:.35;}});
 loop(canvas,(t,dt)=>{
  if(!drag){vel+=((auto?.6:0)-vel)*Math.min(1,dt*2.5);spinner.rotation.y+=vel*dt;}
  spin+=dt*5;
  // Troca de carro: o antigo encolhe girando e o novo salta no palco
  const s=t-swapAt;
  if(prev){const k=Math.min(1,s/.18);cars[prev].scale.setScalar(1-k);cars[prev].rotation.y=k*2;if(k>=1){cars[prev].visible=false;cars[prev].rotation.y=0;prev=null;}}
  const c=cars[now],k=Math.min(1,Math.max(0,(s-.14)/.45)),e=1-Math.pow(1-k,3)+Math.sin(k*Math.PI)*.18;
  c.visible=s>.14||swapAt<0;c.scale.setScalar(swapAt<0?1:e);c.position.y=swapAt<0?0:(1-k)*1.2;drive(c,t,spin,0);
  R.render(scene,cam);
 });
 return{show(id){if(!cars[id]||id===now)return;if(prev){cars[prev].visible=false;cars[prev].rotation.y=0;}prev=now;now=id;swapAt=performance.now()/1000;}};
}
