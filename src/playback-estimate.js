function estimateTextSeconds(text, speed = 1) {
  const value = String(text || '');
  const han = (value.match(/\p{Script=Han}/gu) || []).length;
  const words = (value.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
  // Local heuristic: 240 Chinese characters or 150 words per minute.
  return (han / 4 + words / 2.5) / (Number(speed) > 0 ? Number(speed) : 1);
}
function estimatePlayback(session, index, time, speed = 1, playbackSpeed = 1) {
  if (!Array.isArray(session?.chunks) || !session.chunks.length || session.kind === 'audio-export') return null;
  const durations = session.chunks.map((text, i) => {
    const measured = session.audioDurations?.[i];
    return Number.isFinite(measured) && measured > 0 ? measured : estimateTextSeconds(text, session.synthesisSpeeds?.[i] || speed);
  });
  index = Math.max(0, Math.min(durations.length - 1, Math.floor(Number(index) || 0)));
  const rate = Number.isFinite(playbackSpeed) && playbackSpeed > 0 ? playbackSpeed : 1;
  return {
    total: durations.reduce((a, b) => a + b, 0) / rate,
    remaining: (Math.max(0, durations[index] - Math.max(0, Number(time) || 0)) + durations.slice(index + 1).reduce((a, b) => a + b, 0)) / rate,
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
module.exports = { estimateTextSeconds, estimatePlayback, formatDuration };
