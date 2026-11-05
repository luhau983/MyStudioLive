// Per-viewer season stats (honour only, no prizes). Pure functions; the server persists the object.
export const PRUNE_DAYS = 60;

export function emptySeason(now = Date.now()) { return { startedAt: new Date(now).toISOString(), players: {} }; }

export function recordResult(season, result, now = Date.now()) {
  for (const p of result.players || []) {
    if (typeof p.uniqueId !== 'string' || !p.uniqueId) continue;
    const cur = Object.hasOwn(season.players, p.uniqueId) ? season.players[p.uniqueId] : { nickname: '', rounds: 0, wins: 0, top3: 0, kills: 0, lastSeen: 0 };
    cur.nickname = p.nickname || cur.nickname;
    cur.rounds++;
    if (p.place === 1 && result.winner?.uniqueId === p.uniqueId) cur.wins++;
    if (p.place >= 1 && p.place <= 3) cur.top3++;
    cur.kills += Math.max(0, p.kills | 0);
    cur.lastSeen = now;
    Object.defineProperty(season.players, p.uniqueId, { value: cur, enumerable: true, writable: true, configurable: true });
  }
  return season;
}

export function prune(season, now = Date.now(), days = PRUNE_DAYS) {
  const cutoff = now - days * 86400000;
  for (const [id, p] of Object.entries(season.players)) if (!(p.lastSeen >= cutoff)) delete season.players[id];
  return season;
}

export function leaderboard(season, limit = 5) {
  return Object.entries(season.players)
    .map(([uniqueId, p]) => ({ uniqueId, nickname: p.nickname, wins: p.wins, top3: p.top3, kills: p.kills, rounds: p.rounds }))
    .sort((a, b) => b.wins - a.wins || b.top3 - a.top3 || b.kills - a.kills)
    .slice(0, limit);
}
