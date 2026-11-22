// The screenshot scenes behind ?shot=start|play|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot, so the frame is what a short game really looks like and the
// same seed always gives the same frame. The whole room is always in frame
// (1280x720), so the play shot only needs the thief mid-room with the cones,
// cameras, loot and a partly-filled alarm meter all visible at once.

import { ALARM, FIELD, STEP } from './config.js';
import { EVENT_CAUGHT, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 20;
const END_LIMIT_SECONDS = 150;
const LOOKAHEAD = 46;

/**
 * Can the thief's centre actually travel from (x1,y1) to (x2,y2)? The
 * endpoint test alone lies: a point past a wall can look free while the wall
 * stands between, and a point near a wall's top can look blocked while the
 * centre's path passes cleanly over it. The segment test is the honest one,
 * so a step is clear when its endpoint is in bounds, outside every solid,
 * and the centre's path to it crosses no solid.
 */
function stepClear(state, x1, y1, x2, y2) {
  if (x2 < 30 || x2 > FIELD.width - 30 || y2 < FIELD.hudHeight + 14 || y2 > FIELD.height - 30) return false;
  for (const s of state.solids) {
    if (x2 >= s.x && x2 <= s.x + s.w && y2 >= s.y && y2 <= s.y + s.h) return false;
    if (segmentHits(x1, y1, x2, y2, s)) return false;
  }
  return true;
}

/**
 * How dangerous the point (x,y) is right now: 0 when no cone or camera can
 * see it, rising toward 1 as a watcher gets a clear, close look at it.
 */
function dangerAt(state, x, y) {
  let danger = 0;
  const p = state.player;
  const hidden = state.room.vents.some((v) => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h);
  if (hidden) return 0;
  for (const g of state.guards) {
    const dx = x - g.x;
    const dy = y - g.y;
    const d = Math.hypot(dx, dy);
    // A guard's body is dangerous from any side, cone or not: walking into
    // a patrolling guard from behind is still being caught.
    if (d < 70) danger = Math.max(danger, 1.3 - d / 70);
    if (d > 235) continue;
    let a = Math.atan2(dy, dx) - g.angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    if (Math.abs(a) > 0.62) continue;
    let seen = true;
    for (const s of state.solids) {
      if (segmentHits(g.x, g.y, x, y, s)) { seen = false; break; }
    }
    if (seen) danger = Math.max(danger, 1 - d / 235);
  }
  for (const c of state.cameras) {
    if (state.emp > 0) continue;
    const dx = x - c.x;
    const dy = y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > c.range) continue;
    let a = Math.atan2(dy, dx) - c.angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    if (Math.abs(a) > 0.5) continue;
    let seen = true;
    for (const s of state.solids) {
      if (segmentHits(c.x, c.y, x, y, s)) { seen = false; break; }
    }
    if (seen) danger = Math.max(danger, 0.8 * (1 - d / c.range));
  }
  return danger;
}

function segmentHits(x1, y1, x2, y2, r) {
  if (x1 >= r.x && x1 <= r.x + r.w && y1 >= r.y && y1 <= r.y + r.h) return true;
  if (x2 >= r.x && x2 <= r.x + r.w && y2 >= r.y && y2 <= r.y + r.h) return true;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  const axes = [
    [dx, r.x - x1, r.x + r.w - x1],
    [dy, r.y - y1, r.y + r.h - y1],
  ];
  for (const [d, lo, hi] of axes) {
    if (d === 0) {
      if (lo > 0 || hi < 0) return false;
    } else {
      let t1 = lo / d;
      let t2 = hi / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707],
];

/** The route planner's grid: one cell is a thief's stride and a bit. */
const CELL = 40;
const COLS = Math.ceil(FIELD.width / CELL);
const ROWS = Math.ceil(FIELD.height / CELL);

function cellWalkable(state, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
  const x = cx * CELL + CELL / 2;
  const y = cy * CELL + CELL / 2;
  if (y < FIELD.hudHeight + CELL / 2) return false;
  for (const s of state.solids) {
    if (x > s.x - 15 && x < s.x + s.w + 15 && y > s.y - 15 && y < s.y + s.h + 15) return false;
  }
  return true;
}

/**
 * What one cell costs to cross. The vent corridors are cheap: they hide the
 * thief, so the planned route prefers them. Cells a guard walks through are
 * dear: a patrol's ground is risky even when the guard is elsewhere. The
 * plain floor costs 1.
 */
function cellCost(state, cx, cy) {
  const x = cx * CELL + CELL / 2;
  const y = cy * CELL + CELL / 2;
  if (state.room.vents.some((v) => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h)) return 0.3;
  for (const g of state.guards) {
    for (const [wx, wy] of g.waypoints) {
      if (Math.hypot(x - wx, y - wy) < 110) return 2.2;
    }
  }
  return 1;
}

/**
 * Cheapest route from the thief's cell to the goal's cell, as a list of cell
 * centres (Dijkstra over the grid; 32 by 18 cells, so a plain queue is fast
 * enough). Greedy steering alone cannot leave a walled room (the Vault's
 * diamond sits in a chamber with one door), so the pilot plans the route and
 * then steers along it; null when no route exists and greed takes over.
 */
function planPath(state, goal) {
  const startX = Math.floor(state.player.x / CELL);
  const startY = Math.floor(state.player.y / CELL);
  const goalX = Math.floor(goal.x / CELL);
  const goalY = Math.floor(goal.y / CELL);
  const key = (x, y) => y * COLS + x;
  const dist = new Map();
  const prev = new Map();
  const open = [[0, startX, startY]];
  dist.set(key(startX, startY), 0);
  prev.set(key(startX, startY), null);
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i][0] < open[best][0]) best = i;
    const [d, cx, cy] = open.splice(best, 1)[0];
    if (d > (dist.get(key(cx, cy)) ?? Infinity)) continue;
    if (cx === goalX && cy === goalY) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!cellWalkable(state, nx, ny)) continue;
      const nd = d + cellCost(state, nx, ny);
      const k = key(nx, ny);
      if (nd < (dist.get(k) ?? Infinity)) {
        dist.set(k, nd);
        prev.set(k, [cx, cy]);
        open.push([nd, nx, ny]);
      }
    }
  }
  if (!prev.has(key(goalX, goalY))) return null;
  const cells = [];
  let cur = [goalX, goalY];
  while (cur) {
    cells.push({ x: cur[0] * CELL + CELL / 2, y: cur[1] * CELL + CELL / 2 });
    cur = prev.get(key(cur[0], cur[1]));
  }
  cells.reverse();
  return cells;
}

