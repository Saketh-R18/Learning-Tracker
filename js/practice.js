// ── practice.js ────────────────────────────────────────────────
import { Auth } from './auth.js';
import { DB } from './db.js';
import { Tracker, esc, showToast, fmtDate } from './tracker.js';

export const Practice = (() => {
  let logs = [];         // all problem_logs for this user
  let selectedDate = null;
  let dialogOpen = false;

  const SITES = ['LeetCode','HackerRank','CodeSignal','GeeksforGeeks','Codeforces','NeetCode','Other'];
  const DIFFICULTIES = ['Easy','Medium','Hard'];

  // ── Init & render ─────────────────────────────────────────────
  async function init() {
    const user = Auth.getUser();
    logs = await DB.getProblemLogs(user.uid);
    render();
  }

  function render() {
    renderHeatmap();
    renderStats();
  }

  // ── Heatmap ───────────────────────────────────────────────────
  function renderHeatmap() {
    const wrap = document.getElementById('heatmap-grid');
    if (!wrap) return;

    // Determine start date — first session date or today
    const user = Auth.getUser();
    const allSessions = Tracker.getStatsCache();
    let startDate;
    if (allSessions.length) {
      const dates = allSessions.map(s => new Date(s.started_at)).sort((a,b) => a-b);
      startDate = new Date(dates[0]);
      startDate.setHours(0,0,0,0);
    } else {
      startDate = new Date();
      startDate.setHours(0,0,0,0);
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    // Build map of date → total problems
    const countMap = {};
    logs.forEach(l => {
      const k = l.date;
      countMap[k] = (countMap[k] || 0) + (l.count || 0);
    });

    // Generate all days from startDate to today
    const days = [];
    const cursor = new Date(startDate);
    while (cursor <= today) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    // Group into weeks for layout
    // Find the Monday of the week containing startDate
    const firstDay = new Date(startDate);
    const dow = firstDay.getDay(); // 0=Sun
    firstDay.setDate(firstDay.getDate() - dow); // go to Sunday

    // Build week columns
    const weeks = [];
    let week = [];
    let pointer = new Date(firstDay);

    // pad empty days before start
    while (pointer < startDate) {
      week.push(null);
      pointer.setDate(pointer.getDate() + 1);
    }

    days.forEach(d => {
      week.push(new Date(d));
      if (week.length === 7) { weeks.push(week); week = []; }
    });
    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    // Month labels
    const monthLabels = [];
    let lastMonth = -1;
    weeks.forEach((wk, wi) => {
      const firstReal = wk.find(d => d);
      if (firstReal) {
        const m = firstReal.getMonth();
        if (m !== lastMonth) {
          monthLabels.push({ wi, label: firstReal.toLocaleString('default', { month: 'short' }) });
          lastMonth = m;
        }
      }
    });

    // Render
    wrap.innerHTML = '';

    // Month label row
    const monthRow = document.createElement('div');
    monthRow.className = 'heatmap-month-row';
    monthRow.style.gridColumn = `1 / ${weeks.length + 2}`;
    const mlWrap = document.createElement('div');
    mlWrap.className = 'heatmap-months';
    mlWrap.style.gridTemplateColumns = `repeat(${weeks.length}, 18px)`;
    monthLabels.forEach(ml => {
      const span = document.createElement('span');
      span.textContent = ml.label;
      span.style.gridColumn = ml.wi + 1;
      mlWrap.appendChild(span);
    });
    wrap.appendChild(mlWrap);

    // Day-of-week labels + week columns
    const gridWrap = document.createElement('div');
    gridWrap.className = 'heatmap-grid-inner';

    const dowLabels = ['S','M','T','W','T','F','S'];
    const dowCol = document.createElement('div');
    dowCol.className = 'heatmap-dow';
    dowLabels.forEach(l => {
      const s = document.createElement('span');
      s.textContent = l;
      dowCol.appendChild(s);
    });
    gridWrap.appendChild(dowCol);

    weeks.forEach(wk => {
      const col = document.createElement('div');
      col.className = 'heatmap-week-col';
      wk.forEach(d => {
        const cell = document.createElement('button');
        cell.className = 'heatmap-cell';
        if (!d) {
          cell.classList.add('empty');
          cell.disabled = true;
        } else {
          const dateKey = toDateKey(d);
          const count = countMap[dateKey] || 0;
          const level = getLevel(count);
          cell.classList.add('level-' + level);
          cell.setAttribute('aria-label', `${fmtDate(d)}: ${count} problems`);
          cell.title = `${fmtDate(d)}\n${count} problem${count !== 1 ? 's' : ''} solved`;
          if (toDateKey(d) === toDateKey(today)) cell.classList.add('today');
          cell.addEventListener('click', () => openDialog(d, countMap[dateKey] || 0));
        }
        col.appendChild(cell);
      });
      gridWrap.appendChild(col);
    });

    wrap.appendChild(gridWrap);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'heatmap-legend';
    legend.innerHTML = `
      <span>Less</span>
      <button class="heatmap-cell level-0" disabled></button>
      <button class="heatmap-cell level-1" disabled></button>
      <button class="heatmap-cell level-2" disabled></button>
      <button class="heatmap-cell level-3" disabled></button>
      <button class="heatmap-cell level-4" disabled></button>
      <span>More</span>`;
    wrap.appendChild(legend);
  }

  function getLevel(count) {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 9) return 3;
    return 4;
  }

  function toDateKey(d) {
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }

  // ── Dialog ────────────────────────────────────────────────────
  function openDialog(date, existingCount) {
    selectedDate = date;
    const dlg = document.getElementById('problem-dialog');
    const overlay = document.getElementById('problem-dialog-overlay');
    if (!dlg) return;

    // Populate topic options from user's topics
    const topics = Tracker.getTopics();
    const topicSel = document.getElementById('dlg-topic');
    topicSel.innerHTML = topics.map(t => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');

    // Set date label
    document.getElementById('dlg-date-label').textContent = fmtDate(date);

    // Load existing entries for this date
    renderDialogEntries(date);

    // Reset form
    document.getElementById('dlg-count').value = '';
    document.getElementById('dlg-notes').value = '';
    document.getElementById('dlg-site').value = 'LeetCode';
    document.getElementById('dlg-difficulty').value = 'Medium';

    dlg.classList.remove('hidden');
    dlg.classList.add('visible');
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
    document.getElementById('dlg-count').focus();
  }

  function closeDialog() {
    const dlg = document.getElementById('problem-dialog');
    const overlay = document.getElementById('problem-dialog-overlay');
    if (dlg) { dlg.classList.remove('visible'); dlg.classList.add('hidden'); }
    if (overlay) { overlay.classList.remove('visible'); overlay.classList.add('hidden'); }
    selectedDate = null;
  }

  function renderDialogEntries(date) {
    const dateKey = toDateKey(date);
    const entries = logs.filter(l => l.date === dateKey);
    const el = document.getElementById('dlg-entries');
    if (!entries.length) {
      el.innerHTML = '<p style="color:var(--text3);font-size:12px">No entries yet for this day.</p>';
      return;
    }
    el.innerHTML = entries.map(e => `
      <div class="dlg-entry">
        <span class="dlg-entry-dot" style="background:${getDiffColor(e.difficulty)}"></span>
        <span class="dlg-entry-text">
          <strong>${esc(e.topic)}</strong> · ${esc(e.site)} · 
          <span style="color:${getDiffColor(e.difficulty)}">${esc(e.difficulty||'')}</span> · 
          <strong>${e.count}</strong> problem${e.count!==1?'s':''}
          ${e.notes ? `<em style="color:var(--text3)"> — ${esc(e.notes)}</em>` : ''}
        </span>
        <button class="dlg-entry-del" data-id="${e.id}" title="Delete">✕</button>
      </div>`).join('');
    el.querySelectorAll('.dlg-entry-del').forEach(btn => {
      btn.addEventListener('click', () => deleteEntry(btn.dataset.id, date));
    });
  }

  async function saveEntry() {
    if (!selectedDate) return;
    const count = parseInt(document.getElementById('dlg-count').value);
    if (!count || count < 1) { showToast('Enter number of problems solved', 'error'); return; }
    const topic = document.getElementById('dlg-topic').value;
    const site = document.getElementById('dlg-site').value;
    const difficulty = document.getElementById('dlg-difficulty').value;
    const notes = document.getElementById('dlg-notes').value.trim();
    const dateKey = toDateKey(selectedDate);
    const user = Auth.getUser();
    try {
      const entry = await DB.addProblemLog(user.uid, { date: dateKey, topic, site, difficulty, count, notes });
      logs.push(entry);
      document.getElementById('dlg-count').value = '';
      document.getElementById('dlg-notes').value = '';
      renderDialogEntries(selectedDate);
      renderHeatmap();
      renderStats();
      showToast(`${count} ${topic} problem${count!==1?'s':''} logged! 🎯`, 'success');
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
  }

  async function deleteEntry(id, date) {
    try {
      await DB.deleteProblemLog(id);
      logs = logs.filter(l => l.id !== id);
      renderDialogEntries(date);
      renderHeatmap();
      renderStats();
      showToast('Entry removed', 'info');
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
  }

  function getDiffColor(d) {
    if (d === 'Easy') return '#1D9E75';
    if (d === 'Hard') return '#E24B4A';
    return '#f59e0b';
  }

  // ── Stats ─────────────────────────────────────────────────────
  function renderStats() {
    const total = logs.reduce((a,l) => a+l.count, 0);

    // This week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0,0,0,0);
    const thisWeek = logs.filter(l => new Date(l.date+'T12:00:00') >= weekStart).reduce((a,l)=>a+l.count,0);

    // Best day
    const byDay = {};
    logs.forEach(l => { byDay[l.date] = (byDay[l.date]||0) + l.count; });
    const bestDay = Math.max(0, ...Object.values(byDay));

    // Current streak
    let streak = 0;
    const today = toDateKey(new Date());
    let cursor = new Date();
    while (true) {
      const k = toDateKey(cursor);
      if (byDay[k]) { streak++; cursor.setDate(cursor.getDate()-1); }
      else if (k === today) { cursor.setDate(cursor.getDate()-1); } // skip today if not yet logged
      else break;
    }

    document.getElementById('ps-total').textContent = total;
    document.getElementById('ps-week').textContent = thisWeek;
    document.getElementById('ps-best').textContent = bestDay;
    document.getElementById('ps-streak').textContent = streak ? `🔥${streak}d` : '—';

    // By topic bars
    const byTopic = {};
    logs.forEach(l => { byTopic[l.topic] = (byTopic[l.topic]||0) + l.count; });
    const topicMax = Math.max(1, ...Object.values(byTopic));
    const topics = Tracker.getTopics();
    document.getElementById('ps-topic-bars').innerHTML = Object.entries(byTopic)
      .sort((a,b)=>b[1]-a[1])
      .map(([name, count]) => {
        const t = topics.find(x => x.name === name);
        const color = t?.color || '#5b73ff';
        const pct = (count/topicMax*100).toFixed(1);
        return `<div class="ps-bar-row">
          <div class="ps-bar-label">${esc(name)}</div>
          <div class="ps-bar-track"><div class="ps-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="ps-bar-count">${count}</div>
        </div>`;
      }).join('') || '<p style="color:var(--text3);font-size:13px">No data yet</p>';

    // By site bars
    const bySite = {};
    logs.forEach(l => { bySite[l.site] = (bySite[l.site]||0) + l.count; });
    const siteMax = Math.max(1, ...Object.values(bySite));
    document.getElementById('ps-site-bars').innerHTML = Object.entries(bySite)
      .sort((a,b)=>b[1]-a[1])
      .map(([name, count]) => {
        const pct = (count/siteMax*100).toFixed(1);
        return `<div class="ps-bar-row">
          <div class="ps-bar-label">${esc(name)}</div>
          <div class="ps-bar-track"><div class="ps-bar-fill" style="width:${pct}%;background:#5b73ff"></div></div>
          <div class="ps-bar-count">${count}</div>
        </div>`;
      }).join('') || '<p style="color:var(--text3);font-size:13px">No data yet</p>';

    // By difficulty
    const byDiff = { Easy:0, Medium:0, Hard:0 };
    logs.forEach(l => { if(byDiff[l.difficulty]!==undefined) byDiff[l.difficulty]+=l.count; });
    const diffTotal = Math.max(1, Object.values(byDiff).reduce((a,b)=>a+b,0));
    const diffColors = { Easy:'#1D9E75', Medium:'#f59e0b', Hard:'#E24B4A' };
    document.getElementById('ps-diff-bars').innerHTML = Object.entries(byDiff)
      .map(([name, count]) => {
        const pct = (count/diffTotal*100).toFixed(1);
        return `<div class="ps-bar-row">
          <div class="ps-bar-label" style="color:${diffColors[name]}">${name}</div>
          <div class="ps-bar-track"><div class="ps-bar-fill" style="width:${pct}%;background:${diffColors[name]}"></div></div>
          <div class="ps-bar-count">${count}</div>
        </div>`;
      }).join('');
  }

  // ── Public API ────────────────────────────────────────────────
  function setupDialog() {
    document.getElementById('dlg-save').addEventListener('click', saveEntry);
    document.getElementById('dlg-cancel').addEventListener('click', closeDialog);
    document.getElementById('dlg-count').addEventListener('keydown', e => { if(e.key==='Enter') saveEntry(); });
    document.getElementById('problem-dialog-overlay').addEventListener('click', closeDialog);
  }

  return { init, render, setupDialog };
})();
