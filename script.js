const HEX_SIZE = 22;
const TICK_MS = 1000;
const BASE_POP_CAP = 150;
const BASE_TROOP_CAP = 200;
const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]];

let tooltip = document.createElement('div');
tooltip.className = 'tooltip';
document.body.appendChild(tooltip);
tooltip.style.display='none';

function key(q,r){ return `${q},${r}`; }
function neighbors(q,r){ return directions.map(d=>[q+d[0], r+d[1]]); }
function cubeRound(x,y,z){
  let rx=Math.round(x), ry=Math.round(y), rz=Math.round(z);
  let dx=Math.abs(rx-x), dy=Math.abs(ry-y), dz=Math.abs(rz-z);
  if(dx>dy && dx>dz) rx=-ry-rz;
  else if(dy>dz) ry=-rx-rz;
  else rz=-rx-ry;
  return {q:rx,r:rz};
}
function hexToPixel(q,r,width,height){
  return {
    x: HEX_SIZE*(Math.sqrt(3)*q + Math.sqrt(3)/2*r)+width/2,
    y: HEX_SIZE*(3/2*r)+height/2
  };
}
function pixelToHex(x,y,width,height){
  x-=width/2; y-=height/2;
  let q=(Math.sqrt(3)/3*x - 1/3*y)/HEX_SIZE;
  let r=(2/3*y)/HEX_SIZE;
  return cubeRound(q,-q-r,r);
}

let resources = {
  Pop: {value: 50, cap: 500, visible:true},
  Troops: {value: 50, cap: 200, visible:false}, // Not shown in resource list
  Research: {value: 0, visible: false},
  RulerPrestige: {value: 0, visible: false},
  DynastyPoints: {value: 0, visible: false}
};

let gameState = {
  islandRadius: 8,
  autoConquest: false,
  autoConquestCooldown: 0,
  islandCleared: false,
  totalConquests: 0,
  rulerPrestige: 0, // T1: Roman Numeral
  t1Bonus: 0,
  islandPrestige: 0, // T2: Title Rank
  attackingNation: null,
  viewMode: 'map', // 'map' or 'dynasty'
  view: {x: 0, y: 0, zoom: 1, isDragging: false, lastX: 0, lastY: 0},
  deltas: { player: { gain: 0, loss: 0 }, enemy: { gain: 0, loss: 0 }, popGain: 0 }
};

let settings = {
  rulerName: 'Arthur',
  rulerGender: 'male', // 'male' or 'female'
  showSettings: false,
  showUpgradeDetails: true
};

let upgrades = {
  succession: {name: 'Declare Successor', lvl:0, cost: 0, visible: false, maxLvl: 1, description: 'Pass the throne to a successor to gain bonuses based on land owned and reset.'},
  research:{name:'Unlock Research', lvl:0,cost:0,visible:true,maxLvl:1,description:'Unlocks research resource'},
  researchSpeed:{name:'Library', lvl:0,baseCost:50,visible:false,maxLvl:10,unlockPop:100, description:'Research per Pop +50%'},
  pop:{name:'Farms', lvl:0,baseCost:50,visible:false,maxLvl:10,unlockPop:50, description:'Pop growth +1 per tile'},
  troop:{name:'Barracks', lvl:0,baseCost:50,visible:false,maxLvl:10,unlockPop:50, description:'Troop growth +1 per tile'},
  attack:{name:'Weapons', lvl:0,baseCost:100,visible:false,maxLvl:15,unlockPop:100, description:'Attack +1'},
  defense:{name:'Walls', lvl:0,baseCost:100,visible:false,maxLvl:15,unlockPop:100, description:'Defense +1'},
  health:{name:'Medicine', lvl:0,baseCost:100,visible:false,maxLvl:15,unlockPop:100, description:'Health +2'},
  popCap:{name:'Housing', lvl:0,baseCost:75,visible:false,maxLvl:20,unlockPop:150, description:'Pop cap +50'},
  troopCap:{name:'Logistics', lvl:0,baseCost:75,visible:false,maxLvl:20,unlockPop:150, description:'Troop cap +20'},
  showConqueredStats:{name:'Census', lvl:0,baseCost:500,visible:false,maxLvl:1,requirePrestige:1, description:'Show total conquests stat'},
  autoSpeed:{name:'War Council', lvl:0,baseCost:200,visible:false,maxLvl:5,unlockPop:200,requireDynasty:'autoConquest', description:'Auto-conquest speed +1'}
};

let dynastyUpgrades = {
  legacy: {name: 'Legacy', cost: 1, purchased: false, x: 350, y: 600, description: 'Unlock Dynasty Points generation'},
  autoConquest: {name: 'Auto Conquest', cost: 1, purchased: false, x: 350, y: 500, parent: 'legacy', description: 'Unlock Auto-Conquest Action'},
  islandSize: {name: 'Expansion', cost: 2, purchased: false, x: 250, y: 400, parent: 'autoConquest', description: 'Increase Island Size'},
  startingTroops: {name: 'Standing Army', cost: 1, purchased: false, x: 450, y: 400, parent: 'autoConquest', description: 'Start with more troops'}
};

let tiles = new Map();
let explored = new Set();
let hoverHex = null;
let selectedEnemy = null;
let enemyColors = new Map();

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const selectedNationInfoDiv = document.getElementById('selectedNationInfo');
const troopStatsDiv = document.getElementById('troopStats');
const rulerNameDiv = document.getElementById('rulerName');
const notificationsDiv = document.getElementById('notifications');
const actionsList = document.getElementById('actionsList');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsOverlay = document.getElementById('settingsOverlay');
const rulerNameInput = document.getElementById('rulerNameInput');
const rulerGenderSelect = document.getElementById('rulerGenderSelect');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const dynastyOverlay = document.getElementById('dynastyOverlay');
const dynastyTreeDiv = document.getElementById('dynastyTree');

// Settings panel handlers
settingsBtn.addEventListener('click', ()=>{
  rulerNameInput.value = settings.rulerName;
  rulerGenderSelect.value = settings.rulerGender;
  settingsPanel.style.display = 'block';
  settingsOverlay.style.display = 'block';
});

closeSettingsBtn.addEventListener('click', ()=>{
  settingsPanel.style.display = 'none';
  settingsOverlay.style.display = 'none';
});

saveSettingsBtn.addEventListener('click', ()=>{
  settings.rulerName = rulerNameInput.value || 'Arthur';
  settings.rulerGender = rulerGenderSelect.value;
  assignRuler();
  settingsPanel.style.display = 'none';
  settingsOverlay.style.display = 'none';
  showNotification('Settings saved!', 'info');
});

settingsOverlay.addEventListener('click', ()=>{
  settingsPanel.style.display = 'none';
  settingsOverlay.style.display = 'none';
});

// Debug keys
window.addEventListener('keydown', e=>{
  if(e.key==='T'){
    resources.Troops.value=Math.min(resources.Troops.value+100, resources.Troops.cap);
    resources.Troops.cap+=100;
    resources.Troops.value += 100;
  }
  else if(e.key==='R'){
    if(resources.Research.visible) resources.Research.value+=1000;
  }
  else if(e.key==='P'){
    resources.Pop.value=Math.min(resources.Pop.value+100, resources.Pop.cap);
    resources.Pop.cap+=100;
  }
  else if(e.key==='A'){
    upgrades.attack.lvl += 100;
    console.log('Player attack level increased by 100');
  }
  else if(e.key==='D'){
    upgrades.defense.lvl += 100;
    console.log('Player defense level increased by 100');
  }
  else if(e.key==='X'){
    dynastyUpgrades.autoConquest.purchased = true;
    console.log('Auto-conquest unlocked');
    renderActions();
  }
  else if(e.key==='S'){
    upgrades.autoSpeed.lvl++;
    console.log(`Auto-conquest speed level increased to ${upgrades.autoSpeed.lvl}`);
  }
  const { totalPopCap, totalTroopCap } = calculateCaps();
  renderResources();
  renderTroopStats(totalPopCap, totalTroopCap);
});

