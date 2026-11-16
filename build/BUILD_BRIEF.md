# Build Brief — 黑猫：墙中之声

## Target and design

- `targetFinish`: playable prototype
- `buildStage`: production prototype
- `buildPath`: custom
- Platform: offline browser game; desktop mouse/keyboard and mobile touch; landscape preferred, portrait supported.
- Runtime: static HTML/CSS/JavaScript, Canvas 2D, Web Audio. No package manager or third-party runtime dependencies.
- Core loop: move through illustrated scenes, approach a marked object, see a character/environment action, and change the next scene or ending.
- Main source of truth: `design/GAME_DESIGN.md`, `design/ART_DIRECTION.md`, and `PRODUCT_BRIEF.md`.

## Run

```sh
python -m http.server 8014 --directory build/app
```

Open `http://127.0.0.1:8014/`. The browser must support JavaScript modules, Canvas 2D, local storage, and optional Web Audio. Do not open the entry page with `file://`.

## Verify

```sh
node build/app/tests/rules.test.mjs
node build/app/tests/locomotion.test.mjs
```

The tests cover state transitions, ending gates, save validation, world-locked stance feet, gait symmetry, IK bone lengths, settling, turns, and frame-rate stability. They do not replace browser end-to-end or device testing.

## Current status and limitations

- The Canvas game and scene assets are a playable prototype, not a release build.
- Some actions and endings have been exercised in a desktop browser. A complete clean-context playthrough for all endings has not been verified.
- Portrait layout was checked in a 390×844 browser viewport; physical iOS/Android devices and mobile browser performance have not been verified.
- Character locomotion is a procedural 2D puppet rig made from single side-view illustrations. It bends at the hip/knee and follows planted/swing foot trajectories, but it is not a full skeletal animation or multi-angle sprite set.
- Generated image model and asset reuse licenses have not been independently audited. No license is granted by this repository.
- The historical text-adventure build, extracted full-text input, raw ComfyUI workflows, private audit logs, and intermediate generations are deliberately excluded from the public repository.
