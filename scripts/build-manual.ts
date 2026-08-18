// Website manual generator: reads the SAME registry the game loads (zod-validated
// JSON) and emits a static manual + spoiler-free player guide into public/, so the
// deployed site always documents the data it actually runs.
//
// Usage: npm run manual   (writes public/manual/*.html, public/guide/index.html)

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRegistry } from '../src/game/data/registry';
import type { Registry } from '../src/game/data/registry';

const reg: Registry = loadRegistry();
const branding = JSON.parse(readFileSync('data/branding.json', 'utf8')) as {
  title: string;
  tagline: string;
  version: string;
};

const OUT_MANUAL = 'public/manual';
const OUT_GUIDE = 'public/guide';
mkdirSync(OUT_MANUAL, { recursive: true });
mkdirSync(OUT_GUIDE, { recursive: true });

// ---------- helpers ----------

function titleCase(id: string): string {
  return id
    .split('-')
    .map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : s))
    .join(' ');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function grantLine(g: { stat: string; flat?: number; pct?: number; mult?: number }): string {
  const stat = titleCase(g.stat.replace(/([A-Z])/g, '-$1').toLowerCase());
  const parts: string[] = [];
  if (g.flat !== undefined) parts.push(`${g.flat > 0 ? '+' : ''}${g.flat} ${stat}`);
  if (g.pct !== undefined) parts.push(`${g.pct > 0 ? '+' : ''}${Math.round(g.pct * 100)}% ${stat}`);
  if (g.mult !== undefined) parts.push(`×${g.mult} ${stat}`);
  return parts.join(', ');
}

const NAV: [string, string][] = [
  ['index.html', 'Overview'],
  ['classes.html', 'Classes'],
  ['weapons.html', 'Weapons'],
  ['passives.html', 'Passive Items'],
  ['boons.html', 'Boons'],
  ['pets.html', 'Companions'],
  ['enemies.html', 'Bestiary'],
  ['deeds.html', 'Deeds'],
];

function page(current: string, title: string, body: string, cssPath = 'manual.css'): string {
  const nav = NAV.map(
    ([href, label]) =>
      `<a href="${href}"${href === current ? ' class="active"' : ''}>${label}</a>`,
  ).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${esc(branding.title)} Manual</title>
<link rel="stylesheet" href="${cssPath}">
<link rel="icon" href="../favicon.svg">
</head>
<body>
<header>
  <div class="brand"><a href="../">${esc(branding.title)}</a> <span class="tag">${esc(branding.tagline)}</span></div>
  <nav>${nav}</nav>
</header>
<main>
${body}
</main>
<footer>
  <p>Generated from the game's live data files · v${esc(branding.version)} · <a href="../guide/index.html">New? Read the Player Guide</a></p>
</footer>
</body>
</html>`;
}

function spoiler(summary: string, inner: string): string {
  return `<details class="spoiler"><summary>${esc(summary)}</summary>${inner}</details>`;
}

// ---------- CSS (standalone file, game palette) ----------

const CSS = `/* Manual stylesheet — palette mirrors src/ui/theme.ts */
:root {
  --bg-deep: #211a35;
  --bg-panel: #2b2140;
  --border: #b88ae0;
  --gold: #ffd97a;
  --text: #fff4d6;
  --dim: #a99bc9;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg-deep);
  color: var(--text);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.55;
}
header {
  padding: 1rem 1.25rem 0.5rem;
  border-bottom: 2px solid var(--border);
  background: var(--bg-panel);
}
.brand { font-size: 1.35rem; color: var(--gold); }
.brand a { color: var(--gold); text-decoration: none; }
.brand .tag { font-size: 0.85rem; color: var(--dim); font-style: italic; margin-left: 0.5rem; }
nav { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; padding: 0.5rem 0; }
nav a { color: var(--dim); text-decoration: none; padding: 0.15rem 0.3rem; }
nav a.active, nav a:hover { color: var(--gold); }
main { max-width: 62rem; margin: 0 auto; padding: 1.25rem; }
h1 { color: var(--gold); font-size: 1.6rem; }
h2 { color: var(--gold); font-size: 1.2rem; margin-top: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.2rem; }
.card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
}
.card h3 { margin: 0 0 0.25rem; color: var(--gold); font-size: 1.05rem; }
.card .blurb { font-style: italic; color: var(--dim); margin: 0.1rem 0 0.4rem; }
.statline { color: var(--dim); font-size: 0.92rem; }
.statline b { color: var(--text); font-weight: normal; }
table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; font-size: 0.95rem; }
th, td { text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid rgba(184,138,224,0.3); }
th { color: var(--gold); font-weight: normal; }
.wrap { overflow-x: auto; }
details.spoiler {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 0.4rem 0.8rem;
  margin: 0.6rem 0;
}
details.spoiler > summary { cursor: pointer; color: var(--dim); }
details.spoiler[open] > summary { color: var(--gold); }
.pill { display: inline-block; border: 1px solid var(--border); border-radius: 999px; padding: 0 0.5rem; font-size: 0.8rem; color: var(--dim); margin-right: 0.3rem; }
footer { text-align: center; color: var(--dim); font-size: 0.85rem; padding: 1.5rem; }
footer a { color: var(--gold); }
@media (max-width: 40rem) { main { padding: 0.75rem; } }
`;

// ---------- Classes ----------

function classesPage(): string {
  let body = `<h1>Classes</h1>
