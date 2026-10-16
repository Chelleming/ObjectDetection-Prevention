(function(){
"use strict";

/* ============ DYNAMIC THEME STYLING ============ */
const style = document.createElement('style');
style.id = "theme-styles";
style.innerHTML = `
  #game-container, #viewport, #visual-viewport, #canvas-container, #screen, #game, #scene-container,
  .visual-viewport, .game-container, .screen, .canvas-container, [class*="viewport"], [class*="container"] {
    background: transparent !important;
    background-color: transparent !important;
    box-shadow: none !important;
    border: none !important;
  }
  
  #scene {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 0 !important;
    background: transparent !important;
    background-color: transparent !important;
  }

  /* Default theme behavior based on body class */
  body, html {
    margin: 0;
    padding: 0;
    overflow: hidden;
    transition: background-color 0.3s ease;
  }
  
  body.dark-theme {
    background-color: #0b0f19 !important;
  }
  
  body.light-theme {
    background-color: #f3f4f6 !important;
  }
`;
document.head.appendChild(style);

// I-default muna sa dark-theme ang body class
document.body.classList.add('dark-theme');

/* ============ Global Game State & Destinations ============ */
let running = false;
let paused = false;
let score = 0;
let level = 1;
let lives = 3;
let streak = 0;
let pulseTimer = 0;
let pulseInterval = 3.0;
let continuousGuidanceTimer = 0;
const GUIDANCE_INTERVAL = 4.5; 
let isLightMode = false; // Flag para sa active theme state

const DESTINATIONS = [
  {
    name: "Training Grounds",
    sub: "Portal Tutorial",
    skyColorDark: "#0b0f19",
    skyColorLight: "#e5e7eb",
    groundColorDark: 0x111827,
    groundColorLight: 0xd1d5db,
    obstacleType: "cone",
    obstacleLabel: "traffic cone",
    description: "Welcome back! Guide your avatar to the spinning diamond gateway directly ahead to trigger teleportation."
  },
  {
    name: "Paris Streets",
    sub: "Destination France",
    skyColorDark: "#070b19",
    skyColorLight: "#dde1ee",
    groundColorDark: 0x1e293b,
    groundColorLight: 0xbcc5cf,
    obstacleType: "scooter",
    obstacleLabel: "parked electric scooter",
    description: "Welcome to Paris! Watch out for narrow streets and scooters parked haphazardly along the stone pathways."
  },
  {
    name: "Rome Colosseum Outer Wall",
    sub: "Destination Italy",
    skyColorDark: "#1c0d02",
    skyColorLight: "#f5ebe0",
    groundColorDark: 0x2e1806,
    groundColorLight: 0xd5bdaf,
    obstacleType: "pillar",
    obstacleLabel: "crumbling roman marble column",
    description: "Welcome to Rome! Be highly careful of ancient, heavy marble stone pillars obstructing the walkway."
  },
  {
    name: "Manila Expressway",
    sub: "Destination Philippines",
    skyColorDark: "#021e17",
    skyColorLight: "#e8f5e9",
    groundColorDark: 0x064e3b,
    groundColorLight: 0xa5d6a7,
    obstacleType: "tricycle",
    obstacleLabel: "tricycle side-car",
    description: "Welcome to the Philippines! Maneuver carefully through busy streets around tires and local tricycles."
  }
];
let currentDestIndex = 0;

/* ============ INSTANT REAL-TIME SPEECH SYNCHRONIZATION WITH LOCK ============ */
let voiceOn = true;
let speechRate = 1.15; 
let isSpeaking = false; 
const liveEl = document.getElementById('live');
const captionEl = document.getElementById('caption');
let captionTimer = null;

function announceLive(text){
  if (!liveEl) return;
  liveEl.textContent = "";
  setTimeout(()=>{ liveEl.textContent = text; }, 10);
  if (captionEl) {
    captionEl.textContent = text;
    captionEl.classList.add('show');
    clearTimeout(captionTimer);
    captionTimer = setTimeout(()=> captionEl.classList.remove('show'), 3500);
  }
}

function speak(text, interrupt = true) {
  if (!voiceOn) return;
  if (isSpeaking && !interrupt) return;

  announceLive(text);
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.rate = speechRate;
  
  u.onstart = () => { isSpeaking = true; };
  u.onend = () => { isSpeaking = false; };
  u.onerror = () => { isSpeaking = false; };

  window.speechSynthesis.speak(u);
}

function chatLog(msg, strong){
  const log = document.getElementById('log');
  if(!log) return;
  const p = document.createElement('p');
  p.className = 'new';
  p.innerHTML = strong ? ('<b>'+strong+':</b> '+msg) : msg;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
  while(log.children.length > 25) log.removeChild(log.firstChild);
}

/* ============ Web Audio: Spatialization ============ */
let soundOn = true;
let masterVol = 1.0;
let actx = null;
function ctx(){ if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)(); return actx; }

function updateListener(px,py,pz,fx,fz){
  if(!actx) return;
  const l = actx.listener;
  if(l.positionX){
    l.positionX.setValueAtTime(px, actx.currentTime);
    l.positionY.setValueAtTime(py, actx.currentTime);
    l.positionZ.setValueAtTime(pz, actx.currentTime);
    l.forwardX.setValueAtTime(fx, actx.currentTime);
    l.forwardY.setValueAtTime(0, actx.currentTime);
    l.forwardZ.setValueAtTime(fz, actx.currentTime);
    l.upX.setValueAtTime(0, actx.currentTime);
    l.upY.setValueAtTime(1, actx.currentTime);
    l.upZ.setValueAtTime(0, actx.currentTime);
  } else if(l.setPosition){
    l.setPosition(px,py,pz);
    l.setOrientation(fx,0,fz, 0,1,0);
  }
}

function makePanner(x,y,z){
  const c = ctx();
  const panner = c.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 2.0;
  panner.maxDistance = 80.0;
  panner.rolloffFactor = 1.2;
  if(panner.positionX){
    panner.positionX.setValueAtTime(x, c.currentTime);
    panner.positionY.setValueAtTime(y, c.currentTime);
    panner.positionZ.setValueAtTime(z, c.currentTime);
  } else if(panner.setPosition){
    panner.setPosition(x,y,z);
  }
  return panner;
}

function ping3D(x,y,z, opts){
  if(!soundOn) return;
  opts = opts || {};
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  const panner = makePanner(x,y,z);
  osc.type = opts.wave || 'sine';
  osc.frequency.setValueAtTime(opts.freq || 520, c.currentTime);
  if(opts.freqTo !== undefined){
    osc.frequency.exponentialRampToValueAtTime(Math.max(opts.freqTo,20), c.currentTime + (opts.dur||0.28));
  }
  const vol = (opts.volume !== undefined ? opts.volume : 0.5) * masterVol;
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(vol,0.001), c.currentTime+0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (opts.dur||0.28));
  osc.connect(gain); gain.connect(panner); panner.connect(c.destination);
  osc.start(); osc.stop(c.currentTime + (opts.dur||0.28) + 0.03);
}