const nationPrefixes = ['Holy','Ancient','Dark','Bright','Silent','Grand','Mystic','Iron','Stormy','Golden'];
const nationAdjectives = ['Berating','Golden','Furious','Hidden','Mighty','Blessed','Crimson','Shadow','Silver','Glorious'];
const nationTypes = ['Duchy','Kingdom','Empire','Principality','Realm'];
const nationSuffixes = ['of Light','of Stone','of Fire','of Brick','of Shadows','of Glory','of Winds','of Ice','of Earth','of Heaven'];

function generateKingdomName(){
  const parts = [];

  // Randomly include prefix (0 or 1)
  if(Math.random() > 0.5){
    parts.push(nationPrefixes[Math.floor(Math.random() * nationPrefixes.length)]);
  }

  // Randomly include adjective (0 or 1)
  if(Math.random() > 0.5){
    parts.push(nationAdjectives[Math.floor(Math.random() * nationAdjectives.length)]);
  }

  // Always include type
  const type = nationTypes[Math.floor(Math.random() * nationTypes.length)];
  parts.push(type);

  // Randomly include suffix (0 or 1)
  if(Math.random() > 0.5){
    parts.push(nationSuffixes[Math.floor(Math.random() * nationSuffixes.length)]);
  }

  // Ensure at least one modifier (if only type, add a random modifier)
  if(parts.length === 1){
    const allModifiers = [...nationPrefixes, ...nationAdjectives, ...nationSuffixes];
    const modifier = allModifiers[Math.floor(Math.random() * allModifiers.length)];
    // Add before type if it's a prefix/adjective, after if suffix
    if(nationSuffixes.includes(modifier)){
      parts.push(modifier);
    } else {
      parts.unshift(modifier);
    }
  }

  return parts.join(' ');
}

const maleNames = ['Arthur', 'David', 'Henry', 'Edward', 'Charles', 'Richard', 'William', 'James', 'Alexander', 'Frederick'];
const femaleNames = ['Isabella', 'Victoria', 'Alice', 'Matilda', 'Eleanor', 'Elizabeth', 'Catherine', 'Margaret', 'Anne', 'Mary'];

function getRulerTitle(){
  const titles = [
    {male: 'General', female: 'General'},
    {male: 'Count', female: 'Countess'},
    {male: 'Duke', female: 'Duchess'},
    {male: 'King', female: 'Queen'},
    {male: 'Emperor', female: 'Empress'},
    {male: 'Overlord', female: 'Overlord'}
  ];
  const titleIndex = Math.min(gameState.islandPrestige, titles.length - 1);
  return titles[titleIndex][settings.rulerGender];
}

function generateRulerName(){
  const title = getRulerTitle();
  const lvl = gameState.rulerPrestige + 1;
  let roman = toRoman(lvl);
  if(lvl >= 4000) {
    roman = formatOrdinal(lvl);
  }
  return `${title} ${settings.rulerName} ${roman}`;
}

function isFemaleName(name){
  return femaleNames.includes(name);
}

