// Renders the board and plays back the engine's events with animations.
(function () {
  'use strict';

  const { Engine, COLORS } = window.ShiftMatch;
  const ROWS = 9;
  const COLS = 7;
  const MOVES = 30;
  const MAX_CELL = 68;
  const BEST_KEY = 'shift-match-best';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = reduced
    ? { pop: 60, shift: 90, mark: 260, clear: 90, toast: 700 }
    : { pop: 140, shift: 220, mark: 360, clear: 220, toast: 900 };

  const $ = (id) => document.getElementById(id);
  const els = {
    board: $('board'),
    wrap: $('board-wrap'),
    score: $('score'),
    moves: $('moves'),
    best: $('best'),
    toast: $('toast'),
    over: $('over'),
    finalScore: $('final-score'),
    overNote: $('over-note'),
    order: $('order'),
  };

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--pop-ms', T.pop + 'ms');
  rootStyle.setProperty('--shift-ms', T.shift + 'ms');
  rootStyle.setProperty('--clear-ms', T.clear + 'ms');

  const ARROW =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5 21 11.5h-5.5V21h-7v-9.5H3z"/></svg>';

  let engine;
  let tiles = new Map(); // cell id -> element
  let cell = 48;
  let busy = false;
  let best = readBest();

  function readBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(BEST_KEY, String(value));
    } catch (e) {
      // Storage can be unavailable (private mode); the best score just won't persist.
    }
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function faceHtml(color) {
    const { name, dir } = COLORS[color];
    return `<div class="face c-${name} d-${dir}">${ARROW}</div>`;
  }

  // ---- Tiles ----

  function place(el, r, c) {
    el._r = r;
    el._c = c;
    el.style.transform = `translate(${c * cell}px, ${r * cell}px)`;
  }

  function makeTile(entry) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.innerHTML = faceHtml(entry.color);
    el.setAttribute('role', 'gridcell');
    el.setAttribute('aria-label', `${COLORS[entry.color].name} ${COLORS[entry.color].dir}`);
    tiles.set(entry.id, el);
    els.board.appendChild(el);
    return el;
  }

  // Moves tiles to match a layout. New tiles slide in from their spawn point.
  function sync(cells, animate) {
    const entering = [];
    for (const entry of cells) {
      let el = tiles.get(entry.id);
      if (!el) {
        el = makeTile(entry);
        if (animate && entry.fromR !== undefined) {
          el.style.transition = 'none';
          place(el, entry.fromR, entry.fromC);
          entering.push([el, entry]);
          continue;
        }
      }
      place(el, entry.r, entry.c);
    }
    if (entering.length) {
      void els.board.offsetWidth; // commit spawn positions before animating
      for (const [el, entry] of entering) {
        el.style.transition = '';
        place(el, entry.r, entry.c);
      }
    }
  }

  function dropTiles(ids) {
    for (const id of ids) {
      const el = tiles.get(id);
      if (el) el.remove();
      tiles.delete(id);
    }
  }

  function tagTiles(ids, cls) {
    for (const id of ids) {
      const el = tiles.get(id);
      if (el) el.classList.add(cls);
    }
  }

  // ---- Layout ----

  function resize() {
    const frame = 12; // frame padding on both sides
    const w = els.wrap.clientWidth - frame;
    const h = els.wrap.clientHeight - frame;
    const next = Math.max(24, Math.min(MAX_CELL, Math.floor(Math.min(w / COLS, h / ROWS))));
    if (next === cell && els.board.style.width) return;
    cell = next;
    rootStyle.setProperty('--cell', cell + 'px');
    els.board.style.width = cell * COLS + 'px';
    els.board.style.height = cell * ROWS + 'px';
    for (const el of tiles.values()) {
      el.style.transition = 'none';
      place(el, el._r, el._c);
    }
    void els.board.offsetWidth;
    for (const el of tiles.values()) el.style.transition = '';
  }

  // ---- HUD ----

  function renderLegend() {
    els.order.innerHTML = COLORS.map(
      (color, i) =>
        `<li data-color="${i}"><span class="num">${i + 1}</span>` +
        `<span class="chip">${faceHtml(i)}</span>` +
        `<span class="word">${color.dir}</span></li>`
    ).join('');
  }

  function setActiveColor(colorIndex) {
    for (const li of els.order.children) {
      li.classList.toggle('active', Number(li.dataset.color) === colorIndex);
    }
  }

  function updateHud() {
    els.score.textContent = engine.score;
    els.moves.textContent = engine.movesLeft;
    els.moves.classList.toggle('low', engine.movesLeft <= 5);
    els.best.textContent = best;
  }

  let toastTimer;
  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), T.toast);
  }

  function showGameOver() {
    const isBest = engine.score > best;
    if (isBest) {
      best = engine.score;
      saveBest(best);
    }
    updateHud();
    els.finalScore.textContent = engine.score;
    els.overNote.textContent = isBest ? 'New best score' : `Best: ${best}`;
    els.over.hidden = false;
  }

  // ---- Game flow ----

  async function play(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'remove':
          tagTiles(ev.ids, 'popping');
          await wait(T.pop);
          dropTiles(ev.ids);
          break;
        case 'shift':
          sync(ev.cells, true);
          await wait(T.shift);
          break;
        case 'mark':
          tagTiles(ev.ids, 'marked');
          await wait(T.mark);
          break;
        case 'clear':
          setActiveColor(ev.color);
          tagTiles(ev.ids, 'clearing');
          els.score.textContent = ev.score;
          toast(ev.chain > 1 ? `Chain ×${ev.chain}  +${ev.points}` : `+${ev.points}`);
          await wait(T.clear);
          dropTiles(ev.ids);
          break;
        case 'end':
          setActiveColor(-1);
          updateHud();
          if (ev.gameOver) showGameOver();
          break;
      }
    }
  }

  async function onTap(event) {
    if (busy || engine.gameOver) return;
    const rect = els.board.getBoundingClientRect();
    const r = Math.floor((event.clientY - rect.top) / cell);
    const c = Math.floor((event.clientX - rect.left) / cell);
    const events = engine.tap(r, c);
    if (!events) return;
    busy = true;
    els.moves.textContent = engine.movesLeft;
    try {
      await play(events);
    } finally {
      busy = false;
    }
  }

  function start(state) {
    engine = new Engine({ rows: ROWS, cols: COLS, moves: MOVES });
    if (state && state.grid) {
      engine.grid = state.grid.map((row) => row.map((color) => engine.newCell(color)));
      engine.score = state.score;
      engine.movesLeft = state.movesLeft;
    }
    for (const el of tiles.values()) el.remove();
    tiles = new Map();
    busy = false;
    els.over.hidden = true;
    setActiveColor(-1);
    resize();
    sync(engine.layout(), false);
    updateHud();
    if (engine.gameOver) showGameOver();
  }

  renderLegend();
  els.board.addEventListener('click', onTap);
  $('new-game').addEventListener('click', () => start());
  $('play-again').addEventListener('click', () => start());
  if (window.ResizeObserver) new ResizeObserver(resize).observe(els.wrap);
  else window.addEventListener('resize', resize);

  // Keeps an in-progress game across live reloads of a hosted copy.
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) {
    hot.snapshot(() => ({
      grid: engine.grid.map((row) => row.map((c) => c.color)),
      score: engine.score,
      movesLeft: engine.movesLeft,
    }));
  }
  if (hot && hot.ready) hot.ready(start);
  else start(hot && hot.data);
})();