function tone2D(freq, dur, volume, wave){
  if(!soundOn) return;
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = wave || 'triangle';
  osc.frequency.setValueAtTime(freq, c.currentTime);
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime((volume||0.25)*masterVol, c.currentTime+0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime+(dur||0.3));
  osc.connect(gain); gain.connect(c.destination);
  osc.start(); osc.stop(c.currentTime+(dur||0.3)+0.03);
}

function flash(className){
  const el = document.getElementById('flash');
  if(!el) return;
  el.className = className;
  el.style.opacity = '1';
  setTimeout(()=>{ el.style.opacity = '0'; }, 250);
}

/* ============ Three.js Initialization ============ */
const canvas = document.getElementById('scene');
canvas.style.background = "transparent";

const renderer = new THREE.WebGLRenderer({
  canvas: canvas, 
  antialias: true, 
  alpha: true,              
  premultipliedAlpha: false 
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.setClearColor(0x000000, 0); 

const scene = new THREE.Scene();
scene.background = null; 
const sceneFog = new THREE.FogExp2("#0b0f19", 0.012);
scene.fog = sceneFog;
const camera = new THREE.PerspectiveCamera(62, window.innerWidth/window.innerHeight, 0.1, 400);

const hemi = new THREE.HemisphereLight(0xffffff, 0x1f2937, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(30,50,20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-50; sun.shadow.camera.right=50; sun.shadow.camera.top=50; sun.shadow.camera.bottom=-50;
scene.add(sun);

const FIELD_HALF = 35;
const groundGeo = new THREE.PlaneGeometry(FIELD_HALF*2, FIELD_HALF*2, 1,1);
const groundMat = new THREE.MeshLambertMaterial({color:0x111827});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(FIELD_HALF*2, 24, 0x4b5563, 0x27272a);
grid.position.y = 0.01;
scene.add(grid);

/* ============ Landmark & Environment Background Mesh Generators ============ */
const backgroundDecoGroup = new THREE.Group();
scene.add(backgroundDecoGroup);

function createParisVisualBackground() {
  backgroundDecoGroup.clear();
  const ironMat = new THREE.MeshLambertMaterial({color: 0x2e3b4e});

  const eiffel = new THREE.Group();
  const b1 = new THREE.Mesh(new THREE.ConeGeometry(4, 12, 4), ironMat);
  b1.position.y = 6;
  eiffel.add(b1);
  const b2 = new THREE.Mesh(new THREE.ConeGeometry(2, 16, 4), ironMat);
  b2.position.y = 14;
  eiffel.add(b2);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.5, 8), ironMat);
  spire.position.y = 24;
  eiffel.add(spire);
  
  eiffel.position.set(0, 0, -45);
  backgroundDecoGroup.add(eiffel);
}

function createRomeVisualBackground() {
  backgroundDecoGroup.clear();
  const stoneMat = new THREE.MeshLambertMaterial({color: 0x4a3728});
  
  for(let i = -3; i <= 3; i++) {
    if(i === 0) continue;
    const wallBlock = new THREE.Mesh(new THREE.BoxGeometry(8, 14, 3), stoneMat);
    wallBlock.position.set(i * 12, 7, -48);
    backgroundDecoGroup.add(wallBlock);
  }
}

function createManilaVisualBackground() {
  backgroundDecoGroup.clear();
  const buildingMat = new THREE.MeshLambertMaterial({color: 0x143a28});
  
  for(let i = 0; i < 6; i++) {
    const h = randRange(15, 30);
    const block = new THREE.Mesh(new THREE.BoxGeometry(6, h, 6), buildingMat);
    block.position.set(-30 + i * 12, h/2, -45);
    backgroundDecoGroup.add(block);
  }
}

/* ============ Custom Native Object Builders ============ */
const coneOrangeMat = new THREE.MeshLambertMaterial({color:0xef4444});
const coneStripeMat = new THREE.MeshLambertMaterial({color:0xf3f4f6});
const darkRubberMat = new THREE.MeshLambertMaterial({color:0x1e293b});
const brightTreadMat = new THREE.MeshLambertMaterial({color:0x8b949e});
const pillarMarbleMat = new THREE.MeshLambertMaterial({color:0xe5e7eb});
const localJeepneyYellowMat = new THREE.MeshLambertMaterial({color:0xf59e0b});

function buildTrafficCone(scale){
  const g = new THREE.Group();
  const s = scale || 1;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.15*s,0.14*s,1.15*s), darkRubberMat);
  base.position.y = 0.07*s;
  base.castShadow = true;
  g.add(base);

  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.46*s,1.35*s,24), coneOrangeMat);
  cone.position.y = 0.82*s;
  cone.castShadow = true;
  g.add(cone);

  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.30*s,0.36*s,0.12*s,24), coneStripeMat);
  stripe.position.y = 0.68*s;
  g.add(stripe);
  return g;
}