<p>Every class carries a different pair of hands and a different bad idea. Hand points limit
what you can hold: most one-handed items cost 1 point, hefty ones cost 2. Some classes refuse
whole categories of gear — that refusal is usually where their power hides.</p>`;
  for (const c of reg.classes.values()) {
    const mods = (c.statMods ?? []).map(grantLine).filter(Boolean).join(' · ');
    const weapons = (c.startingWeapons ?? []).map(titleCase).join(', ') || 'None (yes, really)';
    const pets = (c.startingPets ?? []).map(titleCase).join(', ');
    const deny = (c.denyTags ?? []).map((t: string) => `<span class="pill">no ${esc(t)}</span>`).join('');
    const unlockNote =
      c.unlock?.type === 'default'
        ? ''
        : spoiler('How to unlock', `<p>${esc(unlockText(c.unlock))}</p>`);
    body += `<div class="card">
<h3>${esc(c.name)}</h3>
<p class="blurb">${esc(c.blurb ?? '')}</p>
<p class="statline"><b>Hands:</b> ${c.handPoints} point${c.handPoints === 1 ? '' : 's'} · <b>Starts with:</b> ${esc(weapons)}${pets ? ` · <b>Companion:</b> ${esc(pets)}` : ''}</p>
${mods ? `<p class="statline"><b>Talents:</b> ${esc(mods)}</p>` : ''}
${deny ? `<p class="statline">${deny}</p>` : ''}
${c.mechanic ? `<p class="statline"><b>Signature:</b> ${esc(mechanicText(c.mechanic))}</p>` : ''}
${unlockNote}
</div>`;
  }
  return page('classes.html', 'Classes', body);
}

function mechanicText(m: string): string {
  const table: Record<string, string> = {
    ironhide: 'Ironhide — shrugs off a portion of every physical hit.',
    backspin: 'Backspin — dashing through an enemy guarantees the next strike lands critically.',
    redline: 'Redline — hits harder as health runs low.',
    redthirst: 'Redthirst — feeds on damage dealt, restoring health.',
    riseAndShine: 'Rise and Shine — the defeated may rise again to fight at their side.',
  };
  return table[m] ?? titleCase(m);
}

function unlockText(unlock: { type: string; deedId?: string; [k: string]: unknown }): string {
  if (unlock?.type === 'deed' && unlock.deedId) {
    const deed = reg.deeds.get(unlock.deedId);
    return deed ? deed.desc : 'Complete a certain deed…';
  }
  if (unlock?.type === 'shop') return 'Sold in town by a certain vendor of shortcuts.';
  return 'Found along the way.';
}

// ---------- Weapons ----------

function weaponsPage(): string {
  let body = `<h1>Weapons</h1>
