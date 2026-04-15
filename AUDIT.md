# Slovak PM Simulator — Code Audit

**Date:** 2026-04-10 | **Codebase:** 3,439 lines TypeScript across 16 files

---

## Bugs Fixed

### 1. Warning Banner Duplication (`game-flow.ts:257-265`)
**Severity: Medium** — visible to players

`proceed()` called `updateDash()` which sets `warningBanner.innerHTML` with metric warnings (low approval, etc.), then immediately appended crisis/poll/scandal warnings using `wb.innerHTML = (wb.innerHTML || '') + ...`. This caused the metric warnings from `updateDash()` to appear twice — once from the dashboard render, once carried over when appending.

**Fix:** Collect all `proceed()`-specific warnings into an array, then append them to the existing banner content in one operation instead of repeatedly reading and re-writing `innerHTML`.

### 2. Single Quote Escaping in `esc()` (`sanitize.ts`)
**Severity: Low** — defense in depth

`esc()` escaped HTML entities via `textContent`/`innerHTML` round-trip, but didn't escape single quotes. The function is used in onclick handler strings like `onclick="window.__doKick('${esc(id)}')"`. If a coalition partner ID ever contained a `'`, this would break the handler and could allow script injection.

IDs come from trusted JSON files so this was not exploitable in practice, but the fix is trivial (`.replace(/'/g, '&#39;')`) and closes the gap.

---

## Dead Code Removed

### 1. `Stakeholder.fp` field (`types.ts:64`)
Optional `fp?: number` field defined on the `Stakeholder` interface but never read anywhere in the engine code. Removed from the type definition. If any era JSON files include `fp` values, they're harmlessly ignored by TypeScript.

### 2. Redundant type cast (`analysis.ts:36`)
`const r = raw as Record<string, unknown>` was redundant since the `raw` parameter was already typed as `Record<string, unknown>`. Removed the intermediate variable and used `raw` directly.

---

## Audit Findings — No Action Needed

These items were reviewed and determined to be correct or intentional:

### Architecture
- **16 TypeScript files, ~3,400 LOC** — well-organized into engine/, render/, and utility modules
- **Zero runtime dependencies** — only devDependencies (TypeScript + Vite)
- **~73KB JS bundle** — excellent for the complexity
- **Static HTML structure** — `game.html` has all screens, TypeScript swaps visibility via CSS classes

### Security
- **CSP headers** in both HTML files restrict script/style sources
- **Path traversal protection** in `loader.ts` — era ID validated against `/^[a-z0-9-]+$/`
- **XSS protection** — `esc()` used consistently for all user/dynamic content in innerHTML
- **API keys** stored in `sessionStorage` (auto-cleared on tab close), never sent to own server
- **No server-side code** — entire game runs client-side on GitHub Pages

### Intentional Patterns (not bugs)
- **`window.__doKick` / `__handleDem` / etc. globals** — ugly but functional pattern for onclick handlers in dynamically generated HTML. Refactoring to event delegation would be cleaner but isn't worth the effort for 4 handlers.
- **`!` non-null assertions on `getElementById`** — acceptable in a single-page game with static HTML. All referenced elements exist in `game.html`.
- **`pellegrini` initialization via `presidentUnfriendlyMonth`** (`state.ts:46`) — correctly implements the two-transition president model (friendly/unfriendly transitions at different months per era).
- **`(era as unknown as Record<string, unknown>).quietMonths`** (`events.ts:15`) — optional field access pattern. The type doesn't declare `quietMonths` but some era JSONs may include it.

### Game Engine Quality
- **Economic model** is well-designed: Okun's Law, Phillips curve (NAIRU at 6%), business cycles, FDI dynamics, EU funds linkage, brain drain, and debt-to-GDP spiral are all implemented with reasonable parameters
- **Nash bargaining** and **Shapley power index** for coalition dynamics — computationally sound (Shapley uses full permutation enumeration, feasible for n<=6 partners)
- **Monte Carlo election simulation** (500 runs + D'Hondt allocation) — correct implementation with proper 5% threshold and confidence intervals
- **Media cycle, crisis fatigue, political capital** — well-balanced dampening systems that prevent runaway feedback loops

### Known Limitations (not bugs)
- **No unit tests** — Vitest is the recommended framework given the Vite setup
- **No ARIA accessibility** — keyboard navigation and screen reader support missing
- **Hub page vs game page theme mismatch** — `index.html` uses light theme, `game.html` uses dark theme
- **Analytics are localStorage-only** — no external analytics service, so no real visitor data
- **`consequenceChains`** data exists in all era JSONs but only fires when specific flags are set by policy keyword matching — some chains may never trigger if players don't use the right keywords
