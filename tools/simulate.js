// Plays games with uniformly random legal taps and no move limit, to see how
// often a board runs out of legal moves.
//
//   node tools/simulate.js [arrows|all] [games] [moveCap]
const { Engine, ARROWS, COLORS, mulberry32 } = require('../logic.js');

const palette = process.argv[2] === 'arrows' ? ARROWS : COLORS;
const games = Number(process.argv[3]) || 200;
const cap = Number(process.argv[4]) || 2000;

const lengths = [];
let capped = 0;
let legalTotal = 0;
let turns = 0;
let minLegal = Infinity;
for (let seed = 1; seed <= games; seed++) {
  const rng = mulberry32(seed);
  const engine = new Engine({ colors: palette, rng });
  let moves = 0;
  while (!engine.stuck && moves < cap) {
    legalTotal += engine.legal.size;
    minLegal = Math.min(minLegal, engine.legal.size);
    turns++;
    const options = [...engine.legal];
    const [r, c] = options[Math.floor(rng() * options.length)].split(',').map(Number);
    engine.tap(r, c);
    moves++;
  }
  if (engine.stuck) lengths.push(moves);
  else capped++;
}

lengths.sort((a, b) => a - b);
const pct = (p) => lengths[Math.min(lengths.length - 1, Math.floor(p * lengths.length))];
console.log(`palette: ${palette.map((c) => c.name).join(', ')}`);
console.log(`games: ${games}, cap: ${cap} moves`);
console.log(`ended (no legal moves): ${lengths.length}, still going at cap: ${capped}`);
if (lengths.length) {
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  console.log(`game length of ended games: min ${lengths[0]}, median ${pct(0.5)}, mean ${mean.toFixed(1)}, p90 ${pct(0.9)}, max ${lengths.at(-1)}`);
}
console.log(`legal moves per turn: mean ${(legalTotal / turns).toFixed(1)}, min seen ${minLegal}`);
