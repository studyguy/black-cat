const rigs = {
  hero: {
    sourceFacing: 1, hip: [202, 561], bodyBottom: 653,
    arms: [
      { shoulder: [109, 233], points: [[63, 204], [105, 193], [150, 237], [116, 312], [87, 385], [92, 465], [107, 508], [94, 562], [43, 570], [34, 522], [22, 443], [26, 354], [48, 278]], near: false },
      { shoulder: [268, 278], points: [[254, 252], [284, 264], [307, 330], [336, 382], [366, 427], [390, 448], [388, 495], [365, 516], [340, 491], [321, 448], [284, 414], [258, 357]], near: true },
    ],
    legs: [
      { hip: [162, 611], knee: [110, 718], ankle: [41, 845], foot: [45, 850],
        outline: [[88, 640], [169, 646], [157, 680], [133, 712], [111, 754], [89, 798], [64, 838], [71, 853], [107, 868], [126, 881], [116, 891], [75, 891], [39, 878], [1, 866], [0, 840], [12, 816], [31, 778], [56, 735], [79, 696]],
        shoe: [[3, 828], [33, 834], [49, 850], [75, 860], [100, 871], [124, 879], [125, 887], [110, 894], [75, 891], [40, 878], [1, 867], [0, 845]] },
      { hip: [218, 583], knee: [230, 686], ankle: [286, 864], foot: [291, 869],
        outline: [[191, 590], [248, 591], [266, 642], [271, 696], [281, 749], [299, 801], [320, 850], [344, 872], [383, 874], [398, 883], [391, 894], [362, 901], [310, 907], [271, 898], [251, 875], [237, 839], [219, 792], [203, 742], [189, 702], [173, 661]],
        shoe: [[271, 847], [299, 851], [319, 866], [343, 875], [383, 874], [398, 883], [391, 894], [362, 901], [310, 907], [271, 898], [252, 880]] },
    ],
  },
  inspector: {
    sourceFacing: -1, hip: [202, 577], bodyBottom: 661,
    arms: [
      { shoulder: [167, 257], points: [[137, 244], [172, 249], [190, 307], [155, 359], [119, 401], [77, 439], [48, 472], [37, 506], [22, 509], [9, 487], [19, 459], [49, 425], [78, 387], [107, 336]], near: false },
      { shoulder: [282, 254], points: [[249, 219], [284, 222], [318, 254], [345, 325], [344, 372], [322, 436], [317, 481], [315, 522], [296, 553], [273, 549], [263, 521], [271, 482], [279, 429], [286, 368], [263, 326]], near: true },
    ],
    legs: [
      { hip: [244, 622], knee: [291, 737], ankle: [326, 842], foot: [327, 850],
        outline: [[223, 638], [285, 638], [314, 684], [335, 734], [354, 782], [365, 826], [370, 854], [365, 876], [327, 883], [278, 882], [248, 878], [249, 866], [280, 855], [299, 838], [291, 810], [273, 776], [251, 741], [228, 706], [213, 670]],
        shoe: [[299, 824], [357, 825], [366, 843], [371, 863], [366, 876], [327, 883], [278, 882], [248, 878], [249, 866], [278, 856], [297, 840]] },
      { hip: [160, 625], knee: [126, 721], ankle: [84, 842], foot: [79, 852],
        outline: [[116, 639], [199, 641], [186, 681], [168, 718], [148, 760], [130, 804], [118, 840], [113, 870], [93, 887], [64, 883], [23, 872], [0, 861], [0, 844], [12, 835], [48, 845], [64, 826], [76, 787], [89, 741], [102, 696]],
        shoe: [[67, 824], [118, 833], [115, 859], [112, 875], [92, 887], [64, 883], [23, 872], [0, 861], [0, 844], [12, 835], [48, 845]] },
    ],
  },
  wife: {
    sourceFacing: -1, hip: [211, 565], bodyBottom: 850,
    arms: [
      { shoulder: [206, 210], points: [[193, 180], [242, 178], [273, 206], [286, 266], [283, 329], [268, 397], [260, 464], [249, 517], [220, 536], [199, 520], [203, 486], [223, 435], [230, 370], [229, 301], [204, 252]], near: true },
    ],
    legs: [
      { hip: [247, 646], knee: [301, 742], ankle: [364, 841], foot: [363, 850],
        outline: [[304, 787], [369, 785], [396, 815], [412, 838], [412, 861], [389, 885], [361, 902], [334, 905], [314, 895], [316, 883], [340, 867], [352, 841], [333, 818]],
        shoe: [[353, 816], [384, 807], [407, 828], [414, 849], [407, 868], [389, 885], [361, 902], [334, 905], [314, 895], [316, 883], [340, 867]] },
      { hip: [177, 651], knee: [145, 749], ankle: [107, 864], foot: [103, 872],
        outline: [[76, 790], [142, 794], [144, 836], [145, 868], [151, 889], [141, 903], [93, 906], [43, 898], [29, 889], [39, 878], [68, 876], [86, 858], [86, 824]],
        shoe: [[86, 850], [140, 856], [145, 875], [151, 889], [141, 903], [93, 906], [43, 898], [29, 889], [39, 878], [68, 876]] },
    ],
  },
};