function buildTire(scale){
  const g = new THREE.Group();
  const s = scale || 1;
  const tireMesh = new THREE.Mesh(new THREE.TorusGeometry(0.5*s, 0.2*s, 12, 24), darkRubberMat);
  tireMesh.rotation.y = Math.PI/2;
  tireMesh.position.y = 0.5*s;
  tireMesh.castShadow = true;
  g.add(tireMesh);

  const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.24*s, 0.24*s, 0.44*s, 8), brightTreadMat);
  rimMesh.rotation.x = Math.PI/2;
  rimMesh.position.y = 0.5*s;
  g.add(rimMesh);
  return g;
}

function buildScooter(scale){
  const g = new THREE.Group();
  const s = scale || 1;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.2*s, 0.1*s, 1.3*s), darkRubberMat);
  base.position.y = 0.1*s;
  base.castShadow = true;
  g.add(base);

  const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.04*s, 0.04*s, 1.4*s, 8), brightTreadMat);
  handleBar.position.set(0, 0.7*s, -0.55*s);
  handleBar.rotation.x = -0.15;
  handleBar.castShadow = true;
  g.add(handleBar);

  const crossGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.04*s, 0.04*s, 0.7*s, 8), darkRubberMat);
  crossGrip.position.set(0, 1.38*s, -0.65*s);
  crossGrip.rotation.z = Math.PI/2;
  g.add(crossGrip);
  return g;
}