function toRoman(num){
  if(num >= 4000) return num;
  const romans=['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
  if(num <= 20) return romans[num];
  // Simple implementation for higher numbers if needed, but sticking to basic for now or just number
  // Implementing a basic converter for M
  const lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
  let roman = '';
  for (let i in lookup ) {
    while ( num >= lookup[i] ) {
      roman += i;
      num -= lookup[i];
    }
  }
  return roman;
}

function formatOrdinal(n){
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  const suffix = (s[(v - 20) % 10] || s[v] || s[0]);
  return `${n}<sup>${suffix}</sup>`;
}

function assignRuler(){
  rulerNameDiv.innerHTML=generateRulerName();
}

function showNotification(message, type='info'){
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.textContent = message;
  notificationsDiv.appendChild(notif);
  setTimeout(()=>{
    notif.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(()=>notif.remove(), 300);
  }, 3000);
}

function showConfirmation(message, onConfirm) {
  // Remove any existing confirmation
  const existingConfirm = document.getElementById('confirmation-overlay');
  if (existingConfirm) existingConfirm.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirmation-overlay';
  overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:1999; display:flex; align-items:center; justify-content:center;';

  const panel = document.createElement('div');
  panel.style.cssText = 'background:#1e1e2e; padding:30px; border-radius:12px; border:2px solid #444; z-index:2000; box-shadow:0 8px 32px rgba(0,0,0,0.8); text-align:center; min-width: 300px;';

  const messageP = document.createElement('p');
  messageP.textContent = message;
  messageP.style.color = '#e0e0e0';
  messageP.style.maxWidth = '400px';
  messageP.style.margin = '0 0 20px 0';
  messageP.style.fontSize = '16px';
  messageP.style.lineHeight = '1.5';

  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.justifyContent = 'center';
  buttonContainer.style.gap = '10px';

  const yesBtn = document.createElement('button');
  yesBtn.textContent = 'Confirm';
  yesBtn.style.width = '120px';

  const noBtn = document.createElement('button');
  noBtn.textContent = 'Cancel';
  noBtn.style.width = '120px';
  noBtn.style.background = '#666';

  const close = () => overlay.remove();

  yesBtn.onclick = () => {
    close();
    if (onConfirm) onConfirm();
  };

  noBtn.onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  buttonContainer.append(yesBtn, noBtn);
  panel.append(messageP, buttonContainer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

// Map Interaction
canvas.addEventListener('mousedown', e=>{
  if(e.button === 2) return; // Ignore right click
  gameState.view.isDragging = true;
  gameState.view.lastX = e.clientX;
  gameState.view.lastY = e.clientY;
});

window.addEventListener('mouseup', ()=>{
  gameState.view.isDragging = false;
});

canvas.addEventListener('wheel', e=>{
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // World coordinates before zoom
  const worldX = (mouseX - gameState.view.x) / gameState.view.zoom;
  const worldY = (mouseY - gameState.view.y) / gameState.view.zoom;

  const zoomSpeed = 0.1;
  const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
  const oldZoom = gameState.view.zoom;
  const newZoom = Math.max(0.5, Math.min(3, oldZoom + delta));

  // New view position to keep world coordinates at mouse position
  gameState.view.x = mouseX - worldX * newZoom;
  gameState.view.y = mouseY - worldY * newZoom;
  gameState.view.zoom = newZoom;
  draw();
});

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousemove', e=>{
  if(gameState.view.isDragging){
    gameState.view.x += e.clientX - gameState.view.lastX;
    gameState.view.y += e.clientY - gameState.view.lastY;
    gameState.view.lastX = e.clientX;
    gameState.view.lastY = e.clientY;
    draw();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left - canvas.clientLeft;
  const canvasY = e.clientY - rect.top - canvas.clientTop;
  const mx = (canvasX - gameState.view.x) / gameState.view.zoom;
  const my = (canvasY - gameState.view.y) / gameState.view.zoom;

  const {q,r} = pixelToHex(mx, my, canvas.width, canvas.height);
  const t=tiles.get(key(q,r));
  hoverHex = (t && explored.has(key(q,r)))? t : null;
  draw();
  if(hoverHex && hoverHex.owner && hoverHex.owner!=='player' && hoverHex.owner !== 'water'){
    tooltip.style.display='block';
    tooltip.style.left = e.clientX+10+'px';
    tooltip.style.top = e.clientY+10+'px';
    const totalTroops = Math.floor(getNationTotalTroops(hoverHex.owner));
    const maxTroops = getNationMaxTroops(hoverHex.owner);
    tooltip.innerHTML = `<b>${t.nationName}</b><br>Troops: ${totalTroops}/${maxTroops}<br>ATK: ${t.strength.toFixed(1)} DEF: ${t.defense.toFixed(1)} HP: ${t.health.toFixed(1)}`;
  } else {
    tooltip.style.display='none';
  }
});

canvas.addEventListener('mouseleave', ()=>{
  hoverHex = null;
  tooltip.style.display='none';
  draw();
});

canvas.addEventListener('click', (e)=>{
  // Recalculate click position to ensure accuracy even if hoverHex is stale
  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left - canvas.clientLeft;
  const canvasY = e.clientY - rect.top - canvas.clientTop;
  const mx = (canvasX - gameState.view.x) / gameState.view.zoom;
  const my = (canvasY - gameState.view.y) / gameState.view.zoom;
  const {q,r} = pixelToHex(mx, my, canvas.width, canvas.height);
  const clickedHex = tiles.get(key(q,r));

  if(!clickedHex || !explored.has(key(q,r))) return;

  if(clickedHex.owner==='player'){
    if(gameState.attackingNation) stopAttack();
    selectedEnemy = null;
    updateSelectedNationInfo();
  } else {
    if(selectedEnemy === clickedHex.owner){
      // Deselecting
      if(gameState.attackingNation === selectedEnemy) stopAttack();
      selectedEnemy = null;
    } else {
      // Selecting a new/different nation
      if(gameState.attackingNation) stopAttack();
      selectedEnemy = clickedHex.owner;
    }
    updateSelectedNationInfo();
  }
  draw();
});

function startAttack(){
  if(!selectedEnemy) return;
  gameState.attackingNation = selectedEnemy;
  showNotification(`⚔️ Attacking ${getNationName(selectedEnemy)}!`, 'conquest');
  updateSelectedNationInfo();
}

function stopAttack(){
  gameState.attackingNation = null;
  updateSelectedNationInfo();
}

function getAllNationTiles(owner){
  return [...tiles.values()].filter(t => t.owner === owner);
}

function getNationName(owner){
  const tile = [...tiles.values()].find(t => t.owner === owner);
  return tile ? tile.nationName : 'Unknown';
}

function getNationTiles(owner){
  return getAllNationTiles(owner).filter(t => owner === 'player' || explored.has(key(t.q, t.r)));
}

function getNationTotalTroops(owner){
  return getAllNationTiles(owner).reduce((sum, t) => sum + t.troops, 0);
}

function getNationMaxTroops(owner){
  const tiles = getAllNationTiles(owner);
  if(tiles.length === 0) return 0;
  return tiles[0].maxTroops * tiles.length;
}

function processCombat(){
  if(!gameState.attackingNation) return;

  const attackingNationName = getNationName(gameState.attackingNation);

  const playerTiles = getNationTiles('player');
  const enemyTiles = getNationTiles(gameState.attackingNation);

  if(playerTiles.length === 0 || enemyTiles.length === 0){
    gameState.attackingNation = null;
    return;
  }

  const playerStrength = 2 + (upgrades.attack?.lvl||0);
  const playerDefense = 2 + (upgrades.defense?.lvl||0);
  const playerHealth = 15 + (upgrades.health?.lvl||0)*2;

  const enemyStrength = enemyTiles[0].strength;
  const enemyDefense = enemyTiles[0].defense;
  const enemyHealth = enemyTiles[0].health;

  // Apply ruler prestige bonus
  const rulerBonus = 1 + gameState.t1Bonus + (resources.DynastyPoints.value * 0.1 * (dynastyUpgrades.legacy.purchased ? 1 : 0));
  const effectivePlayerStr = Math.floor(playerStrength * rulerBonus);
  const effectivePlayerDef = Math.floor(playerDefense * rulerBonus);
  const effectivePlayerHp = Math.floor(playerHealth * rulerBonus);

  const playerTroopCount = resources.Troops.value;
  const enemyTroopCount = getNationTotalTroops(gameState.attackingNation);

  // Reworked combat formula
  const playerForce = effectivePlayerStr * playerTroopCount;
  const enemyForce = enemyStrength * enemyTroopCount;

  const playerToughness = effectivePlayerDef + effectivePlayerHp;
  const enemyToughness = enemyDefense + enemyHealth;

  const combatSpeed = 4; // Lower is faster combat

  let enemyTroopsLost = playerForce / enemyToughness / combatSpeed;
  let playerTroopsLost = enemyForce / playerToughness / combatSpeed;

  // Difference bonus
  if (playerTroopCount > enemyTroopCount) {
      enemyTroopsLost *= (1 + (playerTroopCount - enemyTroopCount) / Math.max(1, playerTroopCount));
  } else {
      playerTroopsLost *= (1 + (enemyTroopCount - playerTroopCount) / Math.max(1, enemyTroopCount));
  }

  if(isNaN(enemyTroopsLost)) enemyTroopsLost = 0;
  if(isNaN(playerTroopsLost)) playerTroopsLost = 0;

  if (gameState.attackingNation) {
    gameState.deltas.player.loss += playerTroopsLost;
    gameState.deltas.enemy.loss += enemyTroopsLost;
  }

  // Apply losses
  let playerTroops = Math.max(0, resources.Troops.value - playerTroopsLost);

  if(playerTroops <= 0){
    // Player defeated!
    resources.Troops.value = 1;
    gameState.attackingNation = null;
    showNotification('❌ Defeated! Retreating...', 'conquest');
    return;
  }

  resources.Troops.value = playerTroops;

  // Apply enemy losses
  let enemyTotalTroops = getNationTotalTroops(gameState.attackingNation);
  enemyTotalTroops -= enemyTroopsLost;

  // Check for tile loss
  const maxEnemyTroops = getNationMaxTroops(gameState.attackingNation);
  const currentTileCount = getAllNationTiles(gameState.attackingNation).length;
  const troopPercent = Math.max(0, enemyTotalTroops) / maxEnemyTroops;

  const targetTileCount = Math.ceil(troopPercent * currentTileCount);

  // Remove tiles if needed
  if(targetTileCount < currentTileCount){
    const tilesToCapture = currentTileCount - targetTileCount;

    const playerTileKeys = new Set(getNationTiles('player').map(t => key(t.q, t.r)));
    const capturableTiles = getAllNationTiles(gameState.attackingNation).filter(t =>
        neighbors(t.q, t.r).some(([nq, nr]) => playerTileKeys.has(key(nq, nr)))
    );

    if (capturableTiles.length > 0) {
      // Prioritize weakest adjacent tiles
      const sortedCapturableTiles = capturableTiles.sort((a,b) => a.troops - b.troops);

      for(let i = 0; i < tilesToCapture && i < sortedCapturableTiles.length; i++){
        const tile = sortedCapturableTiles[i];
        if (!tile) continue;

      tile.owner = 'player';
      tile.nationName = 'Your Empire';
      tile.strength = 2 + (upgrades.attack?.lvl||0);
      tile.defense = 2 + (upgrades.defense?.lvl||0);
      tile.health = 15 + (upgrades.health?.lvl||0)*2;
      tile.troops = 0;
      tile.maxTroops = 200;
      revealAround(tile.q, tile.r);
      gameState.totalConquests++;
    }
    }
  }

  // Distribute remaining troops among remaining tiles
  const remainingEnemyTiles = getAllNationTiles(gameState.attackingNation);
  if(remainingEnemyTiles.length === 0){
    // Nation defeated!
    showNotification(`🎉 ${attackingNationName} conquered!`, 'victory');
    gameState.attackingNation = null;
    selectedEnemy = null;
    checkIslandCleared();
  } else {
    const troopsPerTile = Math.floor(Math.max(0, enemyTotalTroops) / remainingEnemyTiles.length);
    remainingEnemyTiles.forEach(t => t.troops = troopsPerTile);
  }
}

function checkIslandCleared(){
  const enemyTiles = [...tiles.values()].filter(t=>t.owner!=='player');
  if(enemyTiles.length === 0 && !gameState.islandCleared){
    gameState.islandCleared = true;
    renderActions();
    showNotification('🎉 Island Conquered! You can now Set Sail!', 'victory');
  }
}

function updateSelectedNationInfo(){
  if(!selectedEnemy){
    selectedNationInfoDiv.style.visibility = 'hidden';
    return;
  }

  selectedNationInfoDiv.style.visibility = 'visible';
  let enemyTiles = getNationTiles(selectedEnemy);
  if(enemyTiles.length===0){
    selectedNationInfoDiv.style.visibility = 'hidden';
    selectedEnemy = null;
    return;
  }

  let totalTroops = Math.floor(getNationTotalTroops(selectedEnemy));
  let maxTroops = getNationMaxTroops(selectedEnemy);
  let avgStrength = enemyTiles[0].strength;
  let avgDefense = enemyTiles[0].defense;
  let avgHealth = enemyTiles[0].health;

  const isAttacking = gameState.attackingNation === selectedEnemy;
  const { gain: enemyGain, loss: enemyLoss } = gameState.deltas.enemy;
  let enemyDeltaText = '';
  if (isAttacking) {
      if (enemyGain > 0.1) enemyDeltaText += `<span style="color:#4caf50;">(+${enemyGain.toFixed(1)})</span> `;
      if (enemyLoss > 0.1) enemyDeltaText += `<span style="color:#f44336;">(-${enemyLoss.toFixed(1)})</span> `;
  }

  // Use getAllNationTiles for the true tile count
  const trueTileCount = getAllNationTiles(selectedEnemy).length;

  selectedNationInfoDiv.innerHTML = `
    <h3><span style="float:right;cursor:pointer;" onclick="selectedEnemy=null;updateSelectedNationInfo();draw();">✖</span>Nation Intel</h3>
    <b>${enemyTiles[0].nationName}</b>
    <div class="stat-line"><span class="stat-label">Tiles:</span><span class="stat-value">${trueTileCount}</span></div>
    <div class="stat-line"><span class="stat-label">Troops:</span><span class="stat-value">${enemyDeltaText}${totalTroops}/${maxTroops}</span></div>
    <div class="stat-line"><span class="stat-label">Attack:</span><span class="stat-value">${avgStrength.toFixed(1)}</span></div>
    <div class="stat-line"><span class="stat-label">Defense:</span><span class="stat-value">${avgDefense.toFixed(1)}</span></div>
    <div class="stat-line"><span class="stat-label">Health:</span><span class="stat-value">${avgHealth.toFixed(1)}</span></div>
    <button id="attackBtn" style="margin-top:10px; width:100%; ${isAttacking ? 'background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);' : ''}">${isAttacking ? '🛑 Stop Attack' : '⚔️ Attack'}</button>
  `;

  document.getElementById('attackBtn').onclick = () => {
    if(isAttacking){
      stopAttack();
    } else {
      startAttack();
    }
  };
}

function createIsland(){
  tiles.clear();
  explored.clear();
  enemyColors.clear();
  gameState.islandCleared = false;
  gameState.attackingNation = null;
  selectedEnemy = null;

  const waterDepth = 3;
  const totalRadius = gameState.islandRadius + waterDepth;

  // Create all hexes within total radius
  for(let q = -totalRadius; q <= totalRadius; q++){
      for(let r = -totalRadius; r <= totalRadius; r++){
          if(Math.abs(q+r) <= totalRadius){
              const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q-r));
              if(dist > gameState.islandRadius){
                  tiles.set(key(q,r), {q, r, owner: 'water', nationName: 'Ocean'});
              } else {
                  tiles.set(key(q,r),{
                      q,r, owner: null, nationName: null,
                      pop: 0, troops: 0, maxTroops: 0, strength: 0, defense: 0, health: 0
                  });
              }
          }
      }
  }

  // Create player nation at origin
  const origin=tiles.get(key(0,0));
  origin.owner='player';
  origin.nationName='Your Empire';
  origin.pop=0;
  origin.troops= dynastyUpgrades.startingTroops.purchased ? 50 : 10;
  origin.maxTroops= dynastyUpgrades.startingTroops.purchased ? 500 : 200;
  origin.strength=2;
  origin.defense=2;
  origin.health=15;
  explored.add(key(0,0));
  revealAround(0,0);

  // Get hexes adjacent to player
  const adjacentToPlayer = neighbors(0, 0).map(([q,r]) => tiles.get(key(q,r))).filter(t => t);

  // Create at least 2 single-tile nations adjacent to player
  const shuffledAdjacent = [...adjacentToPlayer].sort(() => Math.random() - 0.5);
  let enemyId = 0;
  for(let i = 0; i < Math.min(2, shuffledAdjacent.length); i++){
    const hex = shuffledAdjacent[i];
    if(hex.owner === null){
      const nationName = generateKingdomName();
      const owner = `enemy${enemyId}`;
      const color = `hsl(${Math.random()*360},70%,50%)`;
      enemyColors.set(owner, color);

      const distanceFromOrigin = Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(-hex.q-hex.r));
      const sizeMultiplier = 1;
      const distanceMultiplier = 1 + Math.pow(distanceFromOrigin, 1.3) * 0.2;

      hex.owner = owner;
      hex.nationName = nationName;
      hex.maxTroops = Math.floor(50 * sizeMultiplier * distanceMultiplier * (0.9 + Math.random() * 0.2));
      hex.troops = hex.maxTroops;
      hex.strength = Math.floor(2 * distanceMultiplier);
      hex.defense = Math.floor(2 * distanceMultiplier);
      hex.health = Math.floor(15 * distanceMultiplier);

      enemyId++;
    }
  }

  // Create remaining enemy nations with varying sizes
  const availableHexes = [...tiles.values()].filter(t => t.owner === null);

  while(availableHexes.length > 0){
    // Pick a random starting hex for this nation
    const startIndex = Math.floor(Math.random() * availableHexes.length);
    const startHex = availableHexes[startIndex];

    if(!startHex || startHex.owner !== null) {
      availableHexes.splice(startIndex, 1);
      continue;
    }

    const nationName = generateKingdomName();
    const owner = `enemy${enemyId}`;
    const color = `hsl(${Math.random()*360},70%,50%)`;
    enemyColors.set(owner, color);

    // Determine nation size (1-8 hexes, weighted towards smaller)
    const sizeRoll = Math.random();
    let nationSize;
    if(sizeRoll < 0.3) nationSize = 1;
    else if(sizeRoll < 0.6) nationSize = 2;
    else if(sizeRoll < 0.8) nationSize = 3;
    else if(sizeRoll < 0.95) nationSize = Math.floor(Math.random() * 3) + 4; // 4-6
    else nationSize = Math.floor(Math.random() * 4) + 7; // 7-10

    const nationHexes = [startHex];

    // Assign first hex
    startHex.owner = owner;
    startHex.nationName = nationName;

    // Remove from available
    const idx = availableHexes.indexOf(startHex);
    if(idx > -1) availableHexes.splice(idx, 1);

    // Expand nation with adjacent hexes
    for(let i = 1; i < nationSize; i++){
      let possibleExpansions = [];

      // Find all unclaimed neighbors of current nation hexes
      for(const nationHex of nationHexes){
        for(const [nq, nr] of neighbors(nationHex.q, nationHex.r)){
          const neighborHex = tiles.get(key(nq, nr));
          if(neighborHex && neighborHex.owner === null && !possibleExpansions.includes(neighborHex)){
            possibleExpansions.push(neighborHex);
          }
        }
      }

      if(possibleExpansions.length === 0) break;

      // Pick random adjacent hex
      const nextHex = possibleExpansions[Math.floor(Math.random() * possibleExpansions.length)];
      nextHex.owner = owner;
      nextHex.nationName = nationName;

      nationHexes.push(nextHex);

      // Remove from available
      const nextIdx = availableHexes.indexOf(nextHex);
      if(nextIdx > -1) availableHexes.splice(nextIdx, 1);
    }

    // Calculate stats based on nation size and distance from origin
    const avgDistance = nationHexes.reduce((sum, h) => sum + Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(-h.q-h.r)), 0) / nationHexes.length;
    const sizeMultiplier = Math.sqrt(nationHexes.length); // Grows with size but not linearly
    const distanceMultiplier = 1 + Math.pow(avgDistance, 1.3) * 0.2;
    const randomVariation = 0.9 + Math.random() * 0.2;

    // Apply stats to all hexes in nation
    const baseTroops = Math.floor(50 * sizeMultiplier * distanceMultiplier * randomVariation);
    const baseStrength = 2 * distanceMultiplier * Math.sqrt(sizeMultiplier);
    const baseDefense = 2 * distanceMultiplier * Math.sqrt(sizeMultiplier);
    const baseHealth = 15 * distanceMultiplier * Math.sqrt(sizeMultiplier);

    nationHexes.forEach(hex => {
      hex.maxTroops = baseTroops;
      hex.troops = baseTroops;
      hex.strength = baseStrength;
      hex.defense = baseDefense;
      hex.health = baseHealth;
    });

    enemyId++;
  }
}

