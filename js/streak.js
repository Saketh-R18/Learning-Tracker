// ── streak.js ──────────────────────────────────────────────────
import { Auth } from './auth.js';
import { DB } from './db.js';
import { todayNY, toNYDateKey } from './tracker.js';

export const Streak = (() => {

  // Calculate current streak and longest streak from session stats
  function calculate(statsCache) {
    if (!statsCache.length) return { current: 0, longest: 0, studiedToday: false };

    // Get unique study days in NY timezone
    const days = new Set(statsCache.map(s => toNYDateKey(s.started_at)));
    const today = todayNY();
    const studiedToday = days.has(today);

    // Build sorted list of unique days descending
    const sorted = Array.from(days).sort((a, b) => b.localeCompare(a));

    // Current streak — count consecutive days back from today (or yesterday)
    let current = 0;
    const startDate = studiedToday ? today : getPrevDay(today);
    let cursor = startDate;

    for (let i = 0; i < 365; i++) {
      if (days.has(cursor)) {
        current++;
        cursor = getPrevDay(cursor);
      } else {
        break;
      }
    }

    // Longest streak ever
    let longest = 0;
    let running = 0;
    let prev = null;
    for (const day of sorted.reverse()) {
      if (!prev || day === getNextDay(prev)) {
        running++;
        longest = Math.max(longest, running);
      } else {
        running = 1;
      }
      prev = day;
    }

    return { current, longest, studiedToday };
  }

  function getPrevDay(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }

  function getNextDay(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }

  // Render streak banner on tracker page
  function render(statsCache) {
    const { current, longest, studiedToday } = calculate(statsCache);

    // Sidebar streak badge
    const sidebarEl = document.getElementById('sidebar-streak');
    if (sidebarEl) {
      sidebarEl.textContent = current > 0 ? `🔥 ${current}` : '—';
      sidebarEl.title = `${current} day streak`;
    }

    // Tracker page streak banner
    const banner = document.getElementById('streak-banner');
    if (!banner) return;

    if (current === 0 && !studiedToday) {
      banner.innerHTML = `
        <div class="streak-item">
          <div class="streak-icon neutral"><i class="ti ti-flame"></i></div>
          <div class="streak-info">
            <div class="streak-value">Start your streak!</div>
            <div class="streak-label">Clock in to begin day 1</div>
          </div>
        </div>
        <div class="streak-item">
          <div class="streak-icon gold"><i class="ti ti-trophy"></i></div>
          <div class="streak-info">
            <div class="streak-value">${longest} days</div>
            <div class="streak-label">Best streak ever</div>
          </div>
        </div>`;
      return;
    }

    const flameColor = current >= 7 ? '#f97316' : current >= 3 ? '#f59e0b' : '#5b73ff';
    const msg = studiedToday
      ? current === 1 ? "Great start! Keep going tomorrow 💪"
        : current < 7 ? `${current} days strong! Don't stop now 🔥`
        : current < 30 ? `${current} days — you're on fire! 🔥🔥`
        : `${current} days — absolute legend 🏆`
      : `You haven't studied yet today — keep your streak alive!`;

    banner.innerHTML = `
      <div class="streak-item">
        <div class="streak-icon" style="background:${flameColor}22;color:${flameColor}">
          <i class="ti ti-flame"></i>
        </div>
        <div class="streak-info">
          <div class="streak-value" style="color:${flameColor}">${current} day${current !== 1 ? 's' : ''}</div>
          <div class="streak-label">${studiedToday ? 'Current streak ✓' : 'Study today to continue!'}</div>
        </div>
      </div>
      <div class="streak-divider"></div>
      <div class="streak-item">
        <div class="streak-icon gold"><i class="ti ti-trophy"></i></div>
        <div class="streak-info">
          <div class="streak-value">${longest} days</div>
          <div class="streak-label">Best streak ever</div>
        </div>
      </div>
      <div class="streak-divider"></div>
      <div class="streak-msg">${msg}</div>`;
  }

  return { calculate, render };
})();