function buildPillar(scale){
  const g = new THREE.Group();
  const s = scale || 1;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2*s, 0.3*s, 1.2*s), pillarMarbleMat);
  base.position.y = 0.15*s;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42*s, 0.46*s, 2.6*s, 12), pillarMarbleMat);
  column.position.y = 1.45*s;
  column.castShadow = true;
  g.add(column);
  return g;
}

function buildTricycle(scale){
  const g = new THREE.Group();
  const s = scale || 1;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.2*s, 0.8*s, 1.4*s), localJeepneyYellowMat);
  body.position.y = 0.55*s;
  body.castShadow = true;
  g.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3*s, 0.08*s, 1.5*s), darkRubberMat);
  roof.position.set(0, 1.65*s, 0);
  g.add(roof);
  return g;
}

/* ---- Player Avatar ---- */
function buildAvatar(colors){
  const g = new THREE.Group();
  const mat = (c)=> new THREE.MeshLambertMaterial({color:c});
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9,1.1,0.5), mat(colors.torso));
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.7,0.7), mat(colors.head));
  head.position.y = 2.05; head.castShadow = true; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.16,0.08), new THREE.MeshLambertMaterial({color:0x111827}));
  visor.position.set(0, 2.05, -0.39); g.add(visor);
  
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.9,0.42), mat(colors.legs));
  legL.position.set(-0.25,0.45,0); legL.castShadow = true; g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.25; g.add(legR);
  
  g.userData.parts = {legL, legR};

  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22,0.55,4), new THREE.MeshLambertMaterial({color:0xf59e0b}));
  arrow.rotation.x = -Math.PI/2;
  arrow.rotation.z = Math.PI/4;
  arrow.position.set(0, 0.04, -0.95);
  g.add(arrow);

  return g;
}
const player = buildAvatar({torso:0x374151, head:0x6b7280, legs:0x111827});
player.position.set(0, 0, FIELD_HALF-4);
scene.add(player);
player.visible = false;

const scanRing = new THREE.Mesh(
  new THREE.RingGeometry(0.8, 1.0, 48),
  new THREE.MeshBasicMaterial({color:0xf59e0b, transparent:true, opacity:0, side:THREE.DoubleSide})
);
scanRing.rotation.x = -Math.PI/2;
scanRing.position.y = 0.05;
scene.add(scanRing);
let scanPulse = 0;

/* ============ Goal Portal Gateway ============ */
const portalGroup = new THREE.Group();
const portalRingMesh = new THREE.Mesh(
  new THREE.TorusGeometry(1.3, 0.16, 16, 64),
  new THREE.MeshStandardMaterial({color: 0x0ea5e9, emissive: 0x0284c7, emissiveIntensity: 1.0, metalness: 0.6})
);
portalRingMesh.castShadow = true;
portalGroup.add(portalRingMesh);

const portalFieldMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(1.2, 1.2, 0.05, 32),
  new THREE.MeshStandardMaterial({color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 1.4, transparent: true, opacity: 0.7, side: THREE.DoubleSide})
);
portalFieldMesh.rotation.x = Math.PI / 2;
portalGroup.add(portalFieldMesh);
portalGroup.position.set(0, 1.5, -10);
scene.add(portalGroup);
const goalMesh = portalGroup;

/* ---- Game Variables ---- */
let hazards = [];
let orbs = [];
let powerups = [];
const keys = {up:false,down:false,left:false,right:false};
let walkT = 0;
let heading = 0;
const MOVE_SPEED = 7.0;

function clearGroup(arr){ arr.forEach(o=> scene.remove(o.mesh)); arr.length = 0; }
function randRange(a,b){ return a + Math.random()*(b-a); }

function placeGoal(){
  const gx = randRange(-4, 4);
  const gz = randRange(-FIELD_HALF+6, -8);
  goalMesh.position.set(gx, 1.5, gz); 
}

function farEnough(p, list, minDist){
  return !list.some(o => o.mesh.position.distanceTo(p) < minDist);
}

