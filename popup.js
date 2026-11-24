const $ = (id) => document.getElementById(id);
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
};
const elapsed = (S) => S.base + (S.running ? Date.now() - S.t0 : 0);

let mode = 'stopwatch';
let cache = { S: { active: false }, log: [], n: 0 };

const load = () => chrome.storage.local.get({ S: { active: false }, log: [], n: 0 });
const save = (d) => chrome.storage.local.set(d);
const note = (log, S, ev, at, el) => log.push({ sid: S.sid, ev, at, el });

async function act(type, extra) {
  let { S, log, n } = await load();
  const now = Date.now();

  if (type === 'start') {
    n++;
    const target = mode === 'timer' ? (+$('mins').value || 25) * 60000 : 0;
    S = { active: true, running: true, mode, t0: now, base: 0, target, dur: target, sid: n };
    note(log, S, target ? `Timer started (${target / 60000} min)` : 'Started', now, 0);
    if (target) chrome.alarms.create('end', { when: now + target });
  } else {
    const e = elapsed(S);
    if (type === 'pause') {
      S.base = e; S.running = false; chrome.alarms.clear('end');
      note(log, S, 'Paused', now, e);
    } else if (type === 'resume') {
      S.t0 = now; S.running = true;
      if (S.mode === 'timer') chrome.alarms.create('end', { when: now + S.target - S.base });
      note(log, S, 'Resumed', now, e);
    } else if (type === 'restart') {
      note(log, S, 'Restarted', now, e);
      S.base = 0; S.t0 = now; S.running = true;
      if (S.mode === 'timer') {
        S.target = S.dur || S.target;
        chrome.alarms.create('end', { when: now + S.target });
      }
    } else if (type === 'lap') {
      note(log, S, 'Flag', now, e);
    } else if (type === 'stop') {
      note(log, S, 'Stopped', now, e);
      S.active = false; S.running = false; chrome.alarms.clear('end');
    } else if (type === 'add') {
      S.target += extra * 60000;
      note(log, S, `+${extra} min (${fmt(S.target - e)} left)`, now, e);
      if (S.running) chrome.alarms.create('end', { when: now + S.target - e });
    }
  }
  await save({ S, log, n });
}

function render() {
  const { S, log } = cache;
  const timer = S.active && S.mode === 'timer';
  let txt = '00:00', sub = '';
  if (S.active) {
    txt = fmt(timer ? S.target - elapsed(S) : elapsed(S));
    sub = `Log ${S.sid} · ${S.running ? 'running' : 'paused'}${timer ? ' · ' + fmt(elapsed(S)) + ' elapsed' : ''}`;
  } else {
    const last = log[log.length - 1];
    if (last && last.ev === 'Timer ended') { sub = `Log ${last.sid} · finished ${clock(last.at)}`; }
    else if (last) { txt = fmt(last.el); sub = `Log ${last.sid} · stopped ${clock(last.at)}`; }
  }
  $('disp').textContent = txt;
  $('sub').textContent = sub;
  $('face').dataset.s = S.active ? (S.running ? 'run' : 'pause') : 'idle';
  $('idle').classList.toggle('hide', S.active);
  $('modes').classList.toggle('hide', S.active);
  $('minsWrap').classList.toggle('hide', S.active || mode !== 'timer');
  $('run').classList.toggle('hide', !(S.active && S.running));
  $('paused').classList.toggle('hide', !(S.active && !S.running));
  $('add').classList.toggle('hide', !timer);
  $('lap').classList.toggle('hide', timer);
}

const STAR = '<svg class="star" viewBox="0 0 24 24"><polygon points="12,1.5 15.1,8.3 22.5,9.1 17,14.1 18.5,21.4 12,17.7 5.5,21.4 7,14.1 1.5,9.1 8.9,8.3" fill="#F7C21B" stroke="#E39A0B" stroke-width="1.2" stroke-linejoin="round"/></svg>';
const kind = (ev) =>
  ev === 'Flag' ? 'flag' : ev === 'Paused' ? 'pause' : ev === 'Resumed' ? 'resume' :
  ev === 'Stopped' ? 'stop' : ev === 'Restarted' ? 'restart' : ev === 'Timer ended' ? 'end' : ev.startsWith('+') ? 'add' :
  ev.startsWith('Warning') ? 'warn' : ev.startsWith('Snoozed') ? 'snooze' : ev.startsWith('Auto-paused') ? 'limit' : 'start';

function renderLog() {
  const el = $('log');
  if (!cache.log.length) { el.innerHTML = '<div class="empty">Nothing logged yet. Press Start.</div>'; return; }
  const groups = {};
  cache.log.forEach((l) => (groups[l.sid] = groups[l.sid] || []).push(l));
  el.innerHTML = Object.keys(groups).map(Number).sort((a, b) => b - a).map((sid) => {
    const items = groups[sid];
    const notes = items.map((l) => {
      const k = kind(l.ev);
      return `<div class="note ${k}">${k === 'flag' ? STAR : ''}<b>${l.ev}</b>` +
             `<div class="c">${clock(l.at)}</div><div class="e">${fmt(l.el)} elapsed</div></div>`;
    }).join('');
    return `<div class="sess c${(sid - 1) % 6}"><div class="sh">Log ${sid}<span>${clock(items[0].at)}</span></div>` +
           `<div class="notes">${notes}</div></div>`;
  }).join('');
}

async function refresh() { cache = await load(); render(); renderLog(); }

$('m-sw').onclick = () => { mode = 'stopwatch'; $('m-sw').classList.add('on'); $('m-tm').classList.remove('on'); render(); };
$('m-tm').onclick = () => { mode = 'timer'; $('m-tm').classList.add('on'); $('m-sw').classList.remove('on'); render(); };
$('start').onclick = () => act('start');
$('pause').onclick = () => act('pause');
$('resume').onclick = () => act('resume');
$('lap').onclick = () => act('lap');
$('stop').onclick = () => act('stop');
$('stop2').onclick = () => act('stop');
$('restart').onclick = () => act('restart');
$('restart2').onclick = () => act('restart');
$('a1').onclick = () => act('add', 1);
$('a5').onclick = () => act('add', 5);
$('clear').onclick = async () => { await save({ log: [] }); };

// alert settings
const num = (id, def, min) => { const v = parseFloat($(id).value); return v >= min ? v : def; };
async function loadCfg() {
  const { cfg } = await chrome.storage.local.get({ cfg: {} });
  const c = { warnH: 2, limitH: 10, snoozeMin: 30, ...cfg };
  $('cfg-warn').value = c.warnH; $('cfg-limit').value = c.limitH; $('cfg-snooze').value = c.snoozeMin;
}
const saveCfg = () => save({ cfg: { warnH: num('cfg-warn', 2, 0.1), limitH: num('cfg-limit', 10, 0.2), snoozeMin: num('cfg-snooze', 30, 1) } });
['cfg-warn', 'cfg-limit', 'cfg-snooze'].forEach((id) => ($(id).onchange = saveCfg));
$('gear').onclick = () => { $('settings').classList.toggle('hide'); loadCfg(); };

chrome.storage.onChanged.addListener(refresh);
setInterval(render, 250);
refresh();
