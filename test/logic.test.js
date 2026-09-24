// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, findMatches, mulberry32, COLORS } = require('../logic.js');

const R = 0, Y = 1, G = 2, B = 3;

// Builds an engine whose board is the given color layout.
function engineWith(layout, seed = 1) {
  const engine = new Engine({ rows: layout.length, cols: layout[0].length, rng: mulberry32(seed) });
  engine.grid = layout.map((row) => row.map((color) => engine.newCell(color)));
  return engine;
}

const colors = (engine) => engine.grid.map((row) => row.map((cell) => cell.color));

test('new boards start without groups', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const engine = new Engine({ rng: mulberry32(seed) });
    assert.equal(findMatches(engine.grid).length, 0);
  }
});

test('findMatches finds horizontal and vertical runs of three or more', () => {
  const engine = engineWith([
    [R, R, R, Y],
    [G, B, Y, Y],
    [G, B, G, B],
    [G, Y, B, Y],
  ]);
  const found = findMatches(engine.grid).map((cell) => cell.id).sort((a, b) => a - b);
  const idAt = (r, c) => engine.grid[r][c].id;
  assert.deepEqual(found, [idAt(0, 0), idAt(0, 1), idAt(0, 2), idAt(1, 0), idAt(2, 0), idAt(3, 0)].sort((a, b) => a - b));
});

test('shift up closes the gap and spawns at the bottom', () => {
  const engine = engineWith([
    [R, G],
    [Y, B],
    [G, R],
    [B, Y],
  ]);
  const ids = engine.grid.map((row) => row[0].id);
  engine.grid[1][0] = null;
  const spawned = engine.shift('up');
  assert.deepEqual(engine.grid.slice(0, 3).map((row) => row[0].id), [ids[0], ids[2], ids[3]]);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].id, engine.grid[3][0].id);
  assert.deepEqual([spawned[0].fromR, spawned[0].fromC], [4, 0]);
  assert.deepEqual(colors(engine).map((row) => row[1]), [G, B, R, Y]);
});

test('shift right with two gaps spawns two cells from the left edge', () => {
  const engine = engineWith([[R, Y, G, B, R]]);
  const ids = engine.grid[0].map((cell) => cell.id);
  engine.grid[0][1] = null;
  engine.grid[0][3] = null;
  const spawned = engine.shift('right');
  const row = engine.grid[0];
  assert.deepEqual([row[2].id, row[3].id, row[4].id], [ids[0], ids[2], ids[4]]);
  const from = new Map(spawned.map((s) => [s.id, s.fromC]));
  assert.equal(from.get(row[1].id), -1);
  assert.equal(from.get(row[0].id), -2);
});

test('tapping an arrow removes it and shifts its line that way', () => {
  const engine = engineWith([
    [B, G, B],
    [Y, G, R],
    [G, R, B],
  ]);
  const topLeft = engine.grid[0][0].id;
  // Yellow points down: the cell above slides down into the gap.
  const events = engine.tap(1, 0);
  assert.equal(events[0].type, 'remove');
  assert.equal(events[1].type, 'shift');
  assert.equal(events[1].dir, 'down');
  assert.equal(engine.grid[1][0].id, topLeft);
  assert.equal(engine.movesLeft, 29);
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
  assert.deepEqual([...marks[0].ids].sort(), [...redIds, ...blueIds].sort());

  const clears = events.filter((e) => e.type === 'clear');
  assert.equal(clears[0].color, R);
  assert.deepEqual([...clears[0].ids].sort(), [...redIds].sort());
  assert.equal(events[events.indexOf(clears[0]) + 1].dir, 'up');

  // The blues moved up when the reds cleared but stayed marked.
  const blueIndex = clears.findIndex((e) => e.color === B);
  for (const id of blueIds) assert.ok(clears[blueIndex].ids.includes(id));
  assert.equal(events[events.indexOf(clears[blueIndex]) + 1].dir, 'right');

  // Everything up to that blue clear happened in one red→yellow→green→blue pass.
  const firstPass = clears.slice(0, blueIndex + 1).map((e) => e.color);
  firstPass.slice(1).forEach((color, i) => assert.ok(color > firstPass[i]));
  assert.equal(findMatches(engine.grid).length, 0);
});

test('chain multiplier grows with each clear', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const engine = new Engine({ rng: mulberry32(seed) });
    const events = engine.tap(4, 3);
    const clears = events.filter((e) => e.type === 'clear');
    clears.forEach((e, i) => {
      assert.equal(e.chain, i + 1);
      assert.equal(e.points, e.ids.length * 10 * e.chain);
    });
    assert.equal(findMatches(engine.grid).length, 0);
  }
});

test('game ends when moves run out', () => {
  const engine = new Engine({ moves: 2, rng: mulberry32(7) });
  engine.tap(0, 0);
  const last = engine.tap(0, 0);
  assert.equal(last.at(-1).gameOver, true);
  assert.equal(engine.tap(0, 0), null);
});
