// Flow Log Timer background worker:
// timer end, long-run stopwatch warnings, auto-pause, and the toolbar badge.
const H = 3600000;
const DEF = { warnH: 2, limitH: 10, snoozeMin: 30 };
const TOL = 2000; // ms of tolerance so an alert never fires twice

const read = () => chrome.storage.local.get({ S: { active: false }, log: [], cfg: DEF, W: {} });
const cfgOf = (cfg) => ({ ...DEF, ...cfg });
const elapsedOf = (S, now) => S.base + (S.running ? now - S.t0 : 0);
const isLiveSW = (S) => S.active && S.running && S.mode === 'stopwatch';
const clockStr = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function hrs(ms) {
  const m = Math.round(ms / 60000), h = Math.floor(m / 60), mm = m % 60;
  return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
}
function short(ms) { // badge text, max ~4 characters
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h}h` + (mm ? String(mm).padStart(2, '0') : '');
}

async function updateBadge() {
  const { S, cfg } = await read();
  const c = cfgOf(cfg), now = Date.now();
  let text = '', color = '#2A9D8F';
  if (S.active) {
    const e = elapsedOf(S, now);
    if (!S.running) { text = 'II'; color = '#7A8794'; }
    else if (S.mode === 'timer') { text = short(Math.max(0, S.target - e)); color = '#3D8BD4'; }
    else {
      text = short(e);
      const f = e / (c.limitH * H);
      color = f < 0.4 ? '#2A9D8F' : f < 0.8 ? '#D98A0B' : '#E5483B';
    }
  }
  await chrome.action.setBadgeText({ text });
  if (text) {
    await chrome.action.setBadgeBackgroundColor({ color });
    if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  }
}

// Works out which alarms should exist, based on the current state.
async function reschedule() {
  const { S, cfg, W } = await read();
  const c = cfgOf(cfg), now = Date.now();
  const live = S.active && S.running;

  if (live && S.mode === 'timer') chrome.alarms.create('end', { when: S.t0 + S.target - S.base });
  if (live) chrome.alarms.create('tick', { periodInMinutes: 1 }); else chrome.alarms.clear('tick');

  if (isLiveSW(S)) {
    const warnMs = c.warnH * H, limitMs = c.limitH * H;
    const e = elapsedOf(S, now), eTol = e + TOL;
    const limitWhen = now + (Math.floor(eTol / limitMs) + 1) * limitMs - e;
    let warnWhen = now + (Math.floor(eTol / warnMs) + 1) * warnMs - e;
    if (W.snoozeUntil && W.snoozeUntil > now) warnWhen = W.snoozeUntil;
    chrome.alarms.create('limit', { when: limitWhen });
    if (warnWhen < limitWhen) chrome.alarms.create('warn', { when: warnWhen });
    else chrome.alarms.clear('warn');
  } else {
    chrome.alarms.clear('warn');
    chrome.alarms.clear('limit');
  }
  if (W.snoozeUntil && !(isLiveSW(S) && W.snoozeUntil > now)) await chrome.storage.local.set({ W: {} });
  await updateBadge();
}

async function endTimer() {
  const { S, log } = await read();
  if (!S.active || !S.running || S.mode !== 'timer') return;
  const at = S.t0 + (S.target - S.base); // exact scheduled end
  log.push({ sid: S.sid, ev: 'Timer ended', at, el: S.target });
  S.active = false; S.running = false;
  await chrome.storage.local.set({ S, log });
  chrome.notifications.create('end', {
    type: 'basic', iconUrl: 'icon.png', title: 'Timer finished',
    message: 'Ended at ' + new Date(at).toLocaleTimeString()
  });
}

async function warn() {
  const { S, log, cfg } = await read();
  if (!isLiveSW(S)) return;
  const c = cfgOf(cfg), now = Date.now(), e = elapsedOf(S, now), f = e / (c.limitH * H);
  const msg = f < 0.4 ? 'Still going. Quick stretch or a sip of water?'
    : f < 0.8 ? 'A long stretch with no break. Time to eat, drink or walk around?'
    : `Very long session. It will auto-pause at ${c.limitH}h.`;
  log.push({ sid: S.sid, ev: `Warning: ${hrs(e)} running`, at: now, el: e });
  await chrome.storage.local.set({ log, W: {} });
  chrome.notifications.create('warn', {
    type: 'basic', iconUrl: 'icon.png', requireInteraction: true,
    title: `Stopwatch running for ${hrs(e)}`, message: msg,
    buttons: [{ title: `Snooze ${c.snoozeMin} min` }, { title: 'Stop now' }]
  });
}

async function limit() {
  const { S, log, cfg } = await read();
  if (!isLiveSW(S)) return;
  const c = cfgOf(cfg), limitMs = c.limitH * H, now = Date.now();
  const L = Math.floor((elapsedOf(S, now) + TOL) / limitMs) * limitMs;
  if (L <= 0) return;
  const at = S.t0 + (L - S.base);
  S.base = L; S.running = false;
  log.push({ sid: S.sid, ev: `Auto-paused at ${hrs(L)} limit`, at, el: L });
  await chrome.storage.local.set({ S, log, W: {} });
  chrome.notifications.create('limit', {
    type: 'basic', iconUrl: 'icon.png', requireInteraction: true,
    title: 'Stopwatch auto-paused',
    message: `Hit the ${hrs(L)} limit at ${clockStr(at)}. Open Flow Log to resume, restart or stop.`,
    buttons: [{ title: 'Stop stopwatch' }]
  });
}

async function snooze() {
  const { S, log, cfg } = await read();
  if (!isLiveSW(S)) return;
  const c = cfgOf(cfg), now = Date.now();
  log.push({ sid: S.sid, ev: `Snoozed ${c.snoozeMin} min`, at: now, el: elapsedOf(S, now) });
  await chrome.storage.local.set({ log, W: { snoozeUntil: now + c.snoozeMin * 60000 } });
}

async function stopFromAlert() {
  const { S, log } = await read();
  if (!S.active) return;
  const now = Date.now();
  log.push({ sid: S.sid, ev: 'Stopped', at: now, el: elapsedOf(S, now) });
  S.active = false; S.running = false;
  chrome.alarms.clear('end');
  await chrome.storage.local.set({ S, log, W: {} });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'end') return endTimer();
  if (a.name === 'warn') return warn();
  if (a.name === 'limit') return limit();
  if (a.name === 'tick') return updateBadge();
});

chrome.notifications.onButtonClicked.addListener(async (id, i) => {
  if (id === 'warn' && i === 0) await snooze();
  else if ((id === 'warn' && i === 1) || (id === 'limit' && i === 0)) await stopFromAlert();
  chrome.notifications.clear(id);
});
chrome.notifications.onClicked.addListener((id) => chrome.notifications.clear(id));

chrome.storage.onChanged.addListener(() => reschedule());
chrome.runtime.onInstalled.addListener(() => reschedule());
chrome.runtime.onStartup.addListener(() => reschedule());