function polygon(ctx, points) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.closePath();
}
function layer(img, points, clip) {
  const surface = document.createElement('canvas'); surface.width = img.width; surface.height = img.height;
  const ctx = surface.getContext('2d'); ctx.save();
  if (points) { polygon(ctx, points); ctx.clip(); }
  if (clip) clip(ctx);
  ctx.drawImage(img, 0, 0); ctx.restore();
  return surface;
}
function cutAt(ctx, a, b, side, overlap = 5) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  const nx = dx / length, ny = dy / length, tx = -ny * 1800, ty = nx * 1800;
  const x = b[0] - nx * overlap * side, y = b[1] - ny * overlap * side;
  polygon(ctx, [[x + tx, y + ty], [x - tx, y - ty], [x - tx + nx * 2400 * side, y - ty + ny * 2400 * side], [x + tx + nx * 2400 * side, y + ty + ny * 2400 * side]]);
  ctx.clip();
}

export function createActorRenderer() {
  const cache = new Map();
  function prepare(name, img) {
    if (cache.has(name)) return cache.get(name);
    const rig = rigs[name];
    const body = layer(img);
    const bodyCtx = body.getContext('2d');
    bodyCtx.clearRect(0, rig.bodyBottom, img.width, img.height - rig.bodyBottom);
    const legs = rig.legs.map(leg => {
      const upper = layer(img, leg.outline, ctx => cutAt(ctx, leg.hip, leg.knee, -1, 7));
      const lower = layer(img, leg.outline, ctx => {
        cutAt(ctx, leg.hip, leg.knee, 1, 7);
        cutAt(ctx, leg.knee, leg.ankle, -1, 7);
      });
      const soleLandmarks = {
        hero: [[[8, 864], [116, 886]], [[270, 896], [390, 894]]],
        inspector: [[[356, 877], [254, 877]], [[106, 882], [8, 860]]],
        wife: [[[394, 860], [328, 898]], [[141, 899], [39, 897]]],
      };
      const [heel, toe] = soleLandmarks[name][rig.legs.indexOf(leg)];
      const shoe = layer(img, leg.shoe);
      const lowerCtx = lower.getContext('2d'); lowerCtx.globalCompositeOperation = 'destination-out'; lowerCtx.drawImage(shoe, 0, 0);
      if (name === 'wife') {
        bodyCtx.globalCompositeOperation = 'destination-out'; bodyCtx.drawImage(shoe, 0, 0);
      }
      return { ...leg, upper, lower, shoe, heel, toe };
    });
    const arms = rig.arms.map(arm => {
      const image = layer(img, arm.points);
      bodyCtx.globalCompositeOperation = 'destination-out'; bodyCtx.drawImage(image, 0, 0);
      return { ...arm, image };
    });
    bodyCtx.globalCompositeOperation = 'source-over';
    const result = { ...rig, img, body, legs, arms }; cache.set(name, result); return result;
  }

  function bone(ctx, img, sourceA, sourceB, a, b, scale) {
    const sourceAngle = Math.atan2(sourceB[1] - sourceA[1], sourceB[0] - sourceA[0]);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const sourceLength = Math.hypot(sourceB[0] - sourceA[0], sourceB[1] - sourceA[1]);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(angle); ctx.scale(length / sourceLength, scale);
    ctx.rotate(-sourceAngle); ctx.drawImage(img, -sourceA[0], -sourceA[1]); ctx.restore();
  }

  function draw(ctx, name, img, actor, pose, height) {
    const p = prepare(name, img), scale = height / img.height;
    const face = actor.face || 1;
    const bodyFace = face * p.sourceFacing;
    const hip = pose.hip;
    const map = point => ({ x: hip.x + (point[0] - p.hip[0]) * scale * bodyFace, y: hip.y + (point[1] - p.hip[1]) * scale });
    const drawLeg = index => {
      const texture = p.legs[index], leg = pose.legs[index];
      // Source leg direction is converted to a canonical forward-facing frame.
      ctx.save(); ctx.translate(hip.x, 0); ctx.scale(face, 1);
      const point = q => ({ x: (q.x - hip.x) * face, y: q.y });
      const sourceHip = [texture.hip[0] * p.sourceFacing, texture.hip[1]];
      const sourceKnee = [texture.knee[0] * p.sourceFacing, texture.knee[1]];
      const sourceAnkle = [texture.ankle[0] * p.sourceFacing, texture.ankle[1]];
      const mirrored = surface => {
        if (p.sourceFacing === 1) return surface;
        if (!surface.mirrored) {
          const c = document.createElement('canvas'); c.width = surface.width; c.height = surface.height;
          const cctx = c.getContext('2d'); cctx.translate(c.width, 0); cctx.scale(-1, 1); cctx.drawImage(surface, 0, 0); surface.mirrored = c;
        }
        return surface.mirrored;
      };
      const originShift = p.sourceFacing === -1 ? img.width : 0;
      const source = q => [q[0] + originShift, q[1]];
      const heel = source([texture.heel[0] * p.sourceFacing, texture.heel[1]]);
      const toe = source([texture.toe[0] * p.sourceFacing, texture.toe[1]]);
      const heelTarget = point(leg.heel), toeTarget = point(leg.toe);
      const sourceAngle = Math.atan2(toe[1] - heel[1], toe[0] - heel[0]);
      const targetAngle = Math.atan2(toeTarget.y - heelTarget.y, toeTarget.x - heelTarget.x);
      const footScale = Math.hypot(toeTarget.x - heelTarget.x, toeTarget.y - heelTarget.y) / Math.hypot(toe[0] - heel[0], toe[1] - heel[1]);
      const ankle = source(sourceAnkle), dx = ankle[0] - heel[0], dy = ankle[1] - heel[1];
      const rotation = targetAngle - sourceAngle;
      const texturedAnkle = { x: heelTarget.x + (dx * Math.cos(rotation) - dy * Math.sin(rotation)) * footScale,
        y: heelTarget.y + (dx * Math.sin(rotation) + dy * Math.cos(rotation)) * footScale };
      if (name !== 'wife') {
        bone(ctx, mirrored(texture.upper), source(sourceHip), source(sourceKnee), point(leg.hip), point(leg.knee), scale);
        bone(ctx, mirrored(texture.lower), source(sourceKnee), source(sourceAnkle), point(leg.knee), texturedAnkle, scale);
      }
      bone(ctx, mirrored(texture.shoe), heel, toe, heelTarget, toeTarget, footScale);
      ctx.restore();
    };
    const drawArm = arm => {
      const shoulder = map(arm.shoulder), swing = pose.armSwing * (arm.near ? -1 : 1);
      ctx.save(); ctx.translate(shoulder.x, shoulder.y); ctx.scale(bodyFace, 1);
      ctx.rotate(swing * p.sourceFacing - (arm.near ? (actor.reach || 0) * 1.02 : 0));
      ctx.drawImage(arm.image, -arm.shoulder[0] * scale, -arm.shoulder[1] * scale, img.width * scale, img.height * scale); ctx.restore();
    };
    ctx.save(); ctx.globalAlpha = actor.opacity;
    drawLeg(0);
    for (const arm of p.arms.filter(arm => !arm.near)) drawArm(arm);
    if (name !== 'wife') drawLeg(1);
    ctx.save(); ctx.translate(hip.x, hip.y); ctx.scale(bodyFace, 1); ctx.rotate(pose.lean * p.sourceFacing);
    ctx.drawImage(p.body, -p.hip[0] * scale, -p.hip[1] * scale, img.width * scale, img.height * scale); ctx.restore();
    if (name === 'wife') drawLeg(1);
    for (const arm of p.arms.filter(arm => arm.near)) drawArm(arm);
    ctx.restore();
  }
  return { draw };
}
