export const SAVE_KEY = 'blackcat.mobile.v2';
export const SCENES = ['home', 'garden', 'fire', 'ruins', 'tavern', 'cellar', 'search'];

export function freshState() {
  return {
    version: 2, scene: 'home', step: 'feed', x: 330,
    fedCat: false, comfortedWife: false, gentleAtTavern: false,
    catOutside: false, bricks: 0, dust: [], visited: ['home'], ending: null,
  };
}

export function reflection(s) {
  return Number(s.fedCat) + Number(s.comfortedWife) + Number(s.gentleAtTavern);
}

export function outcome(s, action) {
  if (action === 'confess') return reflection(s) >= 2 ? 'confession' : null;
  if (action === 'knock') return s.catOutside ? 'silence' : 'exposed';
  if (action === 'leave') return 'silence';
  return null;
}

const transitions = {
  feed: ['home', 'feed', 'door'],
  garden: ['home', 'door', 'tree', 'garden'],
  remember: ['garden', 'tree', 'escape', 'fire'],
  escape: ['fire', 'escape', 'wipe', 'ruins'],
  reveal: ['ruins', 'wipe', 'street'],
  street: ['ruins', 'street', 'approach', 'tavern'],
  approach: ['tavern', 'approach', 'choose'],
  gentle: ['tavern', 'choose', 'door'],
  hurry: ['tavern', 'choose', 'door'],
  cellar: ['tavern', 'door', 'lamp', 'cellar'],
  lamp: ['cellar', 'lamp', 'stairs'],
  stairs: ['cellar', 'stairs', 'prepare'],
  lead: ['cellar', 'prepare', 'prepare'],
  plaster: ['cellar', 'prepare', 'summon'],
  summon: ['cellar', 'summon', 'inspect', 'search'],
  inspect: ['search', 'inspect', 'decide'],
};

export function commit(s, action) {
  if (s.ending) return false;
  if (action === 'comfort') {
    if (s.scene !== 'home' || s.comfortedWife) return false;
    s.comfortedWife = true;
    return true;
  }
  if (action === 'brick') {
    if (s.scene !== 'cellar' || s.step !== 'prepare' || s.bricks >= 3) return false;
    s.bricks += 1;
    return true;
  }
  if (['knock', 'leave', 'confess'].includes(action)) {
    if (s.scene !== 'search' || s.step !== 'decide') return false;
    const end = outcome(s, action);
    if (!end) return false;
    s.ending = end;
    return true;
  }
  const transition = transitions[action];
  if (!transition || transition[0] !== s.scene || transition[1] !== s.step) return false;
  if (action === 'lead' && (s.bricks !== 0 || s.catOutside)) return false;
  if (action === 'plaster' && s.bricks !== 3) return false;
  s.step = transition[2];
  if (transition[3]) {
    s.scene = transition[3];
    s.x = s.scene === 'search' ? 820 : s.scene === 'cellar' ? 770 : 290;
    if (!s.visited.includes(s.scene)) s.visited.push(s.scene);
  }
  if (action === 'feed') s.fedCat = true;
  if (action === 'gentle') s.gentleAtTavern = true;
  if (action === 'lead') s.catOutside = true;
  return true;
}

const steps = {
  home: ['feed', 'door'], garden: ['tree'], fire: ['escape'],
  ruins: ['wipe', 'street'], tavern: ['approach', 'choose', 'door'],
  cellar: ['lamp', 'stairs', 'prepare', 'summon'], search: ['inspect', 'decide'],
};

export function restoreState(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.version !== 2 || !SCENES.includes(value.scene) || !steps[value.scene].includes(value.step)) return null;
    const s = freshState();
    for (const key of ['fedCat', 'comfortedWife', 'gentleAtTavern', 'catOutside']) s[key] = value[key] === true;
    s.scene = value.scene;
    s.step = value.step;
    s.x = Number.isFinite(value.x) ? Math.max(130, Math.min(1070, value.x)) : 290;
    s.bricks = Number.isInteger(value.bricks) ? Math.max(0, Math.min(3, value.bricks)) : 0;
    s.dust = Array.isArray(value.dust) ? [...new Set(value.dust.filter(n => Number.isInteger(n) && n >= 0 && n < 1600))] : [];
    s.visited = SCENES.filter(scene => Array.isArray(value.visited) && value.visited.includes(scene));
    if (!s.visited.includes(s.scene)) s.visited.push(s.scene);
    s.ending = ['exposed', 'silence', 'confession'].includes(value.ending) ? value.ending : null;
    if (s.scene === 'home' && s.step === 'door' && !s.fedCat) return null;
    if (s.scene === 'cellar' && s.step === 'summon' && s.bricks !== 3) return null;
    if (s.ending && (s.scene !== 'search' || s.step !== 'decide')) return null;
    return s;
  } catch { return null; }
}
