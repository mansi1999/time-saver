// options.js

const DEFAULTS = {
  thresholds: [5, 10, 15],
  hardBlockAfterFinal: true,
  shortsBlockingEnabled: true,
  hideShortsUI: true,
  educationalKeywords: [
    'lecture', 'tutorial', 'course', 'khan academy', 'crash course',
    'documentary', 'how to', 'explained', 'programming', 'science'
  ],
  redirectSearchQuery: 'khan academy OR crash course OR documentary'
};

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById('t1').value = s.thresholds[0] ?? 5;
  document.getElementById('t2').value = s.thresholds[1] ?? 10;
  document.getElementById('t3').value = s.thresholds[2] ?? 15;
  document.getElementById('hardBlock').checked = !!s.hardBlockAfterFinal;
  document.getElementById('shortsBlock').checked = !!s.shortsBlockingEnabled;
  document.getElementById('hideShortsUi').checked = !!s.hideShortsUI;
  document.getElementById('keywords').value = (s.educationalKeywords || []).join('\n');
  document.getElementById('redirectQuery').value = s.redirectSearchQuery || DEFAULTS.redirectSearchQuery;
}

async function save() {
  const t1 = parseInt(document.getElementById('t1').value, 10) || 5;
  const t2 = parseInt(document.getElementById('t2').value, 10) || 10;
  const t3 = parseInt(document.getElementById('t3').value, 10) || 15;
  const thresholds = [t1, t2, t3].sort((a, b) => a - b);

  const keywords = document.getElementById('keywords').value
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean);

  const settings = {
    thresholds,
    hardBlockAfterFinal: document.getElementById('hardBlock').checked,
    shortsBlockingEnabled: document.getElementById('shortsBlock').checked,
    hideShortsUI: document.getElementById('hideShortsUi').checked,
    educationalKeywords: keywords,
    redirectSearchQuery: document.getElementById('redirectQuery').value.trim() || DEFAULTS.redirectSearchQuery
  };

  await chrome.storage.sync.set(settings);

  const msg = document.getElementById('saved-msg');
  msg.textContent = 'Saved';
  setTimeout(() => { msg.textContent = ''; }, 2000);
}

document.getElementById('save').addEventListener('click', save);
load();
