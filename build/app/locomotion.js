const DUTY = 0.62;
const UPPER_RATIO = 0.20;
const LOWER_RATIO = 0.19;
const ANKLE_RATIO = 0.035;
const HEEL_RATIO = 0.035;
const TOE_RATIO = 0.105;
const STOP_GRACE = 0.09;
const SPEED_LIMIT = 900;
const EPSILON = 1e-8;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeFacing(value) {
  return finite(value, 1) < 0 ? -1 : 1;
}

function wrapPhase(value) {
  return ((value % 1) + 1) % 1;
}

function smooth01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function sideBias(index, height) {
  return (index === 0 ? -1 : 1) * height * 0.035;
}

function makeLeg(index, x, facing, height) {
  const anchorX = x + facing * sideBias(index, height);
  return {
    index,
    phase: index === 0 ? 0 : 0.5,
    anchorX,
    swingStartX: anchorX,
    swingTargetX: anchorX,
    contact: true,
    settle: null,
  };
}

function clearMotion(gait, x, facing, height) {
  gait.rootX = x;
  gait.lastX = x;
  gait.facing = facing;
  gait.height = height;
  gait.speed = 0;
  gait.cyclePhase = 0;
  gait.lastDirection = facing;
  gait.idleTime = 0;
  gait.motionActive = false;
  gait.legs = [makeLeg(0, x, facing, height), makeLeg(1, x, facing, height)];
  gait.settling = false;
  gait.settled = true;
}

function swingProgress(leg) {
  return clamp((leg.phase - DUTY) / (1 - DUTY), 0, 1);
}

function swingPosition(leg, height) {
  const t = swingProgress(leg);
  return {
    x: leg.swingStartX + (leg.swingTargetX - leg.swingStartX) * smooth01(t),
    lift: height * 0.055 * Math.sin(Math.PI * t) ** 2,
    angle: -0.18 * Math.sin(Math.PI * t) + 0.12 * Math.sin(2 * Math.PI * t),
  };
}

function settlePosition(settle, height) {
  const t = clamp(settle.elapsed / settle.duration, 0, 1);
  const eased = smooth01(t);
  return {
    x: settle.fromX + (settle.toX - settle.fromX) * eased,
    lift: settle.fromLift * (1 - eased) + height * 0.018 * Math.sin(Math.PI * t) ** 2,
    angle: 0.08 * Math.sin(Math.PI * t),
  };
}

function footPosition(leg, height) {
  if (leg.settle) return settlePosition(leg.settle, height);
  if (leg.contact) return { x: leg.anchorX, lift: 0, angle: 0 };
  return swingPosition(leg, height);
}

function strideLength(height, speed) {
  const pace = clamp(speed / (height * 2), 0, 1);
  return height * (0.34 + 0.30 * pace);
}

function advanceLeg(leg, index, oldX, dx, distance, stride, height) {
  const phaseDistance = distance / stride;
  let remaining = phaseDistance;
  let traversed = 0;
  let phase = leg.phase;
  let guard = 0;

  while (remaining > EPSILON && guard++ < 128) {
    const stance = phase < DUTY;
    const boundary = stance ? DUTY : 1;
    const step = Math.min(remaining, boundary - phase);
    phase += step;
    remaining -= step;
    traversed += step;

    if (phase >= boundary - EPSILON) {
      const eventX = oldX + dx * clamp(traversed / phaseDistance, 0, 1);
      if (stance) {
        leg.contact = false;
        leg.swingStartX = leg.anchorX;
        leg.swingTargetX = eventX + Math.sign(dx) * ((1 - DUTY / 2) * stride + sideBias(index, height));
        phase = DUTY;
      } else {
        leg.anchorX = leg.swingTargetX;
        leg.swingStartX = leg.anchorX;
        leg.swingTargetX = leg.anchorX;
        leg.contact = true;
        phase = 0;
      }
    }
  }

  leg.phase = wrapPhase(phase + remaining);
  leg.contact = leg.phase < DUTY && !leg.settle;
}