function revealAround(q,r){
  for(let [nq,nr] of neighbors(q,r)){
    let k=key(nq,nr);
    if(tiles.has(k)) explored.add(k);
  }
}

function autoConquest(){
  if(!gameState.autoConquest || !dynastyUpgrades.autoConquest.purchased) return;
  if(gameState.autoConquestCooldown > 0){
    gameState.autoConquestCooldown--;
    return;
  }

  // If not currently attacking, find a new target
  if(!gameState.attackingNation){
    // Find weakest adjacent enemy nation
    const playerTiles = getNationTiles('player');
    const adjacentEnemies = new Set();

    for(const tile of playerTiles){
      for(const [nq,nr] of neighbors(tile.q, tile.r)){
        const neighbor = tiles.get(key(nq,nr));
        if(neighbor && neighbor.owner && neighbor.owner !== 'player' && explored.has(key(nq,nr))){
          adjacentEnemies.add(neighbor.owner);
        }
      }
    }

    if(adjacentEnemies.size === 0) return;

    // Find weakest nation
    let weakestNation = null;
    let weakestTroops = Infinity;

    adjacentEnemies.forEach(owner => {
      const troops = getNationTotalTroops(owner);
      if(troops < weakestTroops){
        weakestTroops = troops;
        weakestNation = owner;
      }
    });

    if(weakestNation){
      gameState.attackingNation = weakestNation;
      selectedEnemy = weakestNation;
    }
  }

  // Set cooldown (5 seconds base, reduced by upgrade)
  const baseCooldown = 5;
  const reductionPerLevel = 0.85; // Each level makes it 15% faster (cooldown is 85% of previous)
  const calculatedCooldown = baseCooldown * Math.pow(reductionPerLevel, upgrades.autoSpeed?.lvl || 0);
  gameState.autoConquestCooldown = Math.max(1, Math.round(calculatedCooldown));
}

