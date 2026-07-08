// event-bus.js — zero-dependency pub/sub bus for the Velura MR pipeline.
//
// Design notes (see architecture doc for full reasoning):
//  - Fires once per pipeline stage, NOT per render frame. The Renderer's
//    90 FPS loop never touches this bus.
//  - Payloads are deep-frozen plain objects — no GPU handles, no live
//    textures — so the event stream is safely loggable/replayable for
//    future analytics, recording, and collaboration features.
//  - Every event carries a correlationId (one per pipeline run). A new
//    run supersedes an old one; stale events from a superseded run are
//    tagged `stale: true` rather than silently dropped, so a listener
//    (e.g. the orchestrator) can decide whether to ignore them.

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

let runCounter = 0;

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
    this._currentCorrelationId = null;
  }

  beginRun() {
    runCounter += 1;
    this._currentCorrelationId = `run-${runCounter}-${Date.now()}`;
    return this._currentCorrelationId;
  }

  isCurrentRun(correlationId) {
    return correlationId === this._currentCorrelationId;
  }

  emit(type, payload, correlationId) {
    const frozenPayload = deepFreeze(
      payload && typeof payload === 'object' ? { ...payload } : payload
    );
    const event = Object.freeze({
      type,
      correlationId,
      timestamp: Date.now(),
      payload: frozenPayload,
      stale: correlationId != null && !this.isCurrentRun(correlationId),
    });

    const handlers = this._handlers.get(type);
    if (!handlers || handlers.size === 0) return event;

    for (const handler of Array.from(handlers)) {
      handler(event);
    }
    return event;
  }

  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(handler);
    return () => this.off(type, handler);
  }

  once(type, handler) {
    const wrapped = (event) => {
      this.off(type, wrapped);
      handler(event);
    };
    return this.on(type, wrapped);
  }

  off(type, handler) {
    this._handlers.get(type)?.delete(handler);
  }

  clear() {
    this._handlers.clear();
  }
}

export function wireAdapter(bus, inputEvent, outputEvent, errorEvent, fn) {
  bus.on(inputEvent, async (event) => {
    if (event.stale) return;
    try {
      const result = await fn(event.payload);
      bus.emit(outputEvent, result, event.correlationId);
    } catch (err) {
      bus.emit(
        errorEvent,
        { message: err.message, stack: err.stack, sourceEvent: inputEvent },
        event.correlationId
      );
    }
  });
}
