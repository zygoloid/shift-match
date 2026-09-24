const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, mulberry32 } = require('../logic.js');
const { makePlayer, countColor } = require('../tools/players.js');

for (const spec of ['random', 'look2', 'look2x3', 'safe2', 'hunt2']) {
  test(`${spec} picks a legal move without touching the game`, () => {
    const rng = mulberry32(11);
    const engine = new Engine({ rng });
    const player = makePlayer(spec, 5);
    for (let move = 0; move < 10 && !engine.gameOver; move++) {
      const grid = engine.grid.map((row) => row.map((cell) => cell.id));
      const upcoming = rng.clone()();
      const [r, c] = player.choose(engine);
      assert.ok(engine.canTap(r, c));
      assert.deepEqual(engine.grid.map((row) => row.map((cell) => cell.id)), grid);
      assert.equal(engine.moves, move);
      assert.equal(rng.clone()(), upcoming);
      engine.tap(r, c);
    }
  });
}

test('hunt1 keeps the game going, then leaves the fewest tiles of the rarest color', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = mulberry32(seed);
    const engine = new Engine({ rng });
    const player = makePlayer('hunt1', seed);
    for (let move = 0; move < 40 && !engine.gameOver; move++) {
      const target = player.target(engine);
      const outcomes = [...engine.legal].map((key) => {
        const next = engine.imagine();
        next.tap(...key.split(',').map(Number));
        return { key, survives: !next.gameOver, left: countColor(next, target) };
      });
      const pool = outcomes.some((o) => o.survives) ? outcomes.filter((o) => o.survives) : outcomes;
      const fewest = Math.min(...pool.map((o) => o.left));
      const [r, c] = player.choose(engine);
      const chosen = outcomes.find((o) => o.key === r + ',' + c);
      assert.equal(chosen.survives, pool[0].survives);
      assert.equal(chosen.left, fewest);
      engine.tap(r, c);
    }
  }
});

test('the hunt target is the surviving color with the fewest tiles', () => {
  const engine = new Engine({ rng: mulberry32(4) });
  const player = makePlayer('hunt1', 1);
  const counts = engine.alive.map((color) => countColor(engine, color));
  assert.equal(countColor(engine, player.target(engine)), Math.min(...counts));
});
