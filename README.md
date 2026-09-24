# Shift Match

A match-3 puzzle where every tile is an arrow. Open `index.html` in a browser
(no build step) — it's sized for phones in portrait but works on desktop too.

## Rules

- Tiles come in six colors. Four are arrows: red ↑, yellow ↓, green ←,
  blue →. Purple ↻ turns things. Gray • has no action and can't be tapped;
  it only gets in the way until it's matched.
- Tapping an arrow removes it and slides its column (↑/↓) or row (←/→) in the
  arrow's direction to close the gap. A new tile enters from the far edge.
- Tapping a purple tile turns its eight neighbors one step clockwise (fewer at
  an edge or corner). Nothing is removed.
- **A move is only allowed if it lines up at least one group of 3+.** Only
  tiles already on the board count; the tile that slides in is unknown until
  it arrives. Tapping any other tile shakes it. The game ends when no move is
  allowed, or when the 30 taps are used up.
- After every move, any run of 3+ same-colored tiles in a row or column is
  **marked** (outlined and pulsing). Marked tiles stay marked as they move.
- Marked tiles clear by color, in order: red, yellow, green, blue, purple,
  gray.
  After an arrow color clears, the board shifts that color's way to fill the
  gaps (red clears → tiles slide up, and so on). After purple or gray clears,
  new tiles appear in the gaps without anything moving. Any new runs get marked,
  and the cycle repeats until nothing is marked.
- Each clear scores 10 points per tile × the chain step, which counts up
  through every clear triggered by one tap.
- Best score is kept in `localStorage`.

## Does the board ever run out of moves?

`node tools/simulate.js [arrows|purple|all] [games] [moveCap]` plays games with
uniformly random legal taps and no move limit. With 200 games capped at 2,000
moves each:

| Colors | Games that ran out of moves | Legal moves per turn (mean) |
| --- | --- | --- |
| 4 arrows | 0 of 200 (≈400,000 moves played) | 18.4 |
| 4 arrows + purple | 15 of 200 (≈386,000 moves; shortest 112, median 1,038) | 13.8 |
| 4 arrows + purple + gray | 200 of 200 (shortest 4, median 102, 90% by 349) | 7.4 |

With five colors, random play runs out of moves only about once every 26,000
moves. The inert gray tile changes that: every game ends, 35 of 200 of them
within 30 moves.

## Code

- `logic.js` — the rules engine (no DOM). `Engine.tap(r, c)` returns a list
  of events (`remove`, `shift`, `mark`, `clear`, `end`) that describe the
  whole cascade.
- `game.js` — renders the board and replays those events with animations.
- `style.css` — layout and theme (follows the system light/dark setting).
- `test/logic.test.js` — engine tests: `node --test`.
- `tools/simulate.js` — random-play simulation (see above).
