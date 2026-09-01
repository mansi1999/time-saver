// background.js
// Aggregates YouTube watch time per day, split into "educational" and
// "unnecessary" (per the user's own keyword list), tracks which nagging
// thresholds have been crossed today, and decides when a hard block kicks in.

const DAY_KEY_PREFIX = 'focus_';

const DEFAULT_SETTINGS = {
  thresholds: [5, 10, 15], // minutes, ascending
  hardBlockAfterFinal: true,
  shortsBlockingEnabled: true,
  hideShortsUI: true,
  educationalKeywords: [
    'lecture', 'tutorial', 'course', 'khan academy', 'crash course',
    'documentary', 'how to', 'explained', 'programming', 'science'
  ],
  redirectSearchQuery: 'khan academy OR crash course OR documentary'
};

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayKey(timestamp) {
  return DAY_KEY_PREFIX + localDateStr(new Date(timestamp));
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function getDayBucket(key, thresholdsLen) {
  const stored = await chrome.storage.local.get(key);
  const bucket = stored[key] || {
    educationalSeconds: 0,
    unnecessarySeconds: 0,
    thresholdsHit: new Array(thresholdsLen).fill(false),
    videos: {}
  };
  // If the user changed the number of thresholds since this bucket was created,
  // reshape thresholdsHit to match rather than losing today's progress.
  if (bucket.thresholdsHit.length !== thresholdsLen) {
    const old = bucket.thresholdsHit;
    bucket.thresholdsHit = new Array(thresholdsLen).fill(false).map((_, i) => old[i] || false);
  }
  return bucket;
}

async function recordWatchTime({ videoId, title, category, seconds, url, timestamp }) {
  const settings = await getSettings();
  const key = dayKey(timestamp);
  const bucket = await getDayBucket(key, settings.thresholds.length);

  if (category === 'educational') {
    bucket.educationalSeconds += seconds;
  } else {
    bucket.unnecessarySeconds += seconds;
  }

  if (videoId) {
    if (!bucket.videos[videoId]) {
      bucket.videos[videoId] = { title, url, seconds: 0, category, lastWatched: timestamp };
    }
    bucket.videos[videoId].seconds += seconds;
    bucket.videos[videoId].title = title;
    bucket.videos[videoId].category = category;
    bucket.videos[videoId].lastWatched = timestamp;
  }

  const newlyCrossed = [];
  if (category === 'unnecessary') {
    const minutes = bucket.unnecessarySeconds / 60;
    settings.thresholds.forEach((thresholdMin, i) => {
      if (!bucket.thresholdsHit[i] && minutes >= thresholdMin) {
        bucket.thresholdsHit[i] = true;
        newlyCrossed.push(i);
      }
    });
  }

  await chrome.storage.local.set({ [key]: bucket });

  const finalIndex = settings.thresholds.length - 1;
  const hardBlockNow = settings.hardBlockAfterFinal && bucket.thresholdsHit[finalIndex] === true;

  return { newlyCrossed, hardBlockNow, bucket, settings };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'WATCH_TIME') {
    recordWatchTime(msg).then(sendResponse);
    return true; // keep channel open for async response
  }
  if (msg && msg.type === 'GET_STATUS') {
    (async () => {
      const settings = await getSettings();
      const key = dayKey(Date.now());
      const bucket = await getDayBucket(key, settings.thresholds.length);
      const finalIndex = settings.thresholds.length - 1;
      const hardBlockNow = settings.hardBlockAfterFinal && bucket.thresholdsHit[finalIndex] === true;
      sendResponse({ settings, bucket, hardBlockNow });
    })();
    return true;
  }
});

// Housekeeping: drop day-buckets older than 90 days.
async function pruneOldData() {
  const all = await chrome.storage.local.get(null);
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const toRemove = [];
  for (const key of Object.keys(all)) {
    if (key.startsWith(DAY_KEY_PREFIX)) {
      const dateStr = key.slice(DAY_KEY_PREFIX.length);
      const t = new Date(dateStr).getTime();
      if (!isNaN(t) && t < cutoff) toRemove.push(key);
    }
  }
  if (toRemove.length) await chrome.storage.local.remove(toRemove);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('prune', { periodInMinutes: 60 * 24 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'prune') pruneOldData();
});