// The planned route, cached across steps: it is re-planned when the goal
// changes (loot stolen, room cleared) and refreshed as the thief moves.
let cachedPath = null;
let cachedKey = '';
let pathCalls = 0;

/**
 * Steer toward the goal (the loot, then the exit) along the planned route.
 * Each candidate direction is scored by how much danger waits at the end of
 * it minus how much closer it gets to the next route point; the reckless
 * pilot skips the danger term entirely and walks straight into the patrols.
 * `caution` scales how much danger matters.
 */
export function autopilot(state, reckless, caution = 1) {
  const p = state.player;
  const goal = state.lootTaken
    ? { x: state.room.exit.x + state.room.exit.w / 2, y: state.room.exit.y + state.room.exit.h / 2 }
    : state.room.loot;
  // A guard that is chasing, or close to spotting the thief, is fled from at
  // full speed: sneaking away is no faster than the guard closing in. The
  // escape direction is picked from the eight compass ways, so the thief
  // slides along a wall instead of being pinned against it, and stays out
  // of the other watchers' cones while it runs.
  if (!reckless) {
    let threat = null;
    let threatD = Infinity;
    for (const g of state.guards) {
      if (g.mode === 'chase' || g.detection > 0.3) {
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        if (d < threatD) {
          threatD = d;
          threat = g;
        }
      }
    }
    if (threat) {
      let bestDir = null;
      let bestScore = -Infinity;
      for (const [dx, dy] of DIRS) {
        const nx = p.x + dx * 60;
        const ny = p.y + dy * 60;
        if (!stepClear(state, p.x, p.y, nx, ny)) continue;
        const away = (dx * (p.x - threat.x) + dy * (p.y - threat.y)) / (threatD || 1);
        const danger = dangerAt(state, nx, ny);
        const score = away * 100 - danger * 150;
        if (score > bestScore) {
          bestScore = score;
          bestDir = { x: dx, y: dy };
        }
      }
      if (bestDir) return { x: bestDir.x, y: bestDir.y, sneak: false };
    }
  }
  // Follow the planned route: aim at the first route point more than a cell
  // ahead of the thief, so the pilot cuts corners instead of hugging cells.
  const goalKey = `${state.roomIndex}:${state.lootTaken}:${Math.round(goal.x)},${Math.round(goal.y)}`;
  pathCalls += 1;
  if (goalKey !== cachedKey || pathCalls % 45 === 0 || !cachedPath) {
    cachedPath = planPath(state, goal);
    cachedKey = goalKey;
  }
  let target = goal;
  if (cachedPath) {
    for (const pt of cachedPath) {
      if (Math.hypot(pt.x - p.x, pt.y - p.y) > CELL) {
        target = pt;
        break;
      }
    }
  }
  const gx = target.x - p.x;
  const gy = target.y - p.y;
  const gl = Math.hypot(gx, gy) || 1;
  let best = { x: 0, y: 0 };
  let bestScore = -Infinity;
  for (const reach of [LOOKAHEAD, 20]) {
    for (const [dx, dy] of DIRS) {
      const nx = p.x + dx * reach;
      const ny = p.y + dy * reach;
      if (!stepClear(state, p.x, p.y, nx, ny)) continue;
      const progress = (dx * gx + dy * gy) / gl;
      const danger = reckless ? 0 : dangerAt(state, nx, ny);
      const score = progress * 60 - danger * 400 * caution;
      if (score > bestScore) {
        bestScore = score;
        best = { x: dx, y: dy };
      }
    }
    if (bestScore > -Infinity) break;
  }
  return { x: best.x, y: best.y, sneak: false };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { x: 0, y: 0 }, { sneak: false, use: false, target: null, harmless: true });
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'end') {
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      const move = autopilot(world.state, true);
      const events = world.step(STEP, move, { sneak: false, use: false, target: null, harmless: false });
      if (events & EVENT_CAUGHT) break;
      if (events & EVENT_WIN) break;
    }
    if (!world.state.over) world.forceCaught();
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  // Play: the careful pilot heads for the loot, ducks out of cones, and
  // collects a few gems on the way; the alarm it picks up on the way stays
  // in the frame. If it somehow stayed perfectly hidden, stage the meter at
  // a partly-filled value so the shot still shows what the meter looks like.
  // If the pilot is caught anyway, run it once more, twice as cautious.
  let caught = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    caught = false;
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      const move = autopilot(world.state, false, attempt === 0 ? 1 : 2);
      const events = world.step(STEP, move, { sneak: move.sneak, use: false, target: null, harmless: false });
      if (events & EVENT_CAUGHT) {
        caught = true;
        break;
      }
      if (events & EVENT_WIN) break;
    }
    if (!caught || world.state.over && world.state.won) break;
    if (attempt === 0) world.reset();
  }
  if (world.state.alarm < 15) world.state.alarm = 32;
  const over = world.state.over && !world.state.won;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
