// ── tracker.js ─────────────────────────────────────────────────
import { Auth } from './auth.js';
import { DB } from './db.js';

export const Tracker = (() => {
  let topics = [];
  let activeSessions = {}; // topicId → { sessionId, startedAt, clockInTime }
  let breaks = {};          // topicId → { endsAt, interval, pausedSec }
  let statsCache = [];
  let tickTimer = null;

  // ── Init ──────────────────────────────────────────────────────
  async function init() {
    const user = Auth.getUser();
    topics = await DB.getTopics(user.uid);
    statsCache = await DB.getTopicStats(user.uid);

    // Restore any open sessions (e.g. page refresh)
    const open = await DB.getAllOpenSessions(user.uid);
    open.forEach(s => {
      activeSessions[s.topic_id] = {
        sessionId: s.id,
        startedAt: new Date(s.started_at),
        clockInTime: new Date(s.started_at)
      };
    });

    // Flush any pending clock-outs from previous abrupt close
    await flushPendingClockouts(user.uid);

    render();
    startTick();
    updateTodayTotal();

    // Auto clock-out on tab hide / close / laptop shutdown
    const autoClockOutAll = () => {
      const keys = Object.keys(activeSessions);
      if (!keys.length) return;
      keys.forEach(topicId => {
        const sess = activeSessions[topicId];
        if (!sess) return;
        try {
          const pending = JSON.parse(localStorage.getItem('lc_pending_clockouts') || '[]');
          pending.push({
            sessionId: sess.sessionId,
            userId: user.uid,
            topicId,
            startedAt: sess.startedAt.toISOString(),
            endedAt: new Date().toISOString(),
          });
          localStorage.setItem('lc_pending_clockouts', JSON.stringify(pending));
        } catch {}
      });
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') autoClockOutAll();
    });
    window.addEventListener('beforeunload', autoClockOutAll);

    // Init streak
    import('./streak.js').then(m => m.Streak.render(statsCache));
  }

  // ── Flush pending clock-outs from localStorage ────────────────
  async function flushPendingClockouts(userId) {
    try {
      const pending = JSON.parse(localStorage.getItem('lc_pending_clockouts') || '[]');
      if (!pending.length) return;
      const mine = pending.filter(p => p.userId === userId);
      if (!mine.length) return;
      for (const p of mine) {
        try { await DB.endSessionAt(p.sessionId, p.endedAt); } catch {}
      }
      const others = pending.filter(p => p.userId !== userId);
      localStorage.setItem('lc_pending_clockouts', JSON.stringify(others));
      statsCache = await DB.getTopicStats(userId);
    } catch {}
  }

  // ── Render all topic cards ────────────────────────────────────
  function render() {
    const grid = document.getElementById('topic-cards');
    if (!grid) return;
    grid.innerHTML = '';
    if (topics.length === 0) {
      grid.innerHTML = '<p style="color:var(--text3);font-size:14px">No topics yet — add some in <strong>My topics</strong>.</p>';
      return;
    }
    topics.forEach(t => grid.appendChild(buildCard(t)));
    renderLiveSessions();
  }

  // ── Build a single topic card ─────────────────────────────────
  function buildCard(t) {
    const isActive = !!activeSessions[t.id];
    const sessionSec = isActive ? getLiveExtra(t.id) : 0;
    const total = getTotalSec(t.id);
    const today = getTodaySec(t.id);
    const clockInTime = isActive ? fmtTime(activeSessions[t.id].clockInTime) : '—';

    const card = document.createElement('div');
    card.className = 'topic-card' + (isActive ? ' is-active' : '');
    card.id = 'card-' + t.id;
    card.style.setProperty('--card-color', t.color);
    card.innerHTML = `
      <div class="topic-card-accent"></div>

      <div class="topic-card-header">
        <div class="topic-card-name">${esc(t.name)}</div>
        <span class="topic-badge ${isActive ? 'active' : 'idle'}" id="badge-${t.id}">${isActive ? '● Live' : 'Idle'}</span>
      </div>

      <div class="clock-times-row">
        <div class="clock-time-block">
          <div class="clock-time-label"><i class="ti ti-player-play"></i> Clock in</div>
          <div class="clock-time-value" id="clockin-time-${t.id}">${clockInTime}</div>
        </div>
        <div class="clock-time-block">
          <div class="clock-time-label"><i class="ti ti-player-stop"></i> Clock out</div>
          <div class="clock-time-value" id="clockout-time-${t.id}">—</div>
        </div>
      </div>

      <div class="session-timer-block" id="session-block-${t.id}" style="${isActive ? '' : 'display:none'}">
        <div class="session-timer-label">⏱ Session time</div>
        <div class="session-timer-value" id="session-${t.id}">${fmtHMS(sessionSec)}</div>
        <div class="break-buttons">
          <button class="btn-break" id="break5-${t.id}" data-tid="${t.id}" data-min="5">
            <i class="ti ti-coffee"></i> 5 min break
          </button>
          <button class="btn-break" id="break10-${t.id}" data-tid="${t.id}" data-min="10">
            <i class="ti ti-coffee"></i> 10 min break
          </button>
        </div>
        <div class="break-countdown hidden" id="break-${t.id}">
          <i class="ti ti-coffee"></i> Break ends in <strong id="break-timer-${t.id}">00:00</strong>
        </div>
      </div>

      <div class="topic-times">
        <div class="time-block">
          <div class="time-label">Today</div>
          <div class="time-value" id="today-${t.id}">${fmtHMS(today)}</div>
        </div>
        <div class="time-block">
          <div class="time-label">Total</div>
          <div class="time-value" id="total-${t.id}">${fmtHMS(total)}</div>
        </div>
      </div>

      <div class="topic-card-actions">
        <button class="btn-clock-in" id="cin-${t.id}" ${isActive ? 'disabled' : ''}>
          <i class="ti ti-player-play"></i> Clock in
        </button>
        <button class="btn-clock-out" id="cout-${t.id}" ${!isActive ? 'disabled' : ''}>
          <i class="ti ti-player-stop"></i> Clock out
        </button>
      </div>`;

    // Wire up buttons after innerHTML is set
    card.querySelector('#cin-' + t.id).addEventListener('click', () => clockIn(t.id));
    card.querySelector('#cout-' + t.id).addEventListener('click', () => clockOut(t.id));
    card.querySelector('#break5-' + t.id).addEventListener('click', () => startBreak(t.id, 5));
    card.querySelector('#break10-' + t.id).addEventListener('click', () => startBreak(t.id, 10));

    return card;
  }

  // ── Clock in ──────────────────────────────────────────────────
  async function clockIn(topicId) {
    if (activeSessions[topicId]) return;
    const user = Auth.getUser();
    try {
      const sess = await DB.startSession(user.uid, topicId);
      const now = new Date(sess.started_at);
      activeSessions[topicId] = { sessionId: sess.id, startedAt: now, clockInTime: now };

      const card = document.getElementById('card-' + topicId);
      if (card) {
        card.classList.add('is-active');
        card.style.setProperty('--card-color', topics.find(t => t.id === topicId)?.color || '#5b73ff');

        const badge = document.getElementById('badge-' + topicId);
        if (badge) { badge.textContent = '● Live'; badge.className = 'topic-badge active'; }

        const cinBtn = document.getElementById('cin-' + topicId);
        const coutBtn = document.getElementById('cout-' + topicId);
        if (cinBtn) cinBtn.disabled = true;
        if (coutBtn) coutBtn.disabled = false;

        // Show clock-in time
        const cinTime = document.getElementById('clockin-time-' + topicId);
        if (cinTime) cinTime.textContent = fmtTime(now);

        // Reset clock-out time
        const coutTime = document.getElementById('clockout-time-' + topicId);
        if (coutTime) coutTime.textContent = '—';

        // Show session block with break buttons
        const sb = document.getElementById('session-block-' + topicId);
        if (sb) sb.style.display = '';
      }

      renderLiveSessions();
      updateTodayTotal();
      showToast('Clocked in — ' + getTopicName(topicId), 'success');
      import('./streak.js').then(m => m.Streak.render(statsCache));
    } catch (e) { showToast('Error clocking in: ' + e.message, 'error'); }
  }

  // ── Clock out ─────────────────────────────────────────────────
  async function clockOut(topicId) {
    const sess = activeSessions[topicId];
    if (!sess) return;
    clearBreak(topicId);
    try {
      const result = await DB.endSession(sess.sessionId);
      const now = new Date();
      statsCache.push({
        topic_id: topicId,
        duration_seconds: result.duration_seconds,
        started_at: result.started_at
      });
      delete activeSessions[topicId];

      const card = document.getElementById('card-' + topicId);
      if (card) {
        card.classList.remove('is-active');

        const badge = document.getElementById('badge-' + topicId);
        if (badge) { badge.textContent = 'Idle'; badge.className = 'topic-badge idle'; }

        const cinBtn = document.getElementById('cin-' + topicId);
        const coutBtn = document.getElementById('cout-' + topicId);
        if (cinBtn) cinBtn.disabled = false;
        if (coutBtn) coutBtn.disabled = true;

        // Show clock-out time
        const coutTime = document.getElementById('clockout-time-' + topicId);
        if (coutTime) coutTime.textContent = fmtTime(now);

        // Hide session block
        const sb = document.getElementById('session-block-' + topicId);
        if (sb) sb.style.display = 'none';

        // Reset session timer
        const sv = document.getElementById('session-' + topicId);
        if (sv) sv.textContent = fmtHMS(0);

        refreshCardStats(topicId);
      }

      renderLiveSessions();
      updateTodayTotal();
      showToast(`Clocked out — ${getTopicName(topicId)} · ${fmtHMS(result.duration_seconds)} session`, 'info');
      import('./streak.js').then(m => m.Streak.render(statsCache));
    } catch (e) { showToast('Error clocking out: ' + e.message, 'error'); }
  }

  // ── Break timer ───────────────────────────────────────────────
  function startBreak(topicId, minutes) {
    if (!activeSessions[topicId]) return;
    clearBreak(topicId);

    const pausedSec = getLiveExtra(topicId);
    const endsAt = Date.now() + minutes * 60 * 1000;

    // Freeze session clock by recording break start
    activeSessions[topicId].breakStartedAt = Date.now();
    activeSessions[topicId].breakPausedSec = pausedSec;

    const countdown = document.getElementById('break-' + topicId);
    const timerEl = document.getElementById('break-timer-' + topicId);
    if (countdown) countdown.classList.remove('hidden');

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      if (timerEl) timerEl.textContent = fmtMMSS(remaining);
      if (remaining === 0) {
        clearBreak(topicId);
        showToast('Break over! Back to ' + getTopicName(topicId) + ' 💪', 'success');
      }
    }, 1000);

    // Show initial time immediately
    if (timerEl) timerEl.textContent = fmtMMSS(minutes * 60);

    breaks[topicId] = { endsAt, interval, pausedSec };
    showToast(`${minutes} min break started ☕`, 'info');
  }

  function clearBreak(topicId) {
    if (breaks[topicId]) {
      clearInterval(breaks[topicId].interval);
      delete breaks[topicId];
    }
    if (activeSessions[topicId] && activeSessions[topicId].breakStartedAt) {
      // Adjust startedAt to account for break duration so session clock resumes correctly
      const pauseDuration = Date.now() - activeSessions[topicId].breakStartedAt;
      activeSessions[topicId].startedAt = new Date(activeSessions[topicId].startedAt.getTime() + pauseDuration);
      delete activeSessions[topicId].breakStartedAt;
      delete activeSessions[topicId].breakPausedSec;
    }
    const countdown = document.getElementById('break-' + topicId);
    if (countdown) countdown.classList.add('hidden');
  }

  // ── Stats helpers ─────────────────────────────────────────────
  function getTotalSec(topicId) {
    return statsCache.filter(s => s.topic_id === topicId)
      .reduce((a, s) => a + (s.duration_seconds || 0), 0);
  }

  function getTodaySec(topicId) {
    const today = todayNY();
    return statsCache
      .filter(s => s.topic_id === topicId && toNYDateKey(s.started_at) === today)
      .reduce((a, s) => a + (s.duration_seconds || 0), 0);
  }

  function getLiveExtra(topicId) {
    const sess = activeSessions[topicId];
    if (!sess) return 0;
    if (breaks[topicId]) return breaks[topicId].pausedSec; // frozen during break
    return Math.round((Date.now() - sess.startedAt) / 1000);
  }

  function refreshCardStats(topicId) {
    const total = getTotalSec(topicId);
    const today = getTodaySec(topicId);
    const tv = document.getElementById('total-' + topicId);
    const tdv = document.getElementById('today-' + topicId);
    if (tv) tv.textContent = fmtHMS(total);
    if (tdv) tdv.textContent = fmtHMS(today);
  }

  // ── Tick every second ─────────────────────────────────────────
  function tick() {
    Object.keys(activeSessions).forEach(topicId => {
      const extra = getLiveExtra(topicId);
      const base = getTotalSec(topicId);
      const todayBase = getTodaySec(topicId);

      const sv = document.getElementById('session-' + topicId);
      const tv = document.getElementById('total-' + topicId);
      const tdv = document.getElementById('today-' + topicId);

      if (sv) sv.textContent = fmtHMS(extra);
      if (tv) tv.textContent = fmtHMS(base + extra);
      if (tdv) tdv.textContent = fmtHMS(todayBase + extra);
    });
    updateTodayTotal();
  }

  function updateTodayTotal() {
    const today = todayNY();
    let sec = statsCache
      .filter(s => toNYDateKey(s.started_at) === today)
      .reduce((a, s) => a + (s.duration_seconds || 0), 0);
    Object.keys(activeSessions).forEach(tid => sec += getLiveExtra(tid));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    const el = document.getElementById('today-total');
    if (el) el.textContent = `${h}h ${m}m today`;
  }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(tick, 1000);
  }

  function stopTick() {
    if (tickTimer) clearInterval(tickTimer);
    Object.keys(breaks).forEach(tid => clearInterval(breaks[tid].interval));
  }

  // ── Live sessions panel ───────────────────────────────────────
  function renderLiveSessions() {
    const el = document.getElementById('live-sessions-list');
    if (!el) return;
    const keys = Object.keys(activeSessions);
    if (!keys.length) {
      el.innerHTML = '<span style="color:var(--text3);font-size:13px">No active sessions</span>';
      return;
    }
    el.innerHTML = keys.map(tid => {
      const t = topics.find(x => x.id === tid);
      const s = activeSessions[tid];
      if (!t) return '';
      const onBreak = !!breaks[tid];
      return `<div class="live-item">
        <div class="live-dot" style="${onBreak ? 'background:#f59e0b' : ''}"></div>
        <span style="color:${t.color};font-weight:500;font-size:13px">${esc(t.name)}</span>
        <span style="color:var(--text3);font-size:12px">
          ${onBreak ? '☕ On break' : 'clocked in at ' + fmtTime(s.clockInTime || s.startedAt)}
        </span>
      </div>`;
    }).join('');
  }

  function getTopicName(id) {
    const t = topics.find(x => x.id === id);
    return t ? t.name : id;
  }

  function getTopics() { return topics; }
  function getStatsCache() { return statsCache; }

  async function refresh() {
    const user = Auth.getUser();
    topics = await DB.getTopics(user.uid);
    statsCache = await DB.getTopicStats(user.uid);
    render();
  }

  return { init, render, refresh, getTopics, getStatsCache, getTotalSec, getTodaySec, stopTick };
})();

// ── Shared utilities ───────────────────────────────────────────
export function todayNY() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
export function toNYDateKey(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
export function fmtHMS(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}
export function fmtMMSS(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
export function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
}
export function fmtDate(d) {
  return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
export function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
export function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  t.classList.remove('hidden');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.add('hidden'), 3500);
}
