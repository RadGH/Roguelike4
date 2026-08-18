// Headless run driver: pilots the REAL Sim (the same core the browser runs) with
// bot inputs and simple reward policies. No reimplemented combat math anywhere —
// every roll, drop, and level-up goes through the exact code the player's game
// uses (the predecessor's fatal sin was four diverging combat copies).

import { Sim } from '../core/sim';
import { neutralInput, type InputFrame } from '../core/input';
import { TICK_RATE } from '../core/constants';
import { stat } from '../core/stats';
import { resolveWeapon } from '../core/items';
import type { WeaponInstance } from '../core/items';

export type BotPolicy = 'kite' | 'brawl';

export type HeadlessOptions = {
  seed: number;
  classIds?: string[];
  players?: number;
  act?: number;
  policy?: BotPolicy;
  /** stop after clearing this wave (defaults to the act's last wave) */
  untilWave?: number;
  /** cross act boundaries and play through wave 40 (the full campaign) */
  campaign?: boolean;
  /** unlock everything so chest pools are rich (guardrails assume mid-progress saves) */
  allUnlocked?: boolean;
  /** safety valve: a wave taking longer than this many seconds counts as a stall */
  waveTimeLimit?: number;
};

export type HeadlessResult = {
  victory: boolean;
  stalled: boolean;
  waveReached: number;
  deathWave: number | null;
  ticks: number;
  kills: number;
  goldEarned: number;
  finalLevel: number;
  damageDealt: number;
  damageTaken: number;
};

