# BingeMate UI information bank

Reference for every page we build in `apps/web`. Two parts, kept apart on purpose:

- **Part A: Extracted from the video.** What is actually visible in the reference design. Treat as fact.
- **Part B: Our inputs.** Decisions and extensions we made. Treat as ours to change.

If something is in Part B, nobody drew it in the reference; it is a design choice.

---

# Part A: Extracted from the video

**Source:** Dribbble shot "IMDB Redesign featuring Dune Part 2 - Media App" (https://dribbble.com/shots/23848918-IMDB-Redesign-featuring-Dune-Part-2-Media-App).
Dribbble blocked automated fetching, so this comes from a 15.6 s screen recording (2046 x 1276) of the shot. Six frames were reviewed (one every 3 s).
Colours and sizes are **estimates** read from compressed video, not exact values.

## A1. Screens shown
1. **Title hero** (Dune: Part Two): full-bleed poster art, title, synopsis, rating, tags, play button.
2. **Person / filmography strip** (Denis Villeneuve): row of tall posters over a giant ghost surname.

Nothing else is shown: no forms, lists, tables, comments, admin or mobile layouts.

## A2. Global look
- Dark only. Background near-black, text white, secondary text grey.
- One accent colour: yellow, used on the logo chip and the rating pill.
- Neo-grotesque sans-serif (looks like Helvetica Now / Neue Haas), tight letter-spacing on large text.
- Imagery is full-bleed. A dark gradient fades the bottom of the hero to black.
- Rounded pill shapes for tags and badges.

## A3. Breadcrumb
- Centred at the top of the screen.
- Pattern: `Main > Films > Denis Villeneuve > Dune: Part Two`.
- Parent crumbs muted grey, current crumb white, chevron separators, about 14 px.
- On the filmography screen it stops at the person: `Main > Films > Denis Villeneuve`.

## A4. Navigation (in the reference it is at the BOTTOM, centred)
- Floating dock, not full width. Dark grey translucent bar, rounded corners.
- Left to right: yellow logo chip (IMDb), then text items `Menu` (with a grid-dots icon), `Actors`, `Description`, `Title`, `Title`, then three square icon buttons: `Save` (bookmark), `Search` (magnifier), `Sign in` (person).
- Icon buttons have a tiny caption under the icon.
- Text items about 13 px, white at reduced opacity.

## A5. Title hero
- **Title:** very large white text, top-left, two lines (`Dune:` / `Part Two`), about 110 px, line-height about 1.
- **Synopsis:** right-top, about 15 px, about 380 px wide, white, with a studio credit at the end.
- **Rating:** yellow filled pill under the synopsis: `IMDb` wordmark in bold plus the score (`9.6`).
- **Play button:** centred, large translucent grey circle (about 110 px) with a white play triangle.
- **Metadata (bottom-left):** label plus outlined pills. `Country:` Usa, Canada. `Studio:` Warner Bros. Then a runtime pill (`2h 46min`) that fades in a moment later.
- **Pills:** 1 px white outline, transparent fill, fully rounded, about 14 px text.

## A6. Filmography strip
- Seven tall, narrow portrait posters in a row (about 145 px wide, about 480 px tall) with even gaps.
- Posters are **greyscale** by default.
- The hovered poster turns **full colour**, grows slightly and lifts up.
- A giant ghost surname (`Villeneuve`) sits behind the posters at the bottom, very dark grey on black, so large it is cropped by the screen edges.
- **Our build differs:** the Home strip has no ghost word, and its section reserves a top zone for the breadcrumb so a lifted poster can never cover "Trending now". Ghost text stays on the loading, empty, error, 403 and 404 states.
- Black background.

## A7. Motion seen
- Posters enter staggered from the left, at different heights, then settle into one row.
- Hover on a poster: greyscale to colour plus lift.
- The hero and the strip alternate (transition between the two screens).
- The runtime pill fades in after the others.

---

# Part B: Our inputs

Everything below was decided by us (Claude Code session on 2026-10-17 with WH). None of it is in the reference.

## B1. Decisions made
| Decision | Choice | Why |
|---|---|---|
| Navigation position | **Fixed at the top** of the viewport (reference has it at the bottom) | Requested by WH |
| Font | **Inter** | Requested by WH. Free, close to the reference's neo-grotesque feel |
| Brand | **BingeMate** wordmark in the yellow chip. No IMDb name, logo, or Dune artwork | We are not IMDb; also avoids copyright issues |
| Imagery | Mock posters (CSS/SVG placeholders) first, real dataset posters later | Backend and data are not ready |
| Theme | Dark only | Matches the reference; avoids doubling the styling work |
| Visuals first | Static preview at `docs/design/preview.html` before React pages | Review the look cheaply before building it |

## B2. Design tokens (proposed)
Names are CSS custom properties. Values are our estimates from Part A; adjust here first, then in code.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#070707` | Page background |
| `--surface` | `#161616` | Cards, inputs, panels |
| `--surface-2` | `#222222` | Raised surfaces, hover |
| `--dock` | `rgba(38,38,38,0.82)` | Nav dock fill (with blur) |
| `--border` | `rgba(255,255,255,0.14)` | Outlines |
| `--text` | `#ffffff` | Primary text |
| `--text-muted` | `#9a9a9a` | Secondary text |
| `--ghost` | `#1e1e1e` | Giant background words |
| `--accent` | `#f5c518` | Logo chip, rating, primary actions |
| `--accent-ink` | `#111111` | Text on accent |
| `--danger` | `#ff5c5c` | Errors, destructive actions |
| `--success` | `#4cd083` | Approved / success |
| `--warn` | `#f5a623` | Pending |

Type scale (Inter):

| Token | Size | Weight | Use |
|---|---|---|---|
| `--fs-display` | `clamp(3.5rem, 8vw, 7rem)` | 500, letter-spacing -0.04em | Hero titles |
| `--fs-h1` | 2.5rem | 600 | Page titles |
| `--fs-h2` | 1.5rem | 600 | Section titles |
| `--fs-body` | 0.95rem | 400 | Body |
| `--fs-small` | 0.8rem | 400/500 | Nav, labels, captions |

Shape and spacing: pill radius `999px`; poster radius `8px`; panel radius `16px`; spacing steps 4, 8, 12, 16, 24, 32, 48, 64 px.

## B3. Fixed top navigation (our spec)
- `position: fixed; top: 16px; left: 50%; transform: translateX(-50%)`, `z-index` above all content.
- Same dock as the reference: logo chip, text links, icon buttons.
- Our links (the reference's `Actors/Description/Title` are placeholders): `Menu`, `Browse`, `Trending`, `My Lists`.
- Our icon buttons: `Save` (watchlist), `Search`, `Sign in` (becomes the user menu when logged in).
- Role-based items (Creator, Admin) appear after login, as in `MainLayout`.
- Page content needs top padding so it does not sit under the dock.
- On narrow screens the text links collapse into the `Menu` button.

## B4. Pages not in the reference (our extensions)
Same tokens, same pill and dock language. Proposed:

| Page | Proposed treatment |
|---|---|
| Home | Reference hero (featured title) followed by a poster strip of trending titles |
| Browse | Filter pills row (type, genre, rating) over a grid of portrait posters, greyscale-to-colour on hover |
| Title detail | The reference hero, then reviews and comments in `--surface` panels below |
| Login / Register | Centred panel on `--bg`, pill-radius inputs and a yellow primary button |
| My Lists | Pill tabs (Completed, In progress, Plan to) with a poster grid |
| Review form | Panel with a rating control and media-specific fields (movie, book, TV) |
| Creator | Table of submissions with status badges (Pending, Approved, Rejected) |
| Admin | Tables for users and the approval queue, using the same badge styles |
| Forbidden / 404 | Giant ghost text (`403`, `404`) in the style of the surname word |

## B5. Components (our spec)
- **Primary button:** `--accent` fill, `--accent-ink` text, pill.
- **Secondary button:** outlined pill like the reference's tags.
- **Input:** `--surface` fill, 1 px `--border`, pill or 12 px radius, yellow focus ring.
- **Badge:** small pill. Statuses: Pending (`--warn`), Approved (`--success`), Rejected (`--danger`). List statuses use neutral outlines.
- **Rating pill:** yellow filled pill with score.
- **Poster card:** portrait poster, 8 px radius, greyscale then colour on hover, title below on Browse grids.
- **Empty / loading / error states:** muted text with a ghost headline.

## B6. Accessibility notes (ours)
- White on near-black passes contrast. `--text-muted` (`#9a9a9a`) on `--bg` is about 7:1, fine for body.
- Black text on the yellow accent passes. Do not put white text on yellow.
- Keep a visible focus ring (yellow) on every interactive element.
- Colour-on-hover for posters must also work on keyboard focus.
- Respect `prefers-reduced-motion`: turn off the staggered entrance and lift.
- The ghost words are decorative: `aria-hidden="true"`.

## B7. Open items
- Mobile layout is not defined by the reference. Our rule: dock collapses, strip becomes a horizontal scroller.
- Real posters come from the dataset later (URL field on titles). Until then use the mock posters.
- Exact colours and sizes need a pass against full-resolution screenshots if the team wants closer fidelity.
