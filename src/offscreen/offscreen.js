// Plays short synthesized chimes for the focus timer (no audio files needed).

export function playChime(kind = "done") {
  const ctx = new AudioContext();
  const notes = kind === "start" ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25, 659.25];
  const now = ctx.currentTime;
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
  setTimeout(() => ctx.close(), 2000);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.target === "offscreen" && message.type === "chime") playChime(message.kind);
  return false;
});
