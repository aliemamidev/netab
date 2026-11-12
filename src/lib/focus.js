// Pomodoro / focus timer state machine. Pure functions so the service worker,
// the new tab widget and the popup all agree on the same rules.

export const PHASES = ["work", "short", "long"];

export function defaultFocusState() {
  return { phase: "work", status: "idle", endsAt: null, remaining: null, cycle: 0, startedAt: null, updatedAt: Date.now() };
}

export function normalizeFocusState(raw) {
  const base = defaultFocusState();
  if (!raw || typeof raw !== "object") return base;
  return {
    phase: PHASES.includes(raw.phase) ? raw.phase : "work",
    status: ["idle", "running", "paused"].includes(raw.status) ? raw.status : "idle",
    endsAt: Number.isFinite(raw.endsAt) ? raw.endsAt : null,
    remaining: Number.isFinite(raw.remaining) ? raw.remaining : null,
    cycle: Number.isFinite(raw.cycle) ? raw.cycle : 0,
    startedAt: Number.isFinite(raw.startedAt) ? raw.startedAt : null,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

export function durationMs(focusSettings, phase) {
  const minutes = Number(focusSettings?.[phase]) || { work: 25, short: 5, long: 15 }[phase];
  return Math.round(minutes * 60_000);
}

export function remainingMs(state, focusSettings, now = Date.now()) {
  if (state.status === "running" && state.endsAt) return Math.max(0, state.endsAt - now);
  if (state.status === "paused" && Number.isFinite(state.remaining)) return state.remaining;
  return durationMs(focusSettings, state.phase);
}

export function progress(state, focusSettings, now = Date.now()) {
  const total = durationMs(focusSettings, state.phase);
  return total ? 1 - remainingMs(state, focusSettings, now) / total : 0;
}

export function start(state, focusSettings, now = Date.now()) {
  if (state.status === "running") return state;
  const remaining = state.status === "paused" && state.remaining ? state.remaining : durationMs(focusSettings, state.phase);
  return { ...state, status: "running", endsAt: now + remaining, remaining: null, startedAt: state.startedAt || now, updatedAt: now };
}

export function pause(state, focusSettings, now = Date.now()) {
  if (state.status !== "running") return state;
  return { ...state, status: "paused", remaining: Math.max(0, (state.endsAt || now) - now), endsAt: null, updatedAt: now };
}

export function toggle(state, focusSettings, now = Date.now()) {
  return state.status === "running" ? pause(state, focusSettings, now) : start(state, focusSettings, now);
}

export function reset(state, focusSettings, now = Date.now()) {
  return { ...state, status: "idle", endsAt: null, remaining: null, startedAt: null, updatedAt: now };
}

export function setPhase(state, phase, now = Date.now()) {
  return { ...defaultFocusState(), cycle: state.cycle, phase, updatedAt: now };
}

export function nextPhase(state, focusSettings) {
  if (state.phase !== "work") return { phase: "work", cycle: state.cycle };
  const cycle = state.cycle + 1;
  const longEvery = Number(focusSettings?.longEvery) || 4;
  return { phase: cycle % longEvery === 0 ? "long" : "short", cycle };
}

/**
 * Finish the current phase (timer ran out or user skipped).
 * Returns { state, finished } where finished is the phase that ended.
 */
export function complete(state, focusSettings, now = Date.now()) {
  const finished = state.phase;
  const { phase, cycle } = nextPhase(state, focusSettings);
  const autoStart = phase === "work" ? Boolean(focusSettings?.autoWork) : Boolean(focusSettings?.autoBreak);
  let next = { ...defaultFocusState(), phase, cycle: phase === "work" && finished === "long" ? 0 : cycle, updatedAt: now };
  if (autoStart) next = start(next, focusSettings, now);
  return { state: next, finished };
}

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function isFocusing(state) {
  return state?.status === "running" && state.phase === "work";
}
