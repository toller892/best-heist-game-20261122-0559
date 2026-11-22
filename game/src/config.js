// Midnight Vault: every tuning number and the three room layouts in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. A room is data: border
// walls, interior walls, display cases and pillars (all solid: they block the
// thief and block sight), vent corridors (hidden, slow), guard patrol loops,
// sweeping wall cameras, scattered gems, the loot and the getaway exit.

export const FIELD = { width: 1280, height: 720, hudHeight: 64 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 205,
  sneakSpeed: 112,
  ventSpeed: 0.55,
};

export const GUARD = {
  radius: 13,
  touchDistance: 26,
  /** Half-angle of a guard's vision cone, in radians. */
  coneHalf: 0.62,
  range: 235,
  /** How much sneaking shrinks the distance a guard can spot the thief at. */
  sneakRange: 0.62,
  /** Detection rises this fast (per second) when the thief is seen, scaled by closeness. */
  detectRate: 1.5,
  detectDecay: 0.6,
  /** Seconds a fully alerted guard chases before giving up. */
  chaseSeconds: 3,
  chaseSpeed: 1.6,
  /** Seconds a guard waits at a noisemaker's landing point. */
  investigateSeconds: 4,
};

export const CAMERA = {
  /** Half-angle of a camera's vision cone, in radians. */
  coneHalf: 0.5,
  range: 285,
};

export const ALARM = {
  /** Per second while any guard is watching the thief. */
  guardRate: 20,
  /** Per second while any camera is watching the thief. */
  cameraRate: 16,
  /** Per second extra while a guard is actively chasing. */
  chaseRate: 6,
  /** Per second the meter cools down while nobody sees the thief. */
  decayRate: 3.5,
  max: 100,
};

export const TOOLS = {
  /** [key, name, short HUD label, cost in gems, blurb] in selection order. */
  list: [
    { key: '1', name: 'Smoke bomb', short: 'Smoke', cost: 2, blurb: '4s vision-blocking cloud' },
    { key: '2', name: 'EMP', short: 'EMP', cost: 2, blurb: 'cameras off 6s' },
    { key: '3', name: 'Noisemaker', short: 'Noise', cost: 1, blurb: 'lures the nearest guard' },
  ],
  smokeSeconds: 4,
  smokeRadius: 72,
  empSeconds: 6,
};

export const SCORE = {
  /** Points per second left on a room's par time when the room is cleared. */
  timeBonusPerSecond: 5,
};

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'midnight-vault.best';

