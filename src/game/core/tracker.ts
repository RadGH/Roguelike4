// Combat tracker: ONE event stream feeds the log, the meters, the deed engine, and
// (later) the recap/report UIs. Attribution is structured IDs, never display strings.

import type { DamageType } from '../data/stats';

export type ActorRef =
  | { kind: 'player'; index: number }
  | { kind: 'enemy'; id: string; instance: number }
  | { kind: 'pet'; owner: number; id: string; instance: number };

export type SourceChain = {
  actor: ActorRef;
  itemId: string | null; // owning weapon/passive/feat
  grantedBy: string | null; // feat/affix that modified or caused it
  deliveryTag: 'projectile' | 'melee' | 'explosion' | 'pool' | 'chain' | 'beam' | 'pet' | 'trail' | 'pickup' | 'contact';
  hitId: number; // shared by all consequences of one hit (multikill deeds)
};

export type Mitigation = {
  dodged: boolean;
  blocked: number;
  armor: number;
  resist: number;
  flat: number;
};

export type TrackerEvent =
  | {
      type: 'damage';
      tick: number;
      wave: number;
      source: SourceChain;
      target: ActorRef;
      amount: number; // final applied
      raw: number;
      types: DamageType[];
      crit: boolean;
      mitigated: Mitigation;
      overkill: number;
    }
  | { type: 'kill'; tick: number; wave: number; source: SourceChain; target: ActorRef }
  | { type: 'heal'; tick: number; wave: number; source: SourceChain; target: ActorRef; amount: number }
  | { type: 'pickup'; tick: number; wave: number; player: number; what: 'gold' | 'xp'; amount: number }
  | { type: 'dodgeSave'; tick: number; wave: number; target: ActorRef; source: SourceChain };

export type DamageAggregate = {
  total: number;
  hits: number;
  crits: number;
  max: number;
};

/** Aggregation tree: playerKey → itemKey → total. Incremental — no rescans. */
export class Tracker {
  events: TrackerEvent[] = [];
  private maxEvents: number;
  /** damage dealt by players: playerIndex → itemId → aggregate */
  byPlayerItem = new Map<number, Map<string, DamageAggregate>>();
  killsByPlayer = new Map<number, number>();
  damageTakenByPlayer = new Map<number, number>();
  goldByPlayer = new Map<number, number>();
  xpByPlayer = new Map<number, number>();
  private nextHitId = 1;

  constructor(maxEvents = 20000) {
    this.maxEvents = maxEvents;
  }

  newHitId(): number {
    return this.nextHitId++;
  }

  push(ev: TrackerEvent): void {
    this.events.push(ev);
    if (this.events.length > this.maxEvents) this.events.splice(0, 2000);
    if (ev.type === 'damage') {
      if (ev.source.actor.kind === 'player' || ev.source.actor.kind === 'pet') {
        const pIdx = ev.source.actor.kind === 'player' ? ev.source.actor.index : ev.source.actor.owner;
        let items = this.byPlayerItem.get(pIdx);
        if (!items) {
          items = new Map();
          this.byPlayerItem.set(pIdx, items);
        }
        const key = ev.source.itemId ?? 'unknown';
        let agg = items.get(key);
        if (!agg) {
          agg = { total: 0, hits: 0, crits: 0, max: 0 };
          items.set(key, agg);
        }
        agg.total += ev.amount;
        agg.hits++;
        if (ev.crit) agg.crits++;
        if (ev.amount > agg.max) agg.max = ev.amount;
      }
      if (ev.target.kind === 'player') {
        this.damageTakenByPlayer.set(
          ev.target.index,
          (this.damageTakenByPlayer.get(ev.target.index) ?? 0) + ev.amount,
        );
      }
    } else if (ev.type === 'kill') {
      if (ev.source.actor.kind === 'player' || ev.source.actor.kind === 'pet') {
        const pIdx = ev.source.actor.kind === 'player' ? ev.source.actor.index : ev.source.actor.owner;
        this.killsByPlayer.set(pIdx, (this.killsByPlayer.get(pIdx) ?? 0) + 1);
      }
    } else if (ev.type === 'pickup') {
      const map = ev.what === 'gold' ? this.goldByPlayer : this.xpByPlayer;
      map.set(ev.player, (map.get(ev.player) ?? 0) + ev.amount);
    }
  }
}
