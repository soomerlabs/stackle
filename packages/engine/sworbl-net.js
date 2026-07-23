// sworbl-net.js — the Soomer web client, two layers in one file:
//
//   • SoomerNet   — platform core, deliberately mirroring the KMP SDK (soomer-sdk shared/):
//                   setup({appId, environment}) lifecycle, Environment base URLs,
//                   X-Soomer-Application-ID / X-Soomer-Application-Version headers,
//                   30s timeout, 3× exponential retry on 5xx/408/429/network,
//                   typed errors { kind }. This is the seed of a real Soomer web SDK —
//                   keep it free of anything sworbl-specific.
//   • SworblApi  — the app layer: /sworble/v1/ endpoints, response validation into the
//                   local stub's shape, and a DURABLE write-behind submit queue (web tabs
//                   die mid-request; the mobile SDK has no outbox, web needs one).
//
// Contract with the game: NO raw fetch anywhere else in the client — all remote I/O goes
// through here (same rule the daily-status selector enforces for daily state). Unconfigured
// (no appId), everything degrades to null/false and the game runs fully local.
//
// Backend contract lives in docs/SOOMER_BACKEND_CONTRACT.md — payloads are snake_case
// with trailing-slash paths, per soomer-api conventions.
(function (root) {
  'use strict';

  // The dc runtime executes helmet scripts TWICE — once at document parse, once re-injected
  // into <head> on first render. This module holds MUTABLE config, so the second eval must
  // never replace a possibly-configured instance with a fresh blank one: first eval wins.
  if (root.SoomerNet && root.SworblApi) {
    if (typeof module !== 'undefined' && module.exports) module.exports = { SoomerNet: root.SoomerNet, SworblApi: root.SworblApi };
    return;
  }

  // Environment.baseUrl mirrors soomer-sdk Environment.kt exactly.
  const ENVIRONMENTS = {
    local: 'http://localhost:8000',
    dev: 'https://api.dev.soomerlabs.com',
    prod: 'https://api.soomerlabs.com',
  };
  const DEFAULT_TIMEOUT_MS = 30000; // SDK TimeoutConfig default
  const MAX_ATTEMPTS = 3;           // SDK HttpRequestRetry maxRetries
  const RETRY_STATUSES = new Set([408, 429]); // + all 5xx, per SDK

  function netError(kind, message, status) {
    const e = new Error(message);
    e.kind = kind; // 'network' | 'timeout' | 'http' | 'server' | 'rate_limited' | 'not_configured'
    if (status != null) e.status = status;
    return e;
  }

  // ---- SoomerNet: platform core ---------------------------------------------------
  let cfg = null;
  const SoomerNet = {
    setup(options) {
      const o = options || {};
      if (!o.appId || typeof o.appId !== 'string') throw new Error('SoomerNet.setup: appId is required');
      if (!ENVIRONMENTS[o.environment]) throw new Error('SoomerNet.setup: environment must be one of ' + Object.keys(ENVIRONMENTS).join('/'));
      cfg = {
        appId: o.appId,
        baseUrl: ENVIRONMENTS[o.environment],
        appVersion: o.appVersion || null,
        timeoutMs: o.timeoutMs || DEFAULT_TIMEOUT_MS,
        retryBaseMs: o.retryBaseMs != null ? o.retryBaseMs : 300,
        fetchFn: o.fetchFn || ((...a) => root.fetch(...a)),
      };
    },
    reset() { cfg = null; },
    isConfigured() { return !!cfg; },
    baseUrl() { return cfg ? cfg.baseUrl : null; },
    // fetch + parse JSON with the SDK's network semantics. Throws typed errors; never
    // returns on non-2xx. Paths are relative to the environment base URL.
    async fetchJSON(path, options) {
      if (!cfg) throw netError('not_configured', 'SoomerNet is not configured — call setup() first');
      const o = options || {};
      const url = cfg.baseUrl + path;
      const headers = {
        'Content-Type': 'application/json',
        'X-Soomer-Application-ID': cfg.appId,
      };
      if (cfg.appVersion) headers['X-Soomer-Application-Version'] = cfg.appVersion;
      let lastErr = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), o.timeoutMs || cfg.timeoutMs) : null;
        try {
          const res = await cfg.fetchFn(url, {
            method: o.method || 'GET',
            headers,
            body: o.body != null ? JSON.stringify(o.body) : undefined,
            signal: ac ? ac.signal : undefined,
          });
          if (timer) clearTimeout(timer);
          if (res.status >= 500) { lastErr = netError('server', 'HTTP ' + res.status, res.status); }
          else if (RETRY_STATUSES.has(res.status)) { lastErr = netError(res.status === 429 ? 'rate_limited' : 'http', 'HTTP ' + res.status, res.status); }
          else if (!res.ok) { throw netError('http', 'HTTP ' + res.status, res.status); } // plain 4xx: no retry
          else { return await res.json(); }
        } catch (e) {
          if (timer) clearTimeout(timer);
          if (e && e.kind === 'http' && !RETRY_STATUSES.has(e.status)) throw e; // the no-retry 4xx path
          lastErr = (e && e.name === 'AbortError') ? netError('timeout', 'request timed out')
            : (e && e.kind) ? e : netError('network', String((e && e.message) || e));
        }
        if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, cfg.retryBaseMs * Math.pow(2, attempt - 1)));
      }
      throw lastErr;
    },
  };

  // ---- SworblApi: app endpoints + validation + durable submit queue ---------------
  // QUEUE_KEY reads SworblStore.K.PENDING_SUBMITS directly — single source, no hand-copied
  // literal to drift. Two ways to resolve SworblStore depending on realm:
  //   • Node (tests, or any CommonJS consumer): require() it — Node's module cache means
  //     this returns the EXACT SAME object tests/sworbl-net.test.js gets from its own
  //     require('../sworbl-store.js'), so the two are reference-identical, not just
  //     string-equal.
  //   • browser: read window.SworblStore. index.html's <script src> load order puts
  //     sworbl-store.js BEFORE sworbl-net.js in <helmet> — that order IS the contract this
  //     line leans on (unlike the old hand-copied literal, which deliberately avoided leaning
  //     on load order; now that this reads the store directly, load order is unavoidable and
  //     enforced by that same script ordering).
  const QUEUE_KEY = ((typeof module !== 'undefined' && module.exports)
    ? require('./sworbl-store.js')
    : root.SworblStore).K.PENDING_SUBMITS;
  let app = null; // { storage, playerId }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  // Remote board → the local stub's exact shape ({entries:[{name,score}], me, count}),
  // or null on ANY structural surprise — the caller keeps its local data, never crashes.
  function validateBoard(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.entries)) return null;
    const entries = [];
    for (const e of data.entries) {
      if (!e || typeof e.display_name !== 'string' || !isNum(e.score)) return null;
      entries.push({ name: e.display_name, score: e.score });
    }
    let me = null;
    if (data.me != null) {
      if (typeof data.me !== 'object' || typeof data.me.display_name !== 'string' || !isNum(data.me.score)) return null;
      me = { name: data.me.display_name, score: data.me.score };
      if (isNum(data.me.rank)) me.rank = data.me.rank;
    }
    return { entries, me, count: isNum(data.count) ? data.count : entries.length + (me ? 1 : 0) };
  }

  function readQueue() {
    try { const q = JSON.parse(app.storage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (e) { return []; }
  }
  function writeQueue(q) { try { app.storage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {} }
  function enqueue(payload) {
    // one pending submit per (date, mode): a newer score replaces its predecessor —
    // the server keeps per-player best anyway, and the queue can never grow unbounded
    const q = readQueue().filter(p => !(p.date === payload.date && p.mode === payload.mode));
    q.push(payload);
    writeQueue(q.slice(-14)); // hard cap: two weeks of modes, then oldest drop
  }
  async function postSubmit(payload) {
    await SoomerNet.fetchJSON('/sworble/v1/leaderboard/submit/', { method: 'POST', body: payload });
  }

  const SworblApi = {
    setup(options) {
      const o = options || {};
      if (!o.storage) throw new Error('SworblApi.setup: storage is required');
      app = { storage: o.storage, playerId: o.playerId || null };
    },
    // GET the day's board. null = "no remote data" (unconfigured, offline, bad payload) —
    // the game keeps its local stub. Never throws.
    async fetchBoard(date, mode) {
      if (!app || !SoomerNet.isConfigured()) return null;
      try {
        const qs = '?date=' + encodeURIComponent(date) + '&mode=' + encodeURIComponent(mode || 'puzzle')
          + (app.playerId ? '&player_id=' + encodeURIComponent(app.playerId) : '');
        return validateBoard(await SoomerNet.fetchJSON('/sworble/v1/leaderboard/' + qs));
      } catch (e) { return null; }
    },
    // POST a score with its seven (the proof-of-play the server can verify by replaying
    // the deterministic board). true = delivered; false = queued for a later flush.
    async submitScore(s) {
      if (!app) return false;
      const payload = {
        date: s.date, mode: s.mode || 'puzzle',
        player_id: app.playerId, display_name: s.displayName,
        score: s.score, seven: (s.seven || []).map(w => ({ word: w.word, pts: w.pts })),
      };
      if (SoomerNet.isConfigured()) {
        try { await postSubmit(payload); return true; } catch (e) { /* fall through to queue */ }
      }
      enqueue(payload);
      return false;
    },
    // Re-deliver queued submits (call on boot / tab-visible / before a board fetch).
    // Successes drain; failures stay queued. Never throws.
    async flushQueue() {
      if (!app || !SoomerNet.isConfigured()) return;
      const q = readQueue();
      const still = [];
      for (const payload of q) {
        try { await postSubmit(payload); } catch (e) { still.push(payload); }
      }
      writeQueue(still);
    },
    pendingCount() { return app ? readQueue().length : 0; },
    isReady() { return !!app; }, // callers re-run setup() when false (see netApi in the game)
    QUEUE_KEY, // exposed ONLY so tests/sworbl-net.test.js can assert identity against
    // SworblStore.K.PENDING_SUBMITS directly — not meant as an app-facing API.
  };

  const API = { SoomerNet, SworblApi };
  root.SoomerNet = SoomerNet;
  root.SworblApi = SworblApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
