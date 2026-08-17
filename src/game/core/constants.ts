// Engine-level constants. Gameplay balance numbers migrate to data/balance.json as
// systems land (M1); these are the simulation's structural constants.

export const TICK_RATE = 30; // fixed simulation ticks per second
export const TICK_SECONDS = 1 / TICK_RATE;

// Distance unit: 1 unit ≈ 32 px at reference zoom.
export const PLAYER_MOVE_SPEED = 6.8; // units/s (proven feel from the predecessor)
export const DASH_SPEED = 18.75; // units/s
export const DASH_DURATION = 0.18; // s
export const DASH_IFRAMES = 0.15; // s
export const DASH_COOLDOWN = 0.9; // s
export const PLAYER_RADIUS = 0.55; // units
