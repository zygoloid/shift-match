const test = require('node:test');
const assert = require('node:assert/strict');
const { Engine, mulberry32 } = require('../logic.js');
const { makePlayer } = require('../tools/players.js');

for (const spec of ['random', 'look2', 'look2x3', 'peek2']) {
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

test('peek1 avoids a move that ends the game when another move does not', () => {
  // Checked across many positions: whenever some move keeps the game going
  // (with the real upcoming tiles), peek1 picks one of those.
  for (let seed = 1; seed <= 20; seed++) {
    const rng = mulberry32(seed);
    const engine = new Engine({ rng });
    const player = makePlayer('peek1', seed);
    for (let move = 0; move < 40 && !engine.gameOver; move++) {
      const survivors = [...engine.legal].filter((key) => {
        const [r, c] = key.split(',').map(Number);
        const twin = engine.clone(rng.clone());
        twin.tap(r, c);
        return !twin.gameOver;
      });
      const [r, c] = player.choose(engine);
      if (survivors.length) assert.ok(survivors.includes(r + ',' + c));
      engine.tap(r, c);
    }
  }
});