/** One bot-piloted input frame for a player. */
export function botInput(sim: Sim, playerIndex: number, policy: BotPolicy): InputFrame {
  const p = sim.state.players[playerIndex]!;
  const frame = neutralInput();
  if (!p.alive) return frame;
  // Melee-only loadouts need a duelist's gait, not a kiter's; a weaponless
  // pet class must hold mid-range or its leashed pets never reach the fight
  const hasMelee = p.weapons.some(
    (w) => sim.registry.weapons.get(w.itemId)?.delivery.type === 'meleeArc',
  );
  const meleeOnly =
    p.weapons.length > 0 &&
    p.weapons.every((w) => sim.registry.weapons.get(w.itemId)?.delivery.type === 'meleeArc');
  const petCommander = p.weapons.length === 0;

  let fleeX = 0;
  let fleeY = 0;
  let threat = 0;
  let nearestDist = Infinity;
  for (const e of sim.state.enemies) {
    if (!e.alive) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < nearestDist) nearestDist = d;
    // Telegraphed windups and active charges are lethal — clear out hard
    const scary = e.charge.phase === 'windup' || e.charge.phase === 'charging';
    const radius = scary ? 10 : 7;
    if (d < radius) {
      // heavier hitters push harder — the bot respects elites and minibosses
      const menace = 1 + e.damage / 5;
      const w = (radius - d) * (radius - d) * (scary ? 1.2 : 0.3) * menace;
      fleeX += (dx / d) * w;
      fleeY += (dy / d) * w;
      threat++;
      if (scary && d < 4 && p.dashCooldown <= 0) frame.dash = true;
    }
  }

  // Projectile avoidance: sidestep incoming enemy shots
  let dodgeUrgent = false;
  for (const pr of sim.state.projectiles) {
    if (!pr.active || pr.fromPlayer >= 0) continue;
    const rx = p.x - pr.x;
    const ry = p.y - pr.y;
    const speed = Math.hypot(pr.vx, pr.vy) || 1;
    // time of closest approach
    const t = (rx * pr.vx + ry * pr.vy) / (speed * speed);
    if (t < 0 || t > 1.2) continue;
    const cx = pr.x + pr.vx * t - p.x;
    const cy = pr.y + pr.vy * t - p.y;
    const miss = Math.hypot(cx, cy);
    if (miss < 1.4) {
      // steer perpendicular to the shot
      const px = -pr.vy / speed;
      const py = pr.vx / speed;
      const side = px * rx + py * ry >= 0 ? 1 : -1;
      fleeX += px * side * 4;
      fleeY += py * side * 4;
      if (miss < 0.8 && t < 0.4) dodgeUrgent = true;
    }
  }

  let pullX = 0;
  let pullY = 0;
  let bestPickup = threat > 2 ? 3 : 6; // don't greed pickups while swarmed
  for (const pk of sim.state.pickups) {
    if (!pk.active) continue;
    const dx = pk.x - p.x;
    const dy = pk.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < bestPickup) {
      bestPickup = d;
      pullX = dx / d;
      pullY = dy / d;
    }
  }

  // Soft centering keeps bots off the walls
  const cx = sim.state.arena.width / 2 - p.x;
  const cy = sim.state.arena.height / 2 - p.y;
  const cd = Math.hypot(cx, cy) || 1;
  const centerBias = cd > 12 ? 0.6 : 0.15;

  let mx: number;
  let my: number;
  // Mixed melee/ranged kits kite the swarm, but a kit with lifesteal sustain
  // closes in to finish stragglers — end-of-wave whittling is where pure
  // kiting stalls out the clock, and sustain makes the contact survivable
  const aliveCount = sim.state.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  const sustain =
    stat(p.stats, 'lifestealPhys') > 0 || stat(p.stats, 'lifestealMagic') > 0;
  // ...and never "finish" a miniboss/elite: heavy hitters get kited, not hugged
  const nearestE = sim.nearestEnemy(p.x, p.y, 100);
  const hpFrac = p.hp / Math.max(1, stat(p.stats, 'maxHp'));
  const finishThem =
    hasMelee &&
    !meleeOnly &&
    sustain &&
    aliveCount <= 2 &&
    !!nearestE &&
    // weak stragglers always; a heavy (miniboss/boss) only while healthy —
    // lifesteal turns short, disciplined contact windows into net healing
    (nearestE.damage <= 3 || hpFrac > 0.65);
  if ((meleeOnly || petCommander || finishThem) && aliveCount > 0) {
    // Ring-keeping duelist: hover just inside arc reach, strafe, bail on telegraphs.
    // Pet commanders hold a wider ring so leashed pets can reach the fight.
    const e = nearestE;
    if (e) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const scary = e.charge.phase === 'windup' || e.charge.phase === 'charging';
      const ring = scary ? 8 : petCommander ? 5.5 : meleeOnly ? 1.5 : 2.0;
      const toward = d > ring ? 1.2 : d < ring * 0.6 ? -0.8 : 0;
      // A duelist commits: general crowd pressure never outweighs the approach —
      // only telegraphs and incoming shots earn a sidestep
      const fleeBlend = scary || dodgeUrgent ? 0.4 : 0;
      mx = (dx / d) * toward + (-dy / d) * 0.5 + fleeX * fleeBlend;
      my = (dy / d) * toward + (dx / d) * 0.5 + fleeY * fleeBlend;
      // Backspin rogues weave dashes through the target to bank guaranteed crits
      if (
        !scary &&
        d < 3 &&
        p.dashCooldown <= 0 &&
        !p.guaranteedCrit &&
        sim.registry.classes.get(p.classId)?.mechanic === 'backspin'
      ) {
        frame.dash = true;
        mx = dx / d;
        my = dy / d;
      }
    } else {
      mx = pullX;
      my = pullY;
    }
  } else if (policy === 'brawl' && threat === 0 && sim.state.enemies.length > 0) {
    // walk toward the nearest enemy to keep auto-aim in range
    const e = sim.nearestEnemy(p.x, p.y, 100);
    if (e) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      mx = dx / d;
      my = dy / d;
    } else {
      mx = pullX;
      my = pullY;
    }
  } else {
    // Circle-strafe: blend the flee vector with its tangent so the bot orbits the
    // pack instead of backing into a corner (what a human's kiting looks like)
    const fm = Math.hypot(fleeX, fleeY) || 1;
    const tangX = -fleeY / fm;
    const tangY = fleeX / fm;
    mx = fleeX * 0.7 + tangX * fm * 0.45 + pullX * (threat > 1 ? 0.25 : 0.6) + (cx / cd) * centerBias;
    my = fleeY * 0.7 + tangY * fm * 0.45 + pullY * (threat > 1 ? 0.25 : 0.6) + (cy / cd) * centerBias;
  }
  const mag = Math.hypot(mx, my);
  if (mag > 0.01) {
    frame.moveX = mx / mag;
    frame.moveY = my / mag;
  }
  // Twin-stick discipline: always aim at the nearest enemy (fire over the shoulder
  // while kiting — exactly what a human does with the right stick / mouse)
  const aimTarget = sim.nearestEnemy(p.x, p.y, 100);
  if (aimTarget) {
    const ax = aimTarget.x - p.x;
    const ay = aimTarget.y - p.y;
    const ad = Math.hypot(ax, ay) || 1;
    frame.aimX = ax / ad;
    frame.aimY = ay / ad;
    frame.fire = true;
  }
  // Panic dash when something is on top of us or a shot is unavoidable
  if ((nearestDist < 1.8 || dodgeUrgent) && p.dashCooldown <= 0) frame.dash = true;
  return frame;
}

