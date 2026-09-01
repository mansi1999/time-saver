// content.js
// Runs on every youtube.com page. Blocks Shorts, classifies the current
// video as "educational" or "unnecessary" based on the user's own keyword
// list, tracks watch time per category, and shows taunts / a hard block
// per the user's configured thresholds.

(function () {
  const DEBUG = true;

  const TAUNTS = [
    // level 0 - mildest
    [
      "That's your first reminder gone. The algorithm is winning right now.",
      "Just a heads up: your 'quick break' has a timer on it now.",
      "First checkpoint hit. You could've done a Duolingo lesson by now."
    ],
    // level 1
    [
      "Second reminder. Bold strategy, watching this much.",
      "You could've read a few pages of that book you keep meaning to start.",
      "Still here? The educational version of you is disappointed."
    ],
    // level 2 - final, most severe
    [
      "Final reminder. You're now basically funding someone else's ad revenue for free.",
      "This is the last polite nudge you get. Close the tab.",
      "Future you would like a word about this."
    ]
  ];

  let settings = null;
  let videoEl = null;
  let lastTime = null;
  let accumulated = 0;
  let videoId = null;
  let category = 'unnecessary';
  let hardBlocked = false;
  let overlayEl = null;

  function getVideoId() {
    try {
      return new URLSearchParams(window.location.search).get('v');
    } catch (e) {
      return null;
    }
  }

  function isShortsPage() {
    return location.pathname.startsWith('/shorts/');
  }

  function currentTitle() {
    return document.title.replace(/ - YouTube$/, '').trim();
  }

  function currentChannelName() {
    const el = document.querySelector(
      '#owner ytd-channel-name a, ytd-video-owner-renderer ytd-channel-name a, #upload-info ytd-channel-name a'
    );
    return el ? el.textContent.trim() : '';
  }

  function classify() {
    if (!settings) return 'unnecessary';
    const haystack = (currentTitle() + ' ' + currentChannelName()).toLowerCase();
    const isEdu = settings.educationalKeywords.some((kw) => kw && haystack.includes(String(kw).toLowerCase()));
    return isEdu ? 'educational' : 'unnecessary';
  }

  // ---------- UI: toast + block overlay ----------
  function removeToast() {
    const el = document.getElementById('yt-focus-toast');
    if (el) el.remove();
  }

  function showToast(message) {
    removeToast();
    const toast = document.createElement('div');
    toast.id = 'yt-focus-toast';
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed', top: '16px', right: '16px', zIndex: 2147483647,
      background: '#1a1a1a', color: '#fff', padding: '12px 16px',
      borderRadius: '10px', fontFamily: 'system-ui, sans-serif',
      fontSize: '14px', maxWidth: '320px', lineHeight: '1.4',
      boxShadow: '0 4px 16px rgba(0,0,0,.35)'
    });
    document.documentElement.appendChild(toast);
    setTimeout(() => toast.remove(), 8000);
  }

  function removeOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
  }

  function showBlockOverlay({ title, message, showEducationalButton }) {
    removeOverlay();
    if (videoEl) { try { videoEl.pause(); } catch (e) {} }

    overlayEl = document.createElement('div');
    overlayEl.id = 'yt-focus-block-overlay';
    Object.assign(overlayEl.style, {
      position: 'fixed', inset: '0', zIndex: 2147483647,
      background: 'rgba(10,10,10,.96)', color: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: '32px',
      fontFamily: 'system-ui, sans-serif'
    });

    const h = document.createElement('h2');
    h.textContent = title;
    h.style.margin = '0 0 12px';
    overlayEl.appendChild(h);

    const p = document.createElement('p');
    p.textContent = message;
    p.style.maxWidth = '420px';
    p.style.opacity = '0.85';
    overlayEl.appendChild(p);

    if (showEducationalButton && settings) {
      const btn = document.createElement('button');
      btn.textContent = 'Take me to something educational';
      Object.assign(btn.style, {
        marginTop: '20px', padding: '10px 18px', borderRadius: '8px',
        border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
      });
      btn.addEventListener('click', () => {
        location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(settings.redirectSearchQuery)}`;
        showEducationalButton = false;
      });
      overlayEl.appendChild(btn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.textContent = "I'm done for today";
    Object.assign(closeBtn.style, {
      marginTop: '10px', padding: '8px 16px', borderRadius: '8px',
      border: '1px solid #555', cursor: 'pointer', background: 'transparent',
      color: '#fff', fontSize: '13px'
    });
    closeBtn.addEventListener('click', () => { history.back(); });
    overlayEl.appendChild(closeBtn);

    document.documentElement.appendChild(overlayEl);
  }

  // ---------- Shorts blocking ----------
  function enforceShortsBlock() {
    if (!settings || !settings.shortsBlockingEnabled) return false;
    if (!isShortsPage()) return false;
    showBlockOverlay({
      title: 'No Shorts.',
      message: 'Shorts are switched off. Taking you to search for something worth your time instead.',
      showEducationalButton: true
    });
    setTimeout(() => {
      if (isShortsPage()) {
        location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(settings.redirectSearchQuery)}`;
      }
    }, 1800);
    return true;
  }

  function injectShortsHidingCss() {
    if (!settings || !settings.hideShortsUI) return;
    if (document.getElementById('yt-focus-hide-shorts-css')) return;
    const style = document.createElement('style');
    style.id = 'yt-focus-hide-shorts-css';
    style.textContent = `
      ytd-reel-shelf-renderer,
      ytd-rich-shelf-renderer[is-shorts],
      ytd-guide-entry-renderer a[title="Shorts"],
      ytd-mini-guide-entry-renderer a[aria-label="Shorts"],
      a[href="/shorts"],
      tp-yt-paper-tab[aria-label="Shorts"] { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ---------- Hard-block check on navigation (before any new watch time) ----------
  async function checkHardBlock() {
    if (category === 'educational') { hardBlocked = false; return; }
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }).catch(() => null);
    if (!status) return;
    settings = status.settings;
    hardBlocked = status.hardBlockNow;
    if (hardBlocked) {
      showBlockOverlay({
        title: "That's enough for today.",
        message: 'You hit your unnecessary-content limit. Educational content is still fair game.',
        showEducationalButton: true
      });
    }
  }

  // ---------- Watch-time tracking ----------
  function flush() {
    if (accumulated > 0.5 && videoId && !hardBlocked) {
      const payload = {
        type: 'WATCH_TIME',
        videoId,
        title: currentTitle() || videoId,
        category,
        seconds: Math.round(accumulated * 10) / 10,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        timestamp: Date.now()
      };
      if (DEBUG) console.log('[YT Focus] flushing', payload);
      chrome.runtime.sendMessage(payload).then((res) => {
        if (!res) return;
        if (DEBUG) console.log('[YT Focus] ack', res);
        if (res.newlyCrossed && res.newlyCrossed.length) {
          const idx = res.newlyCrossed[res.newlyCrossed.length - 1];
          const pool = TAUNTS[Math.min(idx, TAUNTS.length - 1)];
          showToast(pool[Math.floor(Math.random() * pool.length)]);
        }
        if (res.hardBlockNow && category === 'unnecessary') {
          hardBlocked = true;
          showBlockOverlay({
            title: "That's enough for today.",
            message: 'You hit your unnecessary-content limit. Educational content is still fair game.',
            showEducationalButton: true
          });
        }
      }).catch(() => {});
    }
    accumulated = 0;
  }

  function onTimeUpdate() {
    if (!videoEl || hardBlocked) return;
    const playing = !videoEl.paused && !videoEl.ended && document.visibilityState === 'visible';
    if (playing) {
      if (lastTime !== null) {
        const delta = videoEl.currentTime - lastTime;
        if (delta > 0 && delta < 2) accumulated += delta;
      }
      lastTime = videoEl.currentTime;
    } else {
      lastTime = null;
    }
  }

  function attachVideo() {
    const v = document.querySelector('#movie_player video.html5-main-video')
      || document.querySelector('.html5-video-player video.html5-main-video')
      || document.querySelector('video.html5-main-video');
    if (!v || v === videoEl) return;

    if (videoEl) {
      videoEl.removeEventListener('timeupdate', onTimeUpdate);
      videoEl.removeEventListener('pause', flush);
      videoEl.removeEventListener('ended', flush);
    }

    videoEl = v;
    lastTime = null;
    videoEl.addEventListener('timeupdate', onTimeUpdate);
    videoEl.addEventListener('pause', flush);
    videoEl.addEventListener('ended', flush);

    if (hardBlocked && category === 'unnecessary') {
      try { videoEl.pause(); } catch (e) {}
    }
  }

  async function handleNavigation() {
    removeOverlay();
    removeToast();
    accumulated = 0;
    lastTime = null;
    hardBlocked = false;

    if (enforceShortsBlock()) return;

    videoId = getVideoId();
    // Give YouTube's SPA a moment to render the new title/channel before classifying.
    setTimeout(async () => {
      category = classify();
      if (DEBUG) console.log('[YT Focus] classified as', category, '-', currentTitle());
      await checkHardBlock();
    }, 800);
  }

  async function init() {
    const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }).catch(() => null);
    settings = status ? status.settings : null;

    injectShortsHidingCss();
    handleNavigation();

    let currentUrl = location.href;
    const observeRoot = document.querySelector('ytd-page-manager') || document.body || document.documentElement;
    const observer = new MutationObserver(() => {
      attachVideo();
      injectShortsHidingCss();
      if (location.href !== currentUrl) {
        flush();
        currentUrl = location.href;
        handleNavigation();
      }
    });
    observer.observe(observeRoot, { childList: true, subtree: true });

    setInterval(flush, 10000);
    setInterval(attachVideo, 2000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
  }

  init();
})();