function calculateCaps() {
  const owned=getNationTiles('player');
  let totalPopCap = BASE_POP_CAP;
  let totalTroopCap = BASE_TROOP_CAP;

  owned.forEach(t => {
      const dist = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(-t.q - t.r));
      const efficiency = Math.pow(0.9, dist); // 10% drop-off per hex distance
      totalPopCap += (50 + (upgrades.popCap?.lvl||0)*50) * efficiency;
      totalTroopCap += (20 + (upgrades.troopCap?.lvl||0)*20) * efficiency;
  });
  return { totalPopCap, totalTroopCap, owned };
}

function tick(){
  gameState.deltas = { player: { gain: 0, loss: 0 }, enemy: { gain: 0, loss: 0 }, popGain: 0 };
  const { totalPopCap, totalTroopCap, owned } = calculateCaps();

  // Process combat FIRST to calculate losses
  processCombat();

  // THEN do generation to calculate gains
  const troopsBeforeGain = resources.Troops.value;
  const troopGainPerTile = (upgrades.troop.lvl+1);
  let totalTroopGain = 0;
  owned.forEach(t => {
      const dist = Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(-t.q - t.r));
      const efficiency = Math.pow(0.8, dist); // 20% drop-off per hex distance
      totalTroopGain += troopGainPerTile * efficiency;
  });
  resources.Troops.value = Math.min(resources.Troops.value + totalTroopGain, totalTroopCap);
  gameState.deltas.player.gain = resources.Troops.value - troopsBeforeGain;

  // Enemy troop regeneration for all nations
  const allEnemyOwners = new Set([...tiles.values()].filter(t => t.owner && t.owner !== 'player').map(t => t.owner));
  allEnemyOwners.forEach(owner => {
    const nationTiles = getAllNationTiles(owner);
    if(nationTiles.length === 0) return;

    const troopsPerTile = nationTiles[0].maxTroops;
    const regenPerTile = Math.max(1, Math.floor(troopsPerTile * 0.02)); // Ensure at least 1 regen

    const enemyTroopsBeforeGain = getNationTotalTroops(owner);
    nationTiles.forEach(tile => {
      tile.troops = Math.min(tile.troops + regenPerTile, troopsPerTile);
    });
    const enemyTroopsAfterGain = getNationTotalTroops(owner);

    if (owner === gameState.attackingNation) {
        gameState.deltas.enemy.gain += (enemyTroopsAfterGain - enemyTroopsBeforeGain);
    }
  });

  // Population generation for research
  const popBeforeGain = resources.Pop.value;
  const popGainPerTile = (upgrades.pop.lvl+1);
  const popGain = owned.length * popGainPerTile;
  resources.Pop.value = Math.min(resources.Pop.value + popGain, totalPopCap);
  gameState.deltas.popGain = resources.Pop.value - popBeforeGain;

  if(upgrades.research.lvl>0){
    resources.Research.visible=true;
    // Slower research scaling: sqrt(pop)
    let researchGain = (Math.sqrt(resources.Pop.value) / 4) * (1 + (upgrades.researchSpeed?.lvl||0)*0.5);

    // Soft cap based on population capacity
    const popPercent = resources.Pop.value / totalPopCap;
    if (popPercent > 0.5) {
        const efficiency = Math.max(0.1, 1 - (popPercent - 0.5) * 2);
        researchGain *= efficiency;
    }

    resources.Research.value += researchGain;
  }

  // Auto conquest
  autoConquest();

  updateUpgradesVisibility();
  renderResources();
  draw();
  renderTroopStats(totalPopCap, totalTroopCap);
  updateSelectedNationInfo();
  renderActions();
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  ctx.save();
  ctx.translate(gameState.view.x, gameState.view.y);
  ctx.scale(gameState.view.zoom, gameState.view.zoom);

  // First pass: draw all hexes
  tiles.forEach(t=>{
    if(!explored.has(key(t.q,t.r))) return;
    const {x,y} = hexToPixel(t.q,t.r,canvas.width,canvas.height);
    let c;
    if (t.owner === 'player') c = '#4caf50';
    else if (t.owner === 'water') c = '#1565c0';
    else c = enemyColors.get(t.owner) || '#b71c1c';

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    drawHex(x,y,c);
  });

  // Second pass: Draw Nation Borders (Yellow/Red)
  if(selectedEnemy || gameState.attackingNation){
    const highlightOwner = gameState.attackingNation || selectedEnemy;
    const color = gameState.attackingNation === highlightOwner ? '#ff4444' : '#ffaa00';
    drawNationBorder(highlightOwner, color);
  }

  // Third pass: draw troop numbers (one per nation, on first visible tile)
  const displayedNations = new Set();
  tiles.forEach(t => {
    if(!explored.has(key(t.q,t.r)) || !t.owner || t.owner === 'player') return;
    if(displayedNations.has(t.owner)) return;

    const {x,y} = hexToPixel(t.q,t.r,canvas.width,canvas.height);
    const totalTroops = getNationTotalTroops(t.owner);

    if (totalTroops > 0) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 3;
        ctx.fillText(Math.floor(totalTroops), x, y);
        ctx.shadowBlur = 0;
        displayedNations.add(t.owner);
    }
  });

  // Draw player troops at origin
  const origin = tiles.get(key(0,0));
  if (origin && explored.has(key(0,0))) {
      const {x,y} = hexToPixel(0,0,canvas.width,canvas.height);
      const totalTroops = resources.Troops.value;

      if(totalTroops > 0){
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 3;
        ctx.fillText(Math.floor(totalTroops), x, y);
        ctx.shadowBlur = 0;
      }
  }

  // Fourth pass: hover highlight
  if(hoverHex && hoverHex.owner && hoverHex.owner !== 'player' && hoverHex.owner !== 'water'){
    // Don't highlight if it's the currently selected/attacked nation
    if(hoverHex.owner !== selectedEnemy && hoverHex.owner !== gameState.attackingNation) {
        drawNationBorder(hoverHex.owner, '#ffffff');
    }
  }

  ctx.restore();
}

