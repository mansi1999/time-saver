// popup.js

const DAY_KEY_PREFIX = 'focus_';
const DEFAULT_THRESHOLDS = [5, 10, 15];

function fmtDuration(seconds) {
  seconds = Math.round(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateKeyFor(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return DAY_KEY_PREFIX + localDateStr(d);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`view-${btn.dataset.tab}`).classList.add('active');
  });
});

document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ---------- Time Spent view ----------
async function loadTimeStats() {
  const settings = await chrome.storage.sync.get({ thresholds: DEFAULT_THRESHOLDS });
  const thresholds = settings.thresholds || DEFAULT_THRESHOLDS;

  const keys = [];
  for (let i = 0; i < 7; i++) keys.push(dateKeyFor(i));
  const stored = await chrome.storage.local.get(keys);

  const todayKey = keys[0];
  const todayData = stored[todayKey] || { unnecessarySeconds: 0, educationalSeconds: 0, thresholdsHit: [], videos: {} };

  document.getElementById('today-unnecessary').textContent = fmtDuration(todayData.unnecessarySeconds);
  document.getElementById('today-educational').textContent = fmtDuration(todayData.educationalSeconds);

  const hitCount = (todayData.thresholdsHit || []).filter(Boolean).length;
  const statusEl = document.getElementById('threshold-status');
  if (hitCount === 0) {
    statusEl.textContent = `No reminders hit yet today (limits: ${thresholds.join('/')} min).`;
  } else {
    statusEl.textContent = `${hitCount} of ${thresholds.length} reminders hit today (limits: ${thresholds.join('/')} min).`;
  }

  const dayRows = keys.map((key, i) => {
    const d = stored[key];
    const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' :
      new Date(key.slice(DAY_KEY_PREFIX.length)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return { label, total: d ? d.unnecessarySeconds : 0 };
  });

  const weekList = document.getElementById('week-days');
  weekList.innerHTML = '';
  dayRows.forEach(({ label, total }) => {
    const li = document.createElement('li');
    li.className = 'day-row';
    li.innerHTML = `<span>${escapeHtml(label)}</span><span>${fmtDuration(total)}</span>`;
    weekList.appendChild(li);
  });

  const todayVideos = Object.entries(todayData.videos || {})
    .filter(([, v]) => v.category === 'unnecessary')
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .slice(0, 10);

  const list = document.getElementById('today-videos');
  list.innerHTML = '';
  if (todayVideos.length === 0) {
    list.innerHTML = '<li class="empty">Nothing unnecessary watched yet today.</li>';
  } else {
    todayVideos.forEach(([, v]) => {
      const li = document.createElement('li');
      li.className = 'video-item';
      li.innerHTML = `<a href="${v.url}" target="_blank" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</a><span class="video-time">${fmtDuration(v.seconds)}</span>`;
      list.appendChild(li);
    });
  }
}

// ---------- History view (uses chrome.history API) ----------
async function loadHistory() {
  const results = await chrome.history.search({
    text: 'youtube.com/watch',
    startTime: Date.now() - 7 * 24 * 60 * 60 * 1000,
    maxResults: 50
  });

  const list = document.getElementById('history-list');
  list.innerHTML = '';

  const watchItems = results
    .filter((r) => r.url && r.url.includes('youtube.com/watch'))
    .sort((a, b) => b.lastVisitTime - a.lastVisitTime);

  if (watchItems.length === 0) {
    list.innerHTML = '<li class="empty">No YouTube watch history found in the last 7 days.</li>';
    return;
  }

  watchItems.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'video-item';
    const when = new Date(item.lastVisitTime).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    const title = item.title || item.url;
    li.innerHTML = `<a href="${item.url}" target="_blank" title="${escapeHtml(title)}">${escapeHtml(title)}</a><span class="video-time">${escapeHtml(when)}</span>`;
    list.appendChild(li);
  });
}

// ---------- Clear data ----------
document.getElementById('clear-data').addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const keysToRemove = Object.keys(all).filter((k) => k.startsWith(DAY_KEY_PREFIX));
  if (keysToRemove.length) await chrome.storage.local.remove(keysToRemove);
  await loadTimeStats();
});

loadTimeStats();
loadHistory();
