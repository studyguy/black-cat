import { SAVE_KEY, freshState, reflection, outcome, commit, restoreState } from './rules.js';
import { createGait, advanceGait, gaitPose } from './locomotion.js';
import { createActorRenderer } from './actor-renderer.js';

const W = 1200, H = 685;
const $ = id => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const images = new Map();
const actorRenderer = createActorRenderer();
const actorGaits = new WeakMap();
const actorHeights = { hero: 225, wife: 210, inspector: 225 };
const assetPaths = {
  home: 'assets/mobile/home-empty.jpg', garden: 'assets/bg_garden.jpg',
  fire: 'assets/bg_fire.jpg', ruins: 'assets/bg_ruins.jpg',
  tavern: 'assets/mobile/tavern-empty.jpg', cellar: 'assets/mobile/cellar-clean.jpg',
  search: 'assets/mobile/cellar-clean.jpg', hero: 'assets/mobile/hero.png',
  wife: 'assets/mobile/wife.png', inspector: 'assets/mobile/inspector.png',
  cat0: 'assets/mobile/cat-0.png', cat1: 'assets/mobile/cat-1.png', cat2: 'assets/mobile/cat-2.png',
};
const chapters = { home: '第一幕 · 家宅', garden: '第二幕 · 花园', fire: '第二幕 · 火夜', ruins: '第三幕 · 灰墙', tavern: '第四幕 · 酒馆', cellar: '第五幕 · 地窖', search: '第六幕 · 搜查' };
const floors = { home: 610, garden: 625, fire: 625, ruins: 640, tavern: 610, cellar: 620, search: 620 };
const doors = {
  home: { x: 873, y: 250, w: 103, h: 259 },
  tavern: { x: 920, y: 232, w: 127, h: 293 },
  cellar: { x: 990, y: 314, w: 116, h: 227 },
  search: { x: 990, y: 314, w: 116, h: 227 },
};
const wall = { x: 430, y: 224, w: 430, h: 296 };
const ash = { x: 315, y: 82, w: 600, h: 508 };
const ashCanvas = document.createElement('canvas'); ashCanvas.width = 600; ashCanvas.height = 508;
const ashCtx = ashCanvas.getContext('2d');
const wipedCells = new Set();
let state = freshState();
let started = false, paused = false, busy = false, generation = 0;
let sceneTime = 0, lastTime = performance.now(), animation = null, skipSequence = false;
let hero = { x: 330, face: 1, walk: 0, reach: 0, crouch: 0, opacity: 1 };
let wife = { x: 745, face: -1, walk: 0, reach: 0, opacity: 1 };
let cat = { x: 610, y: 604, face: -1, walk: 0, visible: true, follow: false, opacity: 1, eat: 0 };
let inspector = { x: 1000, face: -1, walk: 0, reach: 0, opacity: 0 };
let doorOpen = 0, blackout = 0, crack = 0, falling = 0, plaster = 0;
let brickAnimation = null, destination = null, wiping = false, pointer = null;
let speechUntil = 0, speechText = '', actionTitle = '', lastStepSound = -1;
let activeTargets = [], targetNodes = [], pendingSave = null;
let audio = null, soundOn = true, initialized = false;
const journal = [];
const events = [];
const record = (type, detail = {}) => { events.push({ type, scene: state.scene, step: state.step, at: Math.round(sceneTime * 1000), ...detail }); if (events.length > 300) events.shift(); };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = p => p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
const noise = n => (Math.sin(n * 78.233 + 1843.1) * 43758.5453) % 1;

function fatal(message) { $('error').hidden = false; $('error').textContent = message; record('error', { message }); }
window.addEventListener('error', e => fatal(`记忆暂时中断，请刷新重试。\n${e.message}`));
window.addEventListener('unhandledrejection', e => { if (e.reason?.cancelled) return; fatal(`记忆暂时中断，请刷新重试。\n${e.reason?.message || e.reason}`); });

async function image(name) {
  if (images.has(name)) return images.get(name);
  const img = new Image();
  const promise = new Promise((resolve, reject) => {
    img.onload = () => { images.set(name, img); resolve(img); };
    img.onerror = () => { images.delete(name); reject(new Error(`无法载入素材：${assetPaths[name]}`)); };
  });
  images.set(name, promise);
  img.src = assetPaths[name];
  return promise;
}
function readyImage(name) { const img = images.get(name); return img instanceof HTMLImageElement ? img : null; }
async function loadScene(scene) {
  await Promise.all([image(scene), ...((scene === 'search') ? [image('inspector')] : [])]);
}
function gaitFor(actor) {
  if (!actorGaits.has(actor)) actorGaits.set(actor, createGait(actor.x, actor.face));
  return actorGaits.get(actor);
}

function resize() {
  const viewport = $('viewport');
  const width = Math.min(viewport.clientWidth, viewport.clientHeight * W / H);
  $('world').style.width = `${Math.floor(width)}px`;
  $('world').style.height = `${Math.floor(width * H / W)}px`;
  positionSpeech();
}
function positionSpeech() {
  const vp = $('viewport').getBoundingClientRect(), wr = $('world').getBoundingClientRect();
  const spare = wr.top - vp.top;
  $('speech').style.top = `${spare > 100 ? Math.max(12, spare - 90) : 8}px`;
  if (vp.width > 700 && spare < 60) {
    $('speech').style.maxWidth = '400px';
    $('speech').style.marginLeft = state.scene === 'ruins' ? 'auto' : '0';
    $('speech').style.marginRight = state.scene === 'ruins' ? '0' : 'auto';
  } else { $('speech').style.maxWidth = '580px'; $('speech').style.marginLeft = 'auto'; $('speech').style.marginRight = 'auto'; }
}
new ResizeObserver(resize).observe($('viewport'));

function say(text, speaker = '我的供述', seconds = 6.5) {
  speechText = text; $('speaker').textContent = speaker; $('speech-text').textContent = text;
  $('speech').hidden = false; speechUntil = sceneTime + seconds; positionSpeech();
  journal.push(`${speaker}：${text}`); if (journal.length > 40) journal.shift();
}
function hideSpeech() { $('speech').hidden = true; speechUntil = 0; }
$('speech-close').addEventListener('click', hideSpeech);