function drawNationBorder(owner, color){
  const nationTiles = getNationTiles(owner);
  const tileSet = new Set(nationTiles.map(t => key(t.q, t.r)));

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  nationTiles.forEach(t => {
    const {x,y} = hexToPixel(t.q, t.r, canvas.width, canvas.height);

    // Check each neighbor
    for(let i=0; i<6; i++){
      const [dq, dr] = directions[i];
      const nKey = key(t.q + dq, t.r + dr);

      // If neighbor is NOT in the nation, draw this edge
      if(!tileSet.has(nKey)){
        // Determine vertices for this edge
        // i=0 (Right): Edge between v5(330) and v0(30)
        // i=1 (Left): Edge between v2(150) and v3(210)
        // i=2 (SE): Edge between v0(30) and v1(90)
        // i=3 (NW): Edge between v3(210) and v4(270)
        // i=4 (NE): Edge between v4(270) and v5(330)
        // i=5 (SW): Edge between v1(90) and v2(150)

        // Mapping direction index to start vertex index (based on PI/3*v + PI/6)
        // v0=30, v1=90, v2=150, v3=210, v4=270, v5=330
        // Dir 0 (+1,0) Right: v5 -> v0
        // Dir 1 (-1,0) Left: v2 -> v3
        // Dir 2 (0,1) SE: v0 -> v1
        // Dir 3 (0,-1) NW: v3 -> v4
        // Dir 4 (1,-1) NE: v4 -> v5
        // Dir 5 (-1,1) SW: v1 -> v2

        const edgeMap = {0:[5,0], 1:[2,3], 2:[0,1], 3:[3,4], 4:[4,5], 5:[1,2]};
        const [vStart, vEnd] = edgeMap[i];

        const a1 = Math.PI/3*vStart + Math.PI/6;
        const px1 = x + HEX_SIZE * Math.cos(a1);
        const py1 = y + HEX_SIZE * Math.sin(a1);

        const a2 = Math.PI/3*vEnd + Math.PI/6;
        const px2 = x + HEX_SIZE * Math.cos(a2);
        const py2 = y + HEX_SIZE * Math.sin(a2);

        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
      }
    }
  });
  ctx.stroke();
}

function drawHex(x,y,color){
  ctx.beginPath();
  for(let i=0;i<6;i++){
    let a=Math.PI/3*i+Math.PI/6;
    let px=x+HEX_SIZE*Math.cos(a);
    let py=y+HEX_SIZE*Math.sin(a);
    if(i===0) ctx.moveTo(px,py);
    else ctx.lineTo(px,py);
  }
  ctx.closePath();
  ctx.fillStyle=color;
  ctx.fill();
  ctx.stroke();
}

function renderResources(){
  const resDiv=document.getElementById('resources');
  resDiv.innerHTML='';

  for(const r of Object.keys(resources)){
    if(resources[r].visible){
      let el=document.createElement('div');
      el.className='resource';

      // Special handling for Pop/Troops to show dynamic caps
      if(r === 'Pop' || r === 'Troops'){
         // Caps are calculated in tick, but we need to display them.
         // For simplicity, we'll just use the values stored in resources,
         // but we need to update resources.cap in tick or pass it here.
         // Let's assume resources.cap is updated in tick?
         // Actually, in tick I used local variables. Let's update the object in tick.
      }

      if(r === 'Pop'){
        const popGain = gameState.deltas.popGain;
        const popDeltaText = popGain > 0 ? `<span style="color:#4caf50;">(+${popGain.toFixed(1)})</span> ` : '';
        const percent = resources.Pop.value / resources.Pop.cap;
        let etaText = '';
        if (popGain > 0 && resources.Pop.value < resources.Pop.cap) {
            const remaining = resources.Pop.cap - resources.Pop.value;
            const ticksToFull = remaining / popGain;
            const secondsToFull = ticksToFull * (TICK_MS / 1000);
            const h = Math.floor(secondsToFull / 3600);
            const m = Math.floor((secondsToFull % 3600) / 60);
            const s = Math.floor(secondsToFull % 60);
            if (h > 0) {
                etaText = ` (${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')})`;
            } else {
                etaText = ` (${m}:${s.toString().padStart(2,'0')})`;
            }
        }
        el.innerHTML = `<div>${r}: ${Math.floor(resources[r].value)}/${Math.floor(resources[r].cap)} ${popDeltaText}${etaText}</div><div class="progress-bar"><div class="progress-fill" style="width:${percent*100}%"></div></div>`;
      }
      else if(resources[r].cap && r !== 'Research' && r !== 'RulerPrestige' && r !== 'DynastyPoints' && r !== 'Troops'){
        const percent = resources[r].value / resources[r].cap;
        if(percent >= 0.99) el.className = 'resource full';
        else if(percent >= 0.8) el.className = 'resource warning';

        el.innerHTML = `
          <div>${r}: ${Math.floor(resources[r].value)}/${Math.floor(resources[r].cap)}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${percent*100}%"></div></div>
        `;
      }
      else {
        // Format large numbers
        let val = Math.floor(resources[r].value);
        el.textContent=`${r}: ${val}`;
      }
      resDiv.appendChild(el);
    }
  }
}

