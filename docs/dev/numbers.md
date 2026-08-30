# Baseline numbers (v1 — proposals, not vault canon)

The design vault deliberately contains no numbers. Everything here is a first proposal,
tuned by Simulation Mode over time. Treat these as the working baseline; the vault gets
the final versions once they survive play.

## Fixed engine values

| Value | Number | Why |
|---|---|---|
| Sim tick rate | 30/s | Deterministic fixed step; render interpolates |
| Density cap | 220 enemies | Readability rule — spawns defer, never stack |
| Arena size | 28 × 20 world units | Bounded arena keeps zoom-out finite |

## Player baseline (identical every run — no permanent power)

| Stat | Value |
|---|---|
| Max health | 20 |
| Move speed | 5 u/s |
| Pickup radius | 1.5 u |
| Base weapon slots | 2 (class trait; Student = 2) |

## Wave pacing targets (from the vault's DR-002)

| Target | Value |
|---|---|
| Fight duration | 60–90 s |
| Waves per act | 10 |
| Build online | waves 5–7 |
| Solo run | ~18 min |
| Four-player run | ~35 min |

## Act 1 enemy baseline

| Enemy | HP | Contact dmg | Speed | XP | Gold |
|---|---|---|---|---|---|
| Nibbler | 3 | 1 | 2.6 | 1 | 1 |
| Scurrier | 6 | 2 | 3.4 | 2 | 2 |
| Spitter | 5 | 2 | 2.0 | 3 | 2 |
| Slime | 14 | 2 | 1.2 | 4 | 3 |
| Slimeling | 5 | 1 | 1.8 | 1 | 1 |

Escalation across waves comes from composition and count (authored waves), then density +
elites at waves 8–9, per the Enemy Catalog. Enemy stats do not scale within an act.

## Starter weapons

| Weapon | Type | Dmg | CD | Range | Price |
|---|---|---|---|---|---|
| Practice Sword | Melee | 3 | 0.8s | 1.8 | 20g |
| Practice Wand | Magic | 2 | 0.7s | 8 | 20g |
| Shortbow | Ranged | 3 | 1.0s | 9 | 25g |

DPS sanity: sword ≈ 3.75, wand ≈ 2.86 (safe at range), bow ≈ 3.0. Melee pays for
proximity with the highest number.

## Open number work (next)

- XP curve per level; perk tier multipliers (white/blue/yellow/green)
- Gold income per wave vs shop prices (watch: waves until first weapon purchase ≤ 3)
- Armor diminishing-return curve
- Telegraph windows per severity (light/heavy/extreme)