export const PALETTE = {
  backdrop: '#0d0f16',
  floor: '#171a24',
  floorLine: '#1f2331',
  carpet: '#232033',
  wall: '#33394d',
  wallTop: '#454e68',
  caseGlass: '#2b4a5e',
  caseTrim: '#c9a227',
  pillar: '#3a4157',
  vent: '#10131c',
  ventLine: '#262c3d',
  exit: '#2fae5f',
  exitGlow: '#7be2a0',
  loot: '#ffd94d',
  gem: '#7ee7e2',
  thief: '#e8e6df',
  thiefHood: '#2c2f3a',
  guard: '#c94f43',
  guardBody: '#7d2f28',
  cone: 'rgba(242, 201, 76, 0.20)',
  coneAlert: 'rgba(229, 83, 75, 0.30)',
  cameraCone: 'rgba(242, 140, 76, 0.16)',
  cameraBody: '#8a6d3b',
  smoke: 'rgba(160, 165, 180, 0.45)',
  panel: '#1b1f2a',
  panelEdge: '#2e3446',
  text: '#eef1f5',
  muted: '#9aa1b5',
  alarmLow: '#3fbf6f',
  alarmMid: '#e8b23a',
  alarmHigh: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// One wall helper: border walls are shared by every room, so they are built
// here and each room adds its own interior.
function borderWalls() {
  return [
    { x: 0, y: 64, w: 1280, h: 16 },
    { x: 0, y: 704, w: 1280, h: 16 },
    { x: 0, y: 64, w: 16, h: 640 },
    { x: 1264, y: 64, w: 16, h: 640 },
  ];
}

// A guard patrol is a loop of waypoints in open floor; every segment was
// checked against the room's walls and cases so a guard never walks through one.
export const LEVELS = [
  {
    name: 'Gallery',
    sub: 'Room 1 of 3 — the Starlight Diamond is upstairs in the glass case',
    par: 75,
    start: { x: 90, y: 620 },
    loot: { x: 1180, y: 130, value: 500 },
    exit: { x: 48, y: 96, w: 52, h: 64 },
    walls: borderWalls().concat([
      { x: 420, y: 200, w: 16, h: 150 },
      { x: 420, y: 430, w: 16, h: 130 },
      { x: 700, y: 420, w: 170, h: 16 },
      { x: 960, y: 420, w: 140, h: 16 },
    ]),
    cases: [
      { x: 560, y: 170, w: 110, h: 56 },
      { x: 780, y: 170, w: 110, h: 56 },
      { x: 560, y: 560, w: 110, h: 56 },
      { x: 920, y: 560, w: 110, h: 56 },
    ],
    pillars: [
      { x: 640, y: 330, w: 36, h: 36 },
      { x: 1010, y: 290, w: 36, h: 36 },
    ],
    vents: [{ x: 60, y: 84, w: 1160, h: 44 }],
    guards: [
      { waypoints: [[280, 300], [280, 600], [360, 600], [360, 300]], speed: 70 },
      { waypoints: [[900, 200], [1150, 200], [1150, 500], [900, 500]], speed: 75 },
      { waypoints: [[480, 380], [480, 620], [540, 620], [540, 380]], speed: 72 },
    ],
    cameras: [
      { x: 640, y: 80, base: Math.PI / 2, arc: 0.9, speed: 0.5, range: 280 },
      { x: 1248, y: 380, base: Math.PI, arc: 0.8, speed: 0.65, range: 260 },
    ],
    gems: [
      [200, 150], [340, 470], [660, 250], [820, 650],
      [1060, 250], [1150, 650], [500, 106], [1000, 106],
    ],
  },
  {
    name: 'Vault',
    sub: 'Room 2 of 3 — the diamond sits in a walled vault, one door in',
    par: 80,
    start: { x: 90, y: 620 },
    loot: { x: 1180, y: 130, value: 800 },
    exit: { x: 48, y: 96, w: 52, h: 64 },
    walls: borderWalls().concat([
      { x: 420, y: 150, w: 16, h: 200 },
      { x: 420, y: 430, w: 16, h: 200 },
      { x: 620, y: 300, w: 220, h: 16 },
      { x: 920, y: 300, w: 180, h: 16 },
      { x: 1080, y: 80, w: 16, h: 120 },
      { x: 1080, y: 260, w: 16, h: 140 },
      { x: 960, y: 400, w: 304, h: 16 },
    ]),
    cases: [
      { x: 560, y: 150, w: 110, h: 56 },
      { x: 780, y: 150, w: 110, h: 56 },
      { x: 560, y: 500, w: 110, h: 56 },
      { x: 900, y: 500, w: 110, h: 56 },
    ],
    pillars: [
      { x: 640, y: 480, w: 36, h: 36 },
      { x: 1000, y: 180, w: 36, h: 36 },
    ],
    vents: [{ x: 60, y: 640, w: 1160, h: 44 }],
    guards: [
      { waypoints: [[280, 250], [280, 600], [360, 600], [360, 250]], speed: 88 },
      { waypoints: [[700, 470], [1060, 470], [1060, 620], [700, 620]], speed: 92 },
      { waypoints: [[480, 150], [480, 380], [550, 380], [550, 150]], speed: 85 },
    ],
    cameras: [
      { x: 200, y: 80, base: Math.PI / 2, arc: 1.0, speed: 0.6, range: 300 },
      { x: 1248, y: 520, base: Math.PI, arc: 0.9, speed: 0.7, range: 280 },
    ],
    gems: [
      [200, 150], [340, 470], [660, 250], [820, 650],
      [1060, 600], [1150, 250], [500, 662], [1000, 662],
    ],
  },
  {
    name: 'Penthouse',
    sub: 'Room 3 of 3 — the last diamond, the fastest patrols, no room to hide',
    par: 90,
    start: { x: 90, y: 620 },
    loot: { x: 1180, y: 130, value: 1200 },
    exit: { x: 48, y: 96, w: 52, h: 64 },
    walls: borderWalls().concat([
      { x: 360, y: 120, w: 16, h: 220 },
      { x: 360, y: 420, w: 16, h: 220 },
      { x: 860, y: 120, w: 16, h: 220 },
      { x: 860, y: 420, w: 16, h: 220 },
      { x: 500, y: 200, w: 220, h: 16 },
      { x: 800, y: 200, w: 180, h: 16 },
      { x: 500, y: 520, w: 220, h: 16 },
      { x: 800, y: 520, w: 180, h: 16 },
    ]),
    cases: [
      { x: 480, y: 280, w: 110, h: 56 },
      { x: 780, y: 280, w: 110, h: 56 },
      { x: 480, y: 440, w: 110, h: 56 },
      { x: 780, y: 440, w: 110, h: 56 },
    ],
    pillars: [
      { x: 640, y: 120, w: 36, h: 36 },
      { x: 640, y: 600, w: 36, h: 36 },
    ],
    vents: [{ x: 60, y: 84, w: 1160, h: 44 }],
    guards: [
      { waypoints: [[200, 200], [200, 600], [300, 600], [300, 200]], speed: 100 },
      { waypoints: [[940, 140], [1180, 140], [1180, 300], [940, 300]], speed: 105 },
      { waypoints: [[480, 620], [760, 620], [760, 680], [480, 680]], speed: 98 },
    ],
    cameras: [
      { x: 640, y: 80, base: Math.PI / 2, arc: 1.1, speed: 0.8, range: 300 },
      { x: 1248, y: 360, base: Math.PI, arc: 1.0, speed: 0.85, range: 300 },
    ],
    gems: [
      [200, 150], [300, 500], [660, 380], [900, 650],
      [1120, 450], [1150, 200], [500, 106], [1000, 106],
    ],
  },
];
