const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, mulberry32 } = require('../logic.js');
const P = require('../puzzles.js');
const PACK = require('../puzzle-pack.js');

const E = -1, R = 0, Y = 1, G = 2, B = 3, U = 4; // U: purple
const colorsOf = (engine) => engine.grid.map((row) => row.map((cell) => (cell ? cell.color : E)));
const LETTERS = 'RYGBP';
const parse = (rows) => rows.map((row) => [...row].map((ch) => (ch === '.' ? E : LETTERS.indexOf(ch))));

test('in puzzle mode a tap leaves a gap instead of bringing in a tile', () => {
  const engine = new Engine({
    board: [
      [G, B, G],
      [R, Y, Y],
      [Y, B, R],
      [B, G, B],
    ],
    refill: false,
    extinction: false,
  });
  engine.tap(1, 0);
  // Red slid column 0 up, leaving its bottom cell empty; the three yellows
  // then cleared and their columns slid down, leaving gaps at the top.
  assert.deepEqual(colorsOf(engine), [
    [E, E, E],
    [E, B, G],
    [G, B, R],
    [B, G, B],
  ]);
});

test('only lines that gain a gap move', () => {
  // Column 4 has an old gap at (1,4). The green lines up three reds, whose
  // clear slides columns 0-2 up; column 4 keeps its gap.
  const engine = new Engine({
    board: [
      [R, G, R, R, B],
      [Y, B, Y, B, E],
      [B, Y, B, Y, G],
    ],
    refill: false,
    extinction: false,
  });
  assert.ok(engine.tap(0, 1));
  assert.deepEqual(colorsOf(engine), [
    [Y, B, Y, B, E],
    [B, Y, B, B, E],
    [E, E, E, Y, G],
  ]);
});

test('a purple turn near an edge loses tiles and brings none in', () => {
  const engine = new Engine({ board: [[U, G, Y], [R, B, G], [G, Y, B]], refill: false, extinction: false });
  const { spawned, lost } = engine.rotate(0, 0);
  assert.deepEqual(spawned, []);
  assert.equal(lost.length, 2);
  assert.deepEqual(colorsOf(engine), [
    [U, E, Y],
    [G, E, G],
    [G, Y, B],
  ]);
});

test('emptying the board wins a puzzle', () => {
  const engine = new Engine({ board: [[R, R, G, R]], refill: false, extinction: false });
  const end = engine.tap(0, 2).at(-1);
  assert.equal(end.won, true);
  assert.equal(engine.won, true);
});

test('generated puzzles are cleared by their recorded solution', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { board, solution } = P.generate({ tiles: 18, rng: mulberry32(seed) });
    assert.equal(P.count(board), 18);
    assert.ok(!P.hasGroup(board));
    let g = board;
    for (const [r, c] of solution) g = P.play(g, r, c);
    assert.equal(P.count(g), 0);
  }
});

test('the solver clears a small puzzle and says when none is possible', () => {
  const { board } = P.generate({ tiles: 12, rng: mulberry32(2) });
  let g = board;
  for (const [r, c] of P.solve(board)) g = P.play(g, r, c);
  assert.equal(P.count(g), 0);
  assert.equal(P.solve([[R, Y, G], [B, U, R], [Y, G, B]]), null);
});

test('every puzzle in the pack is a group-free board its solution clears', () => {
  assert.ok(PACK.length > 0);
  for (const [i, puzzle] of PACK.entries()) {
    const board = parse(puzzle.board);
    assert.ok(!P.hasGroup(board), `puzzle ${i + 1} starts with a group`);
    let g = board;
    for (const m of puzzle.solution.split(' ')) {
      g = P.play(g, Number(m[0]), Number(m[1]));
      assert.ok(g, `puzzle ${i + 1}: move ${m} is not allowed`);
    }
    assert.equal(P.count(g), 0, `puzzle ${i + 1} is not cleared`);
  }
});