/* ============ Multi-Destination Asset Swapper ============ */
function loadDestinationWorld(idx){
  currentDestIndex = idx;
  const world = DESTINATIONS[idx];

  const countryTitle = document.getElementById('countryTitle');
  if(countryTitle) countryTitle.textContent = world.name;
  
  const countrySub = document.getElementById('countrySub');
  if(countrySub) countrySub.textContent = "Destination: " + world.sub;
  
  // Dynamic color updating depending on active theme
  const targetSky = isLightMode ? world.skyColorLight : world.skyColorDark;
  const targetGround = isLightMode ? world.groundColorLight : world.groundColorDark;
  
  sceneFog.color.set(targetSky);
  groundMat.color.setHex(targetGround);

  if(world.name.includes("Paris")) {
    createParisVisualBackground();
  } else if(world.name.includes("Rome")) {
    createRomeVisualBackground();
  } else if(world.name.includes("Manila")) {
    createManilaVisualBackground();
  } else {
    backgroundDecoGroup.clear();
  }

  chatLog("Teleported to " + world.name + ".", "Portal");
  speak("Portal coordinates synchronized! Arrived in " + world.name + ". " + world.description, true);

  spawnWorldAssets(world);
}

function spawnWorldAssets(world){
  clearGroup(hazards);
  clearGroup(orbs);
  clearGroup(powerups);

  const startPos = player.position.clone();
  const goalPos = goalMesh.position.clone();
  
  let spawnedCount = 0;
  let attempts = 0;
  const targetCount = Math.min(6 + level * 2, 16);

  while(spawnedCount < targetCount && attempts < 250){
    attempts++;
    const p = new THREE.Vector3(
      randRange(-FIELD_HALF+4, FIELD_HALF-4),
      0,
      randRange(-FIELD_HALF+4, FIELD_HALF-4)
    );

    if(Math.abs(p.x) < 2.5) continue;
    if(p.distanceTo(startPos) < 6.0 || p.distanceTo(goalPos) < 6.0) continue;
    if(!farEnough(p, hazards, 4.0)) continue;

    let mesh;
    const size = randRange(0.9, 1.25);
    
    if(world.obstacleType === 'scooter'){
      mesh = buildScooter(size);
    } else if(world.obstacleType === 'pillar'){
      mesh = buildPillar(size);
    } else if(world.obstacleType === 'tricycle'){
      mesh = Math.random() < 0.6 ? buildTricycle(size) : buildTire(size);
    } else {
      mesh = Math.random() < 0.5 ? buildTrafficCone(size) : buildTire(size);
    }

    mesh.position.copy(p);
    mesh.rotation.y = Math.random()*Math.PI*2;
    scene.add(mesh);

    hazards.push({
      mesh,
      radius: size * 1.2,
      type: world.obstacleType,
      label: world.obstacleLabel
    });
    spawnedCount++;
  }
}

/* ============ Navigational Calculations ============ */
function bearingDeg(from, to){
  const dx = to.x - from.x, dz = to.z - from.z;
  const worldAngle = (Math.atan2(dx, -dz) * 180/Math.PI + 360) % 360;
  const headingDeg = (heading * 180/Math.PI + 360) % 360;
  return ((worldAngle - headingDeg) % 360 + 360) % 360;
}

function navPhrase(angle){
  if(angle < 15 || angle > 345) return "straight ahead";
  if(angle < 75) return "ahead and slightly to your right";
  if(angle < 115) return "on your right";
  if(angle < 165) return "behind you, to your right";
  if(angle < 195) return "directly behind you";
  if(angle < 245) return "behind you, to your left";
  if(angle < 285) return "on your left";
  return "ahead and slightly to your left";
}

function playContinuousVoiceGuidance(){
  if(!running || paused) return;

  const gd = goalMesh.position.distanceTo(player.position);
  const goalAngle = bearingDeg(player.position, goalMesh.position);
  const directionPhrase = navPhrase(goalAngle);

  let stepCue = "Hold W to walk.";
  if (goalAngle >= 15 && goalAngle < 165) {
    stepCue = "Hold D to turn right.";
  } else if (goalAngle >= 195 && goalAngle <= 345) {
    stepCue = "Hold A to turn left.";
  } else if (goalAngle >= 165 && goalAngle < 195) {
    stepCue = "Portal behind you. Hold S to back up.";
  }

  const threat = relevantHazard(9);
  if (threat && threat.inPath) {
    const obstacleLabel = threat.hazard.label || "obstacle";
    const side = turnSide(bearingDeg(player.position, threat.hazard.mesh.position));
    const avoid = oppositeSide(side);
    speak("Danger! " + obstacleLabel + " " + Math.round(threat.dist) + " meters " + side + ". Hold " + avoid + " to avoid.", true);
  } else {
    speak("Portal is " + Math.round(gd) + " meters " + directionPhrase + ". " + stepCue, false);
  }
}

