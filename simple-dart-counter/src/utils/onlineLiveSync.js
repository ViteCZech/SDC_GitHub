/**
 * Monotónní live sync pro online X01.
 * Chrání před pozdním snapshotem staršího `writeId`, který by přepsal novější lokální stav.
 */

export function nextLiveSeq(localSeq, appliedSeq) {
  const local = Number(localSeq);
  const applied = Number(appliedSeq);
  const a = Number.isFinite(local) ? local : 0;
  const b = Number.isFinite(applied) ? applied : 0;
  return Math.max(a, b) + 1;
}

export function createLiveWriteId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function parseLiveSeq(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {object} params
 * @param {object|null|undefined} params.live
 * @param {string} params.lastPushedWriteId
 * @param {number} params.lastPushedSeq
 * @param {number} params.lastAppliedSeq
 * @returns {{ apply: false, reason: string } | { apply: true, seq: number }}
 */
export function shouldApplyRemoteLive({
  live,
  lastPushedWriteId = '',
  lastPushedSeq = 0,
  lastAppliedSeq = 0,
} = {}) {
  if (!live || live.kind !== 'x01' || !live.gameState) {
    return { apply: false, reason: 'invalid' };
  }
  const remoteWriteId = typeof live.writeId === 'string' ? live.writeId : '';
  if (remoteWriteId && remoteWriteId === lastPushedWriteId) {
    return { apply: false, reason: 'echo' };
  }
  const remoteSeq = parseLiveSeq(live.seq);
  if (remoteSeq > 0) {
    if (remoteSeq <= lastAppliedSeq) {
      return { apply: false, reason: 'stale_applied' };
    }
    if (remoteSeq < lastPushedSeq) {
      return { apply: false, reason: 'stale_inflight' };
    }
  }
  return { apply: true, seq: remoteSeq };
}

export function seqAfterApplyingRemote(remoteSeq, lastAppliedSeq, lastPushedSeq) {
  const remote = parseLiveSeq(remoteSeq);
  const applied = Number(lastAppliedSeq) || 0;
  const pushed = Number(lastPushedSeq) || 0;
  return Math.max(remote, applied, pushed);
}
