# Shift Match

A match-3 puzzle where every tile is an arrow. Open `index.html` in a browser
(no build step) — it's sized for phones in portrait but works on desktop too.

## Rules

- Tiles come in four colors, each with an arrow:
  red ↑, yellow ↓, green ←, blue →.
- Tapping a tile removes it and slides its column (↑/↓) or row (←/→) in the
  arrow's direction to close the gap. A new tile enters from the far edge.
- After every shift, any run of 3+ same-colored tiles in a row or column is
  **marked** (outlined and pulsing). Marked tiles stay marked as they move.
- Marked tiles clear by color, in order: red, yellow, green, blue. After each
  color clears, the board shifts that color's way to fill the gaps
  (red clears → tiles slide up, and so on), and any new runs get marked.
  The cycle repeats until nothing is marked.
- Each clear scores 10 points per tile × the chain step, which counts up
  through every clear triggered by one tap.
- You have 30 taps. Best score is kept in `localStorage`.

## Code

- `logic.js` — the rules engine (no DOM). `Engine.tap(r, c)` returns a list
  of events (`remove`, `shift`, `mark`, `clear`, `end`) that describe the
  whole cascade.
- `game.js` — renders the board and replays those events with animations.
- `style.css` — layout and theme (follows the system light/dark setting).
- `test/logic.test.js` — engine tests: `node --test`.
