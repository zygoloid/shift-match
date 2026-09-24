// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, COLORS, GRAY, findMatches, mulberry32 } = require('../logic.js');

const R = 0, Y = 1, G = 2, B = 3, P = 4, N = 5;

const WITH_GRAY = [...COLORS, GRAY];
const engineWith = (board, colors = WITH_GRAY) => new Engine({ board, colors, rng: mulberry32(1) });
const colors = (engine) => engine.grid.map((row) => row.map((cell) => cell.color));
const ids = (engine) => engine.grid.map((row) => row.map((cell) => cell.id));
const sorted = (list) => [...list].sort((a, b) => a - b);

// The shift or refill that fills the gaps left by `clear`.
const fillAfter = (events, clear) =>
  events.slice(events.indexOf(clear) + 1).find((e) => e.type === 'shift' || e.type === 'refill');

function randomLegalTap(engine, rng) {
  const options = [...engine.legal];
  const [r, c] = options[Math.floor(rng() * options.length)].split(',').map(Number);
  return engine.tap(r, c);
}

test('new boards start without groups but with at least three legal moves', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const engine = new Engine({ rng: mulberry32(seed) });
    assert.equal(findMatches(engine.grid).length, 0);
    assert.ok(engine.legal.size >= 3);
  }
});

test('findMatches finds horizontal and vertical runs of three or more', () => {
  const engine = engineWith([
    [R, R, R, Y],
    [G, B, Y, Y],
    [G, B, G, B],
    [G, Y, B, Y],
  ]);
  const at = ids(engine);
  const found = findMatches(engine.grid).map((cell) => cell.id);
  assert.deepEqual(sorted(found), sorted([at[0][0], at[0][1], at[0][2], at[1][0], at[2][0], at[3][0]]));
});

test('shift up closes the gap and spawns at the bottom', () => {
  const engine = engineWith([
    [R, G],
    [Y, B],
    [G, R],
    [B, Y],
  ]);
  const before = ids(engine).map((row) => row[0]);
  engine.grid[1][0] = null;
  const spawned = engine.shift('up');
  assert.deepEqual(ids(engine).slice(0, 3).map((row) => row[0]), [before[0], before[2], before[3]]);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].id, engine.grid[3][0].id);
  assert.deepEqual([spawned[0].fromR, spawned[0].fromC], [4, 0]);
  assert.deepEqual(colors(engine).map((row) => row[1]), [G, B, R, Y]);
});

test('shift right with two gaps spawns two cells from the left edge', () => {
  const engine = engineWith([[R, Y, G, B, R]]);
  const before = ids(engine)[0];
  engine.grid[0][1] = null;
  engine.grid[0][3] = null;
  const spawned = engine.shift('right');
  const row = engine.grid[0];
  assert.deepEqual([row[2].id, row[3].id, row[4].id], [before[0], before[2], before[4]]);
  const from = new Map(spawned.map((s) => [s.id, s.fromC]));
  assert.equal(from.get(row[1].id), -1);
  assert.equal(from.get(row[0].id), -2);
});

test('an arrow move is only allowed if it lines up a group', () => {
  const engine = engineWith([
    [G, B, G],
    [R, Y, Y],
    [Y, B, R],
    [B, G, B],
  ]);
  // Green at (0,0) would pull row 0 left into B G ?, which makes nothing.
  assert.equal(engine.canTap(0, 0), false);
  assert.equal(engine.tap(0, 0), null);
  assert.equal(engine.moves, 0);

  // Red at (1,0) pulls the yellow below it up into Y Y Y.
  const yellowIds = [engine.grid[2][0].id, engine.grid[1][1].id, engine.grid[1][2].id];
  const events = engine.tap(1, 0);
  assert.equal(events[0].type, 'remove');
  assert.deepEqual([events[1].type, events[1].dir], ['shift', 'up']);
  const clear = events.find((e) => e.type === 'clear');
  assert.equal(clear.color, Y);
  assert.deepEqual(sorted(clear.ids), sorted(yellowIds));
  assert.equal(fillAfter(events, clear).dir, 'down');
});

test('new tiles do not count toward making a move legal', () => {
  // Blue at (0,2) pulls row 0 right; only the unknown new tile could join
  // the two reds, so the move is not allowed.
  const engine = engineWith([
    [R, R, B],
    [Y, G, Y],
    [G, Y, G],
  ]);
  assert.equal(engine.canTap(0, 2), false);
});

