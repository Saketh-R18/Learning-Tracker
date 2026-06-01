// ── tracker.js ─────────────────────────────────────────────────
import { Auth } from './auth.js';
import { DB } from './db.js';

export const Tracker = (() => {
  let topics = [];
  let activeSessions = {};
  let statsCache = [];
  let tickTimer = null;

  async function init() {
    const user = Auth.getUser();
    topics = await DB.getTopics(user.uid);
    statsCache = await DB.getTopicStats(user.uid);
    const open = await DB.getAllOpenSessions(user.uid);
    open.forEach(s => {
      activeSessions[s.topic_id] = { sessionId: s.id, startedAt: new Date(s.started_at) };
    });
    render();
    startTick();
    updateTodayTotal();
  }

  function render() {
    const grid = document.getElementById('topic-cards');
    if (!grid) return;
    grid.innerHTML = '';
    if (topics.length === 0) {
      grid.innerHTML = '<p style="color:var(--text3);font-size:14px">No topics yet. Add some in <strong>My topics</strong>.</p>';
      return;
    }
    topics.forEach(t => grid.appendChild(buildCard(t)));
    renderLiveSessions();
  }

  function buildCard(t) {
    const isActive = !!activeSessions[t.id];
    const total = getTotalSec(t.id);
    const today = getTodaySec(t.id);
    const pct = Math.min(100, (total / (t.goal_hours * 3600)) * 100);
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
      <div class="topic-times">
        <div class="time-block">
          <div class="time-label">Total</div>
          <div class="time-value" id="total-${t.id}">${fmtHMS(total)}</div>
        </div>
        <div class="time-block">
          <div class="time-label">Today</div>
          <div class="time-value" id="today-${t.id}">${fmtHMS(today)}</div>
        </div>
      </div>
      <div class="topic-progress">
        <div class="progress-meta">
          <span>${pct.toFixed(1)}% of goal</span>
          <span>${(total/3600).toFixed(1)}h / ${t.goal_hours}h</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" id="prog-${t.id}" style="width:${pct.toFixed(1)}%"></div>
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
    card.querySelector('.btn-clock-in').addEventListener('click', () => clockIn(t.id));
    card.querySelector('.btn-clock-out').addEventListener('click', () => clockOut(t.id));
    return card;
  }

  async function clockIn(topicId) {
    if (activeSessions[topicId]) return;
    const user = Auth.getUser();
    try {
      const sess = await DB.startSession(user.uid, topicId);
      activeSessions[topicId] = { sessionId: sess.id, startedAt: new Date(sess.started_at) };
      const card = document.getElementById('card-' + topicId);
      if (card) {
        card.classList.add('is-active');
        const badge = document.getElementById('badge-' + topicId);
        if (badge) { badge.textContent = '● Live'; badge.className = 'topic-badge active'; }
        document.getElementById('cin-' + topicId).disabled = true;
        document.getElementById('cout-' + topicId).disabled = false;
      }
      renderLiveSessions();
      updateTodayTotal();
      showToast('Clocked in — ' + getTopicName(topicId), 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }

  async function clockOut(topicId) {
    const sess = activeSessions[topicId];
    if (!sess) return;
    try {
      const result = await DB.endSession(sess.sessionId);
      statsCache.push({ topic_id: topicId, duration_seconds: result.duration_seconds, started_at: result.started_at });
      delete activeSessions[topicId];
      const card = document.getElementById('card-' + topicId);
      if (card) {
        card.classList.remove('is-active');
        const badge = document.getElementById('badge-' + topicId);
        if (badge) { badge.textContent = 'Idle'; badge.className = 'topic-badge idle'; }
        document.getElementById('cin-' + topicId).disabled = false;
        document.getElementById('cout-' + topicId).disabled = true;
        refreshCardStats(topicId);
      }
      renderLiveSessions();
      updateTodayTotal();
      showToast(`Clocked out — ${getTopicName(topicId)} · ${fmtHMS(result.duration_seconds)} session`, 'info');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }

  function getTotalSec(topicId) {
    return statsCache.filter(s => s.topic_id === topicId).reduce((a, s) => a + (s.duration_seconds || 0), 0);
  }

  function getTodaySec(topicId) {
    const today = new Date().toISOString().slice(0, 10);
    return statsCache.filter(s => s.topic_id === topicId && (s.started_at || '').slice(0, 10) === today)
      .reduce((a, s) => a + (s.duration_seconds || 0), 0);
  }

  function getLiveExtra(topicId) {
    const sess = activeSessions[topicId];
    return sess ? Math.round((Date.now() - sess.startedAt) / 1000) : 0;
  }

  function refreshCardStats(topicId) {
    const total = getTotalSec(topicId);
    const today = getTodaySec(topicId);
    const t = topics.find(x => x.id === topicId);
    const pct = t ? Math.min(100, (total / (t.goal_hours * 3600)) * 100) : 0;
    const tv = document.getElementById('total-' + topicId);
    const tdv = document.getElementById('today-' + topicId);
    const pf = document.getElementById('prog-' + topicId);
    if (tv) tv.textContent = fmtHMS(total);
    if (tdv) tdv.textContent = fmtHMS(today);
    if (pf) pf.style.width = pct.toFixed(1) + '%';
  }

  function tick() {
    Object.keys(activeSessions).forEach(topicId => {
      const extra = getLiveExtra(topicId);
      const base = getTotalSec(topicId);
      const todayBase = getTodaySec(topicId);
      const t = topics.find(x => x.id === topicId);
      const pct = t ? Math.min(100, ((base + extra) / (t.goal_hours * 3600)) * 100) : 0;
      const tv = document.getElementById('total-' + topicId);
      const tdv = document.getElementById('today-' + topicId);
      const pf = document.getElementById('prog-' + topicId);
      if (tv) tv.textContent = fmtHMS(base + extra);
      if (tdv) tdv.textContent = fmtHMS(todayBase + extra);
      if (pf) pf.style.width = pct.toFixed(1) + '%';
    });
    updateTodayTotal();
  }

  function updateTodayTotal() {
    const today = new Date().toISOString().slice(0, 10);
    let sec = statsCache.filter(s => (s.started_at || '').slice(0, 10) === today)
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

  function stopTick() { if (tickTimer) clearInterval(tickTimer); }

  function renderLiveSessions() {
    const el = document.getElementById('live-sessions-list');
    if (!el) return;
    const keys = Object.keys(activeSessions);
    if (!keys.length) { el.innerHTML = '<span style="color:var(--text3);font-size:13px">No active sessions</span>'; return; }
    el.innerHTML = keys.map(tid => {
      const t = topics.find(x => x.id === tid);
      const s = activeSessions[tid];
      if (!t) return '';
      return `<div class="live-item">
        <div class="live-dot"></div>
        <span style="color:${t.color};font-weight:500;font-size:13px">${esc(t.name)}</span>
        <span style="color:var(--text3);font-size:12px">clocked in at ${fmtTime(s.startedAt)}</span>
      </div>`;
    }).join('');
  }

  function getTopicName(id) { const t = topics.find(x => x.id === id); return t ? t.name : id; }
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
export function fmtHMS(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}
export function fmtTime(d) { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
export function fmtDate(d) { return new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }); }
export function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
export function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type;
  t.classList.remove('hidden');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.add('hidden'), 3500);
}
