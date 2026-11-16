import assert from 'node:assert/strict';
import { commit, freshState, outcome, reflection, restoreState } from '../rules.js';

function routeToCellar({ comfort = false, gentle = true, outside = false } = {}) {
  const s = freshState();
  assert.equal(commit(s, 'feed'), true);
  if (comfort) assert.equal(commit(s, 'comfort'), true);
  assert.equal(commit(s, 'garden'), true);
  assert.equal(commit(s, 'remember'), true);
  assert.equal(s.scene, 'fire');
  assert.equal(commit(s, 'escape'), true);
  assert.equal(commit(s, 'reveal'), true);
  assert.equal(commit(s, 'street'), true);
  assert.equal(commit(s, 'approach'), true);
  assert.equal(commit(s, gentle ? 'gentle' : 'hurry'), true);
  assert.equal(commit(s, 'cellar'), true);
  assert.equal(commit(s, 'lamp'), true);
  assert.equal(commit(s, 'stairs'), true);
  if (outside) assert.equal(commit(s, 'lead'), true);
  return s;
}

const base = routeToCellar({ comfort: true });
assert.equal(reflection(base), 3);
assert.equal(base.scene, 'cellar');
assert.equal(base.step, 'prepare');
assert.equal(commit(base, 'plaster'), false, 'cannot plaster before placing all three layers');
assert.equal(commit(base, 'lead'), true);
assert.equal(base.catOutside, true);
for (let i = 0; i < 3; i++) assert.equal(commit(base, 'brick'), true);
assert.equal(commit(base, 'brick'), false, 'only three masonry layers');
assert.equal(commit(base, 'plaster'), true);
assert.equal(commit(base, 'summon'), true);
assert.equal(base.scene, 'search');
assert.equal(commit(base, 'inspect'), true);
assert.equal(base.step, 'decide');
assert.equal(outcome(base, 'confess'), 'confession');
assert.equal(outcome(base, 'knock'), 'silence');
assert.equal(outcome(base, 'leave'), 'silence');
assert.equal(commit(base, 'confess'), true);
assert.equal(base.ending, 'confession');
assert.equal(commit(base, 'leave'), false, 'ending cannot be changed once chosen');

const sealed = routeToCellar({ gentle: false });
for (let i = 0; i < 3; i++) assert.equal(commit(sealed, 'brick'), true);
assert.equal(commit(sealed, 'plaster'), true);
assert.equal(commit(sealed, 'summon'), true);
assert.equal(commit(sealed, 'inspect'), true);
assert.equal(outcome(sealed, 'confess'), null, 'confession requires two reflective acts');
assert.equal(outcome(sealed, 'knock'), 'exposed');
assert.equal(commit(sealed, 'knock'), true);
assert.equal(sealed.ending, 'exposed');

const saved = restoreState(JSON.stringify({ ...base, ending: null, scene: 'cellar', step: 'prepare', bricks: 2, x: 610, dust: [4, 4, -1, 241] }));
assert.equal(saved.scene, 'cellar');
assert.equal(saved.step, 'prepare');
assert.equal(saved.bricks, 2);
assert.equal(saved.x, 610);
assert.deepEqual(saved.dust, [4, 241]);
assert.equal(restoreState({ version: 1, scene: 'home', step: 'feed' }), null, 'v1 saves never migrate silently');
assert.equal(restoreState({ version: 2, scene: 'cellar', step: 'summon', bricks: 2 }), null, 'invalid step and masonry count rejected');
console.log('rules.test.mjs: PASS (transitions, outcomes, restart invariants, exact save restore)');