function turnSide(angle){
  if(angle >= 345 || angle < 15) return "straight ahead";
  return angle < 180 ? "on your right" : "on your left";
}
function oppositeSide(side){
  if(side.includes("right")) return "A";
  if(side.includes("left")) return "D";
  return "A";
}

function nearestHazard(){
  if(hazards.length === 0) return null;
  let best = null, bd = Infinity;
  hazards.forEach(h=>{
    const d = h.mesh.position.distanceTo(player.position);
    if(d < bd){ bd = d; best = h; }
  });
  return {hazard: best, dist: bd};
}

function hazardThreat(hazard){
  const offset = new THREE.Vector3().subVectors(hazard.mesh.position, player.position).setY(0);
  const dist = offset.length();
  const move = currentMoveVector();
  const forward = offset.dot(move);
  const lateral = Math.sqrt(Math.max(0, dist * dist - forward * forward));
  const inPath = forward > 0 && forward < 10 && lateral < hazard.radius + 1.2;
  const score = (inPath ? 0 : 20) + Math.max(forward, 0) + lateral * 1.5 + dist * 0.1;
  return {hazard, dist, forward, lateral, inPath, score};
}

// Fixed directional mapping to prevent orientation drift while processing inputs
function currentMoveVector(){
  let mx = 0, mz = 0;
  if(keys.up) mz -= 1;
  if(keys.down) mz += 1;
  if(keys.left) mx -= 1;
  if(keys.right) mx += 1;
  if(mx === 0 && mz === 0) return new THREE.Vector3(0, 0, -1);
  const len = Math.hypot(mx, mz);
  return new THREE.Vector3(mx / len, 0, mz / len);
}

function relevantHazard(maxDistance){
  let best = null;
  hazards.forEach(h=>{
    const threat = hazardThreat(h);
    if(threat.dist > maxDistance) return;
    if(!best || threat.score < best.score) best = threat;
  });
  return best || nearestHazard();
}

function doScan(manual){
  if(manual){
    scanPulse = 1;
    scanRing.visible = true;
    scanRing.scale.setScalar(0.8);
    scanRing.material.opacity = 0.7;
  }

  hazards.forEach(h=>{
    const d = h.mesh.position.distanceTo(player.position);
    if(d < 45){
      const vol = Math.max(0.05, 0.55 - d*0.01);
      ping3D(h.mesh.position.x, 0.8, h.mesh.position.z, {freq:220 + Math.max(0,(20-d))*15, dur:0.25, volume:vol});
    }
  });

  const gd = goalMesh.position.distanceTo(player.position);
  ping3D(goalMesh.position.x, 1.1, goalMesh.position.z, {freq: 880, dur:0.4, volume: Math.max(0.08,0.5-gd*0.008), wave:'triangle'});

  if(!manual) return;

  setTimeout(() => {
    const n = relevantHazard(45);
    const goalAngle = bearingDeg(player.position, goalMesh.position);
    const goalDir = navPhrase(goalAngle);

    if(gd < 1.6){ speak("Arrived at the portal. Teleporting.", true); return; }

    const navPhraseText = "Portal is " + Math.round(gd) + " meters " + goalDir + ".";
    if(!n){
      speak("No hazards. " + navPhraseText, true);
    } else {
      const obstacleLabel = n.hazard.label || "hazard";
      const side = turnSide(bearingDeg(player.position, n.hazard.mesh.position));
      speak(obstacleLabel + " " + Math.round(n.dist) + " meters " + side + ". " + navPhraseText, true);
    }
  }, 50);
}

/* ============ Game State Actions ============ */
function handlePortalTransition(){
  flash('win');
  score += 100;
  level += 1;
  streak += 1;

  const nextIdx = (currentDestIndex + 1) % DESTINATIONS.length;
  
  player.position.set(0, 0, FIELD_HALF - 4);
  placeGoal();
  loadDestinationWorld(nextIdx);
  updateHUD();
}

