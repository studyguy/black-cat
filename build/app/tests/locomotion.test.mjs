import assert from 'node:assert/strict';
import { advanceGait, createGait, gaitPose } from '../locomotion.js';

const HEIGHT = 160;
const DT = 1 / 60;
const tolerance = (actual, expected, message, epsilon = 1e-5) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: got ${actual}, expected ${expected}`);
};

function step(gait, x, dt = DT, options = {}) {
  advanceGait(gait, { x, facing: options.facing ?? 1, dt, height: HEIGHT, moving: options.moving ?? true });
  return gaitPose(gait, { x, y: 500, height: HEIGHT, crouch: options.crouch ?? 0 });
}

function simulateWalk(rate, seconds = 3) {
  const gait = createGait(0, 1);
  const dt = 1 / rate;
  const frames = Math.round(seconds * rate);
  const speed = 120;
  for (let frame = 1; frame <= frames; frame++) {
    step(gait, speed * frame * dt, dt);
  }
  return { gait, pose: gaitPose(gait, { x: speed * seconds, y: 500, height: HEIGHT }) };
}

const gait = createGait(0, 1);
let x = 0;
const contactAnchors = [[], []];
const previous = [null, null];
let maximumSwingLift = 0;
for (let frame = 1; frame <= 240; frame++) {
  x = 120 * frame * DT;
  const pose = step(gait, x);
  for (let index = 0; index < 2; index++) {
    const leg = pose.legs[index];
    const old = previous[index];
    if (old?.contact && leg.contact) {
      tolerance(leg.ankle.x, old.ankleX, 'a planted ankle stays fixed in world space');
    }
    if (leg.contact && old && !old.contact) contactAnchors[index].push(leg.ankle.x);
    if (!leg.contact) maximumSwingLift = Math.max(maximumSwingLift, 500 - leg.ankle.y);
    tolerance(Math.hypot(leg.knee.x - leg.hip.x, leg.knee.y - leg.hip.y), HEIGHT * 0.20, 'upper leg IK length', 1e-4);
    tolerance(Math.hypot(leg.ankle.x - leg.knee.x, leg.ankle.y - leg.knee.y), HEIGHT * 0.19, 'lower leg IK length', 1e-4);
    previous[index] = { contact: leg.contact, ankleX: leg.ankle.x };
  }
  tolerance((gait.legs[1].phase - gait.legs[0].phase + 1) % 1, 0.5, 'left and right leg phases remain half a cycle apart');
}

assert.ok(maximumSwingLift > HEIGHT * 0.07 && maximumSwingLift < HEIGHT * 0.11, 'swing foot clears the floor without a high-knee march');
assert.ok(contactAnchors.every(anchors => anchors.length >= 3), 'both legs make repeated ground contacts');
const strideDistances = contactAnchors.map(anchors => anchors.slice(1).map((point, index) => point - anchors[index]));
for (const distances of strideDistances) {
  for (const distance of distances) tolerance(distance, distances[0], 'each foot repeats the same world-space stride', 1e-4);
}
const averageStride = distances => distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
tolerance(averageStride(strideDistances[0]), averageStride(strideDistances[1]), 'both legs use the same step size', 1e-4);

const stopping = createGait(0, 1);
let stopX = 0;
for (let frame = 1; frame <= 37; frame++) {
  stopX = frame * 1.8;
  step(stopping, stopX);
}
const stopPose = step(stopping, stopX, DT, { moving: false });
assert.ok(stopPose.legs.some(leg => !leg.contact), 'stopping can begin with a foot still swinging');
for (let frame = 0; frame < 60; frame++) step(stopping, stopX, DT, { moving: false });
const finalPose = gaitPose(stopping, { x: stopX, y: 500, height: HEIGHT });
assert.ok(finalPose.settled, 'stopped gait reaches a settled state');
assert.ok(finalPose.legs.every(leg => leg.contact), 'both feet finish grounded');
for (const leg of finalPose.legs) {
  tolerance(leg.heel.y, 500, 'resting heel touches the ground');
  tolerance(leg.toe.y, 500, 'resting toe touches the ground');
}
assert.ok(Math.abs(finalPose.legs[0].ankle.x - finalPose.legs[1].ankle.x) < HEIGHT * 0.18, 'resting feet return to a narrow stance');

const turning = createGait(0, 1);
let turnX = 0;
for (let frame = 1; frame <= 24; frame++) {
  turnX = frame * 2;
  step(turning, turnX);
}
const beforeTurn = gaitPose(turning, { x: turnX, y: 500, height: HEIGHT });
const afterTurn = step(turning, turnX, DT, { facing: -1 });
for (let index = 0; index < 2; index++) {
  assert.ok(Number.isFinite(afterTurn.legs[index].knee.x) && Number.isFinite(afterTurn.legs[index].knee.y), 'turning keeps IK finite');
  assert.ok(Math.abs(afterTurn.legs[index].ankle.x - beforeTurn.legs[index].ankle.x) < HEIGHT * 0.02, 'turning preserves foot world positions');
}
const teleported = step(turning, turnX + HEIGHT * 4, DT, { facing: -1 });
assert.ok(teleported.legs.every(leg => leg.contact), 'large scene displacement resets to a grounded stance');

const rates = [30, 60, 120].map(rate => simulateWalk(rate));
const reference = rates[1];
for (const result of rates) {
  tolerance(result.gait.legs[0].phase, reference.gait.legs[0].phase, 'leg phase is stable across frame rates', 0.025);
  tolerance(result.gait.legs[1].phase, reference.gait.legs[1].phase, 'opposite leg phase is stable across frame rates', 0.025);
  tolerance(result.pose.speed, reference.pose.speed, 'smoothed speed is stable across frame rates', 0.05);
  for (let index = 0; index < 2; index++) {
    tolerance(result.pose.legs[index].ankle.x, reference.pose.legs[index].ankle.x, 'foot trajectory is stable across frame rates', 1e-4);
  }
}

const paused = createGait(0, 1);
const beforePause = gaitPose(paused, { x: 0, y: 500, height: HEIGHT });
for (let frame = 0; frame < 20; frame++) step(paused, 0, 0, { moving: false });
const afterPause = gaitPose(paused, { x: 0, y: 500, height: HEIGHT });
assert.deepEqual(afterPause, beforePause, 'zero-dt pause leaves the pose unchanged');

console.log('locomotion.test.mjs: PASS (world-locked stance, matched steps, phase, IK, settling, turns, frame rates, pause)');
