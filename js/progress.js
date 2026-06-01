// ── progress.js ────────────────────────────────────────────────
import { Tracker, esc } from './tracker.js';

export const Progress = (() => {
  let charts = {};

  function destroy(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

  async function render() {
    const topics = Tracker.getTopics();
    const stats = Tracker.getStatsCache();

    const byTopic = {};
    let totalAll = 0;
    topics.forEach(t => { byTopic[t.id] = 0; });
    stats.forEach(s => {
      if (byTopic[s.topic_id] !== undefined) byTopic[s.topic_id] += (s.duration_seconds || 0);
      totalAll += (s.duration_seconds || 0);
    });

    // Summary cards
    const container = document.getElementById('progress-summary-cards');
    container.innerHTML = topics.map(t => {
      const sec = byTopic[t.id] || 0;
      return `<div class="summary-card">
        <div class="sc-label" style="color:${t.color}">${esc(t.name)}</div>
        <div class="sc-value">${(sec / 3600).toFixed(1)}h</div>
        <div class="sc-sub">${Math.min(100,(sec/(t.goal_hours*3600))*100).toFixed(0)}% of goal</div>
      </div>`;
    }).join('') + `<div class="summary-card">
      <div class="sc-label">Total</div>
      <div class="sc-value">${(totalAll/3600).toFixed(1)}h</div>
      <div class="sc-sub">all topics</div>
    </div>`;

    // Bar chart
    destroy('topics');
    charts['topics'] = new Chart(document.getElementById('chart-topics'), {
      type: 'bar',
      data: {
        labels: topics.map(t => t.name),
        datasets: [{ label: 'Hours', data: topics.map(t => parseFloat(((byTopic[t.id]||0)/3600).toFixed(2))),
          backgroundColor: topics.map(t => t.color + 'cc'), borderColor: topics.map(t => t.color),
          borderWidth: 1, borderRadius: 6 }]
      },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b92a8' } },
          x: { grid: { display: false }, ticks: { color: '#8b92a8' } } } }
    });

    // Daily line chart
    const last14Labels = [], last14Data = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.toISOString().slice(0, 10);
      last14Labels.push(k.slice(5));
      const sec = stats.filter(s => (s.started_at||'').slice(0,10) === k).reduce((a,s) => a+(s.duration_seconds||0), 0);
      last14Data.push(parseFloat((sec/3600).toFixed(2)));
    }
    destroy('daily');
    charts['daily'] = new Chart(document.getElementById('chart-daily'), {
      type: 'line',
      data: { labels: last14Labels, datasets: [{ label: 'Hours', data: last14Data, borderColor: '#5b73ff',
        backgroundColor: 'rgba(91,115,255,0.08)', fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#5b73ff' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b92a8' } },
          x: { grid: { display: false }, ticks: { color: '#8b92a8' } } } }
    });

    // Goal bars
    document.getElementById('goal-bars').innerHTML = topics.map(t => {
      const sec = byTopic[t.id] || 0;
      const pct = Math.min(100, (sec/(t.goal_hours*3600))*100).toFixed(1);
      return `<div class="goal-bar-row">
        <div class="goal-bar-meta">
          <span style="display:flex;align-items:center;gap:7px">
            <span style="width:10px;height:10px;border-radius:50%;background:${t.color};display:inline-block"></span>${esc(t.name)}
          </span>
          <span style="color:var(--text3)">${pct}% · ${(sec/3600).toFixed(1)}h / ${t.goal_hours}h</span>
        </div>
        <div class="goal-track"><div class="goal-fill" style="width:${pct}%;background:${t.color}"></div></div>
      </div>`;
    }).join('');
  }

  return { render };
})();