function unlockAudio() {
  if (!audio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); }
  if (audio?.state === 'suspended') audio.resume().catch(() => {});
}
function sound(kind) {
  if (!soundOn || !audio || audio.state !== 'running') return;
  const time = audio.currentTime, gain = audio.createGain(); gain.connect(audio.destination);
  const tones = { step: [90, 52, .055, .025], door: [155, 45, .7, .035], cat: [750, 450, .28, .035], stone: [190, 42, .12, .055], knock: [135, 55, .15, .085], fire: [70, 35, .4, .025] };
  const [from, to, length, volume] = tones[kind] || tones.step;
  const osc = audio.createOscillator(); osc.type = kind === 'cat' ? 'sine' : kind === 'door' ? 'sawtooth' : 'triangle';
  osc.frequency.setValueAtTime(from, time); osc.frequency.exponentialRampToValueAtTime(to, time + length);
  gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(.0001, time + length);
  osc.connect(gain); osc.start(time); osc.stop(time + length);
}
$('sound').addEventListener('click', () => { unlockAudio(); soundOn = !soundOn; $('sound').textContent = `声音 ${soundOn ? '开' : '关'}`; });

function save(savePosition = true) {
  if (savePosition) state.x = hero.x;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* Private browsing can disable persistence; the active game remains playable. */ }
}
function settle(action, savePosition = true) {
  if (!commit(state, action)) throw new Error(`无效的场景动作：${action}`);
  record('commit', { action }); save(savePosition);
}
function checkpoint() {
  try { return restoreState(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function resetActors() {
  restoreDust();
  hero = { x: state.x, face: 1, walk: 0, reach: 0, crouch: 0, opacity: 1 };
  wife = { x: state.scene === 'fire' ? 765 : state.scene === 'cellar' ? 440 : 745, face: -1, walk: 0, reach: 0, opacity: 1 };
  cat = { x: 610, y: floors[state.scene] - 6, face: -1, walk: 0, visible: true, follow: false, opacity: 1, eat: 0 };
  inspector = { x: 1000, face: -1, walk: 0, reach: 0, opacity: 0 };
  doorOpen = 0; blackout = 0; crack = 0; falling = 0; plaster = 0; brickAnimation = null; destination = null; wiping = false; pointer = null;
  if (state.scene === 'home') { cat.x = state.fedCat ? 490 : 610; cat.eat = state.fedCat ? 1 : 0; }
  if (state.scene === 'garden') { cat.x = 685; cat.face = -1; }
  if (['fire', 'ruins', 'search'].includes(state.scene)) cat.visible = false;
  if (state.scene === 'tavern') {
    if (['approach', 'choose'].includes(state.step)) { cat.x = 738; cat.y = 385; }
    else { cat.x = hero.x - 85; cat.follow = true; }
  }
  if (state.scene === 'cellar') {
    wife.x = 495;
    cat.x = hero.x - 75; cat.follow = ['lamp', 'stairs'].includes(state.step);
    if (state.catOutside || state.bricks > 0 || state.step === 'summon') cat.visible = false;
    if (state.step === 'summon') plaster = 1;
  }
  if (state.scene === 'search') { plaster = 1; inspector.opacity = state.step === 'decide' ? 1 : 0; inspector.x = state.step === 'decide' ? 1015 : 1000; }
}
function cancelWork() {
  generation += 1;
  const old = animation; animation = null; if (old) old.reject({ cancelled: true });
  busy = false; skipSequence = false; hero.walk = 0; destination = null;
}
function clip(seconds, frame, label = '') {
  const token = generation;
  if (label) actionTitle = label;
  if (skipSequence) { frame(1); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    animation = { duration: reducedMotion ? Math.min(.25, seconds) : seconds, elapsed: 0, frame, resolve, reject, token };
    frame(0);
  });
}
async function walkTo(x, actor = hero, speed = 140) {
  const start = actor.x, end = clamp(x, 130, 1085), delta = end - start;
  if (Math.abs(delta) < 3) { actor.walk = 0; return; }
  gaitFor(actor); actor.face = Math.sign(delta); actor.walk = 1;
  if (actor === hero) destination = { x: end, y: floors[state.scene] };
  const ramp = .13;
  await clip(Math.abs(delta) / (speed * (1 - ramp)), p => {
    const distance = p < ramp ? p * p / (2 * ramp) : p > 1 - ramp ? 1 - ramp - (1 - p) ** 2 / (2 * ramp) : p - ramp / 2;
    actor.x = lerp(start, end, distance / (1 - ramp));
  }, '正在走近');
  actor.walk = 0; if (actor === hero) destination = null;
  await clip(.26, () => {}, '脚步停稳');
}
async function gesture({ crouch = 0, reach = 1, seconds = .95 } = {}) {
  await clip(seconds, p => { const a = Math.sin(p * Math.PI); hero.reach = a * reach; hero.crouch = a * crouch; }, '正在互动');
  hero.reach = 0; hero.crouch = 0;
}
async function openDoor() {
  sound('door'); const start = doorOpen;
  await clip(.95, p => { doorOpen = lerp(start, 1, ease(p)); }, '门正在打开'); record('door-open');
}
async function cut(text, seconds = 3.6) {
  say(text, '我的供述', seconds + 1);
  await clip(.35, p => { blackout = p; }, '记忆暗下去');
  await clip(seconds, () => { blackout = 1; }, '一段不愿面对的记忆');
  await clip(.4, p => { blackout = 1 - p; }); blackout = 0;
}
async function changeScene(action) {
  const token = generation;
  const next = { garden: 'garden', remember: 'fire', escape: 'ruins', street: 'tavern', cellar: 'cellar', summon: 'search' }[action];
  $('transition-title').textContent = chapters[next];
  $('transition-sub').textContent = { garden: '它开始躲我', fire: '那天夜里，家宅起火', ruins: '火后只剩一面墙', tavern: '后来，在一家酒馆', cellar: '我们搬进另一所旧宅', search: '第四天，警察来了' }[next];
  $('transition').classList.add('visible'); hideSpeech();
  await Promise.all([loadScene(next), clip(.55, () => {}, '走向下一段记忆')]);
  if (token !== generation) throw { cancelled: true };
  settle(action, false); resetActors();
  await clip(.65, () => {}, '记忆醒来');
  $('transition').classList.remove('visible');
  record('scene-enter'); intro();
}
function intro() {
  const text = {
    home: '普路托从前总跟着我。请先把晚饭放到它面前。',
    garden: '从我弄瞎它的一只眼起，普路托便不再信任我。',
    fire: '屋子烧起来时，妻子还站在院子里。',
    ruins: '人群围着那面墙。我伸手去拂上面的灰。',
    tavern: '木桶上卧着另一只黑猫，胸口有一块白斑。',
    cellar: '它跟到了新居，也跟下了地窖的台阶。',
    search: '我亲自带他们搜查，甚至领他们下了地窖。',
  }[state.scene];
  say(text);
}

function target(id, label, x, y, dock, action, optional = false) { return { id, label, x, y, dock, action, optional }; }
function choices() {
  if (state.ending) return [];
  if (state.scene === 'home') return [
    ...(!state.fedCat ? [target('bowl', '食碗', 480, 581, 422, 'feed')] : [target('door', '院门', 929, 367, 1035, 'garden')]),
    ...(!state.comfortedWife ? [target('wife', '妻子', 745, 390, 663, 'comfort', true)] : []),
  ];
  if (state.scene === 'garden') return [target('tree', '树下', 565, 520, 560, 'remember')];
  if (state.scene === 'fire') return [target('wife', '带妻子离开', wife.x, 453, 885, 'escape')];
  if (state.scene === 'ruins') return state.step === 'wipe' ? (wiping ? [] : [target('ash', '墙灰', 653, 347, 610, 'wipe')]) : [target('street', '街口', 1091, 568, 1050, 'street')];
  if (state.scene === 'tavern') {
    if (state.step === 'approach') return [target('cat', '黑猫', cat.x, cat.y - 50, 620, 'approach')];
    if (state.step === 'choose') return [];
    return [target('door', '店门', 990, 377, 1065, 'cellar')];
  }
  if (state.scene === 'cellar') {
    if (state.step === 'lamp') return [target('lamp', '提灯', 294, 439, 345, 'lamp')];
    if (state.step === 'stairs') return [target('stairs', '台阶下', 205, 536, 337, 'stairs')];
    if (state.step === 'summon') return [target('door', '走出地窖', 1041, 394, 1055, 'summon')];
    return [target('wall', state.bricks < 3 ? '墙后凹处' : '新砌的墙', 668, 405, 810, state.bricks < 3 ? 'brick' : 'plaster'),
      ...(!state.catOutside && state.bricks === 0 ? [target('cat', '黑猫', cat.x, cat.y - 42, 775, 'lead', true)] : [])];
  }
  if (state.scene === 'search' && state.step === 'inspect') return [target('door', '来客', 970, 375, 785, 'inspect')];
  if (state.scene === 'search') return [target('wall', '墙面', 668, 411, 818, 'knock'), target('door', '出口', 970, 375, 1055, 'leave', true)];
  return [];
}
function labelFor(action) {
  return { feed: '放下晚饭', comfort: '陪妻子说会儿话', garden: '推开院门', remember: '走到树下', escape: '带妻子离开', wipe: '拭去墙灰', street: '走向街口', approach: '走近黑猫', gentle: '轻轻抱下', hurry: '催它下来', cellar: '开门，带猫回去', lamp: '提起灯', stairs: '走下最后一级', lead: '引猫到门外', brick: ['砌第一层', '砌第二层', '砌最后一层'][state.bricks] || '砌墙', plaster: '抹平墙面', summon: '离开地窖', inspect: '让警察搜查', knock: '敲一敲墙', leave: '送警察离开', confess: '把实情说出来' }[action] || action;
}
function currentGoal() {
  if (busy) return actionTitle || '走近，再伸出手';
  const goals = {
    home: state.fedCat ? '院门已经可以打开' : '把食物放进普路托的碗里',
    garden: '走到院中那棵树下', fire: '带妻子从左侧小径撤离',
    ruins: state.step === 'wipe' ? (wiping ? `擦开墙灰 ${Math.min(100, Math.floor(state.dust.length / 1000 * 100))}%` : '走近墙面，拂开灰烬') : '猫影已经露出来了，走向街口',
    tavern: state.step === 'approach' ? '走近木桶上的黑猫' : state.step === 'choose' ? '伸手抱它，或催它跳下来' : '开门，带黑猫一起离开',
    cellar: { lamp: '先取下台阶边的灯', stairs: '妻子正站在台阶尽头', prepare: state.bricks === 0 ? '墙后有一处凹陷；猫还在脚边' : state.bricks < 3 ? '继续把墙面砌起来' : '用灰浆掩住砖缝', summon: '墙面已经抹平，走出地窖' }[state.step],
    search: state.step === 'inspect' ? '领警察进来，等他们查完' : '警察将要离开，你把手放在墙边',
  }; return goals[state.scene];
}
function makeButton(text, action, className = '') {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.className = className;
  button.addEventListener('click', () => act(action)); return button;
}
function ui() {
  $('chapter').textContent = chapters[state.scene]; $('goal').textContent = currentGoal();
  $('guide').textContent = wiping ? '按住墙面来回擦拭 · 灰烬会留在指尖下' : busy ? '动作进行中 · 可跳过演出' : '点地面行走 · 点物件走近互动';
  $('scene-caption').textContent = `${state.scene === 'tavern' ? 'THE STRANGER' : state.scene === 'search' ? 'THE LAST WALL' : 'THE BLACK CAT'} · 1843`;
  $('targets').replaceChildren(); $('actions').replaceChildren(); activeTargets = []; targetNodes = [];
  if (!started || state.ending) return;
  if (busy) { $('actions').append(makeButton('跳过演出', 'skip')); return; }
  activeTargets = choices();
  for (const t of activeTargets) {
    const b = document.createElement('button'); b.className = `target${t.optional ? ' optional' : ''}${t.y > H * .72 ? ' above' : ''}`; b.type = 'button';
    b.setAttribute('aria-label', `${t.label}：${labelFor(t.action)}`);
    const pin = document.createElement('span'); pin.className = 'pin'; pin.textContent = t.action === 'garden' || t.action === 'cellar' || t.action === 'street' || t.action === 'summon' ? '›' : '+';
    const label = document.createElement('span'); label.className = 'target-label'; label.textContent = t.label;
    b.append(pin, label); b.style.left = `${t.x / W * 100}%`; b.style.top = `${t.y / H * 100}%`;
    b.addEventListener('click', e => { e.stopPropagation(); act(t.action); });
    $('targets').append(b); targetNodes.push({ button: b, target: t });
  }
  let actions = activeTargets.map(t => t.action);
  if (state.scene === 'tavern' && state.step === 'choose') actions = ['gentle', 'hurry'];
  if (state.scene === 'search' && state.step === 'decide') { actions = ['knock', 'leave']; if (reflection(state) >= 2) actions.push('confess'); }
  for (const [i, action] of [...new Set(actions)].entries()) $('actions').append(makeButton(labelFor(action), action, i === 0 ? 'primary-action' : ''));
}

async function act(action) {
  clock(); unlockAudio();
  if (action === 'skip' && busy) { skipSequence = true; const button = $('actions').querySelector('button'); if (button) { button.disabled = true; button.textContent = '正在完成…'; } if (animation) { const a = animation; animation = null; a.frame(1); a.resolve(); } render(); return; }
  if (!started || paused || busy || state.ending) return;
  const available = [...choices().map(t => t.action)];
  if (state.scene === 'tavern' && state.step === 'choose') available.push('gentle', 'hurry');
  if (state.scene === 'search' && state.step === 'decide' && reflection(state) >= 2) available.push('confess');
  if (!available.includes(action)) return;
  busy = true; skipSequence = false; actionTitle = labelFor(action); hideSpeech(); ui(); const token = generation;
  record('action', { action });
  try {
    const t = choices().find(item => item.action === action);
    if (t) await walkTo(t.dock);
    if (token !== generation) throw { cancelled: true };
    switch (action) {
      case 'feed': {
        hero.face = 1; const start = cat.x;
        await gesture({ crouch: .65, reach: .8 });
        cat.walk = 1; cat.face = -1;
        await clip(1.1, p => { cat.x = lerp(start, 491, ease(p)); cat.eat = p; }, '普路托走向食碗');
        cat.walk = 0; cat.eat = 1; sound('cat'); settle('feed'); say('它低下头吃东西。那时，我还能让它安心。'); break;
      }
      case 'comfort':
        hero.face = 1; wife.face = -1; await gesture({ reach: .5 });
        await clip(.8, p => { wife.reach = Math.sin(p * Math.PI) * .6; }, '妻子伸出手'); wife.reach = 0;
        settle('comfort'); say('今晚早点回来。普路托一直在门边等你。', '妻子'); break;
      case 'garden':
        await openDoor(); await walkTo(1065);
        await cut('后来我酗酒成性。一夜醉后，我弄瞎了普路托的一只眼。', 3.8);
        await changeScene('garden'); break;
      case 'remember': {
        cat.face = 1; cat.walk = 1; const start = cat.x;
        await clip(1.1, p => { cat.x = lerp(start, 565, ease(p)); hero.crouch = p * .65; }, '普路托退进树影');
        cat.walk = 0;
        await cut('一个清晨，我把普路托吊在树上。我知道它爱我，也知道那是罪。', 4.2);
        cat.visible = false; hero.crouch = 0; await changeScene('remember'); break;
      }
      case 'escape': {
        say('别回头，跟我走！', '妻子', 3);
        const hx = hero.x, wx = wife.x; hero.face = 1; wife.face = 1; hero.walk = 1; wife.walk = 1;
        await clip(1.8, p => { hero.x = lerp(hx, 1120, p); wife.x = lerp(wx, 1080, p); }, '沿着院墙跑向右侧出口');
        hero.walk = 0; wife.walk = 0; await changeScene('escape'); break;
      }
      case 'wipe': wiping = true; say('按住灰白的墙面，来回擦去浮灰。', '手边', 5); break;
      case 'street': await changeScene('street'); break;
      case 'approach': await gesture({ reach: .35 }); settle('approach'); sound('cat'); say('除了胸口的白斑，它几乎和普路托一模一样。'); break;
      case 'gentle':
      case 'hurry': {
        hero.face = 1; await gesture({ reach: action === 'gentle' ? .9 : .4, crouch: .2 });
        const fromX = cat.x, fromY = cat.y; cat.face = -1;
        await clip(action === 'gentle' ? 1 : .65, p => { cat.x = lerp(fromX, 665, p); cat.y = lerp(fromY, floors.tavern - 6, p) - Math.sin(p * Math.PI) * 80; cat.walk = Math.sin(p * Math.PI); }, '黑猫从木桶上跳下');
        cat.walk = 0; cat.follow = true; settle(action);
        say(action === 'gentle' ? '它用额头碰了碰我的手，跟到了脚边。' : '它跳下来，仍紧紧跟着我。'); break;
      }
      case 'cellar': await openDoor(); await walkTo(1078); await clip(.5, () => {}, '黑猫跟过门槛'); await changeScene('cellar'); break;
      case 'lamp': await gesture({ reach: .8 }); sound('door'); settle('lamp'); say('灯照着台阶；猫却在我脚边绕个不停。'); break;
      case 'stairs':
        hero.face = 1; cat.follow = false;
        await clip(.9, p => { hero.reach = p; wife.reach = p; hero.crouch = Math.sin(p * Math.PI) * .15; }, '妻子挡住了举起的手');
        await cut('我举斧向猫砍去，妻子伸手拦住我。我竟把斧头转向了她。', 4.4);
        wife.opacity = 0; hero.reach = 0; hero.crouch = 0; settle('stairs'); cat.x = 495;
        say('妻子死了。我把她藏进墙后的凹处，搬来了砖和灰浆。'); break;
      case 'lead': {
        cat.follow = false; const cx = cat.x; hero.face = -1;
        await gesture({ crouch: .4, reach: .75 }); await openDoor();
        cat.face = 1; cat.walk = 1;
        await clip(2.2, p => { cat.x = lerp(cx, 1095, p); cat.opacity = 1 - clamp((p - .88) / .12, 0, 1); }, '黑猫沿着门槛走到外面');
        cat.visible = false; cat.walk = 0; settle('lead'); record('cat-exited'); say('它从门缝走了出去。我等到脚步声消失才转身。');
        await clip(.6, p => { doorOpen = 1 - p; }, '门合上了'); break;
      }
      case 'brick': {
        hero.face = -1; cat.follow = false;
        if (!state.catOutside) cat.visible = false;
        brickAnimation = { layer: state.bricks, p: 0 };
        await clip(1.8, p => { brickAnimation.p = p; hero.reach = .4 + Math.sin(p * Math.PI * 6) * .35; if (p > .5) hero.crouch = .1; }, '一块块把砖填上去');
        sound('stone'); hero.reach = 0; hero.crouch = 0; brickAnimation = null; settle('brick'); break;
      }
      case 'plaster':
        hero.face = -1; await clip(1.7, p => { plaster = p; hero.reach = .55 + Math.sin(p * Math.PI * 5) * .3; }, '灰浆盖住了最后一道砖缝');
        hero.reach = 0; settle('plaster'); say('我收起工具。墙面看起来和从前一样。'); break;
      case 'summon': await openDoor(); await walkTo(1080); await changeScene('summon'); break;
      case 'inspect':
        await openDoor(); inspector.opacity = 1;
        await walkTo(570, inspector, 190);
        await clip(1.15, p => { inspector.reach = Math.sin(p * Math.PI) * .75; }, '警察察看墙面与地板');
        inspector.reach = 0; await walkTo(1005, inspector, 190); inspector.face = -1;
        settle('inspect'); say('已经看过了。我们走吧。', '警察'); break;
      case 'knock': {
        hero.face = -1;
        for (let i = 0; i < 3; i++) { sound('knock'); await gesture({ reach: .9, seconds: .35 }); }
        if (state.catOutside) { await clip(1.3, () => {}, '只有空洞的回声'); say('墙里没有回答。我把手放了下来。'); }
        else {
          sound('cat');
          await clip(1.3, p => { crack = p; falling = p; inspector.reach = p * .55; }, '墙里传来一声长叫');
          cat = { x: 667, y: 495, face: 1, walk: 1, visible: true, follow: false, opacity: 1, eat: 0 };
          await clip(1.05, p => { cat.x = lerp(667, 875, p); cat.y = lerp(495, floors.search - 6, p) - Math.sin(p * Math.PI) * 115; falling = 1; }, '砖块落下，黑猫跃出墙洞');
          cat.walk = 0; await clip(1.5, () => {}, '谁也没有再说话');
        }
        settle('knock'); showEnding(); break;
      }
      case 'leave':
        hero.face = 1; await walkTo(1080); await walkTo(1085, inspector, 180);
        settle('leave'); showEnding(); break;
      case 'confess':
        hero.face = 1; await gesture({ reach: .4 });
        say('等等。那面墙后面……是我的妻子。', '我', 4);
        await clip(2.7, p => { inspector.face = -1; inspector.x = lerp(1005, 880, ease(p)); }, '警察停住了脚步');
        settle('confess'); showEnding(); break;
    }
  } catch (e) { if (!e?.cancelled) throw e; }
  finally { if (token === generation) { busy = false; skipSequence = false; destination = null; hero.walk = 0; save(); ui(); } }
}

function showEnding() {
  const copy = {
    exposed: ['I · 墙中之声', '墙中之声', '我的手刚离开砖面，墙里便响起尖叫。\n警察拆开新砌的墙，黑猫伏在妻子的遗体之上。\n我亲手封住的罪，也由我亲手揭开。'],
    silence: ['II · 新增结局', '门外无声', state.catOutside ? '猫先离开了地窖。那天，警察什么也没有发现。\n我仍记得每一道砖缝的位置。\n门外没有声音，并不等于墙后的事不曾发生。' : '我没有敲那面墙。警察沿台阶走了上去。\n地窖重归寂静，里面还留着我的罪。\n我得到了片刻沉默，却没有得到清白。'],
    confession: ['III · 新增结局', '未完的供述', '我叫住了将要离开的警察，指向那面新墙。\n这不是一场能够撤回的梦。\n供述写得再长，也换不回妻子和普路托。'],
  }[state.ending];
  $('ending-number').textContent = copy[0]; $('ending-title').textContent = copy[1]; $('ending-copy').textContent = copy[2];
  $('ending-facts').textContent = '据爱伦·坡《黑猫》改编 · 墙后的事仍由我负责';
  $('ending').hidden = false; hideSpeech(); $('targets').replaceChildren(); $('actions').replaceChildren(); record('ending', { ending: state.ending });
}
async function begin(saved = null) {
  cancelWork(); paused = false; started = true; state = saved || freshState();
  $('title-screen').hidden = true; $('ending').hidden = true; $('pause-screen').hidden = true; $('transition').classList.remove('visible');
  hideSpeech(); unlockAudio();
  try { await loadScene(state.scene); resetActors(); initialized = true; save(); ui(); resize(); if (state.ending) showEnding(); else intro(); record(saved ? 'continue' : 'start'); }
  catch (e) { fatal(e.message); }
}
$('start').addEventListener('click', () => begin());
$('continue').addEventListener('click', () => begin(pendingSave));
$('restart').addEventListener('click', () => begin());
$('new-game').addEventListener('click', () => { if (confirm('放下这段记忆，从家宅重新开始？')) begin(); });
function pauseGame(value) {
  if (!started || state.ending) return; clock(); paused = value; lastTime = performance.now(); $('pause-screen').hidden = !value;
  $('journal-text').hidden = true; if (value) save();
}
$('pause').addEventListener('click', () => pauseGame(true)); $('resume').addEventListener('click', () => pauseGame(false));
$('journal').addEventListener('click', () => { $('journal-text').textContent = journal.length ? journal.join('\n\n') : '这一页还没有写下。'; $('journal-text').hidden = !$('journal-text').hidden; });

function toWorld(event) { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width * W, y: (event.clientY - r.top) / r.height * H }; }
function restoreDust() {
  wipedCells.clear(); for (const id of state.dust) wipedCells.add(id);
  ashCtx.clearRect(0, 0, ashCanvas.width, ashCanvas.height);
  ashCtx.fillStyle = '#aba99b'; ashCtx.fillRect(0, 0, ashCanvas.width, ashCanvas.height);
  ashCtx.strokeStyle = '#68675b40'; ashCtx.lineWidth = 1;
  for (let i = 0; i < 1700; i++) {
    const x = (i * 167.31) % ashCanvas.width, y = (i * 79.13) % ashCanvas.height;
    ashCtx.beginPath(); ashCtx.moveTo(x, y); ashCtx.lineTo(x + 2 + i % 4, y + (i % 3) - 1); ashCtx.stroke();
  }
  ashCtx.globalCompositeOperation = 'destination-out';
  for (const id of wipedCells) {
    const row = Math.floor(id / 40), col = id % 40;
    ashCtx.beginPath(); ashCtx.arc((col + .5) * 15, (row + .5) * 13, 13, 0, Math.PI * 2); ashCtx.fill();
  }
  ashCtx.globalCompositeOperation = 'source-over';
}
function wipeAt(x, y) {
  if (!wiping || busy || state.scene !== 'ruins' || state.step !== 'wipe') return;
  const localX = x - ash.x, localY = y - ash.y;
  if (localX < 0 || localY < 0 || localX > ash.w || localY > ash.h) return;
  const col = clamp(Math.floor(localX / ash.w * 40), 0, 39), row = clamp(Math.floor(localY / ash.h * 40), 0, 39);
  const before = wipedCells.size;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dy * dy > 11) continue;
    const cx = col + dx, cy = row + dy;
    if (cx < 0 || cy < 0 || cx > 39 || cy > 39) continue;
    const id = cy * 40 + cx;
    if (!wipedCells.has(id)) { wipedCells.add(id); ashCtx.beginPath(); ashCtx.arc((cx + .5) * 15, (cy + .5) * 13, 13, 0, Math.PI * 2); ashCtx.fill(); }
  }
  if (wipedCells.size === before) return;
  state.dust = [...wipedCells]; $('goal').textContent = currentGoal(); save();
  if (wipedCells.size >= 1000) { wiping = false; settle('reveal'); record('ash-revealed', { cells: wipedCells.size }); say('猫影的颈上有绳痕。我说那只是火和石灰留下的巧合。'); ui(); }
}
canvas.addEventListener('pointerdown', e => {
  clock(); unlockAudio(); if (!started || paused || state.ending) return;
  const p = toWorld(e);
  if (wiping && !busy) { pointer = p; canvas.setPointerCapture(e.pointerId); wipeAt(p.x, p.y); e.preventDefault(); return; }
  if (busy) return; hideSpeech();
  const hit = choices().find(t => {
    const y = t.id === 'cat' ? cat.y - 43 : t.y - 23;
    return Math.hypot(p.x - t.x, p.y - y) < 66;
  });
  if (hit) { act(hit.action); return; }
  if ((p.y >= floors[state.scene] - 86 && p.y < 660) || (state.scene === 'ruins' && state.step === 'wipe' && p.x >= ash.x - 30 && p.x <= ash.x + ash.w + 30 && p.y >= ash.y - 30 && p.y <= ash.y + ash.h + 30)) {
    if (state.scene === 'ruins' && state.step === 'wipe' && p.y < floors.ruins - 70) {
      wiping = true; pointer = p; canvas.setPointerCapture(e.pointerId); wipeAt(p.x, p.y); ui(); e.preventDefault(); return;
    }
    busy = true; actionTitle = '走向那里'; ui(); const token = generation;
    walkTo(p.x).then(() => { if (token === generation) { busy = false; save(); ui(); record('walk'); } }).catch(e => { if (!e?.cancelled) fatal(e.message); });
  } else say('点脚下的地面行走，或点有标记的物件。', '手边', 3);
});
canvas.addEventListener('pointermove', e => {
  if (!pointer || !wiping) return; const p = toWorld(e);
  const distance = Math.hypot(p.x - pointer.x, p.y - pointer.y);
  const count = Math.max(1, Math.ceil(distance / 18));
  for (let i = 1; i <= count; i++) wipeAt(lerp(pointer.x, p.x, i / count), lerp(pointer.y, p.y, i / count));
  pointer = p; e.preventDefault();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { pointer = null; });
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { pauseGame(!paused); return; }
  if (!started || paused || busy || state.ending || !['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) return;
  e.preventDefault(); const sign = ['ArrowLeft', 'a'].includes(e.key) ? -1 : 1;
  const r = canvas.getBoundingClientRect(); canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + clamp(hero.x + sign * 110, 130, 1085) / W * r.width, clientY: r.top + floors[state.scene] / H * r.height }));
});
document.addEventListener('visibilitychange', () => { lastTime = performance.now(); if (started) save(); });
window.addEventListener('pagehide', () => { if (started) save(); });

