// Move pickers for simulations. Each `choose(engine)` returns [r, c] for one
// of the engine's legal moves, and never changes the engine it is given.
const { mulberry32 } = require('../logic.js');

const legalMoves = (engine) => [...engine.legal].map((key) => key.split(',').map(Number));

// Picks uniformly among the legal moves.
class RandomPlayer {
  constructor({ seed = 1 } = {}) {
    this.rng = mulberry32(seed);
  }

  choose(engine) {
    const moves = legalMoves(engine);
    return moves[Math.floor(this.rng() * moves.length)];
  }
}

// Looks `depth` moves ahead (the move being chosen counts as the first) and
// prefers moves after which the game can keep going that long.
//
// New tiles are random, so the player can't know what will arrive. By default
// it plays each candidate move out against `samples` imagined futures, drawing
// tiles from its own generator, and scores the move by how many of those
// futures it survives. With `peek`, it copies the game's own generator and so
// sees exactly which tiles will come: a player who could see the tile queue.
//
// Ties go to the move that leaves the most legal moves afterwards.
class LookaheadPlayer {
  constructor({ depth = 2, samples = 1, peek = false, seed = 1 } = {}) {
    this.depth = depth;
    this.samples = peek ? 1 : samples;
    this.peek = peek;
    this.rng = mulberry32(seed);
  }

  fork(engine) {
    const rng = this.peek ? engine.rng.clone() : mulberry32(Math.floor(this.rng() * 2 ** 32));
    return engine.clone(rng);
  }

  choose(engine) {
    let best = null;
    let bestSurvived = -1;
    let bestMobility = -1;
    for (const [r, c] of legalMoves(engine)) {
      let survived = 0;
      let mobility = 0;
      for (let s = 0; s < this.samples; s++) {
        const next = this.fork(engine);
        next.tap(r, c);
        mobility += next.legal.size;
        if (this.canLast(next, this.depth - 1)) survived++;
      }
      if (survived > bestSurvived || (survived === bestSurvived && mobility > bestMobility)) {
        best = [r, c];
        bestSurvived = survived;
        bestMobility = mobility;
      }
    }
    return best;
  }

  // Whether some sequence of `depth` more moves keeps a legal move available,
  // in one imagined future.
  canLast(engine, depth) {
    if (engine.gameOver) return false;
    if (depth === 0) return true;
    for (const [r, c] of legalMoves(engine)) {
      const next = this.fork(engine);
      next.tap(r, c);
      if (this.canLast(next, depth - 1)) return true;
    }
    return false;
  }
}

// Parses "random", "look3", "look3x4" (3 moves ahead, 4 sampled futures per
// candidate) or "peek3".
function makePlayer(spec, seed) {
  if (spec === 'random') return new RandomPlayer({ seed });
  const m = /^(look|peek)(\d+)(?:x(\d+))?$/.exec(spec);
  if (!m) throw new Error(`Unknown player "${spec}"`);
  return new LookaheadPlayer({
    depth: Number(m[2]),
    samples: m[3] ? Number(m[3]) : 1,
    peek: m[1] === 'peek',
    seed,
  });
}

module.exports = { RandomPlayer, LookaheadPlayer, makePlayer };
