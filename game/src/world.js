// Midnight Vault's rules and state, with no drawing and no browser in it: the
// thief, the patrolling guards and their vision cones, the sweeping cameras,
// the alarm meter, the three tools and their gem costs, the loot and the
// getaway exit, across three rooms. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react (sounds, screens)
// without the world knowing about screens or sound. Nothing here allocates
// after createWorld returns, except the small tool clouds a step may spawn.

import {
  ALARM, CAMERA, FIELD, GUARD, LEVELS, PLAYER, SCORE, TOOLS,
} from './config.js';

export const EVENT_GEM = 1;
export const EVENT_PICKUP = 2;
export const EVENT_CAUGHT = 4;
export const EVENT_ROOM = 8;
export const EVENT_WIN = 16;
export const EVENT_TOOL = 32;
export const EVENT_DENIED = 64;
export const EVENT_SPOTTED = 128;

/** Tool slots, in the order keys 1/2/3 select them. */
export const TOOL_SMOKE = 0;
export const TOOL_EMP = 1;
export const TOOL_NOISE = 2;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Does the segment (x1,y1)-(x2,y2) touch the axis-aligned rectangle? Slab test. */
function segHitsRect(x1, y1, x2, y2, r) {
  if (pointInRect(x1, y1, r) || pointInRect(x2, y2, r)) return true;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (dx === 0) {
    if (x1 < r.x || x1 > r.x + r.w) return false;
  } else {
    let t1 = (r.x - x1) / dx;
    let t2 = (r.x + r.w - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (dy === 0) {
    if (y1 < r.y || y1 > r.y + r.h) return false;
  } else {
    let t1 = (r.y - y1) / dy;
    let t2 = (r.y + r.h - y1) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

/** Does the segment pass through the circle (a smoke cloud)? */
function segHitsCircle(x1, y1, x2, y2, c) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((c.x - x1) * dx + (c.y - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + dx * t;
  const cy = y1 + dy * t;
  const ddx = c.x - cx;
  const ddy = c.y - cy;
  return ddx * ddx + ddy * ddy < c.r * c.r;
}

function circleHitsRect(px, py, r, rect) {
  const cx = Math.max(rect.x, Math.min(px, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(py, rect.y + rect.h));
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy < r * r;
}

export function createWorld(random) {
  const state = {
    roomIndex: 0,
    room: null,
    solids: [],
    player: { x: 0, y: 0, r: PLAYER.radius, face: 0, sneak: false, moving: false },
    guards: [],
    cameras: [],
    gems: [],
    lootTaken: false,
    smoke: [],
    emp: 0,
    alarm: 0,
    gemsHeld: 0,
    scoreLoot: 0,
    scoreBonus: 0,
    score: 0,
    time: 0,
    roomTime: 0,
    selectedTool: TOOL_SMOKE,
    over: false,
    won: false,
    caught: false,
    seenNow: false,
    spotted: false,
  };

  function loadRoom(index) {
    const level = LEVELS[index];
    state.roomIndex = index;
    state.room = level;
    state.solids = level.walls.concat(level.cases, level.pillars);
    state.player.x = level.start.x;
    state.player.y = level.start.y;
    state.player.face = -Math.PI / 2;
    state.player.sneak = false;
    state.player.moving = false;
    state.guards = level.guards.map((g) => ({
      x: g.waypoints[0][0],
      y: g.waypoints[0][1],
      angle: 0,
      waypoints: g.waypoints,
      wpIndex: 1,
      speed: g.speed,
      detection: 0,
      mode: 'patrol',
      timer: 0,
      tx: 0,
      ty: 0,
    }));
    state.cameras = level.cameras.map((c) => ({
      x: c.x, y: c.y, base: c.base, arc: c.arc, speed: c.speed, range: c.range, angle: c.base,
    }));
    state.gems = level.gems.map(([x, y]) => ({ x, y, taken: false }));
    state.lootTaken = false;
    state.smoke.length = 0;
    state.emp = 0;
    state.roomTime = 0;
  }

  function reset() {
    state.gemsHeld = 0;
    state.scoreLoot = 0;
    state.scoreBonus = 0;
    state.score = 0;
    state.alarm = 0;
    state.time = 0;
    state.over = false;
    state.won = false;
    state.caught = false;
    state.seenNow = false;
    state.spotted = false;
    state.selectedTool = TOOL_SMOKE;
    loadRoom(0);
  }

  function inVent(x, y) {
    for (const v of state.room.vents) if (pointInRect(x, y, v)) return true;
    return false;
  }

  function insideSmoke(x, y) {
    for (const c of state.smoke) {
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy < c.r * c.r) return true;
    }
    return false;
  }

  /** True line of sight: in range, inside the cone, and no wall or smoke in between. */
  function sees(ox, oy, facing, range, half, tx, ty) {
    const dx = tx - ox;
    const dy = ty - oy;
    const d = Math.hypot(dx, dy);
    if (d > range) return false;
    if (d > 1 && Math.abs(angleDiff(Math.atan2(dy, dx), facing)) > half) return false;
    for (const s of state.solids) if (segHitsRect(ox, oy, tx, ty, s)) return false;
    for (const c of state.smoke) if (segHitsCircle(ox, oy, tx, ty, c)) return false;
    return d;
  }

  function pushOutOfSolids(p) {
    for (const s of state.solids) {
      const cx = Math.max(s.x, Math.min(p.x, s.x + s.w));
      const cy = Math.max(s.y, Math.min(p.y, s.y + s.h));
      let dx = p.x - cx;
      let dy = p.y - cy;
      let d2 = dx * dx + dy * dy;
      if (d2 >= p.r * p.r) continue;
      if (d2 === 0) {
        // Centre inside the solid: shove out along the shallowest side.
        const left = p.x - s.x;
        const right = s.x + s.w - p.x;
        const top = p.y - s.y;
        const bottom = s.y + s.h - p.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) p.x = s.x - p.r;
        else if (m === right) p.x = s.x + s.w + p.r;
        else if (m === top) p.y = s.y - p.r;
        else p.y = s.y + s.h + p.r;
        continue;
      }
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      p.x = cx + dx * p.r;
      p.y = cy + dy * p.r;
    }
  }

  function movePlayer(dt, mx, my, sneak) {
    const p = state.player;
    p.sneak = sneak;
    const len = Math.hypot(mx, my);
    p.moving = len > 0;
    if (!p.moving) return;
    const nx = mx / len;
    const ny = my / len;
    p.face = Math.atan2(ny, nx);
    let speed = sneak ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
    if (inVent(p.x, p.y)) speed *= PLAYER.ventSpeed;
    p.x += nx * speed * dt;
    pushOutOfSolids(p);
    p.y += ny * speed * dt;
    pushOutOfSolids(p);
    p.x = Math.max(0, Math.min(FIELD.width, p.x));
    p.y = Math.max(FIELD.hudHeight, Math.min(FIELD.height, p.y));
  }

  function moveGuard(g, dt, tx, ty, speed) {
    const dx = tx - g.x;
    const dy = ty - g.y;
    const d = Math.hypot(dx, dy);
    if (d < 4) return true;
    const stepLen = Math.min(d, speed * dt);
    g.x += (dx / d) * stepLen;
    g.y += (dy / d) * stepLen;
    g.angle = Math.atan2(dy, dx);
    return d - stepLen < 4;
  }

  function useTool(target) {
    const tool = state.selectedTool;
    if (tool === TOOL_SMOKE) {
      if (state.gemsHeld < TOOLS.list[TOOL_SMOKE].cost) return EVENT_DENIED;
      state.gemsHeld -= TOOLS.list[TOOL_SMOKE].cost;
      state.smoke.push({ x: state.player.x, y: state.player.y, r: TOOLS.smokeRadius, t: TOOLS.smokeSeconds });
      return EVENT_TOOL;
    }
    if (tool === TOOL_EMP) {
      if (state.gemsHeld < TOOLS.list[TOOL_EMP].cost) return EVENT_DENIED;
      state.gemsHeld -= TOOLS.list[TOOL_EMP].cost;
      state.emp = TOOLS.empSeconds;
      return EVENT_TOOL;
    }
    if (state.gemsHeld < TOOLS.list[TOOL_NOISE].cost) return EVENT_DENIED;
    state.gemsHeld -= TOOLS.list[TOOL_NOISE].cost;
    let tx;
    let ty;
    if (target) {
      tx = target.x;
      ty = target.y;
    } else {
      tx = state.player.x + Math.cos(state.player.face) * 170;
      ty = state.player.y + Math.sin(state.player.face) * 170;
    }
    let nearest = null;
    let nearestD = Infinity;
    for (const g of state.guards) {
      if (g.mode === 'chase') continue;
      const d = Math.hypot(g.x - tx, g.y - ty);
      if (d < nearestD) {
        nearestD = d;
        nearest = g;
      }
    }
    if (nearest) {
      nearest.mode = 'investigate';
      nearest.tx = tx;
      nearest.ty = ty;
      nearest.timer = GUARD.investigateSeconds;
    }
    return EVENT_TOOL;
  }

  function clearRoom() {
    const bonus = Math.max(0, state.room.par - state.roomTime) * SCORE.timeBonusPerSecond;
    state.scoreBonus += Math.round(bonus);
    state.score = state.scoreLoot + state.scoreBonus;
    if (state.roomIndex >= LEVELS.length - 1) {
      state.won = true;
      state.over = true;
      state.score = Math.max(0, state.scoreLoot + state.scoreBonus - Math.floor(state.alarm));
      return EVENT_ROOM | EVENT_WIN;
    }
    state.alarm = Math.floor(state.alarm * 0.25);
    loadRoom(state.roomIndex + 1);
    return EVENT_ROOM;
  }

  function catchThief() {
    state.caught = true;
    state.over = true;
    state.score = Math.max(0, state.scoreLoot + state.scoreBonus - Math.floor(state.alarm));
  }

  /**
   * One fixed step. `move` is the steering direction {x, y} (any length, or 0,0).
   * `opts` carries sneak, a one-shot tool use (with an optional click target) and
   * harmless, the title screen's backdrop: guards patrol but nothing can catch.
   */
  function step(dt, move, opts) {
    let events = 0;
    state.time += dt;
    state.roomTime += dt;
    state.seenNow = false;
    state.spotted = false;
    if (state.over) return events;

    // Cameras sweep whether or not anyone is playing.
    for (const c of state.cameras) {
      c.angle = c.base + Math.sin(state.time * c.speed) * (c.arc / 2);
    }

    if (!opts.harmless) {
      movePlayer(dt, move.x, move.y, opts.sneak);
      if (opts.use) events |= useTool(opts.target);
    }

    // Smoke clouds thin out; the EMP countdown runs.
    for (let i = state.smoke.length - 1; i >= 0; i -= 1) {
      state.smoke[i].t -= dt;
      if (state.smoke[i].t <= 0) state.smoke.splice(i, 1);
    }
    if (state.emp > 0) state.emp = Math.max(0, state.emp - dt);

    const p = state.player;
    const hidden = opts.harmless || inVent(p.x, p.y) || insideSmoke(p.x, p.y);
    let anyChase = false;

    for (const g of state.guards) {
      // Patrol, chase and investigate, in that order of business.
      if (g.mode === 'patrol') {
        const wp = g.waypoints[g.wpIndex];
        if (moveGuard(g, dt, wp[0], wp[1], g.speed)) g.wpIndex = (g.wpIndex + 1) % g.waypoints.length;
      } else if (g.mode === 'chase') {
        moveGuard(g, dt, p.x, p.y, g.speed * GUARD.chaseSpeed);
        g.timer -= dt;
        anyChase = true;
        if (g.timer <= 0) {
          g.mode = 'patrol';
          g.detection = 0.35;
        }
      } else {
        if (moveGuard(g, dt, g.tx, g.ty, g.speed * 1.15)) {
          g.timer -= dt;
          if (g.timer <= 0) g.mode = 'patrol';
        }
      }

      if (opts.harmless) continue;

      // Vision: only inside the cone, with true line of sight, counts.
      const range = g.mode === 'chase'
        ? GUARD.range
        : GUARD.range * (p.sneak ? GUARD.sneakRange : 1);
      const d = hidden ? false : sees(g.x, g.y, g.angle, range, GUARD.coneHalf, p.x, p.y);
      if (d !== false) {
        state.seenNow = true;
        g.detection = Math.min(1, g.detection + dt * GUARD.detectRate * (0.55 + 0.65 * (1 - d / range)));
        state.alarm = Math.min(ALARM.max, state.alarm + dt * ALARM.guardRate * (0.7 + 0.6 * (1 - d / range)));
        if (g.detection >= 1 && g.mode !== 'chase') {
          g.mode = 'chase';
          g.timer = GUARD.chaseSeconds;
          state.spotted = true;
          events |= EVENT_SPOTTED;
        }
      } else {
        g.detection = Math.max(0, g.detection - GUARD.detectDecay * dt);
      }

      // Touching a guard is being caught, whatever the guard was doing.
      if (Math.hypot(g.x - p.x, g.y - p.y) < GUARD.touchDistance) {
        catchThief();
        return events | EVENT_CAUGHT;
      }
    }

    if (!opts.harmless) {
      for (const c of state.cameras) {
        if (state.emp > 0) continue;
        const d = hidden ? false : sees(c.x, c.y, c.angle, c.range, CAMERA.coneHalf, p.x, p.y);
        if (d !== false) {
          state.seenNow = true;
          state.alarm = Math.min(ALARM.max, state.alarm + dt * ALARM.cameraRate);
        }
      }
      if (anyChase) state.alarm = Math.min(ALARM.max, state.alarm + dt * ALARM.chaseRate);
      if (!state.seenNow && !anyChase) {
        state.alarm = Math.max(0, state.alarm - dt * ALARM.decayRate);
      }
      if (state.alarm >= ALARM.max) {
        catchThief();
        return events | EVENT_CAUGHT;
      }

      for (const gem of state.gems) {
        if (!gem.taken && Math.hypot(gem.x - p.x, gem.y - p.y) < p.r + 12) {
          gem.taken = true;
          state.gemsHeld += 1;
          events |= EVENT_GEM;
        }
      }

      if (!state.lootTaken && Math.hypot(state.room.loot.x - p.x, state.room.loot.y - p.y) < 34) {
        state.lootTaken = true;
        state.scoreLoot += state.room.loot.value;
        state.score = state.scoreLoot + state.scoreBonus;
        events |= EVENT_PICKUP;
      }

      if (state.lootTaken && pointInRect(p.x, p.y, state.room.exit)) {
        return events | clearRoom();
      }
    }

    return events;
  }

  /** Staging hook for the end screenshot: end the run as caught. */
  function forceCaught() {
    if (!state.over) catchThief();
  }

  reset();
  return { state, reset, step, forceCaught };
}