<p>Numbers shown are base values at Standard quality. Quality tiers (Rusty → Standard → Fine →
Superb → Masterwork) scale them, and rare variants do stranger things — see the
<a href="index.html#variants">variants note</a>.</p>
<div class="wrap"><table>
<tr><th>Weapon</th><th>Hands</th><th>Kind</th><th>Damage</th><th>Delivery</th><th>Bonus</th></tr>`;
  for (const w of reg.weapons.values()) {
    const d = w.delivery;
    const dmg = `${w.damage.flat[0]}–${w.damage.flat[1]}${w.damage.multiplier !== 1 ? ` ×${w.damage.multiplier}` : ''} ${w.damage.types.join('/')}`;
    const delivery =
      d.type === 'meleeArc'
        ? `melee arc, reach ${d.reach}, every ${d.cooldown}s`
        : `${d.count && d.count > 1 ? `${d.count} projectiles` : 'projectile'}, range ${d.range}, every ${d.cooldown}s${d.blastRadius ? `, blast ${d.blastRadius}` : ''}`;
    const bonus = (w.grants ?? []).map(grantLine).join('; ');
    body += `<tr><td>${esc(titleCase(w.id))}</td><td>${w.hands}</td><td>${w.kind}</td><td>${esc(dmg)}</td><td>${esc(delivery)}</td><td>${esc(bonus)}</td></tr>`;
  }
  body += `</table></div>
<p>Several weapons are earned by <a href="deeds.html">deeds</a> — the game will tell you when
you've done something worth remembering.</p>`;
  return page('weapons.html', 'Weapons', body);
}

// ---------- Passives ----------

function passivesPage(): string {
  let body = `<h1>Passive Items</h1>
<p>Passives ride along without using your hands. Evil items are marked — they make the whole
run harder for the whole party, and the game pays you for the trouble.</p>`;
  const normal = [...reg.passives.values()].filter((p) => !p.tags?.includes('evil'));
  const evil = [...reg.passives.values()].filter((p) => p.tags?.includes('evil'));
  for (const p of normal) {
    body += `<div class="card"><h3>${esc(titleCase(p.id))}</h3><p>${esc(p.desc ?? '')}</p></div>`;
  }
  body += `<h2>Evil Items</h2>`;
  body += spoiler(
    'Show the evil items (they change how runs feel — discover them blind if you prefer)',
    evil
      .map(
        (p) => `<div class="card"><h3>${esc(titleCase(p.id))}</h3><p>${esc(p.desc ?? '')}</p></div>`,
      )
      .join(''),
  );
  return page('passives.html', 'Passive Items', body);
}

// ---------- Boons ----------

function boonsPage(): string {
  let body = `<h1>Boons</h1>
<p>Between waves, the wax offers little blessings. Take what the run needs, not what the
build wants — a dead build deals no damage.</p>
<div class="wrap"><table><tr><th>Boon</th><th>Effect</th></tr>`;
  for (const b of reg.boons.values()) {
    body += `<tr><td>${esc(b.name)}</td><td>${esc(b.desc)}</td></tr>`;
  }
  body += `</table></div>`;
  return page('boons.html', 'Boons', body);
}

// ---------- Pets ----------

function petsPage(): string {
  let body = `<h1>Companions</h1>
<p>Companions fight beside their keeper, and their strength grows with their keeper's.
They cannot be hurt — worry about yourself.</p>`;
  for (const p of reg.pets.values()) {
    const life = p.lifetime > 0 ? `stays ${p.lifetime}s` : 'permanent';
    body += `<div class="card"><h3>${esc(p.name)}</h3>
<p class="statline"><b>Damage:</b> ${p.flat[0]}–${p.flat[1]} ×${p.multiplier} every ${p.attackCooldown}s · <b>${esc(life)}</b> · <b>Up to ${p.maxPerOwner}</b> at once</p></div>`;
  }
  return page('pets.html', 'Companions', body);
}