function startSettling(gait, x, height) {
  for (const leg of gait.legs) {
    if (leg.contact || leg.settle) continue;
    const current = swingPosition(leg, height);
    const toX = x + gait.facing * sideBias(leg.index, height);
    leg.settle = {
      fromX: current.x,
      toX,
      fromLift: current.lift,
      elapsed: 0,
      duration: clamp(0.12 + Math.abs(toX - current.x) / (height * 1.8), 0.12, 0.32),
    };
  }
  gait.settling = gait.legs.some(leg => leg.settle !== null);
}

function resumeSettling(gait, x, direction, height, stride) {
  for (const leg of gait.legs) {
    if (!leg.settle) continue;
    const current = settlePosition(leg.settle, height);
    const t = swingProgress(leg);
    const eased = smooth01(t);
    const remainingDistance = ((1 - t) * (1 - DUTY) + DUTY / 2) * stride;
    const target = x + direction * (remainingDistance + sideBias(leg.index, height));
    leg.swingStartX = eased < 0.95 ? (current.x - eased * target) / (1 - eased) : current.x;
    leg.swingTargetX = target;
    leg.contact = false;
    leg.settle = null;
  }
  gait.settling = false;
}

function updateSettling(gait, dt, height) {
  for (const leg of gait.legs) {
    if (!leg.settle) continue;
    leg.settle.elapsed = Math.min(leg.settle.duration, leg.settle.elapsed + dt);
    if (leg.settle.elapsed >= leg.settle.duration) {
      leg.anchorX = leg.settle.toX;
      leg.swingStartX = leg.anchorX;
      leg.swingTargetX = leg.anchorX;
      leg.phase = 0;
      leg.contact = true;
      leg.settle = null;
    }
  }
  gait.settling = gait.legs.some(leg => leg.settle !== null);
}

function normalizeRestPhases(gait) {
  if (gait.motionActive || gait.settling || gait.legs.some(leg => !leg.contact)) return;
  gait.legs[0].phase = 0;
  gait.legs[1].phase = 0.5;
  if (gait.speed < 5) gait.cyclePhase = 0;
}

function resetForTurn(gait, x, facing, height) {
  const currentFeet = gait.legs.map(leg => footPosition(leg, height));
  gait.rootX = x;
  gait.lastX = x;
  gait.facing = facing;
  gait.height = height;
  gait.speed = 0;
  gait.cyclePhase = 0;
  gait.lastDirection = facing;
  gait.idleTime = 0;
  gait.motionActive = false;
  gait.legs = currentFeet.map((foot, index) => {
    const leg = makeLeg(index, x, facing, height);
    leg.anchorX = foot.x;
    leg.swingStartX = foot.x;
    leg.swingTargetX = foot.x;
    if (foot.lift > height * 0.001) {
      leg.phase = DUTY + (1 - DUTY) * 0.5;
      leg.contact = false;
      leg.settle = {
        fromX: foot.x,
        toX: foot.x,
        fromLift: foot.lift,
        elapsed: 0,
        duration: 0.12,
      };
    }
    return leg;
  });
  gait.settling = gait.legs.some(leg => leg.settle !== null);
  gait.settled = !gait.settling;
}

export function createGait(x, facing = 1) {
  const rootX = finite(x);
  const face = normalizeFacing(facing);
  const gait = {
    rootX,
    lastX: rootX,
    facing: face,
    height: 160,
    speed: 0,
    cyclePhase: 0,
    lastDirection: face,
    idleTime: 0,
    motionActive: false,
    legs: [],
    settling: false,
    settled: true,
  };
  gait.legs = [makeLeg(0, rootX, face, gait.height), makeLeg(1, rootX, face, gait.height)];
  return gait;
}

