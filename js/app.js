// ── app.js ─────────────────────────────────────────────────────
import { Auth } from './auth.js';
import { DB } from './db.js';
import { Tracker, showToast, esc } from './tracker.js';
import { Progress } from './progress.js';
import { Sessions } from './sessions.js';
import { TopicsMgr } from './topics.js';
import { Streak } from './streak.js';

// ── Auth tabs ──────────────────────────────────────────────────
document.querySelectorAll('.auth-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('auth-' + btn.dataset.tab).classList.add('active');
    document.getElementById('auth-message').classList.add('hidden');
  });
});

// ── Login ──────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  if (!email || !pass) { showAuthMsg('Please fill in all fields.', 'error'); return; }
  setLoading('btn-login', true);
  try {
    await Auth.login(email, pass);
    await enterApp();
  } catch (e) {
    showAuthMsg(friendlyError(e.code), 'error');
  } finally { setLoading('btn-login', false); }
});

// ── Register ───────────────────────────────────────────────────
document.getElementById('btn-register').addEventListener('click', async () => {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-password').value;
  if (!name || !email || !pass) { showAuthMsg('Please fill in all fields.', 'error'); return; }
  if (pass.length < 6) { showAuthMsg('Password must be at least 6 characters.', 'error'); return; }
  setLoading('btn-register', true);
  try {
    await Auth.register(email, pass, name);
    await enterApp();
  } catch (e) {
    showAuthMsg(friendlyError(e.code), 'error');
  } finally { setLoading('btn-register', false); }
});

// ── Setup screen ───────────────────────────────────────────────
let setupTopics = [];

document.getElementById('btn-add-setup-topic').addEventListener('click', addSetupTopic);
document.getElementById('setup-topic-input').addEventListener('keydown', e => { if (e.key === 'Enter') addSetupTopic(); });

document.querySelectorAll('.preset-chip').forEach(chip => {
  chip.addEventListener('click', () => addSetupTopicItem(chip.dataset.name, chip.dataset.color));
});

document.getElementById('btn-finish-setup').addEventListener('click', finishSetup);

function addSetupTopic() {
  const input = document.getElementById('setup-topic-input');
  const color = document.getElementById('setup-topic-color').value;
  const name = input.value.trim();
  if (!name) return;
  addSetupTopicItem(name, color);
  input.value = '';
}

function addSetupTopicItem(name, color) {
  if (setupTopics.find(t => t.name.toLowerCase() === name.toLowerCase())) return;
  setupTopics.push({ name, color });
  renderSetupChips();
}

function renderSetupChips() {
  const list = document.getElementById('setup-topics-list');
  list.innerHTML = setupTopics.map((t, i) => `
    <div class="setup-topic-chip" style="background:${t.color}22;color:${t.color};border-color:${t.color}44">
      ${esc(t.name)}
      <span class="remove-chip" data-i="${i}">✕</span>
    </div>`).join('');
  list.querySelectorAll('.remove-chip').forEach(btn => {
    btn.addEventListener('click', () => { setupTopics.splice(+btn.dataset.i, 1); renderSetupChips(); });
  });
}

async function finishSetup() {
  if (!setupTopics.length) { showToast('Add at least one topic', 'error'); return; }
  const user = Auth.getUser();
  setLoading('btn-finish-setup', true);
  try {
    for (const t of setupTopics) await DB.createTopic(user.uid, t.name, t.color, 20);
    await enterApp();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
  finally { setLoading('btn-finish-setup', false); }
}

// ── Navigation ─────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(view) {
  document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'progress') Progress.render();
  if (view === 'sessions') { Sessions.populateFilter(Tracker.getTopics()); Sessions.render(); }
  if (view === 'topics') TopicsMgr.render();
  if (view === 'tracker') Streak.render(Tracker.getStatsCache());
}

// ── Add topic ──────────────────────────────────────────────────
document.getElementById('btn-add-topic').addEventListener('click', TopicsMgr.addTopic);
document.getElementById('new-topic-name').addEventListener('keydown', e => { if (e.key === 'Enter') TopicsMgr.addTopic(); });

// ── Logout ─────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', async () => {
  Tracker.stopTick();
  await Auth.logout();
  showScreen('auth');
  showToast('Signed out', 'info');
});

// ── Enter app ──────────────────────────────────────────────────
async function enterApp() {
  const user = Auth.getUser();
  const profile = Auth.getProfile();
  const topics = await DB.getTopics(user.uid);

  if (topics.length === 0) { showScreen('setup'); return; }

  const displayName = profile?.display_name || user.displayName || user.email.split('@')[0];
  document.getElementById('user-name').textContent = displayName;
  document.getElementById('user-avatar').textContent = displayName.charAt(0).toUpperCase();
  document.getElementById('tracker-date').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  showScreen('main');
  await Tracker.init();
  switchView('tracker');
}

// ── Boot ───────────────────────────────────────────────────────
(async () => {
  const loggedIn = await Auth.init();
  if (loggedIn) {
    await enterApp();
  } else {
    showScreen('auth');
  }
})();

// ── Helpers ────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
  const s = document.getElementById('screen-' + name);
  s.style.display = 'flex';
  s.classList.add('active');
}

function showAuthMsg(msg, type) {
  const el = document.getElementById('auth-message');
  el.textContent = msg;
  el.className = 'auth-msg ' + type;
  el.classList.remove('hidden');
}

function setLoading(btnId, on) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = on;
  btn.style.opacity = on ? '0.6' : '1';
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