function getCost(upgrade){
  if(!upgrade.baseCost) return upgrade.cost || 0;
  return Math.floor(upgrade.baseCost * Math.pow(1.5, upgrade.lvl));
}

function updateUpgradesVisibility(){
  for(const key of Object.keys(upgrades)){
    if (key === 'succession') { // T1 Prestige
        const wasVisible = upgrades.succession.visible;
        const owned = getNationTiles('player').length;
        const totalLandTiles = [...tiles.values()].filter(t => t.owner !== 'water').length;
        const requiredPercent = 0.1 + gameState.rulerPrestige * 0.05; // 10%, 15%, 20%...
        const requiredTiles = Math.max(5, Math.floor(totalLandTiles * requiredPercent));
        upgrades.succession.visible = owned >= requiredTiles && upgrades.succession.lvl < 1;
        if (upgrades.succession.visible && !wasVisible) {
            showNotification('👑 You can now declare a successor!', 'victory');
        }
    }
    const u=upgrades[key];
    if(u.lvl>=u.maxLvl){ u.visible=false; continue; }
    if(key==='research'){ u.visible = true; }
    else if(u.requirePrestige){
      u.visible = upgrades.research.lvl>0 && gameState.rulerPrestige >= u.requirePrestige;
    }
    else if(u.requireDynasty){
      u.visible = dynastyUpgrades[u.requireDynasty].purchased && upgrades.research.lvl>0;
    }
    else if(u.unlockPop){
      u.visible = upgrades.research.lvl>0 && resources.Pop.cap >= u.unlockPop;
    }
  }
  renderUpgrades();
}

function renderUpgrades(){
  const upDiv=document.getElementById('upgrades');

  // Use a set to track which buttons should exist
  const activeKeys = new Set();

  for(const key of Object.keys(upgrades)){
    const u=upgrades[key];
    if(!u.visible) continue;
    activeKeys.add(key);

    const btnId = `upgrade-btn-${key}`;
    let btn = document.getElementById(btnId);
    if (!btn) {
        btn = document.createElement('button');
        btn.id = btnId;
        btn.className = 'upgrade-btn';
        upDiv.appendChild(btn);
    }

    const cost = getCost(u);
    const canAfford = cost === 0 || resources.Research.value >= cost;

    let html = `<span class="upgrade-name">${u.name} ${u.maxLvl>1 ? 'Lv'+(u.lvl+1) : ''}</span>`;
    if(settings.showUpgradeDetails){
      html += `<span class="upgrade-meta">${u.description}</span>`;
      html += `<span class="upgrade-meta">Cost: ${cost === 0 ? 'Free' : Math.floor(cost) + ' Research'}</span>`;
    }

    // Only update innerHTML if it changed to prevent thrashing
    if (btn.innerHTML !== html) btn.innerHTML = html;
    btn.disabled = !canAfford;

    btn.onclick=()=>{
      if(key === 'succession') {
        const owned = getNationTiles('player').length;
        const bonusGain = owned * 0.01; // 1% per tile
        const newBonus = gameState.t1Bonus + bonusGain;

        showConfirmation(`Declare a successor? You will gain +${Math.round(bonusGain*100)}% bonus stats based on your ${owned} tiles (Total: ${Math.round(newBonus*100)}%) and reset the island.`, () => {
          gameState.rulerPrestige++;
          gameState.t1Bonus = newBonus;
          resetRun();
          showNotification('👑 A new ruler has taken the throne!', 'victory');
        });
        return; // Don't do normal upgrade stuff
      }

      if(canAfford){
        if(cost > 0) resources.Research.value -= cost;
        u.lvl++;

        if(u.lvl>=u.maxLvl) u.visible=false;

        const { totalPopCap, totalTroopCap } = calculateCaps();
        renderTroopStats(totalPopCap, totalTroopCap);
        renderResources();

        tooltip.style.display='none';
        updateUpgradesVisibility();
        renderResources();
        renderActions();
      }
    };
  };

  // Remove buttons that are no longer visible
  Array.from(upDiv.children).forEach(child => {
      const key = child.id.replace('upgrade-btn-', '');
      if (!activeKeys.has(key)) {
          upDiv.removeChild(child);
      }
  });
}

function renderTroopStats(popCap, troopCap){
  // Update caps in resources for display
  if(popCap) resources.Pop.cap = popCap;
  if(troopCap) resources.Troops.cap = troopCap;

  const ts=troopStatsDiv;
  const playerTiles = getNationTiles('player');
  if(playerTiles.length > 0){
    const rulerBonus = 1 + gameState.t1Bonus + (resources.DynastyPoints.value * 0.1 * (dynastyUpgrades.legacy.purchased ? 1 : 0));
    const baseStr = 2 + (upgrades.attack?.lvl||0);
    const baseDef = 2 + (upgrades.defense?.lvl||0);
    const baseHp = 15 + (upgrades.health?.lvl||0)*2;

    const { gain, loss } = gameState.deltas.player;
    let deltaText = '';
    if (gain > 0.1) deltaText += `<span style="color:#4caf50;">(+${gain.toFixed(1)})</span> `;
    if (loss > 0.1) deltaText += `<span style="color:#f44336;">(-${loss.toFixed(1)})</span> `;

    ts.innerHTML=`
      <h3>Your Forces</h3>
      <div class="stat-line">
        <span class="stat-label">Troops:</span>
        <span class="stat-value">${deltaText}${Math.floor(resources.Troops.value)}/${Math.floor(troopCap)}</span></div>
      <div class="stat-line"><span class="stat-label">Attack:</span><span class="stat-value">${Math.floor(baseStr * rulerBonus)} ${rulerBonus > 1 ? '(+' + Math.floor((rulerBonus-1)*100) + '%)' : ''}</span></div>
      <div class="stat-line"><span class="stat-label">Defense:</span><span class="stat-value">${Math.floor(baseDef * rulerBonus)} ${rulerBonus > 1 ? '(+' + Math.floor((rulerBonus-1)*100) + '%)' : ''}</span></div>
      <div class="stat-line"><span class="stat-label">Health:</span><span class="stat-value">${Math.floor(baseHp * rulerBonus)} ${rulerBonus > 1 ? '(+' + Math.floor((rulerBonus-1)*100) + '%)' : ''}</span></div>
      ${upgrades.showConqueredStats.lvl > 0 ?
        `<div class="stat-line"><span class="stat-label">Conquered:</span><span class="stat-value">${gameState.totalConquests}</span></div>` : ''}
    `;
  }
}