function shadow(x, y, rx, ry, opacity = .22) { ctx.save(); ctx.fillStyle = `rgba(24,20,13,${opacity})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function drawActor(name, actor, y, height = actorHeights[name]) {
  if (actor.opacity <= 0) return;
  const img = readyImage(name); if (!img) return;
  const pose = gaitPose(gaitFor(actor), { x: actor.x, y, height, crouch: actor.crouch || 0 });
  shadow(actor.x, y + 1, height * .17, 6, .21 * actor.opacity);
  actorRenderer.draw(ctx, name, img, actor, pose, height);
}
function drawCat() {
  if (!cat.visible || cat.opacity <= 0) return;
  const index = cat.walk > .2 ? Math.floor(sceneTime * 10) % 3 : 0, img = readyImage(`cat${index}`); if (!img) return;
  const h = 81, w = h * img.width / img.height, stride = Math.sin(sceneTime * 16) * cat.walk;
  shadow(cat.x, cat.y + 1, 38, 4, cat.opacity * .23);
  ctx.save(); ctx.globalAlpha = cat.opacity; ctx.translate(cat.x, cat.y - Math.abs(stride) * 2); ctx.scale(cat.face, 1);
  if (['home', 'garden'].includes(state.scene)) ctx.filter = 'brightness(.48) saturate(.5)';
  for (let side = 0; side < 2; side++) {
    ctx.save(); const lx = side === 0 ? -.27 * w : .29 * w; ctx.translate(lx, -h * .24); ctx.rotate(stride * .3 * (side === 0 ? 1 : -1));
    const sx = side === 0 ? 22 : 240, sw = side === 0 ? 185 : 180;
    ctx.drawImage(img, sx, 285, sw, 105, (sx / img.width - .5) * w - lx, 0, sw / img.width * w, h * .27); ctx.restore();
  }
  ctx.save(); ctx.rotate(cat.eat ? .1 : 0);
  ctx.drawImage(img, 0, 0, img.width, 300, -w / 2, -h, w, h * 300 / img.height);
  ctx.restore(); ctx.filter = 'none';
  if (['tavern', 'cellar', 'search'].includes(state.scene)) {
    ctx.fillStyle = '#e2dcc6'; ctx.beginPath(); ctx.moveTo(w * .27, -h * .50); ctx.lineTo(w * .34, -h * .41); ctx.lineTo(w * .28, -h * .30); ctx.lineTo(w * .22, -h * .37); ctx.closePath(); ctx.fill();
    if (state.scene !== 'tavern') { ctx.strokeStyle = '#36332b'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(w * .265, -h * .32); ctx.lineTo(w * .265, -h * .45); ctx.lineTo(w * .31, -h * .45); ctx.stroke(); }
  }
  if (state.scene === 'garden') { ctx.strokeStyle = '#342321'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w * .425, -h * .57); ctx.lineTo(w * .46, -h * .53); ctx.stroke(); }
  ctx.restore();
}
function drawDoor() {
  const d = doors[state.scene], bg = readyImage(state.scene); if (!d || !bg || doorOpen <= .001) return;
  ctx.save(); const p = clamp(doorOpen, 0, 1), width = d.w * Math.max(.055, Math.cos(p * 1.43));
  ctx.fillStyle = '#191a16'; ctx.fillRect(d.x, d.y, d.w, d.h);
  const glow = ctx.createLinearGradient(d.x, d.y, d.x + d.w, d.y); glow.addColorStop(0, '#978760'); glow.addColorStop(.35, '#373729'); glow.addColorStop(1, '#131611');
  ctx.globalAlpha = .55; ctx.fillStyle = glow; ctx.fillRect(d.x, d.y, d.w, d.h); ctx.globalAlpha = 1;
  ctx.translate(d.x, d.y); ctx.transform(1, Math.sin(p * 1.43) * .17, 0, 1, 0, 0);
  ctx.drawImage(bg, d.x, d.y, d.w, d.h, 0, 0, width, d.h);
  ctx.strokeStyle = '#191a14'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, width, d.h);
  ctx.restore();
  ctx.save(); ctx.globalAlpha = doorOpen * .13; ctx.fillStyle = '#efe0a7'; ctx.beginPath(); ctx.moveTo(d.x, d.y + d.h); ctx.lineTo(d.x + d.w, d.y + d.h); ctx.lineTo(d.x + d.w + 120, 635); ctx.lineTo(d.x - 35, 635); ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawBowl() {
  ctx.save(); shadow(479, 601, 24, 4, .18); ctx.fillStyle = '#746b53'; ctx.strokeStyle = '#292b23'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(479, 591, 22, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(458, 591); ctx.quadraticCurveTo(464, 607, 494, 600); ctx.lineTo(501, 591); ctx.stroke();
  if (state.fedCat) { ctx.fillStyle = '#b5a67e'; ctx.beginPath(); ctx.ellipse(479, 591, 16, 3, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore();
}
function drawPath() {
  ctx.save(); ctx.fillStyle = '#b1a680'; ctx.strokeStyle = '#524e3b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(76, 601); ctx.quadraticCurveTo(510, 570, 1110, 605); ctx.lineTo(1130, 648); ctx.quadraticCurveTo(480, 624, 80, 652); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = .25; for (let i = 0; i < 90; i++) { const x = 80 + i * 11.6; ctx.beginPath(); ctx.moveTo(x, 620); ctx.lineTo(x + 12, 638); ctx.stroke(); } ctx.restore();
}
function drawFire() {
  ctx.save(); ctx.fillStyle = '#20190f28'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 22; i++) {
    const x = 650 + i * 14.5, base = 493 + Math.sin(i * 3) * 27, flicker = Math.sin(sceneTime * (5 + i % 4) + i * 2);
    const height = 70 + (i % 5) * 19 + flicker * 24, width = 20 + (i % 3) * 8;
    const g = ctx.createLinearGradient(x, base, x, base - height); g.addColorStop(0, '#e49a34c9'); g.addColorStop(.6, '#cf622383'); g.addColorStop(1, '#e9d68c00'); ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - width, base); ctx.quadraticCurveTo(x + width, base - height * .35, x + flicker * 20, base - height); ctx.quadraticCurveTo(x - width, base - height * .4, x - width, base); ctx.fill();
  }
  for (let i = 0; i < 45; i++) { const p = (sceneTime * (.1 + i % 3 * .025) + i * .043) % 1; ctx.fillStyle = `rgba(65,57,43,${(1 - p) * .09})`; ctx.beginPath(); ctx.ellipse(710 + Math.sin(i) * 170 + p * 80, 370 - p * 310, 40 + p * 90, 40 + p * 60, 0, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i < 60; i++) { const p = (sceneTime * .13 + i * .027) % 1; ctx.fillStyle = i % 3 ? '#efc27799' : '#ddd2b988'; ctx.fillRect(640 + ((i * 67) % 410) + Math.sin(sceneTime + i) * 20, 540 - p * 500, 2, 3); }
  ctx.restore();
}
function drawAsh() {
  if (state.scene !== 'ruins' || state.step !== 'wipe') return;
  ctx.save(); ctx.drawImage(ashCanvas, ash.x, ash.y, ash.w, ash.h);
  if (wiping) { ctx.strokeStyle = '#b99a5b'; ctx.lineWidth = 2; ctx.setLineDash([9, 11]); ctx.strokeRect(ash.x - 8, ash.y - 8, ash.w + 16, ash.h + 16); }
  if (pointer) { ctx.setLineDash([]); ctx.strokeStyle = '#ead9a6aa'; ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 24, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}
function drawLantern() {
  if (!['cellar', 'search'].includes(state.scene)) return;
  const held = state.scene === 'cellar' && state.step !== 'lamp', x = held ? hero.x - 36 : 294, y = held ? floors[state.scene] - 110 : 437;
  ctx.save(); const glow = ctx.createRadialGradient(x, y, 0, x, y, 85); glow.addColorStop(0, '#efd37b38'); glow.addColorStop(1, '#efce6700'); ctx.fillStyle = glow; ctx.fillRect(x - 85, y - 85, 170, 170);
  ctx.strokeStyle = '#302e23'; ctx.lineWidth = 2.5; ctx.fillStyle = '#d8bd78'; ctx.fillRect(x - 8, y - 15, 16, 25); ctx.strokeRect(x - 8, y - 15, 16, 25);
  ctx.beginPath(); ctx.arc(x, y - 21, 7, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 12, y - 16); ctx.lineTo(x + 12, y - 16); ctx.moveTo(x - 11, y + 11); ctx.lineTo(x + 11, y + 11); ctx.stroke();
  ctx.fillStyle = '#fff0b6'; ctx.beginPath(); ctx.ellipse(x, y - 3, 3, 7 + Math.sin(sceneTime * 8), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function brickRect(layer, index) {
  const cols = 4, rows = 3, bw = wall.w / cols, bh = wall.h / 9;
  const row = Math.floor(index / cols), col = index % cols;
  return { x: wall.x + col * bw + 2, y: wall.y + wall.h - (layer * rows + row + 1) * bh + 2, w: bw - 4, h: bh - 4 };
}
function drawBrick(b, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = '#8d8064'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = '#37372b'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = '#e6d6ad55'; ctx.beginPath(); ctx.moveTo(b.x + 2, b.y + 3); ctx.lineTo(b.x + b.w - 3, b.y + 3); ctx.stroke();
  ctx.strokeStyle = '#403f3038'; for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.moveTo(b.x + 6 + j * 11, b.y + b.h - 4); ctx.lineTo(b.x + 10 + j * 11, b.y + 7); ctx.stroke(); } ctx.restore();
}
function drawWall() {
  if (!['cellar', 'search'].includes(state.scene)) return;
  const active = state.scene === 'search' || ['prepare', 'summon'].includes(state.step); if (!active) return;
  ctx.save(); ctx.fillStyle = '#292a23'; ctx.fillRect(wall.x - 6, wall.y - 6, wall.w + 12, wall.h + 12);
  ctx.strokeStyle = '#847b60'; ctx.lineWidth = 7; ctx.strokeRect(wall.x - 4, wall.y - 4, wall.w + 8, wall.h + 8);
  const layers = state.scene === 'search' ? 3 : state.bricks;
  for (let layer = 0; layer < layers; layer++) for (let i = 0; i < 12; i++) drawBrick(brickRect(layer, i));
  if (brickAnimation) for (let i = 0; i < 12; i++) {
    const p = clamp(brickAnimation.p * 1.4 - i * .033, 0, 1), b = brickRect(brickAnimation.layer, i); if (!p) continue;
    const q = ease(p); drawBrick({ ...b, x: lerp(458, b.x, q), y: lerp(574, b.y, q) - Math.sin(q * Math.PI) * 50 }, p);
  }
  if (plaster > 0) {
    ctx.save(); ctx.beginPath(); ctx.rect(wall.x - 7, wall.y - 7, wall.w + 14, (wall.h + 14) * plaster); ctx.clip();
    ctx.fillStyle = '#afa486'; ctx.fillRect(wall.x - 7, wall.y - 7, wall.w + 14, wall.h + 14);
    ctx.strokeStyle = '#484b3638'; ctx.lineWidth = .7; for (let i = 0; i < 140; i++) { const x = wall.x + Math.abs(noise(i)) * wall.w, y = wall.y + Math.abs(noise(i + 523)) * wall.h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y - 8); ctx.stroke(); } ctx.restore();
  }
  if (crack > 0) {
    ctx.strokeStyle = '#22261e'; ctx.lineWidth = 2 + crack * 4; ctx.beginPath(); ctx.moveTo(670, 295); ctx.lineTo(655, 345); ctx.lineTo(684, 374); ctx.lineTo(642, 421); ctx.lineTo(667, 463); ctx.lineTo(633, 534); ctx.stroke();
    if (crack > .55) { ctx.globalAlpha = (crack - .55) / .45; ctx.fillStyle = '#1c211b'; ctx.beginPath(); ctx.ellipse(667, 463, 53, 75, .17, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    for (let i = 0; i < 14; i++) { const f = clamp((falling - i * .025) * 1.8, 0, 1), x = 620 + (i % 4) * 28 + Math.sin(i) * f * 45, y = lerp(400 + Math.floor(i / 4) * 23, 588 + (i % 3) * 7, f); ctx.save(); ctx.translate(x, y); ctx.rotate(f * (i - 5)); drawBrick({ x: -13, y: -7, w: 27, h: 15 }); ctx.restore(); }
  }
  if (state.scene === 'cellar' && state.step === 'prepare' && state.bricks < 3) {
    for (let i = 0; i < 7; i++) drawBrick({ x: 440 + i % 3 * 33, y: 584 - Math.floor(i / 3) * 15, w: 31, h: 13 });
  }
  ctx.restore();
}
function render() {
  const bg = readyImage(state.scene) || readyImage('home');
  ctx.clearRect(0, 0, W, H); if (bg) ctx.drawImage(bg, 0, 0, W, H); else { ctx.fillStyle = '#bbb08e'; ctx.fillRect(0, 0, W, H); }
  if (state.scene === 'fire') drawFire();
  drawDoor(); drawWall(); drawAsh();
  if (state.scene === 'home') drawBowl();
  const y = floors[state.scene];
  if (['home', 'fire'].includes(state.scene) || (state.scene === 'cellar' && ['lamp', 'stairs'].includes(state.step))) drawActor('wife', wife, state.scene === 'home' ? 579 : y - 4, state.scene === 'home' ? 190 : 210);
  drawActor('hero', hero, y, 225);
  if (state.scene === 'search') drawActor('inspector', inspector, y - 9, 225);
  drawCat(); drawLantern();
  if (destination) { ctx.save(); ctx.strokeStyle = '#efd28b'; ctx.globalAlpha = .65; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(destination.x, destination.y + 2, 15 + Math.sin(sceneTime * 7) * 2, 5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  if (blackout > 0) { ctx.fillStyle = `rgba(15,17,13,${blackout})`; ctx.fillRect(0, 0, W, H); }
  for (const { button, target: t } of targetNodes) {
    if (t.id === 'cat') { button.style.left = `${cat.x / W * 100}%`; button.style.top = `${(cat.y - 43) / H * 100}%`; }
  }
}
function clock() {
  const now = performance.now(); const delta = Math.max(0, (now - lastTime) / 1000); lastTime = now;
  if (paused || document.hidden) { render(); return; }
  const dt = Math.min(delta, 20); sceneTime += dt;
  if (animation) {
    const a = animation; a.elapsed += dt; const p = Math.min(1, a.elapsed / a.duration);
    a.frame(p); if (p >= 1) { animation = null; a.resolve(); }
  }
  if (cat.follow && cat.visible && !(state.scene === 'tavern' && ['approach', 'choose'].includes(state.step))) {
    const target = clamp(hero.x - hero.face * 82, 145, 1080), distance = target - cat.x;
    if (Math.abs(distance) > 15) { cat.face = Math.sign(distance); cat.x += Math.sign(distance) * Math.min(Math.abs(distance), 290 * dt); cat.walk = 1; } else cat.walk = 0;
    cat.y = floors[state.scene] - 6;
  }
  for (const [actor, height] of [[hero, actorHeights.hero], [wife, state.scene === 'home' ? 190 : actorHeights.wife], [inspector, actorHeights.inspector]]) {
    advanceGait(gaitFor(actor), { x: actor.x, facing: actor.face, dt, height, moving: actor.walk > .02 });
  }
  if (speechUntil && sceneTime >= speechUntil) hideSpeech();
  if (started) $('goal').textContent = currentGoal();
  render();
}
function loop() { clock(); requestAnimationFrame(loop); }
requestAnimationFrame(loop);
// A second real-time wake-up keeps long animations responsive in low-RAF mobile tabs.
setInterval(clock, 120);

Object.defineProperty(window, 'blackcat', { value: Object.freeze({
  snapshot() {
    clock(); return { state: JSON.parse(JSON.stringify(state)), busy, paused, initialized, wiping,
      hero: { ...hero }, cat: { ...cat }, inspector: { ...inspector },
      animation: animation ? { progress: animation.elapsed / animation.duration, label: actionTitle } : null,
      doorOpen, crack, plaster, events: events.map(e => ({ ...e })),
      world: { width: W, height: H, rect: canvas.getBoundingClientRect().toJSON() },
      assets: [...images.entries()].filter(([, v]) => v instanceof HTMLImageElement).map(([key]) => key),
    };
  },
}), writable: false });

$('start').disabled = true; $('start').textContent = '正在拾起记忆…';
Promise.all(['home', 'hero', 'wife', 'cat0', 'cat1', 'cat2'].map(image)).then(() => {
  initialized = true; resetActors(); resize(); render();
  $('start').disabled = false; $('start').innerHTML = '走进这段记忆 <span>→</span>';
  pendingSave = checkpoint(); $('continue').hidden = !pendingSave;
}).catch(e => fatal(e.message));
