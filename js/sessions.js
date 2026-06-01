// ── sessions.js ────────────────────────────────────────────────
import { Auth } from './auth.js';
import { DB } from './db.js';
import { Tracker, esc, fmtDate, fmtTime, fmtHMS } from './tracker.js';

export const Sessions = (() => {
  async function render(topicId) {
    const user = Auth.getUser();
    const data = await DB.getSessions(user.uid, topicId || null);
    const topics = Tracker.getTopics();
    const wrap = document.getElementById('sessions-table-wrap');

    if (!data.length) {
      wrap.innerHTML = '<div class="sessions-empty"><i class="ti ti-history" style="font-size:32px;color:var(--text3)"></i><p style="margin-top:10px">No sessions recorded yet</p></div>';
      return;
    }

    const rows = data.map(s => {
      const topic = topics.find(t => t.id === s.topic_id);
      const topicName = topic?.name || '—';
      const topicColor = topic?.color || '#8b92a8';
      const start = s.started_at ? new Date(s.started_at) : null;
      const end = s.ended_at ? new Date(s.ended_at) : null;
      return `<tr>
        <td><span class="session-topic-dot" style="background:${topicColor}"></span>${esc(topicName)}</td>
        <td>${start ? fmtDate(start) : '—'}</td>
        <td>${start ? fmtTime(start) : '—'}</td>
        <td>${end ? fmtTime(end) : '—'}</td>
        <td><strong>${s.duration_seconds ? fmtHMS(s.duration_seconds) : '—'}</strong></td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="sessions-table">
      <thead><tr><th>Topic</th><th>Date</th><th>Clock in</th><th>Clock out</th><th>Duration</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function populateFilter(topics) {
    const sel = document.getElementById('session-filter-topic');
    if (!sel) return;
    sel.innerHTML = '<option value="">All topics</option>' +
      topics.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    sel.onchange = () => render(sel.value || null);
  }

  return { render, populateFilter };
})();