export function advanceGait(gait, { x, facing = gait?.facing ?? 1, dt, height = gait?.height ?? 160, moving = true } = {}) {
  if (!gait || !Array.isArray(gait.legs) || gait.legs.length !== 2) return gait;

  const nextX = finite(x, gait.lastX);
  const nextFacing = normalizeFacing(facing);
  const h = Math.max(1, finite(height, gait.height || 160));
  const deltaTime = Math.max(0, finite(dt));
  if (deltaTime === 0) return gait;

  if (nextFacing !== gait.facing) {
    resetForTurn(gait, nextX, nextFacing, h);
    return gait;
  }

  const dx = nextX - gait.lastX;
  const jumpLimit = Math.max(h * 2.1, h * 1.2 + Math.min(deltaTime, 0.5) * 850);
  if (Math.abs(dx) > jumpLimit) {
    clearMotion(gait, nextX, nextFacing, h);
    return gait;
  }

  const distance = Math.abs(dx) < 1e-7 ? 0 : Math.abs(dx);
  const rawSpeed = Math.min(SPEED_LIMIT, distance / deltaTime);
  const tau = rawSpeed > gait.speed ? 0.075 : 0.16;
  gait.speed += (rawSpeed - gait.speed) * (1 - Math.exp(-deltaTime / tau));
  gait.height = h;
  gait.rootX = nextX;
  gait.lastX = nextX;

  const wantsToMove = moving !== false;
  let beganSettling = false;
  if (distance > 0) {
    const direction = Math.sign(dx);
    const stride = strideLength(h, rawSpeed);
    if (gait.settling) resumeSettling(gait, nextX - dx, direction, h, stride);
    for (let index = 0; index < gait.legs.length; index++) {
      advanceLeg(gait.legs[index], index, nextX - dx, dx, distance, stride, h);
    }
    gait.cyclePhase = wrapPhase(gait.cyclePhase + distance / stride);
    gait.lastDirection = direction;
    gait.idleTime = 0;
    gait.motionActive = wantsToMove;
    if (!wantsToMove) {
      startSettling(gait, nextX, h);
      beganSettling = gait.settling;
    }
  } else {
    gait.idleTime += deltaTime;
    const staleMotion = gait.motionActive && gait.idleTime >= STOP_GRACE;
    if (!wantsToMove || staleMotion) {
      gait.motionActive = false;
      if (!gait.settling) {
        startSettling(gait, nextX, h);
        beganSettling = gait.settling;
      }
    }
  }

  if (gait.settling && !beganSettling) updateSettling(gait, deltaTime, h);
  normalizeRestPhases(gait);
  const grounded = gait.legs.every(leg => leg.contact && !leg.settle);
  gait.settled = !gait.motionActive && !gait.settling && grounded && gait.speed < 5;
  return gait;
}

function footEndpoints(ankle, groundY, height, facing, angle, contact) {
  if (contact) {
    return {
      heel: { x: ankle.x - facing * height * HEEL_RATIO, y: groundY },
      toe: { x: ankle.x + facing * height * TOE_RATIO, y: groundY },
    };
  }

  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const point = offset => ({
    x: ankle.x + facing * (offset * cosine - height * ANKLE_RATIO * sine),
    y: ankle.y + offset * sine + height * ANKLE_RATIO * cosine,
  });
  return { heel: point(-height * HEEL_RATIO), toe: point(height * TOE_RATIO) };
}

function hipReachInterval(ankles, y, maxReach) {
  let minX = -Infinity;
  let maxX = Infinity;
  for (const ankle of ankles) {
    const vertical = ankle.y - y;
    if (Math.abs(vertical) >= maxReach) return null;
    const horizontal = Math.sqrt(maxReach * maxReach - vertical * vertical);
    minX = Math.max(minX, ankle.x - horizontal);
    maxX = Math.min(maxX, ankle.x + horizontal);
  }
  return minX <= maxX ? { minX, maxX } : null;
}

