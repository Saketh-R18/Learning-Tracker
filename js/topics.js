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

    list.innerHTML = '';
    topics.forEach(t => {
      const sec = stats.filter(s => s.topic_id === t.id).reduce((a,s) => a+(s.duration_seconds||0), 0);
      const card = document.createElement('div');
      card.className = 'topic-manage-card';
      card.innerHTML = `
        <div class="topic-color-dot" style="background:${t.color}"></div>
        <div class="topic-manage-info">
          <div class="topic-manage-name">${esc(t.name)}</div>
          <div class="topic-manage-stats">${(sec/3600).toFixed(1)}h total logged</div>
        </div>
        <button class="btn-delete" title="Delete topic">
          <i class="ti ti-trash"></i>
        </button>`;
      // wire delete directly — no data attributes needed
      card.querySelector('.btn-delete').addEventListener('click', () => deleteTopic(t.id, t.name));
      list.appendChild(card);
    });
  }

  async function addTopic() {
    const nameEl = document.getElementById('new-topic-name');
    const colorEl = document.getElementById('new-topic-color');
    const name = nameEl.value.trim();
    const color = colorEl.value;
    if (!name) { showToast('Enter a topic name', 'error'); return; }
    const user = Auth.getUser();
    try {
      await DB.createTopic(user.uid, name, color, 20);
      nameEl.value = '';
      colorEl.value = '#178CFF';
      await Tracker.refresh();
      render();
      showToast(name + ' added!', 'success');
    } catch (e) { showToast('Error: ' + e.message, 'error'); }
  }

  async function deleteTopic(topicId, name) {
    if (!confirm(`Delete "${name}"?\n\nAll session history for this topic will also be removed.`)) return;
    try {
      await DB.deleteTopic(topicId);
      await Tracker.refresh();
      render();
      showToast(name + ' deleted', 'info');
    } catch (e) { showToast('Error deleting: ' + e.message, 'error'); }
  }

  return { render, addTopic, deleteTopic };
})();
