// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, caught and clean getaway.
//
// ?seed=N fixes the run. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot. The live game also exposes window.__midnightVault so a
// play-test can read the world without touching it.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_CAUGHT,
  EVENT_DENIED,
  EVENT_GEM,
  EVENT_PICKUP,
  EVENT_ROOM,
  EVENT_SPOTTED,
  EVENT_TOOL,
  EVENT_WIN,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_USE_CLICK,
  ACTION_USE_KEY,
  createInput,
} from './input.js';
import {
  createRenderer,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

// Play-tests (and the curious) can read the world from the console.
window.__midnightVault = world;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, audio.isMuted());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let muted = false;
  let accumulator = 0;
  let last = performance.now();
  // A tool use pressed this frame, stashed by handleActions and spent by the
  // next step: the action queue is read once per frame, never twice.
  let pendingUse = false;
  let pendingClick = null;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Steal the Starlight Diamond, then reach the exit.');
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won
      ? `Clean getaway. Score ${world.state.score}. Best ${best}.`
      : `Caught. Score ${world.state.score}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_GEM) audio.gem();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_TOOL) audio.tool();
    if (events & EVENT_DENIED) audio.denied();
    if (events & EVENT_SPOTTED) audio.spotted();
    if (events & EVENT_ROOM) audio.roomClear();
    if (events & EVENT_WIN) audio.win();
    if (events & EVENT_CAUGHT) audio.caught();
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_CAUGHT) endGame(false);
    else if (events & EVENT_ROOM) announce(`Room cleared. ${world.state.room.name} next.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const picked = input.takeToolSelect();
    if (picked >= 0) world.state.selectedTool = picked;
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    // Space and click both use the selected tool while playing; the click's
    // point is the noisemaker's target, a bare Space throws ahead of the thief.
    pendingUse = Boolean(actions & (ACTION_USE_KEY | ACTION_USE_CLICK));
    pendingClick = pendingUse && (actions & ACTION_USE_CLICK) ? input.takeClick() : null;
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, { sneak: false, use: false, target: null, harmless: true });
      return;
    }
    const events = world.step(STEP, input.direction(), {
      sneak: input.sneak(),
      use: pendingUse,
      target: pendingClick,
      harmless: false,
    });
    pendingUse = false;
    pendingClick = null;
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, muted);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Midnight Vault. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
