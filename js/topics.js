// ── topics.js ──────────────────────────────────────────────────
import { Auth } from './auth.js';
import { DB } from './db.js';
import { Tracker, esc, showToast } from './tracker.js';

export const TopicsMgr = (() => {
  async function render() {
    const topics = Tracker.getTopics();
    const stats = Tracker.getStatsCache();
    const list = document.getElementById('topics-manage-list');
    if (!list) return;
    if (!topics.length) {
      list.innerHTML = '<p style="color:var(--text3);font-size:14px">No topics yet. Add your first one above.</p>';
      return;
    }
    list.innerHTML = topics.map(t => {
      const sec = stats.filter(s => s.topic_id === t.id).reduce((a,s) => a+(s.duration_seconds||0), 0);
      return `<div class="topic-manage-card">
        <div class="topic-color-dot" style="background:${t.color}"></div>
        <div class="topic-manage-info">
          <div class="topic-manage-name">${esc(t.name)}</div>
          <div class="topic-manage-stats">${(sec/3600).toFixed(1)}h logged · goal: ${t.goal_hours}h</div>
        </div>
        <button class="btn-delete" title="Delete topic" data-id="${t.id}" data-name="${esc(t.name)}">
          <i class="ti ti-trash"></i>
        </button>
      </div>`;
    }).join('');

    list.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteTopic(btn.dataset.id, btn.dataset.name));
    });
  }

  async function addTopic() {
    const name = document.getElementById('new-topic-name').value.trim();
    const color = document.getElementById('new-topic-color').value;
    const goal = parseInt(document.getElementById('new-topic-goal').value) || 20;
    if (!name) { showToast('Enter a topic name', 'error'); return; }
    const user = Auth.getUser();
    try {
      await DB.createTopic(user.uid, name, color, goal);
      document.getElementById('new-topic-name').value = '';
      document.getElementById('new-topic-goal').value = '';
      await Tracker.refresh();
      render();
      showToast(name + ' added!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }

  async function deleteTopic(topicId, name) {
    if (!confirm(`Delete topic "${name}"? All session history will also be removed.`)) return;
    try {
      await DB.deleteTopic(topicId);
      await Tracker.refresh();
      render();
      showToast(name + ' deleted', 'info');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }

  return { render, addTopic, deleteTopic };
})();