test('purple turns the 3x3 around it a quarter turn clockwise', () => {
  const engine = engineWith([
    [R, G, B, R],
    [R, P, Y, G],
    [Y, B, G, Y],
  ]);
  const before = ids(engine);
  const events = engine.tap(1, 1);
  assert.equal(events[0].type, 'rotate');
  assert.deepEqual(events[0].lost, []);
  const placed = new Map(events[0].cells.map((e) => [e.id, [e.r, e.c]]));
  assert.deepEqual(placed.get(before[2][0]), [0, 0]); // bottom-left -> top-left
  assert.deepEqual(placed.get(before[1][0]), [0, 1]); // left -> top
  assert.deepEqual(placed.get(before[0][0]), [0, 2]); // top-left -> top-right
  assert.deepEqual(placed.get(before[0][1]), [1, 2]); // top -> right
  assert.deepEqual(placed.get(before[1][1]), [1, 1]); // purple stays
  // The two reds from the left column now line up with the red at (0,3).
  const clear = events.find((e) => e.type === 'clear');
  assert.equal(clear.color, R);
  assert.deepEqual(sorted(clear.ids), sorted([before[1][0], before[0][0], before[0][3]]));
});

test('purple at a corner loses tiles off the board and turns new ones in', () => {
  const engine = engineWith([
    [P, G, Y],
    [R, B, G],
    [G, Y, B],
  ]).imagine();
  const before = ids(engine);
  const { spawned, lost } = engine.rotate(0, 0);
  // right -> bottom; bottom and bottom-right turn off the board; new tiles
  // turn in to the right and bottom-right from above the board.
  assert.deepEqual(colors(engine), [
    [P, -1, Y],
    [G, -1, G],
    [G, Y, B],
  ]);
  assert.deepEqual(lost, [
    { id: before[1][1], toR: 1, toC: -1 },
    { id: before[1][0], toR: 0, toC: -1 },
  ]);
  assert.deepEqual(spawned.map((s) => [s.fromR, s.fromC]), [[-1, 0], [-1, 1]]);
});

test('cleared purple groups refill in place', () => {
  const engine = engineWith([
    [P, P, P],
    [R, Y, G],
  ]);
  const others = ids(engine)[1];
  engine.grid[0] = [null, null, null];
  const spawned = engine.refill();
  assert.equal(spawned.length, 3);
  assert.ok(spawned.every((s) => s.appear));
  assert.deepEqual(ids(engine)[1], others);
});

test('gray tiles can never be tapped', () => {
  // Removing the gray would line up the reds, but gray has no action.
  const engine = engineWith([
    [R, N, R, R],
    [Y, G, B, Y],
  ]);
  assert.equal(engine.canTap(0, 1), false);
  assert.equal(engine.tap(0, 1), null);
});

test('cleared gray groups refill in place, after every other color', () => {
  // The purple at (1,1) turns two grays into line with the one at (0,3).
  const engine = engineWith([
    [N, G, B, N],
    [N, P, Y, G],
    [Y, B, G, Y],
  ]);
  const events = engine.tap(1, 1);
  assert.equal(events[0].type, 'rotate');
  const clear = events.find((e) => e.type === 'clear');
  assert.equal(clear.color, N);
  assert.equal(fillAfter(events, clear).type, 'refill');
});

test('marked groups clear in color order, each followed by its own shift', () => {
  // Tapping the green at (1,2) shifts row 1 left and lines up three reds,
  // while column 0 already holds three blues.
  const engine = engineWith([
    [Y, G, Y, G, Y],
    [R, R, G, R, Y],
    [B, Y, G, Y, G],
    [B, G, Y, G, Y],
    [B, Y, G, Y, G],
  ]);
  const redIds = [engine.grid[1][0].id, engine.grid[1][1].id, engine.grid[1][3].id];
  const blueIds = [2, 3, 4].map((r) => engine.grid[r][0].id);
  const events = engine.tap(1, 2);
  const marks = events.filter((e) => e.type === 'mark');
  assert.deepEqual(sorted(marks[0].ids), sorted([...redIds, ...blueIds]));

  const clears = events.filter((e) => e.type === 'clear');
  assert.equal(clears[0].color, R);
  assert.deepEqual(sorted(clears[0].ids), sorted(redIds));
  assert.equal(fillAfter(events, clears[0]).dir, 'up');

  // The blues moved up when the reds cleared but stayed marked.
  const blueIndex = clears.findIndex((e) => e.color === B);
  for (const id of blueIds) assert.ok(clears[blueIndex].ids.includes(id));
  assert.equal(fillAfter(events, clears[blueIndex]).dir, 'right');

  // Everything up to that blue clear happened in one pass through the colors.
  const firstPass = clears.slice(0, blueIndex + 1).map((e) => e.color);
  firstPass.slice(1).forEach((color, i) => assert.ok(color > firstPass[i]));
  assert.equal(findMatches(engine.grid).length, 0);
});

test('every legal move clears something and the chain multiplier grows', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = mulberry32(seed);
    const engine = new Engine({ rng });
    for (let move = 0; move < 5 && !engine.gameOver; move++) {
      const clears = randomLegalTap(engine, rng).filter((e) => e.type === 'clear');
      assert.ok(clears.length > 0);
      clears.forEach((e, i) => {
        assert.equal(e.chain, i + 1);
        assert.equal(e.points, e.ids.length * 10 * e.chain);
      });
      assert.equal(findMatches(engine.grid).length, 0);
    }
  }
});

