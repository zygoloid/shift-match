// Move pickers for simulations. Each `choose(engine)` returns [r, c] for one
// of the engine's legal moves, and never changes the engine it is given.
const { mulberry32 } = require('../logic.js');

const legalMoves = (engine) => [...engine.legal].map((key) => key.split(',').map(Number));

function countColor(engine, color) {
  let n = 0;
  for (const row of engine.grid) for (const cell of row) if (cell && cell.color === color) n++;
  return n;
}

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
//
// With `hunt`, the player also tries to wipe out the color it has least of:
// among moves that survive equally well, it picks the one that leaves the
// fewest known tiles of that color, whether by tapping them, clearing them or
// turning them off the board.
//
// Remaining ties go to the move that leaves the most legal moves afterwards.
class LookaheadPlayer {
  constructor({ depth = 2, samples = 1, mode = 'sample', hunt = false, seed = 1 } = {}) {
    this.depth = depth;
    this.samples = mode === 'sample' ? samples : 1;
    this.mode = mode;
    this.hunt = hunt;
    this.rng = mulberry32(seed);
  }

  fork(engine) {
    if (this.mode === 'safe') return engine.unknownFill ? engine.clone() : engine.imagine();
    return engine.clone(mulberry32(Math.floor(this.rng() * 2 ** 32)));
  }

  // The surviving color with the fewest tiles on the board.
  target(engine) {
    let best = -1;
    let bestCount = Infinity;
    for (const color of engine.alive) {
      const n = countColor(engine, color);
      if (n < bestCount) {
        best = color;
        bestCount = n;
      }
    }
    return best;
  }

  choose(engine) {
    const target = this.hunt ? this.target(engine) : -1;
    let best = null;
    let bestScore = null;
    for (const [r, c] of legalMoves(engine)) {
      let survived = 0;
      let targetLeft = 0;
      let mobility = 0;
      for (let s = 0; s < this.samples; s++) {
        const next = this.fork(engine);
        next.tap(r, c);
        mobility += next.legal.size;
        if (target >= 0) targetLeft += countColor(next, target);
        if (this.canLast(next, this.depth - 1)) survived++;
      }
      // Compared in order: more survivals, fewer target tiles, more moves left.
      const score = [survived, -targetLeft, mobility];
      if (!bestScore || isBetter(score, bestScore)) {
        best = [r, c];
        bestScore = score;
      }
    }
    return best;
  }

  // Whether some sequence of `depth` more moves keeps a legal move available,
  // in one imagined future.
  canLast(engine, depth) {
    if (engine.gameOver) return !!engine.won;
    if (depth === 0) return true;
    for (const [r, c] of legalMoves(engine)) {
      const next = this.fork(engine);
      next.tap(r, c);
      if (this.canLast(next, depth - 1)) return true;
    }
    return false;
  }
}

function isBetter(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// Parses "random", "look3", "look3x4" (3 moves ahead, 4 sampled futures per
// candidate), "safe3" or "hunt3" (safe3 that also hunts the rarest color).
function makePlayer(spec, seed) {
  if (spec === 'random') return new RandomPlayer({ seed });
  const m = /^(look|safe|hunt)(\d+)(?:x(\d+))?$/.exec(spec);
  if (!m) throw new Error(`Unknown player "${spec}"`);
  return new LookaheadPlayer({
    depth: Number(m[2]),
    samples: m[3] ? Number(m[3]) : 1,
    mode: m[1] === 'look' ? 'sample' : 'safe',
    hunt: m[1] === 'hunt',
    seed,
  });
}

module.exports = { RandomPlayer, LookaheadPlayer, makePlayer, countColor };