// ---------- Enemies ----------

function enemiesPage(): string {
  let body = `<h1>Bestiary</h1>
<p>Act 1 is listed openly. Later acts and every boss sit behind spoiler folds — a first
meeting in the dark is worth protecting.</p>`;
  const byAct = new Map<number, string[]>();
  for (const [act, waves] of reg.waves) {
    const ids = new Set<string>();
    for (const w of waves.waves) for (const e of w.entries) ids.add(e.defId);
    byAct.set(act, [...ids]);
  }
  // include enemies referenced by summons/splits that never appear in wave data
  const listed = new Set([...byAct.values()].flat());
  const strays = [...reg.enemies.keys()].filter((id) => !listed.has(id));
  // Canonical act names (must match src/ui/TownScreen.tsx and docs/design/01-world.md)
  const actNames: Record<number, string> = {
    1: 'Act 1 — Guttering Meadows',
    2: 'Act 2 — Sogbottom Marsh',
    3: 'Act 3 — The Frosted Wick',
    4: 'Act 4 — The Snuffed Palace',
  };
  for (const [act, ids] of byAct) {
    const rows = ids
      .map((id) => reg.enemies.get(id))
      .filter((e) => !!e)
      .map((e) => {
        const name = e!.name ?? titleCase(e!.id);
        const boss = e!.archetype === 'boss';
        return `<tr><td>${esc(name)}${boss ? ' <span class="pill">boss</span>' : ''}</td><td>${e!.maxHp}</td><td>${e!.damage}</td><td>${e!.moveSpeed}</td><td>${esc(e!.archetype)}</td></tr>`;
      })
      .join('');
    const table = `<div class="wrap"><table><tr><th>Creature</th><th>HP</th><th>Damage</th><th>Speed</th><th>Habits</th></tr>${rows}</table></div>`;
    if (act === 1) {
      body += `<h2>${esc(actNames[act] ?? `Act ${act}`)}</h2>${table}`;
    } else {
      body += `<h2>${esc(actNames[act] ?? `Act ${act}`)}</h2>${spoiler(`Show the creatures of Act ${act}`, table)}`;
    }
  }
  if (strays.length > 0) {
    const rows = strays
      .map((id) => reg.enemies.get(id)!)
      .map(
        (e) =>
          `<tr><td>${esc(e.name ?? titleCase(e.id))}</td><td>${e.maxHp}</td><td>${e.damage}</td><td>${e.moveSpeed}</td><td>${esc(e.archetype)}</td></tr>`,
      )
      .join('');
    body += `<h2>Uninvited Guests</h2>${spoiler(
      'Creatures that appear by other means…',
      `<div class="wrap"><table><tr><th>Creature</th><th>HP</th><th>Damage</th><th>Speed</th><th>Habits</th></tr>${rows}</table></div>`,
    )}`;
  }
  body += `<p class="statline">HP and damage grow a little every wave — the numbers above are
what a creature is worth on the first wave of its life.</p>`;
  return page('enemies.html', 'Bestiary', body);
}

// ---------- Deeds ----------

function deedsPage(): string {
  let body = `<h1>Deeds</h1>
<p>Deeds are the game remembering what you did. Every deed lists a hint; what it unlocks
stays folded until you want to know.</p>`;
  for (const d of reg.deeds.values()) {
    const unlocks = (d.unlocks ?? [])
      .map((u: { type: string; id: string }) => `${titleCase(u.id)} (${u.type})`)
      .join(', ');
    body += `<div class="card">
<h3>${esc(d.desc)}</h3>
${d.hint ? `<p class="blurb">${esc(d.hint)}</p>` : ''}
${d.target > 1 ? `<p class="statline"><b>Progress:</b> 0 / ${d.target} — party-wide progress counts</p>` : ''}
${unlocks ? spoiler('What it unlocks', `<p>${esc(unlocks)}</p>`) : ''}
</div>`;
  }
  return page('deeds.html', 'Deeds', body);
}

