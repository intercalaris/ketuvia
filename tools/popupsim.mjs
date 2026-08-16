// Runs the real popup.js against a stubbed DOM and a storage you can make slow, flaky or stale.
// Every scenario below is a way the settings panel has actually misbehaved, or could.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SRC = process.argv[2] || fileURLToPath(new URL('../popup.js', import.meta.url));

const PANEL_HTML = readFileSync(fileURLToPath(new URL('../popup.html', import.meta.url)), 'utf8');

function panelControls(html) {
  const out = [];
  for (const m of html.matchAll(/data-setting="([^"]+)"([\s\S]*?)<\/div>/g)) {
    const values = [...m[2].matchAll(/data-value="([^"]+)"/g)].map(x => x[1]);
    if (m[1] !== 'ketuviaEnabled' && values.length) out.push([m[1], values]);
  }
  const grid = (html.match(/class="position-grid"[\s\S]*?<\/div>/) || [''])[0]
    .match(/data-value="[^"]+"/g)?.map(x => x.slice(12, -1)) || [];
  if (grid.length) out.push(['position', grid]);
  const fonts = (html.match(/class="font-list"[\s\S]*?<\/div>/) || [''])[0]
    .match(/data-value="[^"]+"/g)?.map(x => x.slice(12, -1)) || [];
  if (fonts.length) out.push(['font', fonts]);
  return out;
}
const PANEL_CONTROLS = panelControls(PANEL_HTML);

const FRESH = () => ({
  textSize: 'xxlarge', targetLines: 2, background: 'dark', position: 'center-low',
  font: 'noto', allCaps: false, textColor: 'yellow', textOpacity: 75,
});

