# YouTube Focus Guard

A Chrome extension (Manifest V3) that:
- **Blocks Shorts** — any `/shorts/` page gets redirected immediately, and Shorts
  shelves/links elsewhere on YouTube can be hidden too.
- **Classifies videos** as "educational" or "unnecessary" based on a keyword/channel
  list you define yourself (there's no reliable way to auto-detect this, so you set
  the rules — e.g. "lecture", "khan academy", "documentary", a channel name).
- **Taunts you** with a random message each time you cross your own configured
  thresholds (default 5 / 10 / 15 minutes) of "unnecessary" watching in a day.
- **Optionally hard-blocks** further unnecessary videos for the rest of the day once
  you hit the final threshold — pauses the video and shows a block screen.
  Educational content is never restricted.
- Still tracks watch time and shows your YouTube history, from the original build.

## How it works

- `content.js` runs on every youtube.com page.
  - On `/shorts/*`, it immediately shows a block overlay and redirects you.
  - On a watch page, it reads the title + channel name and checks them against your
    keyword list (`options.js` settings) to classify the video.
  - It measures **actual playback time** of the main player (`#movie_player video`,
    scoped carefully to avoid YouTube's silent autoplay preview clips elsewhere on
    the page) and periodically reports elapsed seconds, tagged with the category, to
    the background worker.
  - When the background worker reports a newly-crossed threshold, it shows a taunt
    toast. When the final threshold's hard-block is active, it pauses the video and
    shows a full block overlay (with a button to jump to an educational search, and
    a button to stop for the day).
- `background.js` aggregates watch time per day (`focus_YYYY-MM-DD`) split into
  `educationalSeconds` / `unnecessarySeconds`, tracks which thresholds have been hit
  today, and tells the content script when a new one is crossed or the hard block
  should kick in. It also prunes data older than 90 days.
- `options.html` / `options.js` let you configure:
  - The three reminder thresholds (minutes)
  - Whether to hard-block after the final one
  - Whether to block Shorts pages / hide Shorts UI elsewhere
  - Your educational keyword list
  - The search query used by "take me to something educational" buttons
- `popup.html` / `popup.js` show today's unnecessary vs educational time, how many
  reminders you've hit, a 7-day trend, top "unnecessary" videos today, and your
  recent YouTube history (via `chrome.history`).

## Load it into Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select this folder (or reload if already loaded)
4. Click the extension icon → **Settings** to set your thresholds and keyword list
   before you start browsing.

## Notes / limitations

- Classification is keyword-based, not real content analysis — tune your keyword
  list to fit what you actually consider educational. Add channel names you trust,
  not just topic words, for the most reliable matches.
- The hard block only affects future *unnecessary* videos once triggered — you can
  always still explicitly navigate to and watch anything classified as educational.
- This is a client-side browser extension: someone determined enough could disable
  or uninstall it. It's a nudge/accountability tool, not a parental-control-grade
  lock.
- Shorts blocking works on direct navigation to Shorts URLs and hides shelves where
  YouTube's current DOM structure matches the selectors used; YouTube changes its
  markup periodically, so these selectors may need occasional updates.
