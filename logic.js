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
  // Arrow colors slide a line; `rotate` turns the surrounding 3x3 a quarter
  // turn clockwise;
  // a color with neither can't be tapped. After a group clears, arrow colors
  // shift the board their way to fill the gaps; colors without a direction
  // refill the gaps in place.
  const ARROWS = [
    { name: 'red', dir: 'up' },
    { name: 'yellow', dir: 'down' },
    { name: 'green', dir: 'left' },
    { name: 'blue', dir: 'right' },
  ];
  const PURPLE = { name: 'purple', rotate: true };
  // Gray has no action. It isn't in the default palette.
  const GRAY = { name: 'gray' };
  const COLORS = [...ARROWS, PURPLE];

  // Offsets of the eight neighbors.
  const RING = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];

  const MIN_RUN = 3;
  const MIN_START_MOVES = 3;
  const POINTS_PER_CELL = 10;

  // Stands in for a not-yet-known new tile when checking whether a move is
  // legal, or in an imagined game. It never matches and can't be tapped.
  const UNKNOWN = { id: -1, color: -1 };

  // Small seeded PRNG so tests and simulations are reproducible. `clone()`
  // returns a generator that will produce the same numbers from here on.
  function mulberry32(seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.clone = () => mulberry32(a);
    return next;
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
          if (cur && prev && cur.color >= 0 && cur.color === prev.color) continue;
          if (prev && prev.color >= 0 && j - start >= MIN_RUN) {
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
    // `board` optionally gives the starting colors as rows of color indexes.
    constructor({ rows = 6, cols = 6, colors = COLORS, rng = Math.random, board } = {}) {
      this.rows = board ? board.length : rows;
      this.cols = board ? board[0].length : cols;
      this.colors = colors;
      this.rng = rng;
      this.nextId = 1;
      this.score = 0;
      this.moves = 0;
      this.previewing = false;
      this.unknownFill = false;
      if (board) {
        this.grid = board.map((row) => row.map((color) => this.newCell(color)));
        this.refreshLegal();
        return;
      }
      do {
        this.grid = this.createGrid();
      } while (this.refreshLegal().size < MIN_START_MOVES);
    }

    newCell(color) {
      if (this.previewing || this.unknownFill) return UNKNOWN;
      if (color === undefined) color = Math.floor(this.rng() * this.colors.length);
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
          const allowed = this.colors.map((_, i) => i).filter((i) => !banned.has(i));
          row.push(this.newCell(allowed[Math.floor(this.rng() * allowed.length)]));
        }
      }
      return grid;
    }

    // A move is legal if it lines up at least one group from tiles already on
    // the board. Tiles that would slide in are unknown, so they don't count.
    isLegal(r, c) {
      const color = this.colors[this.grid[r][c].color];
      if (!color || (!color.dir && !color.rotate)) return false;
      const saved = this.grid;
      this.grid = saved.map((row) => row.slice());
      this.previewing = true;
      try {
        this.applyMove(r, c);
        return findMatches(this.grid).length > 0;
      } finally {
        this.previewing = false;
        this.grid = saved;
      }
    }

    // Recomputes the set of legal taps, as "r,c" keys.
    refreshLegal() {
      this.legal = new Set();
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.isLegal(r, c)) this.legal.add(r + ',' + c);
        }
      }
      return this.legal;
    }

    canTap(r, c) {
      return this.legal.has(r + ',' + c);
    }

    // The game ends when no move lines up a group.
    get gameOver() {
      return this.legal.size === 0;
    }

    // A copy of the game in which every new tile is UNKNOWN: it shows what is
    // certain to happen, without guessing which tiles will arrive.
    imagine() {
      const copy = this.clone();
      copy.unknownFill = true;
      return copy;
    }

    // An independent copy of the game that draws new tiles from `rng`.
    clone(rng = this.rng) {
      const copy = Object.assign(Object.create(Engine.prototype), this);
      copy.rng = rng;
      copy.grid = this.grid.map((row) => row.slice());
      copy.legal = new Set(this.legal);
      return copy;
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
      const kept = [];
      for (let i = 0; i < lineCount; i++) {
        // Position j along the line is (headR - j*dr, headC - j*dc): it counts
        // back from the edge the cells move toward, and j >= length is off the
        // board on the entry side.
        const headR = vertical ? (dr < 0 ? 0 : this.rows - 1) : i;
        const headC = vertical ? i : dc < 0 ? 0 : this.cols - 1;
        kept.length = 0;
        for (let j = 0; j < length; j++) {
          const cell = this.grid[headR - j * dr][headC - j * dc];
          if (cell) kept.push(cell);
        }
        const gap = length - kept.length;
        if (gap === 0) continue;
        for (let j = 0; j < length; j++) {
          const r = headR - j * dr;
          const c = headC - j * dc;
          if (j < kept.length) {
            this.grid[r][c] = kept[j];
          } else {
            const cell = this.newCell();
            this.grid[r][c] = cell;
            spawned.push({ id: cell.id, fromR: r - gap * dr, fromC: c - gap * dc });
          }
        }
      }
      return spawned;
    }

    // Fills every gap with a new cell where it stands.
    refill() {
      const spawned = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c]) continue;
          const cell = this.newCell();
          this.grid[r][c] = cell;
          spawned.push({ id: cell.id, appear: true });
        }
      }
      return spawned;
    }

    // Turns the 3x3 around (r, c) a quarter turn clockwise. Near an edge,
    // tiles turned off the board are lost and new tiles turn in from off the
    // board. Returns the new tiles with where they come from, and the lost
    // tiles with where they go.
    rotate(r, c) {
      const onBoard = (rr, cc) => rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols;
      const landed = [];
      const lost = [];
      // Offset (dr, dc) turns clockwise to (dc, -dr).
      for (const [dr, dc] of RING) {
        if (!onBoard(r + dr, c + dc)) continue;
        const cell = this.grid[r + dr][c + dc];
        this.grid[r + dr][c + dc] = null;
        if (onBoard(r + dc, c - dr)) landed.push([cell, r + dc, c - dr]);
        else lost.push({ id: cell.id, toR: r + dc, toC: c - dr });
      }
      for (const [cell, rr, cc] of landed) this.grid[rr][cc] = cell;
      const spawned = [];
      for (const [dr, dc] of RING) {
        if (!onBoard(r + dr, c + dc) || this.grid[r + dr][c + dc]) continue;
        const cell = this.newCell();
        this.grid[r + dr][c + dc] = cell;
        // The tile landing at offset (dr, dc) started at (-dc, dr).
        spawned.push({ id: cell.id, fromR: r - dc, fromC: c + dr });
      }
      return { spawned, lost };
    }

    // Applies the tapped tile's own action and returns the event for it.
    applyMove(r, c) {
      const color = this.colors[this.grid[r][c].color];
      if (color.rotate) {
        return { type: 'rotate', r, c, ...this.rotate(r, c) };
      }
      this.grid[r][c] = null;
      return { type: 'shift', dir: color.dir, spawned: this.shift(color.dir) };
    }

    // Snapshot of every cell's position, for the renderer.
    layout(spawned = []) {
      const from = new Map(spawned.map((s) => [s.id, s]));
      const cells = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.grid[r][c];
          cells.push({ id: cell.id, color: cell.color, r, c, ...from.get(cell.id) });
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
      if (this.gameOver || !this.canTap(r, c)) return null;
      const tapped = this.grid[r][c];
      const events = [];

      const move = this.applyMove(r, c);
      if (move.type === 'rotate') {
        events.push({ type: 'rotate', r, c, cells: this.layout(move.spawned), lost: move.lost });
      } else {
        events.push({ type: 'remove', ids: [tapped.id] });
        events.push({ type: 'shift', dir: move.dir, cells: this.layout(move.spawned) });
      }
      this.moves++;

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
        this.colors.forEach((color, colorIndex) => {
          const group = [...marked.values()].filter((cell) => cell.color === colorIndex);
          if (!group.length) return;
          chain++;
          const points = group.length * POINTS_PER_CELL * chain;
          this.score += points;
          const ids = new Set(group.map((cell) => cell.id));
          for (const id of ids) marked.delete(id);
          this.removeCells(ids);
          events.push({ type: 'clear', color: colorIndex, ids: [...ids], chain, points, score: this.score });
          if (color.dir) {
            events.push({ type: 'shift', dir: color.dir, cells: this.layout(this.shift(color.dir)) });
          } else {
            events.push({ type: 'refill', cells: this.layout(this.refill()) });
          }
          markNew();
        });
      }

      this.refreshLegal();
      events.push({
        type: 'end',
        score: this.score,
        moves: this.moves,
        legalMoves: this.legal.size,
        chain,
        gameOver: this.gameOver,
      });
      return events;
    }
  }

  const api = { ARROWS, PURPLE, GRAY, COLORS, DIRS, Engine, findMatches, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShiftMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
