// Shift Match game rules. No DOM access here, so this file also runs under
// Node for tests. The engine turns a tap into a list of events that the
// renderer (game.js) plays back with animations.
(function (root) {
  'use strict';

  // Movement direction as a (row, col) step.
  const DIRS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
  };

  // Array order is also the order in which marked groups are cleared.
  const COLORS = [
    { name: 'red', dir: 'up' },
    { name: 'yellow', dir: 'down' },
    { name: 'green', dir: 'left' },
    { name: 'blue', dir: 'right' },
  ];

  const MIN_RUN = 3;
  const POINTS_PER_CELL = 10;

  // Small seeded PRNG so tests (and, later, daily puzzles) are reproducible.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Returns every cell that is part of a horizontal or vertical run of
  // MIN_RUN or more cells of the same color.
  function findMatches(grid) {
    const rows = grid.length;
    const cols = grid[0].length;
    const found = new Set();
    const scan = (lineCount, lineLength, at) => {
      for (let i = 0; i < lineCount; i++) {
        let start = 0;
        for (let j = 1; j <= lineLength; j++) {
          const prev = at(i, j - 1);
          const cur = j < lineLength ? at(i, j) : null;
          if (cur && prev && cur.color === prev.color) continue;
          if (prev && j - start >= MIN_RUN) {
            for (let k = start; k < j; k++) found.add(at(i, k));
          }
          start = j;
        }
      }
    };
    scan(rows, cols, (r, c) => grid[r][c]);
    scan(cols, rows, (c, r) => grid[r][c]);
    return [...found];
  }

  class Engine {
    constructor({ rows = 9, cols = 7, moves = 30, rng = Math.random } = {}) {
      this.rows = rows;
      this.cols = cols;
      this.rng = rng;
      this.nextId = 1;
      this.score = 0;
      this.movesLeft = moves;
      this.grid = this.createGrid();
    }

    newCell(color) {
      if (color === undefined) color = Math.floor(this.rng() * COLORS.length);
      return { id: this.nextId++, color };
    }

    // Fills the board so that no group exists at the start.
    createGrid() {
      const grid = [];
      for (let r = 0; r < this.rows; r++) {
        const row = [];
        grid.push(row);
        for (let c = 0; c < this.cols; c++) {
          const banned = new Set();
          if (c >= 2 && row[c - 1].color === row[c - 2].color) banned.add(row[c - 1].color);
          if (r >= 2 && grid[r - 1][c].color === grid[r - 2][c].color) banned.add(grid[r - 1][c].color);
          const allowed = COLORS.map((_, i) => i).filter((i) => !banned.has(i));
          row.push(this.newCell(allowed[Math.floor(this.rng() * allowed.length)]));
        }
      }
      return grid;
    }

    get gameOver() {
      return this.movesLeft <= 0;
    }

    // Slides every line along `dir` to close gaps, then fills the space left
    // behind with new cells that enter from the far edge. Returns the new cells
    // with the off-board position each one slides in from.
    shift(dir) {
      const { dr, dc } = DIRS[dir];
      const vertical = dr !== 0;
      const lineCount = vertical ? this.cols : this.rows;
      const length = vertical ? this.rows : this.cols;
      const spawned = [];
      for (let i = 0; i < lineCount; i++) {
        // Position j along the line counts back from the edge the cells move
        // toward; j >= length is off the board on the entry side.
        const headR = vertical ? (dr < 0 ? 0 : this.rows - 1) : i;
        const headC = vertical ? i : dc < 0 ? 0 : this.cols - 1;
        const pos = (j) => [headR - j * dr, headC - j * dc];
        const kept = [];
        for (let j = 0; j < length; j++) {
          const [r, c] = pos(j);
          if (this.grid[r][c]) kept.push(this.grid[r][c]);
        }
        const gap = length - kept.length;
        for (let j = 0; j < length; j++) {
          const [r, c] = pos(j);
          if (j < kept.length) {
            this.grid[r][c] = kept[j];
          } else {
            const cell = this.newCell();
            this.grid[r][c] = cell;
            const [fromR, fromC] = pos(j + gap);
            spawned.push({ id: cell.id, fromR, fromC });
          }
        }
      }
      return spawned;
    }

    // Snapshot of every cell's position, for the renderer.
    layout(spawned = []) {
      const from = new Map(spawned.map((s) => [s.id, s]));
      const cells = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.grid[r][c];
          const entry = { id: cell.id, color: cell.color, r, c };
          const s = from.get(cell.id);
          if (s) {
            entry.fromR = s.fromR;
            entry.fromC = s.fromC;
          }
          cells.push(entry);
        }
      }
      return cells;
    }

    removeCells(ids) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c] && ids.has(this.grid[r][c].id)) this.grid[r][c] = null;
        }
      }
    }

    // Plays one move. Returns the events describing what happened, or null if
    // the tap is not allowed.
    tap(r, c) {
      if (this.gameOver) return null;
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
      const tapped = this.grid[r][c];
      const dir = COLORS[tapped.color].dir;
      const events = [];

      this.grid[r][c] = null;
      events.push({ type: 'remove', ids: [tapped.id] });
      events.push({ type: 'shift', dir, cells: this.layout(this.shift(dir)) });
      this.movesLeft--;

      // Marked cells stay marked as they move, until their color's turn to clear.
      const marked = new Map();
      const markNew = () => {
        const fresh = findMatches(this.grid).filter((cell) => !marked.has(cell.id));
        for (const cell of fresh) marked.set(cell.id, cell);
        if (fresh.length) events.push({ type: 'mark', ids: fresh.map((cell) => cell.id) });
      };

      markNew();
      let chain = 0;
      while (marked.size) {
        COLORS.forEach((color, colorIndex) => {
          const group = [...marked.values()].filter((cell) => cell.color === colorIndex);
          if (!group.length) return;
          chain++;
          const points = group.length * POINTS_PER_CELL * chain;
          this.score += points;
          const ids = new Set(group.map((cell) => cell.id));
          for (const id of ids) marked.delete(id);
          this.removeCells(ids);
          events.push({ type: 'clear', color: colorIndex, ids: [...ids], chain, points, score: this.score });
          events.push({ type: 'shift', dir: color.dir, cells: this.layout(this.shift(color.dir)) });
          markNew();
        });
      }

      events.push({ type: 'end', score: this.score, movesLeft: this.movesLeft, chain, gameOver: this.gameOver });
      return events;
    }
  }

  const api = { COLORS, DIRS, Engine, findMatches, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShiftMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
