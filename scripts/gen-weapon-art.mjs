// Generates art/weapons/<id>.svg for every weapon and art/projectiles/<school>.svg.
// Template shapes + school palettes: every weapon gets a real graphic, consistent
// style, zero hand-drawn backlog. Rerun after adding weapons: node scripts/gen-weapon-art.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const weapons = JSON.parse(readFileSync('data/items/weapons.json', 'utf8'));
mkdirSync('art/weapons', { recursive: true });
mkdirSync('art/projectiles', { recursive: true });

const PALETTES = {
  physical: { a: '#c8c8d8', b: '#8a92b8', c: '#5d6488' },
  fire: { a: '#ffb347', b: '#ff7847', c: '#c2452d' },
  ice: { a: '#d5eefa', b: '#7fc4e8', c: '#4a8ab5' },
  lightning: { a: '#fff2a0', b: '#ffd93b', c: '#c9a227' },
  poison: { a: '#b8e986', b: '#7fbf4d', c: '#4d7c2e' },
  arcane: { a: '#e0c3fc', b: '#b88ae0', c: '#7d5aa8' },
  void: { a: '#9a86c8', b: '#5d4d85', c: '#2b2140' },
  gold: { a: '#ffe28a', b: '#ffd97a', c: '#c89020' },
};

function paletteFor(w) {
  const t = w.damage.types;
  for (const s of ['fire', 'ice', 'lightning', 'poison', 'arcane', 'void']) {
    if (t.includes(s)) return PALETTES[s];
  }
  if (w.id.includes('gold') || w.id.includes('coin')) return PALETTES.gold;
  return PALETTES.physical;
}

