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
// New tiles are random, so the player can't know what will arrive. `mode`
// says how it deals with that:
// - 'sample': plays each candidate move out against `samples` imagined
//   futures, drawing tiles from its own generator, and scores the move by how
//   many of those futures it survives.
// - 'safe': treats every new tile as a blank that never matches and can't be
//   tapped, so it only counts on tiles already on the board. A line it finds
//   can still fail if new tiles set off a cascade that moves things.
// - 'peek': copies the game's own generator, so it sees exactly which tiles
//   will come: a player who could see the tile queue.
//
// Ties go to the move that leaves the most legal moves afterwards.
class LookaheadPlayer {
  constructor({ depth = 2, samples = 1, mode = 'sample', seed = 1 } = {}) {
    this.depth = depth;
    this.samples = mode === 'sample' ? samples : 1;
    this.mode = mode;
    this.rng = mulberry32(seed);
  }

  fork(engine) {
    if (this.mode === 'safe') return engine.unknownFill ? engine.clone() : engine.imagine();
    if (this.mode === 'peek') return engine.clone(engine.rng.clone());
    return engine.clone(mulberry32(Math.floor(this.rng() * 2 ** 32)));
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
// candidate), "safe3" or "peek3".
function makePlayer(spec, seed) {
  if (spec === 'random') return new RandomPlayer({ seed });
  const m = /^(look|safe|peek)(\d+)(?:x(\d+))?$/.exec(spec);
  if (!m) throw new Error(`Unknown player "${spec}"`);
  return new LookaheadPlayer({
    depth: Number(m[2]),
    samples: m[3] ? Number(m[3]) : 1,
    mode: { look: 'sample', safe: 'safe', peek: 'peek' }[m[1]],
    seed,
  });
}

module.exports = { RandomPlayer, LookaheadPlayer, makePlayer };
