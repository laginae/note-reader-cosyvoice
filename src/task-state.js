'use strict';

const PHASE_TRANSITIONS = {
  idle: new Set(['extracting', 'queued']),
  extracting: new Set(['complete', 'error', 'paused', 'playing', 'queued', 'stopping', 'synthesizing']),
  queued: new Set(['complete', 'error', 'extracting', 'paused', 'playing', 'stopping', 'synthesizing']),
  synthesizing: new Set(['complete', 'error', 'extracting', 'paused', 'playing', 'queued', 'stopping']),
  playing: new Set(['complete', 'error', 'extracting', 'paused', 'queued', 'stopping', 'synthesizing']),
  paused: new Set(['error', 'extracting', 'playing', 'queued', 'stopping', 'synthesizing']),
  stopping: new Set(['error', 'idle']),
  complete: new Set(['extracting', 'idle', 'queued', 'stopping']),
  error: new Set(['extracting', 'idle', 'queued', 'stopping']),
};

function createTaskState(sessionId, phase = 'idle') {
  const normalizedPhase = Object.prototype.hasOwnProperty.call(PHASE_TRANSITIONS, phase) ? phase : 'idle';
  return {
    phase: normalizedPhase,
    revision: 0,
    sessionId: Number(sessionId) || 0,
  };
}

function canTransitionTaskState(fromPhase, toPhase) {
  if (fromPhase === toPhase) {
    return true;
  }
  const allowed = PHASE_TRANSITIONS[fromPhase];
  return Boolean(allowed && allowed.has(toPhase));
}

function transitionTaskState(state, nextPhase, sessionId = state && state.sessionId) {
  const current = state || createTaskState(sessionId);
  if (Number(sessionId) !== current.sessionId) {
    return current;
  }
  if (!Object.prototype.hasOwnProperty.call(PHASE_TRANSITIONS, nextPhase)) {
    throw new Error(`Unknown reading task phase: ${nextPhase}`);
  }
  if (!canTransitionTaskState(current.phase, nextPhase)) {
    throw new Error(`Invalid reading task transition: ${current.phase} -> ${nextPhase}`);
  }
  if (current.phase === nextPhase) {
    return current;
  }
  return {
    phase: nextPhase,
    revision: current.revision + 1,
    sessionId: current.sessionId,
  };
}

module.exports = {
  PHASE_TRANSITIONS,
  canTransitionTaskState,
  createTaskState,
  transitionTaskState,
};