// All shapes point RIGHT (+x) so the renderer can rotate to the aim angle.
const SHAPES = {
  blade: (p) => `
  <polygon points="12,32 46,26 54,32 46,38" fill="${p.a}" stroke="${p.c}" stroke-width="1.5"/>
  <polygon points="14,32 44,28.5 44,35.5" fill="${p.b}"/>
  <rect x="6" y="29" width="8" height="6" rx="2" fill="${p.c}"/>
  <rect x="10" y="24" width="3.5" height="16" rx="1.5" fill="${p.c}"/>`,
  dagger: (p) => `
  <polygon points="20,32 46,28 52,32 46,36" fill="${p.a}" stroke="${p.c}" stroke-width="1.5"/>
  <rect x="13" y="29.5" width="8" height="5" rx="2" fill="${p.c}"/>
  <rect x="18" y="26" width="3" height="12" rx="1.5" fill="${p.c}"/>`,
  axe: (p) => `
  <rect x="8" y="30" width="30" height="4" rx="2" fill="#8a6d4e"/>
  <path d="M36 20 Q52 24 52 32 Q52 40 36 44 Q42 32 36 20 Z" fill="${p.a}" stroke="${p.c}" stroke-width="1.5"/>`,
  hammer: (p) => `
  <rect x="8" y="30" width="28" height="4" rx="2" fill="#8a6d4e"/>
  <rect x="34" y="22" width="16" height="20" rx="4" fill="${p.a}" stroke="${p.c}" stroke-width="1.5"/>
  <rect x="38" y="26" width="8" height="12" rx="2" fill="${p.b}"/>`,
  club: (p) => `
  <rect x="8" y="30" width="22" height="4" rx="2" fill="#8a6d4e"/>
  <ellipse cx="42" cy="32" rx="12" ry="9" fill="${p.a}" stroke="${p.c}" stroke-width="1.5"/>
  <circle cx="38" cy="28" r="1.6" fill="${p.c}"/><circle cx="46" cy="30" r="1.6" fill="${p.c}"/>
  <circle cx="42" cy="37" r="1.6" fill="${p.c}"/>`,
  whip: (p) => `
  <path d="M10 34 Q22 26 32 32 Q44 39 52 28" fill="none" stroke="${p.b}" stroke-width="4" stroke-linecap="round"/>
  <path d="M10 34 Q22 26 32 32" fill="none" stroke="${p.a}" stroke-width="2" stroke-linecap="round"/>
  <rect x="6" y="31" width="8" height="6" rx="3" fill="${p.c}"/>`,
  bow: (p) => `
  <path d="M22 12 Q44 32 22 52" fill="none" stroke="#8a6d4e" stroke-width="4" stroke-linecap="round"/>
  <line x1="22" y1="12" x2="22" y2="52" stroke="${p.a}" stroke-width="1.5"/>
  <line x1="16" y1="32" x2="46" y2="32" stroke="${p.b}" stroke-width="2.5"/>
  <polygon points="46,32 40,29 40,35" fill="${p.a}"/>`,
  crossbow: (p) => `
  <rect x="10" y="29" width="34" height="6" rx="2" fill="#8a6d4e"/>
  <path d="M28 16 Q40 32 28 48" fill="none" stroke="${p.a}" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="28" y1="16" x2="28" y2="48" stroke="${p.b}" stroke-width="1.5"/>
  <polygon points="50,32 42,29 42,35" fill="${p.a}"/>`,
  gun: (p) => `
  <rect x="12" y="27" width="32" height="9" rx="3" fill="${p.b}" stroke="${p.c}" stroke-width="1.5"/>
  <rect x="40" y="25" width="10" height="13" rx="3" fill="${p.a}"/>
  <rect x="14" y="35" width="7" height="10" rx="2" fill="${p.c}"/>`,
  sling: (p) => `
  <path d="M14 40 Q22 24 34 26" fill="none" stroke="#8a6d4e" stroke-width="3.5" stroke-linecap="round"/>
  <ellipse cx="38" cy="28" rx="7" ry="5" fill="${p.b}" stroke="${p.c}" stroke-width="1.5"/>
  <circle cx="38" cy="28" r="2.5" fill="${p.a}"/>`,
  thrown: (p) => `
  <polygon points="32,18 36,28 46,28 38,35 41,45 32,39 23,45 26,35 18,28 28,28" fill="${p.a}" stroke="${p.c}" stroke-width="1.5"/>
  <circle cx="32" cy="32" r="3" fill="${p.b}"/>`,
  wand: (p) => `
  <rect x="10" y="30.5" width="30" height="3.5" rx="1.75" fill="#8a6d4e" transform="rotate(-8 25 32)"/>
  <circle cx="44" cy="27" r="6" fill="${p.a}" stroke="${p.c}" stroke-width="1.5"/>
  <circle cx="44" cy="27" r="2.5" fill="${p.b}"/>
  <path d="M50 20 l2 -2 M52 27 l3 0 M49 34 l2 2" stroke="${p.a}" stroke-width="1.5" stroke-linecap="round"/>`,
  orb: (p) => `
  <circle cx="34" cy="32" r="12" fill="${p.b}" stroke="${p.c}" stroke-width="1.5"/>
  <circle cx="30" cy="28" r="4" fill="${p.a}" opacity="0.9"/>
  <circle cx="34" cy="32" r="16" fill="none" stroke="${p.a}" stroke-width="1" opacity="0.5"/>`,
  flask: (p) => `
  <path d="M30 16 L30 24 L20 42 Q19 46 24 46 L44 46 Q49 46 48 42 L38 24 L38 16 Z" fill="#d8ecf7" stroke="#8fb8d4" stroke-width="1.5" opacity="0.9"/>
  <path d="M23 38 Q34 34 45 38 L44 44 L24 44 Z" fill="${p.b}"/>
  <rect x="28" y="12" width="12" height="5" rx="2" fill="#8a6d4e"/>
  <circle cx="28" cy="36" r="1.5" fill="${p.a}"/><circle cx="38" cy="39" r="1.5" fill="${p.a}"/>`,
  shield: (p) => `
  <path d="M32 12 Q46 14 48 18 Q48 38 32 50 Q16 38 16 18 Q18 14 32 12 Z" fill="${p.b}" stroke="${p.c}" stroke-width="2"/>
  <path d="M32 16 Q42 17 44 20 Q44 34 32 44 Q20 34 20 20 Q22 17 32 16 Z" fill="${p.a}" opacity="0.5"/>
  <circle cx="32" cy="28" r="4" fill="${p.c}"/>`,
  lute: (p) => `
  <ellipse cx="24" cy="36" rx="11" ry="9" fill="#b5824e" stroke="#7a5230" stroke-width="1.5"/>
  <rect x="30" y="24" width="22" height="4" rx="2" fill="#8a6d4e" transform="rotate(18 30 26)"/>
  <circle cx="24" cy="36" r="3.5" fill="#5d4324"/>
  <line x1="18" y1="33" x2="48" y2="32" stroke="${p.a}" stroke-width="0.8"/>
  <line x1="18" y1="37" x2="48" y2="35" stroke="${p.a}" stroke-width="0.8"/>`,
  pan: (p) => `
  <circle cx="26" cy="32" r="12" fill="#3d3a45" stroke="#26242c" stroke-width="2"/>
  <circle cx="26" cy="32" r="8" fill="#4d4a58"/>
  <rect x="36" y="29.5" width="20" height="5" rx="2.5" fill="${p.c}"/>
  <circle cx="23" cy="29" r="2" fill="#ffd97a" opacity="0.6"/>`,
  cane: (p) => `
  <rect x="14" y="30" width="34" height="4" rx="2" fill="#5d4324"/>
  <circle cx="49" cy="30" r="5" fill="${p.a}" stroke="${p.c}" stroke-width="1.5"/>`,
  smoker: (p) => `
  <rect x="18" y="24" width="18" height="18" rx="4" fill="#c8c0a8" stroke="#8a8268" stroke-width="1.5"/>
  <polygon points="36,28 50,24 50,40 36,36" fill="#a8a088"/>
  <circle cx="52" cy="24" r="3" fill="#e8e4d8" opacity="0.8"/>
  <circle cx="56" cy="19" r="2.2" fill="#e8e4d8" opacity="0.6"/>`,
  balls: (p) => `
  <circle cx="24" cy="36" r="6" fill="${PALETTES.fire.b}" stroke="${PALETTES.fire.c}" stroke-width="1.5"/>
  <circle cx="36" cy="24" r="6" fill="${PALETTES.arcane.b}" stroke="${PALETTES.arcane.c}" stroke-width="1.5"/>
  <circle cx="44" cy="38" r="6" fill="${PALETTES.ice.b}" stroke="${PALETTES.ice.c}" stroke-width="1.5"/>`,
};

