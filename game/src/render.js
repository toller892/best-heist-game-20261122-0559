// Drawing only: the renderer paints the world the rules describe and never
// changes it. One canvas, one logical 1280x720 field scaled to the window,
// with the HUD bar on top and a screen overlay (title, paused, caught, win)
// over the room when the game is not in play.

import { ALARM, FIELD, FONT, LEVELS, PALETTE, TOOLS } from './config.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;
export const SCREEN_WIN = 4;

function conePath(ctx, x, y, angle, half, range) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, angle - half, angle + half);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;

  function drawFloor(state) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = PALETTE.floor;
    ctx.fillRect(16, 80, FIELD.width - 32, FIELD.height - 96);
    // Faint floor tiles, so movement reads at a glance.
    ctx.strokeStyle = PALETTE.floorLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 96; x < FIELD.width; x += 80) {
      ctx.moveTo(x, 80);
      ctx.lineTo(x, FIELD.height - 16);
    }
    for (let y = 160; y < FIELD.height; y += 80) {
      ctx.moveTo(16, y);
      ctx.lineTo(FIELD.width - 16, y);
    }
    ctx.stroke();
    // The carpet runner down the central hall: the fast, exposed route.
    ctx.fillStyle = PALETTE.carpet;
    ctx.fillRect(440, 84, 400, 616);
    ctx.strokeStyle = '#2e2a44';
    ctx.strokeRect(440, 84, 400, 616);
    // Vent corridors: dark, grilled, hidden — the slow, safe route.
    for (const v of state.room.vents) {
      ctx.fillStyle = PALETTE.vent;
      ctx.fillRect(v.x, v.y, v.w, v.h);
      ctx.strokeStyle = PALETTE.ventLine;
      ctx.beginPath();
      for (let x = v.x + 14; x < v.x + v.w; x += 28) {
        ctx.moveTo(x, v.y + 6);
        ctx.lineTo(x, v.y + v.h - 6);
      }
      ctx.stroke();
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `600 11px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      // The label sits clear of the exit door, which shares the top vent's corner.
      ctx.fillText('VENT — HIDDEN, SLOW', v.x + 140, v.y + v.h / 2);
    }
  }

  function drawExit(state) {
    const e = state.room.exit;
    const open = state.lootTaken;
    const pulse = open ? 0.5 + 0.5 * Math.sin(state.time * 4) : 0;
    ctx.fillStyle = open ? PALETTE.exit : '#274d36';
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.strokeStyle = open ? PALETTE.exitGlow : '#3a6b4a';
    ctx.lineWidth = 2 + pulse * 2;
    ctx.strokeRect(e.x, e.y, e.w, e.h);
    ctx.fillStyle = open ? '#eafff0' : '#9fc4a8';
    ctx.font = `700 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', e.x + e.w / 2, e.y + e.h / 2 - 6);
    if (!open) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `10px ${FONT}`;
      ctx.fillText('LOCKED', e.x + e.w / 2, e.y + e.h / 2 + 10);
    }
  }

  function drawLoot(state) {
    if (state.lootTaken) return;
    const l = state.room.loot;
    const glow = 26 + 8 * Math.sin(state.time * 3);
    const grad = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, glow + 22);
    grad.addColorStop(0, 'rgba(255, 217, 77, 0.55)');
    grad.addColorStop(1, 'rgba(255, 217, 77, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(l.x, l.y, glow + 22, 0, Math.PI * 2);
    ctx.fill();
    // The Starlight Diamond: a faceted gem, drawn as two triangles.
    ctx.fillStyle = PALETTE.loot;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y - 16);
    ctx.lineTo(l.x + 13, l.y - 2);
    ctx.lineTo(l.x, l.y + 16);
    ctx.lineTo(l.x - 13, l.y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6c9';
    ctx.beginPath();
    ctx.moveTo(l.x, l.y - 16);
    ctx.lineTo(l.x + 13, l.y - 2);
    ctx.lineTo(l.x - 13, l.y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.loot;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('STARLIGHT DIAMOND', l.x, l.y + 32);
  }

  function drawGems(state) {
    for (const g of state.gems) {
      if (g.taken) continue;
      const tw = 0.6 + 0.4 * Math.sin(state.time * 5 + g.x);
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = PALETTE.gem;
      ctx.globalAlpha = tw;
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawSolids(state) {
    for (const w of state.room.walls) {
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = PALETTE.wallTop;
      if (w.h <= 16) ctx.fillRect(w.x, w.y, w.w, 3);
      else ctx.fillRect(w.x, w.y, 3, w.h);
    }
    for (const c of state.room.cases) {
      ctx.fillStyle = PALETTE.caseGlass;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = PALETTE.caseTrim;
      ctx.lineWidth = 3;
      ctx.strokeRect(c.x + 1.5, c.y + 1.5, c.w - 3, c.h - 3);
      ctx.fillStyle = 'rgba(255, 217, 77, 0.85)';
      ctx.beginPath();
      ctx.moveTo(c.x + c.w / 2, c.y + 12);
      ctx.lineTo(c.x + c.w / 2 + 8, c.y + c.h / 2);
      ctx.lineTo(c.x + c.w / 2, c.y + c.h - 12);
      ctx.lineTo(c.x + c.w / 2 - 8, c.y + c.h / 2);
      ctx.closePath();
      ctx.fill();
    }
    for (const p of state.room.pillars) {
      ctx.fillStyle = PALETTE.pillar;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#4a526c';
      ctx.fillRect(p.x + 4, p.y + 4, p.w - 8, 6);
    }
  }

  function drawSmoke(state) {
    for (const c of state.smoke) {
      ctx.fillStyle = PALETTE.smoke;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200, 205, 220, 0.5)';
      ctx.beginPath();
      ctx.arc(c.x - 18, c.y + 10, c.r * 0.45, 0, Math.PI * 2);
      ctx.arc(c.x + 20, c.y - 12, c.r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCones(state) {
    for (const c of state.cameras) {
      if (state.emp > 0) continue;
      ctx.fillStyle = PALETTE.cameraCone;
      conePath(ctx, c.x, c.y, c.angle, 0.5, c.range);
      ctx.fill();
    }
    for (const g of state.guards) {
      const alerted = g.mode === 'chase' || g.detection > 0.5;
      ctx.fillStyle = alerted ? PALETTE.coneAlert : PALETTE.cone;
      conePath(ctx, g.x, g.y, g.angle, 0.62, 235);
      ctx.fill();
    }
  }

  function drawCameras(state) {
    for (const c of state.cameras) {
      const off = state.emp > 0;
      ctx.fillStyle = off ? '#4a4a4a' : PALETTE.cameraBody;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillRect(-4, -8, 22, 16);
      ctx.fillStyle = off ? '#333' : '#ff5a4d';
      ctx.beginPath();
      ctx.arc(18, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (off) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `600 10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('EMP', c.x, c.y + 26);
      }
    }
  }

  function drawGuards(state) {
    for (const g of state.guards) {
      // Detection meter over a guard that is starting to notice the thief.
      if (g.detection > 0.05) {
        ctx.fillStyle = '#20242f';
        ctx.fillRect(g.x - 16, g.y - 30, 32, 5);
        ctx.fillStyle = g.detection > 0.5 ? PALETTE.alarmHigh : PALETTE.alarmMid;
        ctx.fillRect(g.x - 16, g.y - 30, 32 * g.detection, 5);
      }
      ctx.fillStyle = g.mode === 'chase' ? '#e5534b' : PALETTE.guardBody;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g.mode === 'chase' ? '#ff8a80' : PALETTE.guard;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 8, 0, Math.PI * 2);
      ctx.fill();
      // Facing tick: where the guard is looking.
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(g.x + Math.cos(g.angle) * 18, g.y + Math.sin(g.angle) * 18);
      ctx.stroke();
      if (g.mode === 'investigate') {
        ctx.fillStyle = '#ffd94d';
        ctx.font = `700 14px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('?', g.x, g.y - 34);
      }
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    const r = p.sneak ? 10 : p.r;
    // A soft shadow so the thief reads against the dark floor.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.8, r + 3, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.thiefHood;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.thief;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r - 2, 0, Math.PI * 2);
    ctx.fill();
    // Mask band and the direction the thief faces.
    ctx.fillStyle = PALETTE.thiefHood;
    ctx.fillRect(p.x - r + 2, p.y - 3, (r - 2) * 2, 6);
    ctx.strokeStyle = PALETTE.thief;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.face) * (r + 7), p.y + Math.sin(p.face) * (r + 7));
    ctx.stroke();
    if (p.sneak) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `600 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('SNEAKING', p.x, p.y - r - 8);
    }
  }

  function drawHud(state, best, muted) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, FIELD.width, FIELD.hudHeight);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, FIELD.hudHeight - 2, FIELD.width, 2);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText('MIDNIGHT VAULT', 18, 22);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    const level = LEVELS[state.roomIndex];
    ctx.fillText(`${level.name} — Room ${state.roomIndex + 1} of ${LEVELS.length}`, 18, 46);

    // Alarm meter: the one number that decides a caught moment.
    const ax = 330;
    const aw = 250;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText('ALARM', ax, 20);
    ctx.fillStyle = '#0a0c12';
    roundRect(ctx, ax, 30, aw, 18, 4);
    ctx.fill();
    const frac = state.alarm / ALARM.max;
    ctx.fillStyle = frac < 0.4 ? PALETTE.alarmLow : frac < 0.75 ? PALETTE.alarmMid : PALETTE.alarmHigh;
    if (frac > 0) {
      roundRect(ctx, ax, 30, Math.max(8, aw * frac), 18, 4);
      ctx.fill();
    }
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    roundRect(ctx, ax, 30, aw, 18, 4);
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(`${Math.floor(state.alarm)}`, ax + aw + 8, 40);

    // Gems are the currency tools spend.
    ctx.fillStyle = PALETTE.gem;
    ctx.save();
    ctx.translate(640, 40);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(`× ${state.gemsHeld}`, 652, 40);

    // The three tools, with their costs and the selected one lit.
    let tx = 730;
    TOOLS.list.forEach((tool, i) => {
      const selected = state.selectedTool === i;
      const afford = state.gemsHeld >= tool.cost;
      ctx.fillStyle = selected ? '#3a2f10' : '#141824';
      roundRect(ctx, tx, 14, 118, 36, 6);
      ctx.fill();
      ctx.strokeStyle = selected ? PALETTE.loot : PALETTE.panelEdge;
      ctx.lineWidth = selected ? 2 : 1;
      roundRect(ctx, tx, 14, 118, 36, 6);
      ctx.stroke();
      ctx.fillStyle = selected ? PALETTE.loot : afford ? PALETTE.text : PALETTE.muted;
      ctx.font = `700 12px ${FONT}`;
      ctx.fillText(`${tool.key} ${tool.short} · ${tool.cost}◆`, tx + 8, 32);
      tx += 126;
    });

    // Score, best and the loot flag.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(`SCORE ${state.score}`, 1262, 20);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText(`BEST ${best}${muted ? '  ·  MUTED' : ''}`, 1262, 40);
    ctx.fillStyle = state.lootTaken ? PALETTE.loot : PALETTE.muted;
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(state.lootTaken ? '◆ DIAMOND STOLEN' : '◇ STEAL THE DIAMOND', 1262, 57);
    ctx.textAlign = 'left';
  }

  function drawObjective(state) {
    ctx.fillStyle = 'rgba(10, 12, 18, 0.72)';
    ctx.fillRect(0, FIELD.height - 26, FIELD.width, 26);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const msg = state.lootTaken
      ? 'Diamond stolen — reach the green EXIT before the alarm hits 100.'
      : 'Steal the Starlight Diamond, then reach the green EXIT. Shift sneaks. 1/2/3 pick a tool, Space or click uses it.';
    ctx.fillText(msg, FIELD.width / 2, FIELD.height - 13);
    ctx.textAlign = 'left';
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(8, 9, 14, 0.78)';
    ctx.fillRect(0, FIELD.hudHeight, FIELD.width, FIELD.height - FIELD.hudHeight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.font = `800 54px ${FONT}`;
    ctx.fillText(title, FIELD.width / 2, 260);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `16px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, 330 + i * 28);
    });
    ctx.textAlign = 'left';
  }

  function draw(state, screen, best, muted) {
    drawFloor(state);
    drawExit(state);
    drawLoot(state);
    drawGems(state);
    drawSolids(state);
    drawSmoke(state);
    drawCones(state);
    drawCameras(state);
    drawGuards(state);
    drawPlayer(state);
    drawHud(state, best, muted);
    drawObjective(state);

    if (screen === SCREEN_TITLE) {
      overlay('MIDNIGHT VAULT', [
        'A top-down stealth heist in three rooms: Gallery, Vault, Penthouse.',
        'Cross each room, steal the Starlight Diamond, reach the green EXIT.',
        'Guards patrol with vision cones — stay out of the yellow, and red means run.',
        'Cameras sweep the halls. The alarm climbs while anyone sees you; at 100, you are caught.',
        'Gems buy tools: 1 Smoke bomb (2◆), 2 EMP (2◆), 3 Noisemaker (1◆). Shift sneaks.',
        'Vent corridors hide you but slow you down. P pauses, M mutes.',
        '',
        'Press SPACE or click to begin.',
      ], PALETTE.loot);
      if (best > 0) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `14px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`Best getaway so far: ${best}`, FIELD.width / 2, 330 + 8 * 28);
        ctx.textAlign = 'left';
      }
    } else if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['The vault waits. Press P to keep moving.'], PALETTE.text);
    } else if (screen === SCREEN_OVER) {
      overlay('CAUGHT!', [
        state.caught && state.alarm >= ALARM.max
          ? 'The alarm hit 100 — security swarmed the room.'
          : 'A guard got a hand on you.',
        `Score ${state.score}  ·  Best ${Math.max(best, state.score)}`,
        'Press SPACE or click to try the heist again.',
      ], PALETTE.alarmHigh);
    } else if (screen === SCREEN_WIN) {
      overlay('CLEAN GETAWAY!', [
        'All three diamonds, all three rooms — and nobody saw a thing.',
        `Loot ${state.scoreLoot}  +  time bonus ${state.scoreBonus}  −  alarm ${Math.floor(state.alarm)}  =  ${state.score}`,
        `Score ${state.score}  ·  Best ${Math.max(best, state.score)}`,
        'Press SPACE or click to run it again.',
      ], PALETTE.exitGlow);
    }
  }

  return { draw };
}