function renderActions(){
  const actionsSection = document.getElementById('actionsSection');

  // Helper to manage action buttons
  const ensureButton = (id, text, className, onClick, onEnter, onLeave) => {
      let btn = document.getElementById(id);
      if (!btn) {
          btn = document.createElement('button');
          btn.id = id;
          actionsList.appendChild(btn);
      }
      if (btn.textContent !== text) btn.textContent = text;
      if (btn.className !== className) btn.className = className;
      btn.onclick = onClick;
      if (onEnter) btn.onmouseenter = onEnter;
      if (onLeave) btn.onmouseleave = onLeave;
      return btn;
  };

  const activeIds = new Set();

  // Auto Conquest
  if(dynastyUpgrades.autoConquest.purchased){
    const id = 'action-auto-conquest';
    activeIds.add(id);
    ensureButton(
      id,
      gameState.autoConquest ? '🤖 Auto-Conquest: ON' : '🤖 Auto-Conquest: OFF',
      gameState.autoConquest ? 'toggle-on' : 'toggle-off',
      () => {
      gameState.autoConquest = !gameState.autoConquest;
      renderActions();
      }
    );
  }

  // Abdicate (no bonus reset)
  const owned = getNationTiles('player').length;
  if (owned > 0) {
      const id = 'action-abdicate';
      activeIds.add(id);
      const btn = ensureButton(
          id,
          '🏳️ Abdicate',
          '',
          () => {
          showConfirmation('Are you sure you want to abdicate? You will not gain any prestige rank. This is for getting out of a stuck situation.', () => {
              resetRun();
              showNotification('You have abdicated the throne.', 'info');
          });
          },
          () => {
          tooltip.style.display='block';
          tooltip.innerHTML = `<b>Abdicate</b><br>Reset the island without gaining a Ruler Rank. Use this if you are stuck.`;
          },
          () => tooltip.style.display='none'
      );
      btn.style.background = 'linear-gradient(135deg, #757575 0%, #424242 100%)';
  }

  // Set Sail (T2)
  if(gameState.islandCleared){
    const id = 'action-set-sail';
    activeIds.add(id);
    const btn = ensureButton(
      id,
      '⛵ Set Sail (New Island)',
      'prestige-btn',
      () => {
      showConfirmation('Set sail to a new island? This will increase your Title Rank and grant Dynasty Points.', () => {
        gameState.islandPrestige++;
        gameState.rulerPrestige = 0; // Reset numeral on new title? Or keep? Prompt says "change ruler type". Usually implies reset of lower tier. Let's keep it simple and reset numeral.
        gameState.t1Bonus = 0; // Reset T1 bonus on T2 prestige? Usually yes.

        // Dynasty Points logic
        // "Get one dynasty point the first prestige"
        // "First upgrade unlocks a new resource that multiplies points"
        let pointsGain = 1;
        if(dynastyUpgrades.legacy.purchased){
           pointsGain += Math.floor(resources.Pop.value / 1000); // Example scaling
        }
        resources.DynastyPoints.value += pointsGain;
        resources.DynastyPoints.visible = true;

        resetRun();
        showNotification(`⛵ Set Sail! Gained ${pointsGain} Dynasty Points!`, 'victory');
      });
      }
    );
    btn.style.background = 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)';
  }

  // Dynasty Tree Toggle
  if(gameState.islandPrestige > 0){
    const id = 'action-dynasty-tree';
    activeIds.add(id);
    ensureButton(
      id,
      gameState.viewMode === 'map' ? '📜 Dynasty Tree' : '🗺️ World Map',
      '',
      () => {
      gameState.viewMode = gameState.viewMode === 'map' ? 'dynasty' : 'map';
      if(gameState.viewMode === 'dynasty'){
        canvas.style.display = 'none';
        dynastyOverlay.style.display = 'block';
        renderDynastyTree();
      } else {
        canvas.style.display = 'block';
        dynastyOverlay.style.display = 'none';
      }
      renderActions();
      }
    );
  }

  // Cleanup old buttons
  Array.from(actionsList.children).forEach(child => {
      if (!activeIds.has(child.id)) {
          actionsList.removeChild(child);
      }
  });

  actionsSection.style.display = actionsList.children.length > 0 ? 'block' : 'none';
}

function renderDynastyTree(){
  dynastyTreeDiv.innerHTML = '';
  const points = resources.DynastyPoints.value;
  const h3 = document.createElement('h3');
  h3.style.color = '#fff';
  h3.textContent = `Dynasty Points: ${points}`;
  dynastyTreeDiv.appendChild(h3);

  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.height = '500px';
  dynastyTreeDiv.appendChild(container);

  // Draw connections
  // Simple SVG lines? Or just CSS lines.
  // Let's just render nodes for now.

  for(const key in dynastyUpgrades){
    const u = dynastyUpgrades[key];
    const node = document.createElement('div');
    node.className = `dynasty-node ${u.purchased ? 'purchased' : ''}`;

    // Check locked status
    let locked = false;
    if(u.parent && !dynastyUpgrades[u.parent].purchased) locked = true;
    if(locked) node.className += ' locked';

    node.style.left = u.x + 'px';
    node.style.top = u.y + 'px';
    node.textContent = u.name;

    node.onclick = () => {
      if(locked) return;
      if(u.purchased) return;
      if(resources.DynastyPoints.value >= u.cost){
        showConfirmation(`Purchase ${u.name} for ${u.cost} DP?`, () => {
          resources.DynastyPoints.value -= u.cost;
          u.purchased = true;

          if(key === 'islandSize') gameState.islandRadius += 2;

          renderDynastyTree();
        });
      } else {
        alert('Not enough Dynasty Points!');
      }
    };

    // Tooltip
    node.onmouseenter = (e) => {
      tooltip.style.display='block';
      tooltip.style.left = e.clientX+10+'px';
      tooltip.style.top = e.clientY+10+'px';
      tooltip.innerHTML = `<b>${u.name}</b><br>${u.description}<br>Cost: ${u.cost} DP`;
    };
    node.onmouseleave = () => tooltip.style.display='none';

    container.appendChild(node);
  }
}

function resetRun(){
  resources.Pop.value = 10;
  resources.Pop.cap = BASE_POP_CAP;
  resources.Troops.value = 10;
  resources.Troops.cap = BASE_TROOP_CAP;
  resources.Research.value = 0;

  // Reset upgrades
  for(const key of Object.keys(upgrades)){
    if(key !== 'research'){
      upgrades[key].visible = false;
    }
    upgrades[key].lvl = 0;
  }
  upgrades.research.visible = true;

  gameState.autoConquest = false;
  gameState.attackingNation = null;
  selectedEnemy = null;
  gameState.islandCleared = false;

  // Reset View
  gameState.view.x = 0;
  gameState.view.y = 0;
  gameState.view.zoom = 3;
  gameState.view.x = (canvas.width/2) * (1 - gameState.view.zoom);
  gameState.view.y = (canvas.height/2) * (1 - gameState.view.zoom);

  assignRuler();
  createIsland();

  renderResources();
  updateUpgradesVisibility();
  renderTroopStats();
  updateSelectedNationInfo();
  renderActions();
  draw();
}

// Initialize with random name
const allNames = [...maleNames, ...femaleNames];
settings.rulerName = allNames[Math.floor(Math.random() * allNames.length)];
settings.rulerGender = isFemaleName(settings.rulerName) ? 'female' : 'male';

assignRuler();
createIsland();
renderResources();
draw();
renderUpgrades();
const { totalPopCap, totalTroopCap } = calculateCaps();
renderTroopStats(totalPopCap, totalTroopCap);
renderActions();
updateSelectedNationInfo();
setInterval(tick, TICK_MS);