function shapeFor(w) {
  const id = w.id;
  const kw = (s) => id.includes(s);
  if (w.kind === 'shield') return 'shield';
  if (kw('lute')) return 'lute';
  if (kw('pan')) return 'pan';
  if (kw('cane')) return 'cane';
  if (kw('smoker')) return 'smoker';
  if (kw('juggling')) return 'balls';
  if (kw('flask') || kw('venom-orb')) return 'flask';
  if (kw('dagger') || kw('knife') || kw('knives') || kw('fang') || kw('butter')) return 'dagger';
  if (kw('axe') || kw('hatchet') || kw('scythe')) return 'axe';
  if (kw('hammer') || kw('mace') || kw('mallet')) return 'hammer';
  if (kw('club')) return 'club';
  if (kw('whip') || kw('lash')) return 'whip';
  if (kw('crossbow')) return 'crossbow';
  if (kw('bow')) return 'bow';
  if (kw('cannon') || kw('launcher') || kw('slinger')) return 'gun';
  if (kw('sling')) return 'sling';
  if (kw('boomerang') || kw('star') || kw('thrower') || kw('dart') || kw('pebble') || kw('jar')) return 'thrown';
  if (kw('ball') || kw('orb') || kw('globe') || kw('core') || kw('sun') || kw('prism')) return 'orb';
  if (w.kind === 'spell' && w.delivery.type === 'projectile') return 'wand';
  if (w.delivery.type === 'meleeArc') return 'blade';
  return 'thrown';
}

for (const w of weapons) {
  const p = paletteFor(w);
  const body = SHAPES[shapeFor(w)](p);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n<!-- ${w.id} (${shapeFor(w)}) — generated by scripts/gen-weapon-art.mjs -->${body}\n</svg>\n`;
  writeFileSync(`art/weapons/${w.id}.svg`, svg);
}

// Projectiles: one animated-friendly bolt per school + physical + enemy
const PROJ = {
  physical: (p) => `<circle cx="32" cy="32" r="9" fill="${p.a}" stroke="${p.c}" stroke-width="2"/><circle cx="29" cy="29" r="3" fill="#fff" opacity="0.7"/>`,
  fire: (p) => `<path d="M14 32 Q26 20 50 28 Q42 32 50 36 Q26 44 14 32 Z" fill="${p.b}" stroke="${p.c}" stroke-width="1.5"/><path d="M22 32 Q32 26 44 30 Q38 32 44 34 Q32 38 22 32 Z" fill="${p.a}"/>`,
  ice: (p) => `<polygon points="10,32 30,22 54,32 30,42" fill="${p.b}" stroke="${p.c}" stroke-width="1.5"/><polygon points="18,32 32,26 46,32 32,38" fill="${p.a}"/>`,
  lightning: (p) => `<polygon points="10,30 34,26 28,31 54,30 30,38 36,33 10,34" fill="${p.b}" stroke="${p.c}" stroke-width="1"/><polygon points="16,31 32,28.5 30,31.5 44,31" fill="${p.a}"/>`,
  poison: (p) => `<ellipse cx="32" cy="32" rx="14" ry="9" fill="${p.b}" stroke="${p.c}" stroke-width="1.5"/><circle cx="26" cy="29" r="3" fill="${p.a}"/><circle cx="38" cy="34" r="2.2" fill="${p.a}"/>`,
  arcane: (p) => `<polygon points="32,18 40,28 52,32 40,36 32,46 24,36 12,32 24,28" fill="${p.b}" stroke="${p.c}" stroke-width="1.5"/><circle cx="32" cy="32" r="4" fill="${p.a}"/>`,
  void: (p) => `<circle cx="32" cy="32" r="10" fill="${p.c}" stroke="${p.b}" stroke-width="2"/><circle cx="32" cy="32" r="5" fill="#14101f"/><circle cx="28" cy="28" r="1.6" fill="${p.a}"/>`,
  enemy: () => `<circle cx="32" cy="32" r="9" fill="#e86a6a" stroke="#a03030" stroke-width="2"/><circle cx="32" cy="32" r="4" fill="#ffb3b3"/>`,
};
for (const [name, fn] of Object.entries(PROJ)) {
  const p = PALETTES[name] ?? PALETTES.physical;
  writeFileSync(
    `art/projectiles/${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n<!-- ${name} projectile — generated -->${fn(p)}\n</svg>\n`,
  );
}
console.log(`generated ${weapons.length} weapon icons + ${Object.keys(PROJ).length} projectile sprites`);
