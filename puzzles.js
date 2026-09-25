// Puzzle mode: no new tiles appear, and the goal is to clear the board.
//
// Puzzles are built backwards from an empty board. Each step invents a
// position one move earlier: it puts back a group that the move cleared
// ("un-clear"), then puts back the tile that was tapped ("un-tap") or turns a
// purple's square back ("un-turn"). Every invented step is checked by playing
// it forwards with the real engine, so the finished puzzle is solvable by
// replaying the steps in order.
//
// Boards here are rows of color indexes, with -1 for an empty cell.
(function (root) {
  'use strict';

  const { Engine, COLORS, DIRS, findMatches } = root.ShiftMatch || require('./logic.js');

  const EMPTY = -1;
  const ARROW_COLORS = COLORS.map((c, i) => (c.dir ? i : -1)).filter((i) => i >= 0);
  const PURPLE = COLORS.findIndex((c) => c.rotate);
  const RING = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];

  const copy = (grid) => grid.map((row) => row.slice());
  const count = (grid) => grid.reduce((n, row) => n + row.filter((v) => v !== EMPTY).length, 0);
  const same = (a, b) => a.every((row, r) => row.every((v, c) => v === b[r][c]));
  const key = (grid) => grid.map((row) => row.map((v) => (v === EMPTY ? '.' : v)).join('')).join('/');

  function hasGroup(grid) {
    return findMatches(grid.map((row) => row.map((v) => (v === EMPTY ? null : { color: v })))).length > 0;
  }

  function puzzleEngine(grid) {
    return new Engine({ board: grid, refill: false, extinction: false });
  }

  function toGrid(engine) {
    return engine.grid.map((row) => row.map((cell) => (cell ? cell.color : EMPTY)));
  }

  // Plays one move forwards. Returns the resulting board, or null if the move
  // isn't allowed.
  function play(grid, r, c) {
    const engine = puzzleEngine(grid);
    if (!engine.tap(r, c)) return null;
    return toGrid(engine);
  }

  function legalMoves(grid) {
    return [...puzzleEngine(grid).legal].map((k) => k.split(',').map(Number));
  }

  // The cells of line `i` for a shift in `dir`, starting from the edge that
  // tiles move toward.
  function lineCells(grid, dir, i) {
    const { dr, dc } = DIRS[dir];
    const rows = grid.length;
    const cols = grid[0].length;
    const vertical = dr !== 0;
    const length = vertical ? rows : cols;
    const headR = vertical ? (dr < 0 ? 0 : rows - 1) : i;
    const headC = vertical ? i : dc < 0 ? 0 : cols - 1;
    return Array.from({ length }, (_, j) => [headR - j * dr, headC - j * dc]);
  }

  // A line's tiles, if they are all packed against the head edge; else null.
  function packed(grid, cells) {
    const tiles = cells.map(([r, c]) => grid[r][c]);
    const n = tiles.indexOf(EMPTY) === -1 ? tiles.length : tiles.indexOf(EMPTY);
    if (tiles.slice(n).some((v) => v !== EMPTY)) return null;
    return tiles.slice(0, n);
  }

  // Puts back a group of color `k` on `cells` (a straight run), undoing the
  // clear and the shift that closed its gaps. Returns the board just before
  // the clear, or null if that board can't have led to `grid`.
  function unclear(grid, k, cells) {
    const out = copy(grid);
    const dir = COLORS[k].dir;
    if (!dir) {
      // Purple groups leave their gaps unfilled.
      if (cells.some(([r, c]) => grid[r][c] !== EMPTY)) return null;
      for (const [r, c] of cells) out[r][c] = k;
      return out;
    }
    const vertical = DIRS[dir].dr !== 0;
    const byLine = new Map();
    for (const [r, c] of cells) {
      const i = vertical ? c : r;
      if (!byLine.has(i)) byLine.set(i, []);
      byLine.get(i).push([r, c]);
    }
    for (const [i, groupCells] of byLine) {
      const line = lineCells(grid, dir, i);
      const tiles = packed(grid, line);
      if (!tiles) return null;
      const js = groupCells.map(([r, c]) => line.findIndex(([lr, lc]) => lr === r && lc === c)).sort((a, b) => a - b);
      const j0 = js[0];
      if (j0 > tiles.length || tiles.length + js.length > line.length) return null;
      const rebuilt = [...tiles.slice(0, j0), ...js.map(() => k), ...tiles.slice(j0)];
      line.forEach(([r, c], j) => {
        out[r][c] = j < rebuilt.length ? rebuilt[j] : EMPTY;
      });
    }
    return out;
  }

  // Puts back an arrow of color `k` at position `p` of line `i`, undoing the
  // tap and the shift it caused. Returns the board before the tap and the
  // tapped cell, or null.
  function untap(grid, k, i, p) {
    const dir = COLORS[k].dir;
    const line = lineCells(grid, dir, i);
    const tiles = packed(grid, line);
    if (!tiles || tiles.length >= line.length || p > tiles.length) return null;
    const rebuilt = [...tiles.slice(0, p), k, ...tiles.slice(p)];
    const out = copy(grid);
    line.forEach(([r, c], j) => {
      out[r][c] = j < rebuilt.length ? rebuilt[j] : EMPTY;
    });
    return { grid: out, move: line[p] };
  }

  // Turns the square around the purple at (r, c) back a quarter turn. Tiles
  // that the forward turn lost off the board are made up with `lost()`.
  function unturn(grid, r, c, lost) {
    if (grid[r][c] !== PURPLE) return null;
    const rows = grid.length;
    const cols = grid[0].length;
    const onBoard = (rr, cc) => rr >= 0 && rr < rows && cc >= 0 && cc < cols;
    const out = copy(grid);
    for (const [dr, dc] of RING) {
      const src = [r + dr, c + dc];
      const dest = [r + dc, c - dr];
      // A cell whose tile would have come from off the board must be empty.
      if (onBoard(...dest) && !onBoard(...src) && grid[dest[0]][dest[1]] !== EMPTY) return null;
    }
    for (const [dr, dc] of RING) if (onBoard(r + dr, c + dc)) out[r + dr][c + dc] = EMPTY;
    for (const [dr, dc] of RING) {
      const src = [r + dr, c + dc];
      const dest = [r + dc, c - dr];
      if (!onBoard(...src)) continue;
      out[src[0]][src[1]] = onBoard(...dest) ? grid[dest[0]][dest[1]] : lost();
    }
    return { grid: out, move: [r, c] };
  }

  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // Every straight run of 3-5 cells on the board.
  function runs(rows, cols) {
    const out = [];
    for (let len = 3; len <= 5; len++) {
      for (let r = 0; r < rows; r++) for (let c = 0; c + len <= cols; c++) out.push(Array.from({ length: len }, (_, t) => [r, c + t]));
      for (let c = 0; c < cols; c++) for (let r = 0; r + len <= rows; r++) out.push(Array.from({ length: len }, (_, t) => [r + t, c]));
    }
    return out;
  }

  // Finds up to `want` different positions one move before `grid`, trying
  // every way to put back a group and then a tapped or turned tile, in random
  // order. Each result is { grid, move }, checked by playing it forwards.
  function stepsBack(grid, rng, want = 1, maxPlays = 400) {
    const rows = grid.length;
    const cols = grid[0].length;
    const found = [];
    let plays = 0;
    const groups = [];
    for (const cells of runs(rows, cols)) for (let k = 0; k < COLORS.length; k++) groups.push([k, cells]);
    for (const [k, cells] of shuffle(groups, rng)) {
      const before = unclear(grid, k, cells);
      if (!before) continue;
      const moves = [];
      for (const k2 of ARROW_COLORS) {
        const vertical = DIRS[COLORS[k2].dir].dr !== 0;
        const lines = vertical ? cols : rows;
        const length = vertical ? rows : cols;
        for (let i = 0; i < lines; i++) for (let p = 0; p <= length; p++) moves.push(() => untap(before, k2, i, p));
      }
      before.forEach((row, r) =>
        row.forEach((v, c) => {
          if (v === PURPLE) moves.push(() => unturn(before, r, c, () => (rng() < 0.85 ? Math.floor(rng() * COLORS.length) : EMPTY)));
        })
      );
      for (const make of shuffle(moves, rng)) {
        const prev = make();
        if (!prev || hasGroup(prev.grid)) continue;
        if (++plays > maxPlays) return found;
        const after = play(prev.grid, ...prev.move);
        if (after && same(after, grid)) {
          found.push(prev);
          if (found.length >= want) return found;
          break; // try a different group next
        }
      }
    }
    return found;
  }

  // One position one move before `grid`, or null.
  function stepBack(grid, rng) {
    return stepsBack(grid, rng, 1)[0] || null;
  }

  // Empty cells that no step back can refill: not in the empty tail of a
  // packed line, and not in a straight run of 3 empty cells (which a purple
  // group could fill).
  function stranded(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const ok = grid.map((row) => row.map((v) => v !== EMPTY));
    for (const dir of Object.keys(DIRS)) {
      const vertical = DIRS[dir].dr !== 0;
      for (let i = 0; i < (vertical ? cols : rows); i++) {
        const cells = lineCells(grid, dir, i);
        if (packed(grid, cells)) for (const [r, c] of cells) ok[r][c] = true;
      }
    }
    const runLen = (r, c, dr, dc) => {
      let n = 0;
      for (let rr = r, cc = c; rr >= 0 && rr < rows && cc >= 0 && cc < cols && grid[rr][cc] === EMPTY; rr += dr, cc += dc) n++;
      return n;
    };
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (ok[r][c]) continue;
        const across = runLen(r, c, 0, 1) + runLen(r, c, 0, -1) - 1;
        const down = runLen(r, c, 1, 0) + runLen(r, c, -1, 0) - 1;
        if (across < 3 && down < 3) n++;
      }
    }
    return n;
  }

  // How many ways the board leaves to step back: the number of lines that
  // are packed against an edge and still have room.
  function openness(grid) {
    let n = 0;
    for (const dir of Object.keys(DIRS)) {
      const vertical = DIRS[dir].dr !== 0;
      const lines = vertical ? grid[0].length : grid.length;
      for (let i = 0; i < lines; i++) {
        const cells = lineCells(grid, dir, i);
        const tiles = packed(grid, cells);
        if (tiles && tiles.length < cells.length) n++;
      }
    }
    return n;
  }

  // Builds a puzzle with `tiles` tiles (default: a full board). Returns
  // { board, solution } or null if it gave up. It keeps a beam of the most
  // open positions at each step back, since a random walk soon paints itself
  // into a corner.
  function generate({ rows = 6, cols = 6, tiles = rows * cols, rng = Math.random, beam = 10, expand = 8, restarts = 20 } = {}) {
    for (let t = 0; t < restarts; t++) {
      let frontier = [{ grid: Array.from({ length: rows }, () => Array(cols).fill(EMPTY)), solution: [] }];
      const seen = new Set();
      while (frontier.length) {
        const next = [];
        for (const node of frontier) {
          for (const prev of stepsBack(node.grid, rng, expand)) {
            const n = count(prev.grid);
            if (n > tiles) continue;
            const k = key(prev.grid);
            if (seen.has(k)) continue;
            seen.add(k);
            const child = { grid: prev.grid, solution: [prev.move, ...node.solution] };
            if (n === tiles) return { board: child.grid, solution: child.solution, restarts: t };
            child.score = openness(child.grid) - 4 * stranded(child.grid) + n * 0.25 + rng();
            next.push(child);
          }
        }
        next.sort((x, y) => y.score - x.score);
        frontier = next.slice(0, beam);
      }
    }
    return null;
  }

  // Finds a way to clear `grid`, or null if there is none. Stops after
  // visiting `budget` positions and returns undefined if it ran out.
  function solve(grid, budget = 200000) {
    const dead = new Set();
    let visited = 0;
    function search(g) {
      if (count(g) === 0) return [];
      const k = key(g);
      if (dead.has(k)) return null;
      if (++visited > budget) throw new Error('budget');
      for (const [r, c] of legalMoves(g)) {
        const rest = search(play(g, r, c));
        if (rest) return [[r, c], ...rest];
      }
      dead.add(k);
      return null;
    }
    try {
      return search(grid);
    } catch (e) {
      if (e.message === 'budget') return undefined;
      throw e;
    }
  }

  const api = { EMPTY, generate, solve, play, legalMoves, stepBack, stepsBack, unclear, untap, unturn, count, key, hasGroup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShiftPuzzles = api;
})(typeof window !== 'undefined' ? window : globalThis);
