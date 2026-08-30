# Release checklist

Before tagging a build:

1. `npm test` and `npm run e2e` green, `npm run lint` clean, `npm run build` succeeds.
2. `npm run stress` under budget.
3. `npm run simulate` sanity: solo mid-skill win rate in the 30–50% band, death histogram
   spread across waves 6–10 (no single-wave cliff), first weapon purchase by wave 3.
4. Play one full solo run in the browser; one 2-player run if hardware allows.
5. Screenshot review (scripts/screenshot-live.mjs) against the art rules: squint test,
   telegraph visibility, player identity at zoom-out.
6. Grep the diff for the working title and reference-game names (must be absent —
   the title lives only in `src/branding.ts`).
7. Confirm `new/` and `references/` are untracked.
8. Bump `version` in package.json, tag, push.

Deploy (once Pages is enabled): push to main runs the workflow in
`docs/dev/github-pages-deploy.yml` (must live at `.github/workflows/deploy.yml` — needs a
token with workflow scope, or move it by hand).