// ---------- Manual index ----------

function indexPage(): string {
  const counts = `${reg.classes.size} classes · ${reg.weapons.size} weapons · ${reg.passives.size} passive items · ${reg.boons.size} boons · ${reg.enemies.size} creatures · ${reg.deeds.size} deeds`;
  const body = `<h1>${esc(branding.title)} — Manual</h1>
<p class="blurb">${esc(branding.tagline)}</p>
<p>This manual is generated straight from the game's data files, so every number here is the
number the game uses. It contains spoilers, folded politely. If you'd rather learn by playing,
start with the <a href="../guide/index.html">Player Guide</a> — it spoils nothing.</p>
<p class="statline">${esc(counts)}</p>
<h2>How a run works</h2>
<p>Pick a class, ring the bell, survive ten waves, and face what the act keeps at the bottom.
Between waves you'll choose boons, open chests, and occasionally regret an item choice for
several minutes. A Wandering Peddler visits a few times per act — gold burns a hole in every
pocket, and rerolling a disappointing chest costs a little more each time. Clear an act's boss to earn its Emberkey — keys unlock later acts from town,
and you may always press on instead of banking your win.</p>
<h2 id="variants">Qualities and variants</h2>
<p>Weapons come in five qualities: Rusty, Standard, Fine, Superb, Masterwork — better quality,
better numbers. Rarely, an item arrives changed: <b>Corrupted</b> items trade their nature for
another (a corrupted sword is no longer quite a sword), <b>Cursed</b> items overperform and
charge interest, <b>Relics</b> carry an extra gift, and <b>Holographic</b> items simply shine —
collectors know why that matters. Salvaged items become Bits, and Bits become quality upgrades
at the Tinker's bench between waves.</p>
<h2>Co-op</h2>
<p>Up to four players share one screen, one camera, and one pool of trouble. Loot chests take
turns choosing an owner, gold is mirrored (everyone gets the full amount — generosity without
arithmetic), and downed friends can be helped up by anyone willing to stand still in a bad
neighborhood.</p>`;
  return page('index.html', 'Manual', body);
}

// ---------- Player guide (spoiler-free, plain language) ----------