/* ============ THEME SWITCHER EVENT HANDLERS ============ */
function applyTheme(lightModeActive) {
  isLightMode = lightModeActive;
  const world = DESTINATIONS[currentDestIndex];
  
  if (isLightMode) {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    grid.material.color.setHex(0x9ca3af);
    if(world) {
      sceneFog.color.set(world.skyColorLight);
      groundMat.color.setHex(world.groundColorLight);
    }
    speak("System theme switched to Light Mode.", true);
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    grid.material.color.setHex(0x4b5563);
    if(world) {
      sceneFog.color.set(world.skyColorDark);
      groundMat.color.setHex(world.groundColorDark);
    }
    speak("System theme switched to Dark Mode.", true);
  }
}

// Timeout handler to attach core dynamic elements
setTimeout(() => {
  const lightBtn = document.getElementById('lightModeBtn') || document.querySelector('.light-mode-btn') || Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Light'));
  const darkBtn = document.getElementById('darkModeBtn') || document.querySelector('.dark-mode-btn') || Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Dark'));

  if(lightBtn) lightBtn.addEventListener('click', () => applyTheme(true));
  if(darkBtn) darkBtn.addEventListener('click', () => applyTheme(false));
}, 500);

function updateHUD(){
  const scoreEl = document.getElementById('score');
  if(scoreEl) scoreEl.textContent = score;
  const levelEl = document.getElementById('level');
  if(levelEl) levelEl.textContent = level;
  const livesEl = document.getElementById('lives');
  if(livesEl) livesEl.textContent = "●".repeat(Math.max(0, lives));
}

function endGame(){
  running = false;
  const centerMsg = document.getElementById('centerMsg');
  if (centerMsg) {
    centerMsg.style.display = "block";
    centerMsg.querySelector('h2').textContent = "Object Detection and Prevention";
    centerMsg.querySelector('p').textContent = `Simulation Game Over. Final Score: ${score}. Level reached: ${level}. Press Enter to reboot system.`;
    centerMsg.querySelector('.primary').textContent = "Reboot Simulator";
  }
  tone2D(120, 0.8, 0.6, 'sawtooth');
  speak("System core failure. Avatar offline. Simulation terminated.", true);
}

function startGameFramework(){
  lives = 3; score = 0; level = 1; streak = 0;
  player.position.set(0, 0, FIELD_HALF - 4);
  heading = 0; player.rotation.y = 0;
  placeGoal();
  
  const centerMsg = document.getElementById('centerMsg');
  if(centerMsg) centerMsg.style.display = "none";
  
  player.visible = true;
  running = true;
  paused = false;
  
  loadDestinationWorld(0);
  updateHUD();
}

/* ============ FIXED PAUSE WORKFLOW STATE CONTROLLER ============ */
function togglePauseState() {
  if (!running) return;
  paused = !paused;
  
  // Naka-hide na ang block layer overlay, kaya text button indicator na lang ang binabago nito sa ibaba
  const uiPauseBtn = document.getElementById('uiPauseBtn');
  if (uiPauseBtn) {
    uiPauseBtn.innerHTML = paused ? "<span>▶ Resume</span>" : "<span>⏸ Pause</span>";
  }
  
  speak(paused ? "Simulation paused." : "Resuming simulation system.", true);
}

/* ============ Event Listeners & Core Engine Loop ============ */
window.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    if(!running) startGameFramework();
  }
  if(!running) return;
  
  if(e.key.toLowerCase() === 'p'){
    e.preventDefault(); // Iwasan ang browser scroll indicators
    togglePauseState();
    return;
  }

  if(paused) return;

  if(e.key === ' ' || e.code === 'Space'){
    e.preventDefault();
    doScan(true);
  }

  if(e.key === 'w' || e.key === 'ArrowUp') keys.up = true;
  if(e.key === 's' || e.key === 'ArrowDown') keys.down = true;
  if(e.key === 'a' || e.key === 'ArrowLeft') keys.left = true;
  if(e.key === 'd' || e.key === 'ArrowRight') keys.right = true;
});

window.addEventListener('keyup', (e)=>{
  if(e.key === 'w' || e.key === 'ArrowUp') keys.up = false;
  if(e.key === 's' || e.key === 'ArrowDown') keys.down = false;
  if(e.key === 'a' || e.key === 'ArrowLeft') keys.left = false;
  if(e.key === 'd' || e.key === 'ArrowRight') keys.right = false;
});