test('a clone plays out independently, with the same tiles if given a cloned rng', () => {
  const rng = mulberry32(3);
  const engine = new Engine({ rng });
  const [r, c] = [...engine.legal][0].split(',').map(Number);
  const twin = engine.clone(rng.clone());
  engine.tap(r, c);
  assert.equal(twin.moves, 0);
  twin.tap(r, c);
  assert.deepEqual(colors(twin), colors(engine));
  assert.equal(twin.score, engine.score);
});

test('an imagined game fills gaps with blanks that never match or move', () => {
  const engine = engineWith([
    [G, B, G],
    [R, Y, Y],
    [Y, B, R],
    [B, G, B],
  ]);
  const imagined = engine.imagine();
  imagined.tap(1, 0);
  // Red pulled Y Y Y together; yellow clears and shifts down, and the three
  // gaps it leaves at the top are filled with blanks.
  assert.deepEqual(imagined.grid[0].map((cell) => cell.color), [-1, -1, -1]);
  assert.equal(imagined.canTap(0, 0), false);
  assert.equal(engine.moves, 0);
});

test('a color whose last tile clears never comes back', () => {
  const board = [
    [G, B, G],
    [R, Y, Y],
    [Y, B, R],
    [B, G, B],
  ];
  // Red at (1,0) lines up all three yellows on the board.
  const engine = engineWith(board);
  const events = engine.tap(1, 0);
  const extinct = events.find((e) => e.type === 'extinct');
  assert.deepEqual(extinct.colors, [Y]);
  assert.ok(events.indexOf(extinct) < events.indexOf(fillAfter(events, events.find((e) => e.type === 'clear'))));
  assert.ok(!engine.alive.includes(Y));
  assert.ok(!engine.colorsOnBoard().has(Y));

  const classic = new Engine({ board, colors: WITH_GRAY, extinction: false, rng: mulberry32(1) });
  assert.ok(!classic.tap(1, 0).some((e) => e.type === 'extinct'));
});

test('tiles filling a cleared group\'s gaps are never that color', () => {
  // Red at (1,0) lines up three yellows; a fourth yellow at (3,1) keeps
  // yellow alive. The three tiles that drop in after the clear aren't yellow.
  const board = [
    [G, B, G],
    [R, Y, Y],
    [Y, B, R],
    [B, Y, B],
  ];
  const dropped = (excludeCleared, seed) => {
    const engine = new Engine({ board, colors: WITH_GRAY, excludeCleared, rng: mulberry32(seed) });
    const events = engine.tap(1, 0);
    const clear = events.find((e) => e.type === 'clear' && e.color === Y);
    return fillAfter(events, clear).cells.filter((e) => e.fromR !== undefined).map((e) => e.color);
  };
  const seeds = Array.from({ length: 50 }, (_, i) => i + 1);
  for (const seed of seeds) assert.ok(!dropped(true, seed).includes(Y));
  assert.ok(seeds.some((seed) => dropped(false, seed).includes(Y)));
});

test('with two colors left, fills after a clear can be either color', () => {
  // Forcing the other color would make fills deterministic, and a cascade
  // could alternate between the two colors forever.
  const engine = new Engine({ board: [[R, G, R, G]], colors: WITH_GRAY, rng: mulberry32(9) });
  assert.deepEqual(engine.alive, [R, G]);
  engine.fillExclude = R;
  const drawn = new Set(Array.from({ length: 40 }, () => engine.newCell().color));
  assert.deepEqual([...drawn].sort(), [R, G]);
});

test('clearing the last color empties the board and wins', () => {
  // Green is the only green; once it's gone, only red can arrive, and the
  // full row of red clears with nothing left to refill it.
  const engine = engineWith([[R, R, G, R]]);
  const events = engine.tap(0, 2);
  const end = events.at(-1);
  assert.equal(end.won, true);
  assert.equal(end.gameOver, true);
  assert.deepEqual(engine.grid, [[null, null, null, null]]);
  assert.deepEqual(engine.alive, []);
});

test('a hinted turn scores half', () => {
  const board = [
    [G, B, G],
    [R, Y, Y],
    [Y, B, R],
    [B, G, B],
  ];
  const plain = engineWith(board).tap(1, 0).find((e) => e.type === 'clear');
  const hinted = engineWith(board).tap(1, 0, { hinted: true }).find((e) => e.type === 'clear');
  assert.equal(plain.points, 30);
  assert.equal(hinted.points, 15);
  assert.equal(hinted.hinted, true);
});

test('new boards start with every color', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const engine = new Engine({ rng: mulberry32(seed) });
    assert.equal(engine.colorsOnBoard().size, COLORS.length);
  }
});

test('game ends when no move lines up a group', () => {
  const engine = engineWith([
    [R, Y, G],
    [B, P, R],
    [Y, G, B],
  ]);
  assert.equal(engine.legal.size, 0);
  assert.equal(engine.gameOver, true);
  assert.equal(engine.tap(0, 0), null);
});
