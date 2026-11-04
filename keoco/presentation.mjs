// Presentation only: never change the authoritative round state.
export function finalTension(state, connected, now = Date.now()) {
  const end = Number(state?.endsAt);
  return !!connected && state?.phase === 'pull' && !state.paused && !state.overtime && Number.isFinite(end) && end > now && end - now <= 15000;
}
export function teamStrain(score, side) {
  const red = Math.max(0, Number(score?.red) || 0), blue = Math.max(0, Number(score?.blue) || 0);
  const difference = (red - blue) / Math.max(1, red + blue);
  return 0.5 + (side === 'red' ? -difference : difference) * 0.5;
}
export function smoothRope(current, target, dt, still) {
  return still ? target : current + (target - current) * (1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * 5));
}

// Finish marks describe the result, not an alternate early-win rule.
export function resultWinner(state) {
  if (state?.phase !== 'result') return null;
  const red = Number(state.score?.red) || 0, blue = Number(state.score?.blue) || 0;
  return red > blue ? 'red' : blue > red ? 'blue' : null;
}
export function resultView(state) { return resultWinner(state) || 'court'; }
export function ropeTarget(state) {
  if (state?.phase === 'result') return resultWinner(state) === 'red' ? -2 : resultWinner(state) === 'blue' ? 2 : 0;
  return -Math.max(-1, Math.min(1, Number(state?.position) || 0)) * 1.7;
}
