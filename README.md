# Shift Match

A match-3 puzzle on a 6×6 board where every tile does something when tapped.
Open `index.html` in a browser (no build step). It's sized for phones in
portrait but works on desktop too.

## Rules

- Tiles come in five colors. Four are arrows: red ↑, yellow ↓, green ←,
  blue →. Purple ↻ turns things.
- Tapping an arrow removes it and slides its column (↑/↓) or row (←/→) in the
  arrow's direction to close the gap. A new tile enters from the far edge.
- Tapping a purple tile turns the 3×3 square around it a quarter turn
  clockwise. Near an edge or corner, tiles turned off the board are lost and
  new tiles turn in from off the board.
- **A move is only allowed if it lines up at least one group of 3+.** Only
  tiles already on the board count; tiles that arrive are unknown until they
  do. Tapping any other tile shakes it. There is no move limit: the game ends
  when no move is allowed. A new game always starts with at least 3 legal
  moves.
- **Colors can die out.** When the last tile of a color leaves the board, that
  color never comes back; its chip fades on the track. The tiles that fill
  the gaps left by a cleared group are never that group's color (while at
  least three colors survive). **Emptying the board
  wins.** In practice, once only one color is left, every refill is that
  color, so the whole board matches and clears.
- **Hint** highlights one legal move, picked at random. It can be used again
  after the next move. The turn you take after a hint scores half.
- After every move, any run of 3+ same-colored tiles in a row or column is
  **marked** (outlined and pulsing). Marked tiles stay marked as they move.
- Marked tiles clear by color, in order: red, yellow, green, blue, purple.
  The track under the board shows that order, and a cursor steps along it as
  each color clears. After an arrow color clears, the board shifts that
  color's way to fill the gaps (red clears → tiles slide up, and so on).
  After purple clears, new tiles appear in the gaps without anything moving.
  Any new runs get marked, and the cycle repeats until nothing is marked.
- Each clear scores 10 points per tile × the chain step, which counts up
  through every clear triggered by one tap.
- Best score is kept in `localStorage`.

## Simulations

`tools/simulate.js` plays many games with a chosen move picker (in
`tools/players.js`), in parallel:

    node tools/simulate.js [--colors arrows|purple|gray] [--rows R] [--cols C]
                           [--extinction on|off] [--exclude on|off]
                           [--games N] [--cap MOVES]
                           [--player random|lookN|lookNxS|safeN|huntN]

- **random** taps any legal move.
- **lookN** looks N moves ahead, playing each candidate against one randomly
  guessed set of incoming tiles.
- **safeN** looks N moves ahead treating every incoming tile as a blank that
  never matches and can't be tapped, so it only counts on tiles already on the
  board. A cascade set off by unlucky new tiles can still end the game.
- **huntN** is safeN that also goes after the color with the fewest tiles:
  among moves that survive its lookahead, it picks the one leaving the fewest
  known tiles of that color (by tapping them, clearing them, or turning them
  off the board).

Remaining ties go to the move that leaves the most legal moves.

### How often is a game won?

With extinction on and tiles filling a cleared group's gaps never being that
group's color (the game's rules), 5,000-move cap:

| Player | Won | Lost | Moves to win (median) | 1st / 2nd color gone (median move) |
| --- | --- | --- | --- | --- |
| random (200 games) | 33 (16.5%) | 167 | 1,011 | 70 / 1,008 |
| safe1 (40 games) | 34 (85%) | 6 | 1,265 | 219 / 1,248 |
| hunt1 (200 games) | 188 (94%) | 12 | 256 | 53 / 244 |
| hunt2 (40 games) | 39 (98%) | 1 | 292 | 70 / 266 |

No game reached the cap. Once two colors are gone, the rest usually go
within a few moves: the fills after each clear come from the other colors,
so the survivors line up quickly.

Before that fill rule (`--exclude off`):

| Player | Won | Lost | Still going at 5,000 | Moves to win (median) |
| --- | --- | --- | --- | --- |
| random (200 games) | 5 (2.5%) | 194 | 1 | 1,410 |
| safe1 (40 games) | 7 (18%) | 18 | 15 | 2,092 |
| safe2 | 10 (25%) | 13 | 17 | 3,984 |
| safe3 | 8 (20%) | 13 | 19 | 3,169 |
| hunt1 (200 games) | 149 (75%) | 35 | 16 | 1,360 |
| hunt2 (40 games) | 36 (90%) | 2 | 2 | 1,336 |
| hunt3 | 30 (75%) | 4 | 6 | 1,423 |

Without it, the stage with three colors left took about 1,000 moves (hunt1:
colors gone at moves 63, 315 and 1,360; the third, fourth and fifth went on
the same move, since two colors fill the board with matches).

### How long does a game last without the win condition?

With `--extinction off`, 2,000-move cap.

The chosen board, 6×6 with five colors:

| Player | Games that reached 2,000 moves | Median length of games that ended |
| --- | --- | --- |
| random (200 games) | 0 | 75 |
| safe1 (40 games) | 5 | 523 |
| safe2 | 8 | 626 |
| safe3 | 6 | 650 |

Random play dies quickly (10% of games by move 15), while careful play
usually lasts hundreds of moves.

Other boards tried (purple as a quarter turn):

| Board | Random: median length | safe1: games reaching 2,000 of 40 |
| --- | --- | --- |
| 7×7, no gray | 683 (42 of 200 reached 2,000) | – |
| 7×7 + gray | 30 | 0 (median 354) |
| 7 wide × 6 tall, no gray | 225 | 26 |
| 6×6, no gray | 79* | 5 (median 523) |

\* Before starting boards were required to have 3 legal moves.

7×7 without gray is too forgiving: random play often never dies. 7×7 with an
inert gray tile also works, but gray tiles make the board harder to read.

Earlier findings on 7×9 (when purple turned its ring one step):

- Four arrows only: random play never ran out of moves in 200 games.
  Adding purple: 15 of 200 did. Adding gray too: all did, median 99 moves.
- With six colors, sampled lookahead barely helped past one move (look1–look4
  kept 5–15 of 40 games alive to 2,000), because one guessed future almost
  always has some surviving line. safe1–safe3 kept about 30 of 40 alive.

## Code

- `logic.js`: the rules engine (no DOM). `Engine.tap(r, c)` returns a list
  of events (`remove`, `shift`, `rotate`, `mark`, `clear`, `refill`, `end`)
  that describe the whole cascade. `Engine.clone()` and `Engine.imagine()`
  copy a game for lookahead.
- `game.js`: renders the board and replays those events with animations.
- `style.css`: layout and theme (follows the system light/dark setting).
- `test/`: engine and player tests; run with `node --test`.
- `tools/simulate.js`: plays many games in parallel and reports how long
  they last.
- `tools/players.js`: the move pickers.