function fitHip(rootX, baseY, ankles, height) {
  const totalLength = height * (UPPER_RATIO + LOWER_RATIO);
  const maxReach = totalLength - height * 1e-5;
  let y = baseY;
  let interval = hipReachInterval(ankles, y, maxReach);

  if (!interval) {
    const lowerY = baseY + height * 0.18;
    if (hipReachInterval(ankles, lowerY, maxReach)) {
      let low = baseY;
      let high = lowerY;
      for (let i = 0; i < 24; i++) {
        const middle = (low + high) / 2;
        if (hipReachInterval(ankles, middle, maxReach)) high = middle;
        else low = middle;
      }
      y = high;
      interval = hipReachInterval(ankles, y, maxReach);
    } else {
      y = lowerY;
      interval = hipReachInterval(ankles, y, maxReach);
    }
  }

  return {
    x: interval ? clamp(rootX, interval.minX, interval.maxX) : rootX,
    y,
    totalLength,
    maxReach,
  };
}

function solveKnee(hip, ankle, upperLength, lowerLength, facing, maxReach) {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const rawDistance = Math.hypot(dx, dy);
  const minReach = Math.abs(upperLength - lowerLength) + 1e-7;
  const distance = clamp(rawDistance, minReach, maxReach);
  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance) / (2 * distance);
  const bend = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const unitX = dx / (rawDistance || 1);
  const unitY = dy / (rawDistance || 1);
  return {
    x: hip.x + unitX * along + facing * unitY * bend,
    y: hip.y + unitY * along - facing * unitX * bend,
  };
}

export function gaitPose(gait, { x, y, height = gait?.height ?? 160, crouch = 0 } = {}) {
  const h = Math.max(1, finite(height, gait?.height || 160));
  const rootX = finite(x, gait?.rootX ?? 0);
  const groundY = finite(y);
  if (!gait || !Array.isArray(gait.legs) || gait.legs.length !== 2) {
    return {
      hip: { x: rootX, y: groundY - h * 0.42 },
      legs: [],
      bob: 0,
      lean: 0,
      armSwing: 0,
      speed: 0,
      moving: false,
      settled: true,
    };
  }

  const face = normalizeFacing(gait.facing);
  const speed = Math.max(0, finite(gait.speed));
  const intensity = clamp(speed / (h * 1.25), 0, 1);
  const phase = finite(gait.cyclePhase);
  const bob = -h * 0.005 * intensity * Math.sin(Math.PI * phase * 2) ** 2;
  const crouchAmount = clamp(finite(crouch), 0, 1);
  const baseHipY = groundY - h * 0.42 + bob + crouchAmount * h * 0.035;
  const currentFeet = gait.legs.map(leg => footPosition(leg, h));
  const ankleData = gait.legs.map((leg, index) => ({
    x: currentFeet[index].x,
    y: groundY - h * ANKLE_RATIO - currentFeet[index].lift,
  }));
  const fittedHip = fitHip(rootX, baseHipY, ankleData, h);
  const hip = { x: fittedHip.x, y: fittedHip.y };
  const upperLength = h * UPPER_RATIO;
  const lowerLength = h * LOWER_RATIO;

  const legs = gait.legs.map((leg, index) => {
    const ankle = { ...ankleData[index] };
    const contact = leg.contact && !leg.settle;
    const footAngle = contact ? 0 : currentFeet[index].angle;
    const { heel, toe } = footEndpoints(ankle, groundY, h, face, footAngle, contact);
    const knee = solveKnee(hip, ankle, upperLength, lowerLength, face, fittedHip.maxReach);
    return {
      hip: { ...hip },
      knee,
      ankle,
      heel,
      toe,
      contact,
      footAngle,
    };
  });

  const grounded = legs.every(leg => leg.contact);
  const settled = !gait.motionActive && !gait.settling && grounded && speed < 5;
  const lean = clamp((hip.x - rootX) / h * 0.35 + gait.lastDirection * 0.035 * intensity, -0.18, 0.18);
  const armSwing = Math.sin(2 * Math.PI * phase) * 0.32 * intensity;
  return {
    hip,
    legs,
    bob,
    lean,
    armSwing,
    speed,
    moving: gait.motionActive,
    settled,
  };
}
