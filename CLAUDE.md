# Slovak PM Simulator — project guide

9-era Slovak political/economic simulation game. Vite + TypeScript. Deployed to gh-pages. Currently v4.3.

## Stack

- Vite (see `package.json`, `vite.config.*`)
- TypeScript (`src/`)
- Deploy target: GitHub Pages (`netlify.toml` also present)

## Key docs (on disk)

- `BUSINESS_PLAN.md` — original scoping (mostly superseded by board audit)
- `AUDIT.md` — CTO audit findings
- `docs/` — design notes

## Source of truth for "what to build next"

Board audit in the wiki, not in this repo:
- `~/obsidian-wiki/Projects/slovak-pm-simulator-board-audit.md` — CFO/CMO/CTO/Product/Edu/Legal review
- `~/obsidian-wiki/Projects/slovak-pm-simulator-p0-checklist.md` — 7 items to ship by 2026-05-13

## Do not

- Don't rewrite the era transitions without reading `AUDIT.md` — there's a reason the current state machine looks the way it does.
- Don't ship to gh-pages without running the dev build locally first — the `dist/` output is what lands on pages.
- Don't delete `BUSINESS_PLAN.md` even though it's superseded — it's the history of why decisions were made.

## Related wiki pages

- `~/obsidian-wiki/Projects/slovak-pm-simulator.md`
- `~/obsidian-wiki/Projects/slovak-pm-sim-moc.md`