function makeContext({ stored, getDelayMs, failGet = false, failSet = false }) {
  const saved = [];
  const listeners = {};

  const button = (setting, value) => ({
    dataset: { value, active: '0', setting },
    addEventListener(_, fn) { listeners[`${setting}:${value}`] = fn; },
    closest: () => groups[setting],
  });
  const groups = {};
  const make = (setting, values) => {
    const buttons = values.map(v => button(setting, String(v)));
    groups[setting] = { dataset: { setting }, querySelectorAll: () => buttons, buttons };
    return groups[setting];
  };
  // Built from popup.html, so the stub always has exactly the controls the real panel has. A stub
  // that drifts from the panel proves nothing, which is how a missing handler hid here before.
  for (const [setting, values] of PANEL_CONTROLS) make(setting, values);

  const toggles = {};
  const plain = id => (toggles[id] ||= { dataset: {}, addEventListener() {}, checked: false });

  const document = {
    getElementById: id => plain(id),
    querySelector: sel => {
      const m = /data-setting="([^"]+)"/.exec(sel);
      if (m) return groups[m[1]]?.buttons.find(b => b.dataset.active === '1') || null;
      return null;
    },
    querySelectorAll: sel => {
      if (sel.includes('position-grid')) return groups.position.buttons;
      if (sel.includes('font-list')) return groups.font.buttons;
      if (sel.includes('.segments')) {
        const wantsButtons = sel.trim().endsWith('button');
        const pool = Object.entries(groups).filter(([k]) => k !== 'font' && k !== 'position');
        return wantsButtons ? pool.flatMap(([, g]) => g.buttons) : pool.map(([, g]) => g);
      }
      return [];
    },
  };

  const chrome = {
    runtime: { getManifest: () => ({ version: '0.0.0' }) },
    storage: {
      local: {
        // A real read captures its value when serviced, not when it resolves. Reading at resolve
        // time would hide every stale-read race, which is the bug class this file exists for.
        get: keys => {
          if (failGet) return Promise.reject(new Error('storage unavailable'));
          const snapshot = {};
          for (const [k, fallback] of Object.entries(keys)) {
            snapshot[k] = k in stored ? JSON.parse(JSON.stringify(stored[k])) : fallback;
          }
          return new Promise(res => setTimeout(() => res(snapshot), getDelayMs));
        },
        set: obj => {
          if (failSet) return Promise.reject(new Error('quota exceeded'));
          saved.push(JSON.parse(JSON.stringify(obj)));
          Object.assign(stored, JSON.parse(JSON.stringify(obj)));
          return Promise.resolve();
        },
      },
    },
  };

  return {
    ctx: vm.createContext({ document, chrome, console, setTimeout, Promise }),
    saved, listeners, groups, stored,
  };
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'ok ' : 'BAD'} ${name}${detail ? `\n     ${detail}` : ''}`);
}

const settle = (ms) => new Promise(r => setTimeout(r, ms));
const shown = (groups, setting) =>
  groups[setting].buttons.find(b => b.dataset.active === '1')?.dataset.value;
const load = (src, env) => {
  const c = makeContext(env);
  vm.runInContext(readFileSync(src, 'utf8'), c.ctx);
  return c;
};

// 1-3. A click must survive whatever the storage reads are doing around it. The third case is the
// one that shipped broken: a read issued before the click resolves after it and repaints the panel.
for (const [name, clickAfterMs, getDelayMs] of [
  ['a click before the stored settings arrive', 5, 120],
  ['a click well after they arrive', 200, 50],
  ['a click while a later read is in flight', 250, 120],
]) {
  const { saved, listeners, groups } = load(SRC, { stored: { ketuviaSettings: FRESH() }, getDelayMs });
  await settle(clickAfterMs);
  listeners['targetLines:3']();
  await settle(getDelayMs * 4 + 120);
  const last = saved.at(-1)?.ketuviaSettings;
  const keptOthers = last?.textColor === 'yellow' && last?.textSize === 'xxlarge' && last?.font === 'noto';
  check(`${name}: saves the click and keeps the rest`, keptOthers, JSON.stringify(last));
  check(`${name}: panel still shows it`, shown(groups, 'targetLines') === '3',
        `panel shows ${shown(groups, 'targetLines')}`);
}

// 4. Clicking quickly through several controls. The last click of each control must be what sticks,
// and no earlier click may be lost, which is what "I have to click it repeatedly" looks like.
{
  const { saved, listeners, groups } = load(SRC, { stored: { ketuviaSettings: FRESH() }, getDelayMs: 60 });
  await settle(90);
  listeners['targetLines:1']();
  listeners['targetLines:3']();
  listeners['textColor:green']();
  listeners['captionWidth:half']();
  await settle(300);
  const last = saved.at(-1)?.ketuviaSettings;
  const ok = last?.targetLines === 3 && last?.textColor === 'green' && last?.captionWidth === 'half';
  check('four fast clicks all land', ok, JSON.stringify(last));
  check('panel agrees with storage after fast clicks',
        shown(groups, 'targetLines') === '3' && shown(groups, 'textColor') === 'green',
        `lines ${shown(groups, 'targetLines')}, colour ${shown(groups, 'textColor')}`);
}

// 5. Storage unreadable. The panel must stay usable and must still write a complete settings object
// rather than a fragment that would wipe keys it never managed to read.
{
  const { saved, listeners } = load(SRC, { stored: {}, getDelayMs: 20, failGet: true });
  await settle(120);
  listeners['textColor:cyan']();
  await settle(200);
  const last = saved.at(-1)?.ketuviaSettings;
  const complete = last && ['textSize', 'targetLines', 'background', 'position', 'font',
                            'textColor', 'textOpacity', 'captionWidth'].every(k => k in last);
  check('a failed read still writes a complete settings object', Boolean(complete) && last.textColor === 'cyan',
        JSON.stringify(last));
}

// 6. Storage unwritable. Whatever the panel shows afterwards must match what is actually stored,
// so the user is never told a setting took when it did not.
{
  const { listeners, groups, stored } = load(SRC, {
    stored: { ketuviaSettings: FRESH() }, getDelayMs: 30, failSet: true,
  });
  await settle(150);
  listeners['textColor:green']();
  await settle(250);
  const storedColour = stored.ketuviaSettings.textColor;
  check('a failed write leaves panel and storage agreeing',
        shown(groups, 'textColor') === storedColour,
        `panel ${shown(groups, 'textColor')}, storage ${storedColour}`);
}

// 7. Settings saved by older versions, plus junk. These must migrate to the nearest legal value and
// must not knock out the settings around them.
{
  const legacy = {
    ketuviaSettings: {
      textSize: 'xxlarge', targetLines: 5, background: 'dark', captionWidth: 'threequarters',
      position: 'center-low', font: 'noto', textColor: 'yellow', textOpacity: 75, allCaps: true,
      someRemovedKey: 'gone',
    },
  };
  const { saved, listeners } = load(SRC, { stored: legacy, getDelayMs: 30 });
  await settle(150);
  listeners['textOpacity:100']();
  await settle(200);
  const last = saved.at(-1)?.ketuviaSettings;
  const migrated = last?.targetLines === 3 && last?.background === 75 &&
                   last?.captionWidth === 'twothirds';
  const preserved = last?.font === 'noto' && last?.textColor === 'yellow' && last?.allCaps === true;
  check('old stored values migrate to the nearest kept option', Boolean(migrated), JSON.stringify(last));
  check('migration does not disturb the other settings', Boolean(preserved));
}

// 8. Something else writes while the panel is open. The panel's own write must still be complete,
// so a concurrent change can be overwritten but never leaves storage half-formed.
{
  const { saved, listeners, stored } = load(SRC, { stored: { ketuviaSettings: FRESH() }, getDelayMs: 40 });
  await settle(150);
  stored.ketuviaSettings = { ...FRESH(), font: 'roboto' };
  listeners['targetLines:1']();
  await settle(200);
  const last = saved.at(-1)?.ketuviaSettings;
  const complete = last && Object.keys(FRESH()).every(k => k in last);
  check('a concurrent change never leaves a half-written settings object',
        Boolean(complete) && last.targetLines === 1, JSON.stringify(last));
}

// 9. Every control the panel actually offers, clicked one after another. Firefox refuses to script
// extension pages, so this is the closest thing to a person working through the whole panel.
{
  const { saved, listeners, groups } = load(SRC, { stored: { ketuviaSettings: FRESH() }, getDelayMs: 40 });
  await settle(150);
  const missed = [];
  let clicked = 0;
  for (const [setting, values] of PANEL_CONTROLS) {
    for (const value of values) {
      const fn = listeners[`${setting}:${value}`];
      if (!fn) { missed.push(`${setting}=${value} has no handler`); continue; }
      fn();
      clicked += 1;
      await settle(15);
      const stuck = String(saved.at(-1)?.ketuviaSettings?.[setting]) === String(value);
      const displayed = String(shown(groups, setting)) === String(value);
      if (!stuck || !displayed) missed.push(`${setting}=${value} (stored ${stuck}, shown ${displayed})`);
    }
  }
  check(`all ${clicked} controls in popup.html stick when clicked`, missed.length === 0,
        missed.slice(0, 4).join('; '));
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map(f => f.name).join('; '));
  process.exit(1);
}
console.log('THE SETTINGS PANEL HOLDS UNDER EVERY SCENARIO');
