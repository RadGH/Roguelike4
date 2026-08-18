// The ONLY place the working title enters code. Rename the game by editing
// data/branding.json — nothing else in the codebase names the game.
import branding from '@data/branding.json';

export const GAME_TITLE: string = branding.title;
export const GAME_TAGLINE: string = branding.tagline;
export const GAME_VERSION: string = branding.version;
export const SAVE_SLUG: string = branding.saveSlug;