/** Greedy reward policy: class items → first; chests → first weapon that fits,
 *  else passive, else salvage; boons → biggest matching damage stat, else first. */
/** Rough single-target DPS estimate for comparing chest offers to the current kit. */
function roughDps(sim: Sim, inst: WeaponInstance): number {
  const w = resolveWeapon(sim.registry, inst);
  const avg = ((w.flat[0] + w.flat[1]) / 2) * w.multiplier;
  const count = w.delivery.type === 'meleeArc' ? 1 : (w.delivery.count ?? 1);
  return (avg * count) / Math.max(0.1, w.delivery.cooldown);
}

export function resolveRewards(sim: Sim): void {
  for (const p of sim.state.players) {
    let guard = 0;
    while (p.pendingClassItems.length > 0 && guard++ < 20) {
      const options = p.pendingClassItems[0]!;
      if (!sim.equipWeapon(p.index, options[0]!)) {
        // full hands: replace slot 0
        sim.replaceWeapon(p.index, 0, options[0]!);
      }
      p.pendingClassItems.shift();
    }
    guard = 0;
    while (p.pendingChests > 0 && guard++ < 30) {
      const offers = sim.rollChestChoices(p.index, 3);
      let taken = false;
      for (const offer of offers) {
        if (offer.kind === 'passive') {
          sim.addPassive(p.index, offer.id);
          taken = true;
          break;
        }
        if (sim.equipWeapon(p.index, offer.inst)) {
          taken = true;
          break;
        }
        // Full hands: swap out the weakest weapon when the offer is a clear
        // upgrade — humans don't carry a starter wand to the boss
        let worstIdx = -1;
        let worstDps = Infinity;
        const resolved = p.weapons.map((w) => resolveWeapon(sim.registry, w));
        const spellCount = resolved.filter((w) => w.kind === 'spell').length;
        for (let i = 0; i < p.weapons.length; i++) {
          // AoE and status weapons punch far above their listed numbers —
          // never treat them as the weak link
          const cur = resolved[i]!;
          const special =
            (cur.delivery.type !== 'meleeArc' && (cur.delivery.blastRadius ?? 0) > 0) ||
            (cur.effects?.length ?? 0) > 0;
          if (special) continue;
          // A caster's spells feed each other through spellDamage grants —
          // keep the synergy stack intact
          if (cur.kind === 'spell' && spellCount >= 2) continue;
          const d = roughDps(sim, p.weapons[i]!);
          if (d < worstDps) {
            worstDps = d;
            worstIdx = i;
          }
        }
        if (worstIdx >= 0 && roughDps(sim, offer.inst) > worstDps * 1.25) {
          const before = p.weapons[worstIdx]!.itemId;
          sim.replaceWeapon(p.index, worstIdx, offer.inst);
          if (p.weapons[worstIdx]!.itemId !== before) {
            taken = true;
            break;
          }
        }
      }
      if (!taken) p.bits += 2; // salvage
      p.pendingChests--;
      // Tinker when flush
      while (p.bits >= 5 && sim.tinker(p.index, 0)) {
        /* upgrade the first slot while affordable */
      }
    }
    guard = 0;
    while (p.pendingBoons > 0 && guard++ < 50) {
      const choices = sim.rollBoonChoices(4);
      // Humans buy survivability as the waves deepen: keep maxHp ≈ 10 + 2.2×wave,
      // then push damage. Defense (armor/regen/dodge) counts toward "survival".
      const wantSurvival = (stat(p.stats, 'maxHp') || 10) < 10 + sim.state.wave * 2.2;
      const survivalPick = choices.find((id) => {
        const b = sim.registry.boons.get(id)!;
        return b.grants.some((g) =>
          ['maxHp', 'armor', 'hpRegen', 'dodge', 'flatReduction', 'resistAll'].includes(g.stat),
        );
      });
      const damagePick = choices.find((id) => {
        const b = sim.registry.boons.get(id)!;
        return b.grants.some((g) => (stat(p.stats, g.stat) ?? 0) > 0 && g.stat.includes('Damage'));
      });
      const pick = (wantSurvival ? (survivalPick ?? damagePick) : (damagePick ?? survivalPick)) ?? choices[0]!;
      sim.applyBoon(p.index, pick);
    }
  }
}

