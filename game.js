// Renders the board and plays back the engine's events with animations.
(function () {
  'use strict';

  const { Engine, COLORS } = window.ShiftMatch;
  const ROWS = 9;
  const COLS = 7;
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
  const TURN =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 5a7 7 0 1 1-7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>' +
    '<path fill="currentColor" d="M5 6 9.5 12.8h-9z"/></svg>';
  const DOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/></svg>';

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

  const actionName = (color) => (color.rotate ? 'turn' : color.dir || 'none');
  const iconFor = (color) => (color.rotate ? TURN : color.dir ? ARROW : DOT);

  function faceHtml(color) {
    const def = COLORS[color];
    return `<div class="face c-${def.name} d-${actionName(def)}">${iconFor(def)}</div>`;
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
    el.setAttribute('aria-label', `${COLORS[entry.color].name} ${actionName(COLORS[entry.color])}`);
    tiles.set(entry.id, el);
    els.board.appendChild(el);
    return el;
  }

  // Moves tiles to match a layout. New tiles slide in from their spawn point,
  // or grow in place when they refill a gap.
  function sync(cells, animate) {
    const entering = [];
    for (const entry of cells) {
      let el = tiles.get(entry.id);
      if (!el) {
        el = makeTile(entry);
        if (animate && entry.appear) {
          el.classList.add('appearing');
          place(el, entry.r, entry.c);
          entering.push([el, entry]);
          continue;
        }
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
        el.classList.remove('appearing');
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
        `<li data-color="${i}"><span class="chip">${faceHtml(i)}</span>` +
        `<span class="caption"><span class="num">${i + 1}</span>` +
        `<span class="word">${actionName(color)}</span></span></li>`
    ).join('');
  }

  function setActiveColor(colorIndex) {
    for (const li of els.order.children) {
      li.classList.toggle('active', Number(li.dataset.color) === colorIndex);
    }
  }

  function updateHud() {
    els.score.textContent = engine.score;
    els.moves.textContent = engine.moves;
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
    const played = `${engine.moves} ${engine.moves === 1 ? 'move' : 'moves'}`;
    els.overNote.textContent = isBest ? `${played} · New best score` : `${played} · Best: ${best}`;
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
        case 'refill':
          sync(ev.cells, true);
          await wait(T.shift);
          break;
        case 'rotate': {
          const centerId = ev.cells.find((e) => e.r === ev.r && e.c === ev.c).id;
          const center = tiles.get(centerId);
          center.classList.add('turning');
          sync(ev.cells, true);
          await wait(T.shift);
          center.classList.remove('turning');
          break;
        }
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

  // Shakes a tile whose move would not line up a group.
  function refuse(r, c) {
    const cellAt = engine.grid[r] && engine.grid[r][c];
    const el = cellAt && tiles.get(cellAt.id);
    if (!el) return;
    el.classList.remove('refused');
    void el.offsetWidth;
    el.classList.add('refused');
    el.addEventListener('animationend', () => el.classList.remove('refused'), { once: true });
  }

  async function onTap(event) {
    if (busy || engine.gameOver) return;
    const rect = els.board.getBoundingClientRect();
    const r = Math.floor((event.clientY - rect.top) / cell);
    const c = Math.floor((event.clientX - rect.left) / cell);
    const events = engine.tap(r, c);
    if (!events) {
      refuse(r, c);
      return;
    }
    busy = true;
    els.moves.textContent = engine.moves;
    try {
      await play(events);
    } finally {
      busy = false;
    }
  }

  function start(state) {
    if (state && state.grid) {
      engine = new Engine({ board: state.grid });
      engine.score = state.score;
      engine.moves = state.moves || 0;
    } else {
      engine = new Engine({ rows: ROWS, cols: COLS });
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
      moves: engine.moves,
    }));
  }
  if (hot && hot.ready) hot.ready(start);
  else start(hot && hot.data);
})();
