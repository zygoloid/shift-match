// Plays whole games with a chosen move picker to see how often the board runs
// out of legal moves.
//
//   node tools/simulate.js [--colors arrows|purple|gray] [--rows R] [--cols C]
//                          [--games N] [--cap MOVES]
//                          [--player random|lookN|lookNxS|safeN|peekN]
//
// See tools/players.js for what each player does.
const { Engine, ARROWS, PURPLE, GRAY, mulberry32 } = require('../logic.js');
const os = require('node:os');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { makePlayer } = require('./players.js');

const args = { colors: 'purple', rows: 6, cols: 6, games: 200, cap: 2000, player: 'random' };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '');
  if (!(key in args)) throw new Error(`Unknown option ${process.argv[i]}`);
  args[key] = typeof args[key] === 'number' ? Number(process.argv[i + 1]) : process.argv[i + 1];
}

// arrows: the four arrows; purple: plus purple (the game's palette); gray: plus gray too.
const PALETTES = { arrows: ARROWS, purple: [...ARROWS, PURPLE], gray: [...ARROWS, PURPLE, GRAY] };
const palette = PALETTES[args.colors];

// Plays the games whose seeds are in [first, last].
function playGames(first, last) {
  const result = { lengths: [], capped: 0, legalTotal: 0, turns: 0, minLegal: Infinity };
  for (let seed = first; seed <= last; seed++) {
    const engine = new Engine({ rows: args.rows, cols: args.cols, colors: palette, rng: mulberry32(seed) });
    const player = makePlayer(args.player, seed + 1e6);
    while (!engine.gameOver && engine.moves < args.cap) {
      result.legalTotal += engine.legal.size;
      result.minLegal = Math.min(result.minLegal, engine.legal.size);
      result.turns++;
      const [r, c] = player.choose(engine);
      engine.tap(r, c);
    }
    if (engine.gameOver) result.lengths.push(engine.moves);
    else result.capped++;
  }
  return result;
}

if (!isMainThread) {
  parentPort.postMessage(playGames(workerData.first, workerData.last));
} else {
  main();
}

async function main() {
  const started = Date.now();
  const shards = Math.min(os.availableParallelism(), args.games);
  const jobs = [];
  for (let i = 0; i < shards; i++) {
    const first = 1 + Math.floor((i * args.games) / shards);
    const last = Math.floor(((i + 1) * args.games) / shards);
    jobs.push(
      new Promise((resolve, reject) => {
        const worker = new Worker(__filename, { argv: process.argv.slice(2), workerData: { first, last } });
        worker.once('message', resolve);
        worker.once('error', reject);
      })
    );
  }
  const results = await Promise.all(jobs);
  const lengths = results.flatMap((r) => r.lengths);
  const capped = results.reduce((n, r) => n + r.capped, 0);
  const legalTotal = results.reduce((n, r) => n + r.legalTotal, 0);
  const turns = results.reduce((n, r) => n + r.turns, 0);
  const minLegal = Math.min(...results.map((r) => r.minLegal));

  lengths.sort((a, b) => a - b);
  const pct = (p) => lengths[Math.min(lengths.length - 1, Math.floor(p * lengths.length))];
  console.log(`${args.cols}x${args.rows}, colors: ${palette.map((c) => c.name).join(', ')}; player: ${args.player}`);
  console.log(`games: ${args.games}, cap: ${args.cap} moves, ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(`ended (no legal moves): ${lengths.length}, still going at cap: ${capped}`);
  if (lengths.length) {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    console.log(
      `length of ended games: min ${lengths[0]}, p10 ${pct(0.1)}, median ${pct(0.5)}, ` +
        `mean ${mean.toFixed(1)}, p90 ${pct(0.9)}, max ${lengths.at(-1)}`
    );
  }
  console.log(`legal moves per turn: mean ${(legalTotal / turns).toFixed(1)}, min seen ${minLegal}`);
}
