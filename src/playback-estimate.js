function estimateTextSeconds(text, speed = 1) {
  const value = String(text || '');
  const han = (value.match(/\p{Script=Han}/gu) || []).length;
  const words = (value.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
  // Local heuristic: 240 Chinese characters or 150 words per minute.
  return (han / 4 + words / 2.5) / (Number(speed) > 0 ? Number(speed) : 1);
}
const estimates = new WeakMap();
function invalidateEstimate(session, index) {
  const cached = estimates.get(session);
  if (cached) cached.dirty = Math.min(cached.dirty, index);
}
function estimatePlayback(session, index, time, speed = 1, playbackSpeed = 1) {
  if (!Array.isArray(session?.chunks) || !session.chunks.length || session.kind === 'audio-export') return null;
  let cache = estimates.get(session);
  if (!cache || cache.chunks !== session.chunks) {
    cache = { chunks: session.chunks, base: [], prefix: [0], dirty: 0 };
    estimates.set(session, cache);
  }
  if (cache.speed !== speed || cache.speeds !== session.synthesisSpeeds || cache.measured !== session.audioDurations) cache.dirty = 0;
  cache.speed = speed; cache.speeds = session.synthesisSpeeds; cache.measured = session.audioDurations;
  const length = session.chunks.length, prefix = cache.prefix;
  for (let i = Math.min(cache.dirty, prefix.length - 1); i < length; i++) {
    const measured = cache.measured?.[i];
    const synthRate = Number(cache.speeds?.[i] || speed);
    const seconds = measured > 0 && Number.isFinite(measured) ? measured :
      (cache.base[i] ??= estimateTextSeconds(session.chunks[i])) / (synthRate > 0 ? synthRate : 1);
    prefix[i + 1] = prefix[i] + seconds;
  }
  prefix.length = length + 1; cache.dirty = length;
  index = Math.max(0, Math.min(length - 1, Math.floor(Number(index) || 0)));
  const rate = Number.isFinite(playbackSpeed) && playbackSpeed > 0 ? playbackSpeed : 1;
  return {
    total: prefix[length] / rate,
    remaining: (prefix[length] - Math.min(prefix[index + 1], prefix[index] + Math.max(0, Number(time) || 0))) / rate,
    partial: session.kind === 'pdf-progressive' && !session.productionComplete,
  };
}
function formatDuration(seconds) {
  const n = Math.max(0, Math.ceil(Number(seconds) || 0));
  const hours = Math.floor(n / 3600);
  const minutes = Math.floor((n % 3600) / 60);
  const tail = String(n % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
}
module.exports = { estimateTextSeconds, estimatePlayback, invalidateEstimate, formatDuration };
