/**
 * Steam Deck / gamepad controls for hands-free buddy chat while gaming.
 *
 * Back paddles (L4/R4/L5/R5) hold-to-talk; B goes back; Start toggles voice mode.
 * Uses the standard Gamepad API — works in Desktop Mode with a controller connected.
 */

/** Standard Steam Deck button indices in Chromium Desktop Mode. */
export const STEAM_BUTTONS = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SELECT: 8,
  START: 9,
  L3: 10,
  R3: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  L4: 16,
  R4: 17,
  L5: 18,
  R5: 19,
} as const;

/** Back paddles — hold any of these to talk to Buddy while your hands stay on the sticks. */
export const PTT_BUTTONS: number[] = [
  STEAM_BUTTONS.L4,
  STEAM_BUTTONS.R4,
  STEAM_BUTTONS.L5,
  STEAM_BUTTONS.R5,
];

export interface GamepadBindings {
  onPttDown?: () => void;
  onPttUp?: () => void;
}

export interface GamepadNavHandlers {
  onBack?: () => void;
  onVoiceMode?: () => void;
}

const bindingsStack: GamepadBindings[] = [];
let navHandlers: GamepadNavHandlers = {};

let running = false;
let enabled = true;
let rafId = 0;
/** Per-gamepad button pressed state from the previous poll. */
const prevPressed = new Map<number, boolean[]>();
let pttHeld = false;

export function isGamepadSupported(): boolean {
  return typeof navigator !== "undefined" && "getGamepads" in navigator;
}

export function setGamepadEnabled(on: boolean): void {
  enabled = on;
  if (on) startGamepadLoop();
  else stopGamepadLoop();
}

export function pushGamepadBindings(bindings: GamepadBindings): () => void {
  bindingsStack.push(bindings);
  startGamepadLoop();
  return () => {
    const i = bindingsStack.indexOf(bindings);
    if (i >= 0) bindingsStack.splice(i, 1);
    if (bindingsStack.length === 0 && !navHandlers.onBack && !navHandlers.onVoiceMode) {
      stopGamepadLoop();
    }
  };
}

export function setGamepadNavHandlers(handlers: GamepadNavHandlers): () => void {
  navHandlers = handlers;
  startGamepadLoop();
  return () => {
    navHandlers = {};
    if (bindingsStack.length === 0) stopGamepadLoop();
  };
}

function activeBindings(): GamepadBindings | undefined {
  return bindingsStack[bindingsStack.length - 1];
}

function isPressed(gamepad: Gamepad, index: number): boolean {
  const btn = gamepad.buttons[index];
  if (!btn) return false;
  return btn.pressed || btn.value > 0.45;
}

function anyPressed(gamepad: Gamepad, indices: number[]): boolean {
  return indices.some((i) => isPressed(gamepad, i));
}

function poll(): void {
  rafId = 0;
  if (!enabled || !isGamepadSupported()) return;

  const pads = navigator.getGamepads();
  let pttDown = false;

  for (let gi = 0; gi < pads.length; gi++) {
    const gp = pads[gi];
    if (!gp?.connected) continue;

    const prev = prevPressed.get(gi) ?? [];
    const next = gp.buttons.map((b) => b.pressed || b.value > 0.45);

    // Edge-triggered digital actions.
    const rose = (idx: number) => next[idx] && !prev[idx];
    const fell = (idx: number) => !next[idx] && prev[idx];

    if (rose(STEAM_BUTTONS.B)) navHandlers.onBack?.();
    if (rose(STEAM_BUTTONS.START)) navHandlers.onVoiceMode?.();

    if (anyPressed(gp, PTT_BUTTONS)) pttDown = true;

    prevPressed.set(gi, next);

    // Suppress unused vars warning — fell is handy if we add hold-to-repeat later.
    void fell;
  }

  const bindings = activeBindings();
  if (bindings) {
    if (pttDown && !pttHeld) {
      pttHeld = true;
      bindings.onPttDown?.();
    } else if (!pttDown && pttHeld) {
      pttHeld = false;
      bindings.onPttUp?.();
    }
  } else if (!pttDown) {
    pttHeld = false;
  }

  rafId = requestAnimationFrame(poll);
}

function startGamepadLoop(): void {
  if (!enabled || running || !isGamepadSupported()) return;
  running = true;
  if (!rafId) rafId = requestAnimationFrame(poll);
}

function stopGamepadLoop(): void {
  running = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  prevPressed.clear();
  pttHeld = false;
}