function guidePage(): string {
  const body = `<h1>Player Guide</h1>
<p class="blurb">Everything you need for your first hour. No spoilers, no homework.</p>

<h2>What kind of game is this?</h2>
<p>A cozy-looking, slightly haunted action game about tiny living candles defending their
town. Each "run" is short: pick a character, fight ten waves of creatures, and see how far
your little flame gets. Losing is normal and always pays out something — you'll unlock new
gear and characters just by trying things.</p>

<h2>Controls</h2>
<div class="wrap"><table>
<tr><th></th><th>Keyboard &amp; Mouse</th><th>Gamepad</th></tr>
<tr><td>Move</td><td>WASD</td><td>Left stick</td></tr>
<tr><td>Aim</td><td>Mouse</td><td>Right stick</td></tr>
<tr><td>Attack</td><td>Hold left mouse button</td><td>Right trigger</td></tr>
<tr><td>Dash</td><td>Space</td><td>A / bottom button</td></tr>
<tr><td>Interact / revive</td><td>E (hold)</td><td>X / left button (hold)</td></tr>
<tr><td>Pause</td><td>Esc</td><td>Start</td></tr>
</table></div>
<p>Weapons fire on their own while you hold the attack button — your job is aim and footwork.</p>

<h2>Playing with friends (couch co-op)</h2>
<p>Plug in up to four controllers. Player 1 can use keyboard and mouse. Anyone can press
Start on an unused controller at the town screen to join. The camera keeps everyone on one
screen, so wander together. If a friend goes down, stand next to them and hold the interact
button — you'll both feel like heroes.</p>
<p>Gold is shared the generous way: when 100 gold drops, everyone gets 100. Chest rewards
take turns, so nobody has to be polite about loot.</p>

<h2>Your first run, in five sentences</h2>
<p>Talk to the innkeeper to pick a class — the Hero is a fine first choice. Ring the bell
when you're ready. Move constantly; standing still is how candles go out. Between waves,
pick a boon (more health is never wrong on day one) and open your chest. When the big one
arrives on wave ten, keep moving and chip away — you have more time than you think.</p>

<h2>Between waves</h2>
<p>After each wave you'll see your little corner of the screen fill with choices: a boon
(a small permanent upgrade for this run), sometimes a chest (new gear — take it or scrap it
for Bits), and sometimes a visit to the Tinker (spend Bits to polish gear you love).
Take your time; the next wave politely waits.</p>

<h2>In town</h2>
<p>The town between runs is where progress sticks. Vendors sell permanent upgrades and
shortcuts, the codex remembers everything you've discovered, and the chronicle keeps your
records. Anything you unlock is unlocked forever — runs end, progress doesn't.</p>

<h2>Getting stronger (without spoilers)</h2>
<p>The game quietly watches how you play, and doing distinctive things — winning oddly,
surviving barely, overdoing something spectacularly — tends to unlock new toys. If you're
wondering "would the game notice if I…?", the answer is probably yes. Check the codex in
town to see what you've been credited for.</p>

<h2>Good habits</h2>
<ul>
<li>Dashing through danger beats running from it — you're briefly untouchable.</li>
<li>Hearts drop from fallen creatures; grab them even mid-fight.</li>
<li>A boring boon that keeps you alive beats an exciting one that doesn't.</li>
<li>Chests near the middle of the arena sometimes aren't chests. You'll learn.</li>
<li>Losing on wave eight still banks every unlock you earned on the way.</li>
</ul>

<p>Want exact numbers and full lists? The <a href="../manual/index.html">Manual</a> has every stat,
folded to protect first discoveries.</p>`;
  // guide shares the manual stylesheet; nav links point back into the manual
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Player Guide — ${esc(branding.title)}</title>
<link rel="stylesheet" href="../manual/manual.css">
<link rel="icon" href="../favicon.svg">
</head>
<body>
<header>
  <div class="brand"><a href="../">${esc(branding.title)}</a> <span class="tag">${esc(branding.tagline)}</span></div>
  <nav><a class="active" href="./">Player Guide</a><a href="../manual/index.html">Manual</a><a href="../">Play</a></nav>
</header>
<main>
${body}
</main>
<footer><p>Spoiler-free by design · v${esc(branding.version)}</p></footer>
</body>
</html>`;
}

// ---------- write everything ----------

writeFileSync(join(OUT_MANUAL, 'manual.css'), CSS);
writeFileSync(join(OUT_MANUAL, 'index.html'), indexPage());
writeFileSync(join(OUT_MANUAL, 'classes.html'), classesPage());
writeFileSync(join(OUT_MANUAL, 'weapons.html'), weaponsPage());
writeFileSync(join(OUT_MANUAL, 'passives.html'), passivesPage());
writeFileSync(join(OUT_MANUAL, 'boons.html'), boonsPage());
writeFileSync(join(OUT_MANUAL, 'pets.html'), petsPage());
writeFileSync(join(OUT_MANUAL, 'enemies.html'), enemiesPage());
writeFileSync(join(OUT_MANUAL, 'deeds.html'), deedsPage());
writeFileSync(join(OUT_GUIDE, 'index.html'), guidePage());

console.log(
  `Manual built: ${NAV.length} manual pages + player guide (from ${reg.weapons.size} weapons, ${reg.classes.size} classes, ${reg.enemies.size} creatures)`,
);