// Explicit mouse interface control bindings
setTimeout(() => {
  const uiPauseBtn = document.getElementById('uiPauseBtn');
  if (uiPauseBtn) {
    uiPauseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      togglePauseState();
    });
  }
}, 500);

document.getElementById('startBtn').addEventListener('click', startGameFramework);
document.getElementById('skipTutorialBtn').addEventListener('click', ()=>{
  startGameFramework();
  loadDestinationWorld(1);
});
document.getElementById('scanBtn').addEventListener('click', ()=> doScan(true));

const attachTouch = (id, k) => {
  const btn = document.getElementById(id);
  if(!btn) return;
  btn.addEventListener('mousedown', ()=>{ if(running && !paused) keys[k] = true; });
  btn.addEventListener('mouseup', ()=>{ keys[k] = false; });
  btn.addEventListener('touchstart', (e)=>{ e.preventDefault(); if(running && !paused) keys[k] = true; });
  btn.addEventListener('touchend', ()=>{ keys[k] = false; });
};
attachTouch('upBtn', 'up'); attachTouch('downBtn', 'down');
attachTouch('leftBtn', 'left'); attachTouch('rightBtn', 'right');

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if(running && !paused){
    if(keys.left) heading += 2.4 * dt;
    if(keys.right) heading -= 2.4 * dt;
    player.rotation.y = heading;

    let moveX = 0, moveZ = 0;
    if(keys.up) { moveX -= Math.sin(heading); moveZ -= Math.cos(heading); }
    if(keys.down) { moveX += Math.sin(heading); moveZ += Math.cos(heading); }

    if(moveX !== 0 || moveZ !== 0){
      const len = Math.hypot(moveX, moveZ);
      player.position.x += (moveX / len) * MOVE_SPEED * dt;
      player.position.z += (moveZ / len) * MOVE_SPEED * dt;
      
      player.position.x = Math.max(-FIELD_HALF+1, Math.min(FIELD_HALF-1, player.position.x));
      player.position.z = Math.max(-FIELD_HALF+1, Math.min(FIELD_HALF-1, player.position.z));

      walkT += dt * 13;
      player.userData.parts.legL.position.z = Math.sin(walkT) * 0.4;
      player.userData.parts.legR.position.z = -Math.sin(walkT) * 0.4;
    }

    portalGroup.rotation.y += 1.5 * dt;
    
    if(player.position.distanceTo(goalMesh.position) < 1.6){
      handlePortalTransition();
    }

    hazards.forEach(h => {
      if(player.position.distanceTo(h.mesh.position) < h.radius + 0.4){
        flash('hit');
        lives--;
        updateHUD();
        tone2D(180, 0.4, 0.5, 'sawtooth');
        player.position.set(0, 0, FIELD_HALF - 4);
        speak("Collision alert! Hit " + h.label + ". Resetting position.", true);
        if(lives <= 0) endGame();
      }
    });

    pulseTimer += dt;
    if(pulseTimer >= pulseInterval){ pulseTimer = 0; doScan(false); }

    continuousGuidanceTimer += dt;
    if(continuousGuidanceTimer >= GUIDANCE_INTERVAL){
      continuousGuidanceTimer = 0;
      if (!window.speechSynthesis.speaking) {
        playContinuousVoiceGuidance();
      }
    }
  }

  if(scanPulse > 0){
    scanPulse += dt * 4.5;
    scanRing.scale.setScalar(0.8 + scanPulse * 15.0);
    scanRing.material.opacity = Math.max(0, 0.7 - scanPulse);
    scanRing.position.copy(player.position).y = 0.05;
    if(scanPulse >= 1) { scanPulse = 0; scanRing.visible = false; }
  }

  const camTarget = new THREE.Vector3(
    player.position.x + Math.sin(heading) * 9.5,
    player.position.y + 5.5,
    player.position.z + Math.cos(heading) * 9.5
  );
  camera.position.lerp(camTarget, 0.1);
  camera.lookAt(new THREE.Vector3(player.position.x, player.position.y + 1.2, player.position.z));
  
  updateListener(player.position.x, 1.2, player.position.z, -Math.sin(heading), -Math.cos(heading));

  renderer.render(scene, camera);
}

animate();

})();