export function runHeadless(opts: HeadlessOptions): HeadlessResult {
  const players = opts.players ?? 1;
  const policy = opts.policy ?? 'kite';
  const sim = new Sim(opts.seed, players, undefined, opts.classIds ?? []);
  if (opts.allUnlocked) {
    for (const id of sim.registry.weapons.keys()) sim.unlockedItems.add(id);
    for (const id of sim.registry.passives.keys()) sim.unlockedItems.add(id);
  }
  if (opts.act && opts.act > 1) sim.setStartingAct(opts.act);
  const firstWave = sim.firstWaveOfCurrentAct();
  const untilWave = opts.untilWave ?? (opts.campaign ? 40 : firstWave + 9);
  const waveLimitTicks = (opts.waveTimeLimit ?? 150) * TICK_RATE;

  // Spend act catch-up packages (boons/chests/class items) before the first bell
  resolveRewards(sim);
  sim.startWaveNumber(firstWave);
  let ticks = 0;
  let stalled = false;
  let deathWave: number | null = null;
  let waveTicks = 0;

  // Hard ceiling so a bugged run can never wedge the process
  const HARD_CAP = TICK_RATE * 60 * 45;
  while (ticks < HARD_CAP) {
    const inputs = sim.state.players.map((p) => botInput(sim, p.index, policy));
    const events = sim.tick(inputs);
    ticks++;
    waveTicks++;

    if (events.some((e) => e.type === 'runOver')) {
      deathWave = sim.state.wave;
      break;
    }
    if (sim.state.phase === 'cleared') {
      resolveRewards(sim);
      waveTicks = 0;
      if (sim.state.wave >= untilWave) break; // victory condition reached
      if (opts.campaign && !sim.hasNextWave()) sim.advanceAct();
      else sim.startWaveNumber(sim.state.wave + 1);
    }
    if (waveTicks > waveLimitTicks) {
      stalled = true;
      break;
    }
  }

  const p0 = sim.state.players[0]!;
  const items = sim.tracker.byPlayerItem;
  let damageDealt = 0;
  for (const perItem of items.values()) {
    for (const agg of perItem.values()) damageDealt += agg.total;
  }
  let damageTaken = 0;
  for (const v of sim.tracker.damageTakenByPlayer.values()) damageTaken += v;
  let kills = 0;
  for (const v of sim.tracker.killsByPlayer.values()) kills += v;

  return {
    victory: deathWave === null && !stalled && sim.state.wave >= untilWave,
    stalled,
    waveReached: sim.state.wave,
    deathWave,
    ticks,
    kills,
    goldEarned: p0.gold,
    finalLevel: p0.level,
    damageDealt: Math.round(damageDealt),
    damageTaken: Math.round(damageTaken),
  };
}

export type BatchReport = {
  classId: string;
  runs: number;
  clearRate: number;
  stallRate: number;
  avgWave: number;
  avgLevel: number;
  avgKills: number;
  avgDamage: number;
};

export function runBatch(classId: string, runs: number, seedBase = 1000, opts: Partial<HeadlessOptions> = {}): BatchReport {
  let clears = 0;
  let stalls = 0;
  let waves = 0;
  let levels = 0;
  let kills = 0;
  let damage = 0;
  for (let i = 0; i < runs; i++) {
    const r = runHeadless({
      seed: seedBase + i * 7919,
      classIds: [classId],
      allUnlocked: true,
      ...opts,
    });
    if (r.victory) clears++;
    if (r.stalled) stalls++;
    waves += r.waveReached;
    levels += r.finalLevel;
    kills += r.kills;
    damage += r.damageDealt;
  }
  return {
    classId,
    runs,
    clearRate: clears / runs,
    stallRate: stalls / runs,
    avgWave: waves / runs,
    avgLevel: levels / runs,
    avgKills: kills / runs,
    avgDamage: damage / runs,
  };
}
