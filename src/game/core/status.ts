// Status effects — ONE global system (design 03-combat.md). Data lists effects;
// nothing burns/stuns/slows unless its source says so. DoT ticks keep the original
// source chain so meters and deeds attribute correctly.

import type { EffectDef } from '../data/schemas';
import type { SourceChain } from './tracker';

export type StatusTarget = 'normal' | 'elite' | 'boss';

export type StatusState = {
  // Burn: pool dealt over 3s in 0.5s ticks; reapply adds 50% of new total + refreshes
  burnPool: number;
  burnRate: number; // damage per second
  burnTickIn: number;
  burnSource: SourceChain | null;
  // Poison: stacks fully, 1s ticks, longer/cheaper
  poisonPool: number;
  poisonRate: number;
  poisonTickIn: number;
  poisonSource: SourceChain | null;
  // Control
  stunLeft: number;
  slowLeft: number;
  slowMag: number; // 0..1 move/attack speed reduction
  freezeLeft: number;
  // Diminishing returns: re-applies within the window are 50% shorter per recent apply
  recentControlApplies: number;
  controlWindowLeft: number;
};

export function freshStatus(): StatusState {
  return {
    burnPool: 0,
    burnRate: 0,
    burnTickIn: 0,
    burnSource: null,
    poisonPool: 0,
    poisonRate: 0,
    poisonTickIn: 0,
    poisonSource: null,
    stunLeft: 0,
    slowLeft: 0,
    slowMag: 0,
    freezeLeft: 0,
    recentControlApplies: 0,
    controlWindowLeft: 0,
  };
}

const BURN_DURATION = 3;
const BURN_TICK = 0.5;
const POISON_TICK = 1;
const POISON_DURATION = 6;
const CONTROL_DR_WINDOW = 6;

const TARGET_CONTROL_MULT: Record<StatusTarget, number> = {
  normal: 1,
  elite: 0.5,
  boss: 0.15,
};

function controlDuration(base: number, s: StatusState, target: StatusTarget): number {
  const dr = Math.pow(0.5, s.recentControlApplies);
  s.recentControlApplies++;
  s.controlWindowLeft = CONTROL_DR_WINDOW;
  return base * dr * TARGET_CONTROL_MULT[target];
}

/** Apply a listed effect. Chance is rolled by the CALLER (needs the rng stream). */
export function applyEffect(
  s: StatusState,
  effect: EffectDef,
  source: SourceChain,
  target: StatusTarget,
): void {
  switch (effect.kind) {
    case 'burn': {
      const amount = effect.amount ?? 0;
      if (s.burnPool > 0) s.burnPool += amount * 0.5;
      else s.burnPool = amount;
      s.burnRate = s.burnPool / BURN_DURATION;
      if (s.burnTickIn <= 0) s.burnTickIn = BURN_TICK;
      s.burnSource = source;
      break;
    }
    case 'poison': {
      s.poisonPool += effect.amount ?? 0;
      s.poisonRate = Math.max(s.poisonRate, s.poisonPool / POISON_DURATION);
      if (s.poisonTickIn <= 0) s.poisonTickIn = POISON_TICK;
      s.poisonSource = source;
      break;
    }
    case 'stun':
      s.stunLeft = Math.max(s.stunLeft, controlDuration(effect.duration ?? 0.5, s, target));
      break;
    case 'freeze': {
      const dur = controlDuration(effect.duration ?? 1, s, target);
      if (target === 'normal') s.freezeLeft = Math.max(s.freezeLeft, dur);
      else {
        // Elites/bosses: heavy slow instead of a hard stop
        s.slowLeft = Math.max(s.slowLeft, dur);
        s.slowMag = Math.max(s.slowMag, 0.6);
      }
      break;
    }
    case 'slow':
      s.slowLeft = Math.max(s.slowLeft, effect.duration ?? 1.5);
      s.slowMag = Math.max(s.slowMag, effect.magnitude ?? 0.3);
      break;
  }
}

export type DotTick = {
  kind: 'burn' | 'poison';
  amount: number;
  source: SourceChain;
};

/** Advance timers; returns DoT ticks due this step (caller applies the damage). */
export function tickStatus(s: StatusState, dt: number): DotTick[] {
  const out: DotTick[] = [];
  if (s.controlWindowLeft > 0) {
    s.controlWindowLeft -= dt;
    if (s.controlWindowLeft <= 0) s.recentControlApplies = 0;
  }
  if (s.stunLeft > 0) s.stunLeft = Math.max(0, s.stunLeft - dt);
  if (s.freezeLeft > 0) s.freezeLeft = Math.max(0, s.freezeLeft - dt);
  if (s.slowLeft > 0) {
    s.slowLeft = Math.max(0, s.slowLeft - dt);
    if (s.slowLeft === 0) s.slowMag = 0;
  }
  if (s.burnPool > 0 && s.burnSource) {
    s.burnTickIn -= dt;
    while (s.burnTickIn <= 0 && s.burnPool > 0) {
      const amount = Math.min(s.burnPool, s.burnRate * BURN_TICK);
      s.burnPool -= amount;
      out.push({ kind: 'burn', amount, source: s.burnSource });
      s.burnTickIn += BURN_TICK;
    }
    if (s.burnPool <= 0.01) {
      s.burnPool = 0;
      s.burnSource = null;
    }
  }
  if (s.poisonPool > 0 && s.poisonSource) {
    s.poisonTickIn -= dt;
    while (s.poisonTickIn <= 0 && s.poisonPool > 0) {
      const amount = Math.min(s.poisonPool, s.poisonRate * POISON_TICK);
      s.poisonPool -= amount;
      out.push({ kind: 'poison', amount, source: s.poisonSource });
      s.poisonTickIn += POISON_TICK;
    }
    if (s.poisonPool <= 0.01) {
      s.poisonPool = 0;
      s.poisonSource = null;
    }
  }
  return out;
}

/** Effective movement multiplier from control statuses. */
export function moveMult(s: StatusState): number {
  if (s.stunLeft > 0 || s.freezeLeft > 0) return 0;
  return 1 - s.slowMag;
}

export function isControlled(s: StatusState): boolean {
  return s.stunLeft > 0 || s.freezeLeft > 0;
}

export function isBurning(s: StatusState): boolean {
  return s.burnPool > 0;
}

export function isFrozen(s: StatusState): boolean {
  return s.freezeLeft > 0;
}
