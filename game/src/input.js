// Keyboard and pointer input. Held keys give a steering direction; one-shot
// presses (start or restart, pause, mute, use a tool, pick a tool) are queued
// as bit flags and taken once by the loop, so a press between two frames is
// never lost and never counted twice. A click's position is converted to the
// game's 1280x720 logical coordinates at the moment of the click.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_USE_KEY = 8;
export const ACTION_USE_CLICK = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const TOOL_KEYS = new Map([['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]);

export function createInput(canvas) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let sneak = false;
  let actions = 0;
  let toolSelect = -1;
  let clickPoint = null;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (SNEAK.has(event.code)) sneak = true;
    else if (TOOL_KEYS.has(event.code)) {
      if (!event.repeat) toolSelect = TOOL_KEYS.get(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM | ACTION_USE_KEY;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (SNEAK.has(event.code)) sneak = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
    sneak = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    clickPoint = {
      x: ((event.clientX - rect.left) / rect.width) * 1280,
      y: ((event.clientY - rect.top) / rect.height) * 720,
    };
    actions |= ACTION_CONFIRM | ACTION_USE_CLICK;
  });

  return {
    /** Steering direction {x, y}, each component -1, 0 or 1. */
    direction() {
      return {
        x: (right ? 1 : 0) - (left ? 1 : 0),
        y: (down ? 1 : 0) - (up ? 1 : 0),
      };
    },
    sneak() {
      return sneak;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The tool index picked with 1/2/3 since the last call, or -1. */
    takeToolSelect() {
      const picked = toolSelect;
      toolSelect = -1;
      return picked;
    },
    /** The logical point of the last click, or null. */
    takeClick() {
      const point = clickPoint;
      clickPoint = null;
      return point;
    },
  };
}
