import { bootAcademy } from './academy-client.js';
import { chessAdapter, readFamily, STORE as FAMILY_STORE } from './academy-family.js';
import { Chess } from './vendor/chess.js';

const STORE = 'heroacademy.chessquest.v1';
const LEVELS = [
  { name: 'Little Pawn', description: 'A gentle first game', symbol: '♙', tag: 'First steps' },
  { name: 'Brave Knight', description: 'Spot the good moves', symbol: '♘', tag: 'Finding courage' },
  { name: 'Clever Bishop', description: 'Think one step ahead', symbol: '♗', tag: 'New ideas' },
  { name: 'Castle Keeper', description: 'Plan your strategy', symbol: '♖', tag: 'Big plans' },
  { name: 'Royal Champion', description: 'Clever ideas and tactics', symbol: '♛', tag: 'Growing stronger' },
  { name: 'Star Explorer', description: 'Read the whole board', symbol: '✦', tag: 'Explore' },
  { name: 'Pawn Protector', description: 'Keep pieces safe', symbol: '♙', tag: 'Careful steps' },
  { name: 'Knight Captain', description: 'Find sneaky tactics', symbol: '♘', tag: 'New tactics' },
  { name: 'Forest Strategist', description: 'Plan clever attacks', symbol: '♗', tag: 'Thinking ahead' },
  { name: 'Castle Guardian', description: 'Build a strong defence', symbol: '♜', tag: 'King safety' },
  { name: 'Royal Pathfinder', description: 'Spot the best captures', symbol: '♕', tag: 'Big ideas' },
  { name: 'Mountain Master', description: 'Look deeper ahead', symbol: '♞', tag: 'The climb' },
  { name: 'Crown Guardian', description: 'A patient challenger', symbol: '♔', tag: 'Royal moves' },
  { name: 'Grand Tactician', description: 'Tougher combinations', symbol: '♝', tag: 'A bigger challenge' },
  { name: 'Kingdom Legend', description: 'Our strongest challenger', symbol: '♛', tag: 'Champion' },
];
const PIECES = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const FILES = 'abcdefgh';

const $ = id => document.getElementById(id);
const boardEl = $('board');
const levelsEl = $('levels');
const promotionDialog = $('promotion-dialog');
const confirmDialog = $('confirm-dialog');

function defaultState() {
  return {
    preferred: { level: 1, colour: 'w', showMoves: true, speech: false, largeText: false },
    match: { level: 1, colour: 'w', moves: [], result: null, recorded: false },
    stats: { wins: 0, draws: 0, games: 0, stars: Array(LEVELS.length).fill(0) },
    flipped: false,
  };
}

function restoreState() {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? sanitiseState(JSON.parse(raw)) : defaultState();
  } catch { return defaultState(); }
}

function sanitiseState(parsed) {
    const defaults = defaultState();
    const pref = parsed.preferred || {};
    const match = parsed.match || {};
    const stats = parsed.stats || {};
    const validLevel = value => Number.isInteger(value) && value >= 1 && value <= LEVELS.length;
    defaults.preferred.level = validLevel(pref.level) ? pref.level : 1;
    defaults.preferred.colour = pref.colour === 'b' ? 'b' : 'w';
    defaults.preferred.showMoves = pref.showMoves !== false;
    defaults.preferred.speech = pref.speech === true;
    defaults.preferred.largeText = pref.largeText === true;
    defaults.match.level = validLevel(match.level) ? match.level : defaults.preferred.level;
    defaults.match.colour = match.colour === 'b' ? 'b' : 'w';
    defaults.match.moves = Array.isArray(match.moves) ? match.moves.slice(0, 500).filter(m =>
      m && /^[a-h][1-8]$/.test(m.from) && /^[a-h][1-8]$/.test(m.to) && (!m.promotion || /^[qrbn]$/.test(m.promotion))) : [];
    defaults.match.result = ['win', 'loss', 'draw'].includes(match.result) ? match.result : null;
    defaults.match.recorded = match.recorded === true;
    defaults.stats.wins = validCount(stats.wins);
    defaults.stats.draws = validCount(stats.draws);
    defaults.stats.games = validCount(stats.games);
    // Expand older five-level saves in place; retain each earned star.
    defaults.stats.stars = Array.from({ length: LEVELS.length }, (_, i) => Math.floor(Math.max(0, Math.min(3, Number(stats.stars?.[i]) || 0))));
    defaults.flipped = parsed.flipped === true;
    return defaults;
}
function validCount(value) { return Number.isInteger(value) && value >= 0 && value < 100000 ? value : 0; }

let family=readFamily(),academy=null;
const familyHero=()=>family.profiles.find(p=>p.id===family.current);
let state = familyHero().arena ? sanitiseState(familyHero().arena) : restoreState();
let game = new Chess();
let selected = null;
let hint = null;
let pendingPromotion = null;
let aiWorker = null;
let hintWorker = null;
let computerTimer = null;
let flashTimer = null;
let flashMessage = null;
let thinking = false;
let requestNumber = 0;

function rebuildGame() {
  game = new Chess();
  const accepted = [];
  for (const move of state.match.moves) {
    try {
      const done = game.move(move);
      if (!done) break;
      accepted.push({ from: done.from, to: done.to, ...(done.promotion ? { promotion: done.promotion } : {}) });
    } catch { break; }
  }
  state.match.moves = accepted;
  if (!game.isGameOver()) { state.match.result = null; state.match.recorded = false; }
}

function saveState() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
    familyHero().arena=structuredClone(state);
    localStorage.setItem(FAMILY_STORE,JSON.stringify(family));
    void academy?.flush();
    $('save-indicator').textContent = 'Saved on this device';
  } catch {
    $('save-indicator').textContent = 'Storage is unavailable';
  }
}

function setFlash(message, ms = 2800) {
  flashMessage = message;
  clearTimeout(flashTimer);
  renderStatus();
  flashTimer = setTimeout(() => { flashMessage = null; renderStatus(); }, ms);
}

function humanTurn() { return !game.isGameOver() && game.turn() === state.match.colour && !thinking; }
function otherColour(colour) { return colour === 'w' ? 'b' : 'w'; }
function orientation() { return state.flipped ? otherColour(state.match.colour) : state.match.colour; }
function getSquares() {
  const whiteBottom = orientation() === 'w';
  const ranks = whiteBottom ? '87654321' : '12345678';
  const files = whiteBottom ? FILES : [...FILES].reverse().join('');
  return [...ranks].flatMap(rank => [...files].map(file => file + rank));
}

function renderLevels() {
  levelsEl.replaceChildren();
  LEVELS.forEach((level, index) => {
    const number = index + 1;
    const best = state.stats.stars[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'level-card';
    button.setAttribute('aria-pressed', String(state.preferred.level === number));
    button.setAttribute('aria-label', `Level ${number}, ${level.name}, ${level.description}. ${best} stars earned.`);
    button.innerHTML = `<span class="level-emoji" aria-hidden="true">${level.symbol}</span><span class="level-text"><span class="level-number">LEVEL ${String(number).padStart(2, '0')}</span><strong>${level.name}</strong><small>${level.description}</small></span><span class="level-stars" aria-hidden="true">${'★'.repeat(best)}${'☆'.repeat(3 - best)}</span>${state.preferred.level === number ? '<span class="level-selected-mark" aria-hidden="true">✓</span>' : ''}`;
    button.addEventListener('click', () => selectOption('level', number));
    levelsEl.append(button);
  });
}

function renderChoices() {
  for (const button of document.querySelectorAll('[data-colour]')) {
    button.setAttribute('aria-pressed', String(button.dataset.colour === state.preferred.colour));
  }
  $('show-moves').checked = state.preferred.showMoves;
  $('speech').checked = state.preferred.speech;
  $('large-text').checked = state.preferred.largeText;
  document.body.classList.toggle('large-text', state.preferred.largeText);
  const needsStart = state.preferred.level !== state.match.level || state.preferred.colour !== state.match.colour;
  $('start-button').innerHTML = `${needsStart ? '✦ Start selected adventure' : '✦ Play this adventure'} <span>→</span>`;
  $('opponent-label').textContent = `Level ${state.match.level} · ${LEVELS[state.match.level - 1].name}`;
  $('your-colour-label').textContent = `Playing ${state.match.colour === 'w' ? 'white' : 'black'}`;
}

function selectOption(name, value) {
  state.preferred[name] = value;
  // Before any move, switching colours/levels is immediate and intuitive.
  if (!state.match.moves.length) newGameNow();
  else { saveState(); renderLevels(); renderChoices(); }
}

function findKingSquare(colour) {
  const board = game.board();
  for (const rank of board) for (const piece of rank) if (piece?.type === 'k' && piece.color === colour) return piece.square;
  return null;
}

function renderBoard() {
  const focusedSquare = boardEl.contains(document.activeElement) ? document.activeElement.dataset.square : null;
  const squares = getSquares();
  const options = selected && humanTurn() ? game.moves({ square: selected, verbose: true }) : [];
  const targets = new Set(options.map(move => move.to));
  const last = game.history({ verbose: true }).at(-1);
  const checkSquare = game.isCheck() ? findKingSquare(game.turn()) : null;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < squares.length; index++) {
    const square = squares[index];
    const piece = game.get(square);
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chess-square ${(file + rank) % 2 === 0 ? 'light' : 'dark'}`;
    button.dataset.square = square;
    button.setAttribute('role', 'gridcell');
    const descriptor = piece ? `${piece.color === 'w' ? 'white' : 'black'} ${NAMES[piece.type]}` : 'empty square';
    button.setAttribute('aria-label', `${square}, ${descriptor}${targets.has(square) ? ', legal destination' : ''}${square === checkSquare ? ', king in check' : ''}`);
    button.setAttribute('aria-selected', String(square === selected));
    if (last && (last.from === square || last.to === square)) button.classList.add('last-move');
    if (square === checkSquare) button.classList.add('in-check');
    if (square === selected) button.classList.add('selected');
    if (targets.has(square) && state.preferred.showMoves) {
      button.classList.add('legal-target');
      if (piece) button.classList.add('capture');
      const dot = document.createElement('span'); dot.className = 'legal-dot'; dot.setAttribute('aria-hidden', 'true'); button.append(dot);
    }
    if (hint?.from === square || hint?.to === square) button.classList.add('hint-square');
    if (piece) {
      const glyph = document.createElement('span');
      glyph.className = `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}`;
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = PIECES[piece.color][piece.type];
      button.append(glyph);
    }
    if (index % 8 === 0) {
      const label = document.createElement('span'); label.className = 'square-coordinate rank'; label.textContent = square[1]; label.setAttribute('aria-hidden', 'true'); button.append(label);
    }
    if (index >= 56) {
      const label = document.createElement('span'); label.className = 'square-coordinate file'; label.textContent = square[0]; label.setAttribute('aria-hidden', 'true'); button.append(label);
    }
    button.addEventListener('click', () => tapSquare(square));
    button.addEventListener('keydown', event => boardKeydown(event, index, squares));
    fragment.append(button);
  }
  boardEl.replaceChildren(fragment);
  if (focusedSquare) boardEl.querySelector(`[data-square="${focusedSquare}"]`)?.focus({ preventScroll: true });
  renderCaptures();
  renderMoveHistory();
}

function boardKeydown(event, index, squares) {
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
  if (!(event.key in offsets)) return;
  const col = index % 8, row = Math.floor(index / 8);
  const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
  const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
  const newCol = col + dx, newRow = row + dy;
  if (newCol < 0 || newCol > 7 || newRow < 0 || newRow > 7) return;
  event.preventDefault();
  boardEl.querySelector(`[data-square="${squares[newRow * 8 + newCol]}"]`)?.focus();
}

function tapSquare(square) {
  if (!humanTurn()) return;
  const piece = game.get(square);
  if (selected === square) { selected = null; renderBoard(); return; }
  if (selected) {
    const choices = game.moves({ square: selected, verbose: true }).filter(move => move.to === square);
    if (choices.length) {
      if (choices.some(move => move.promotion)) { askPromotion(selected, square); return; }
      makeMove({ from: selected, to: square }, true);
      return;
    }
  }
  if (piece?.color === state.match.colour) {
    selected = square;
    hint = null;
    renderBoard();
    const options = game.moves({ square, verbose: true });
    if (!options.length) setFlash(`That ${NAMES[piece.type]} has no safe move just now.`);
  } else if (selected) {
    setFlash('Not quite! Choose a glowing square, or try another piece.');
  }
}

function askPromotion(from, to) {
  pendingPromotion = { from, to };
  const choices = $('promotion-choices');
  choices.replaceChildren();
  for (const [type, name] of [['q','Queen'],['r','Rook'],['b','Bishop'],['n','Knight']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Promote to ${name}`);
    button.innerHTML = `${PIECES[state.match.colour][type]}<small>${name}</small>`;
    button.addEventListener('click', () => {
      promotionDialog.close();
      const move = { ...pendingPromotion, promotion: type };
      pendingPromotion = null;
      makeMove(move, true);
    });
    choices.append(button);
  }
  if (typeof promotionDialog.showModal === 'function') promotionDialog.showModal();
  else { pendingPromotion = null; makeMove({ from, to, promotion: 'q' }, true); }
}

function makeMove(move, human = false) {
  try {
    const result = game.move(move);
    if (!result) return false;
    state.match.moves.push({ from: result.from, to: result.to, ...(result.promotion ? { promotion: result.promotion } : {}) });
    selected = null;
    hint = null;
    flashMessage = null;
    saveState();
    finishIfNeeded();
    render();
    if (!game.isGameOver() && human) scheduleComputer();
    return true;
  } catch { return false; }
}

function finishIfNeeded() {
  if (!game.isGameOver() || state.match.recorded) return;
  const result = game.isCheckmate() ? (game.turn() !== state.match.colour ? 'win' : 'loss') : 'draw';
  state.match.result = result;
  state.match.recorded = true;
  state.stats.games++;
  if (result === 'win') state.stats.wins++;
  else if (result === 'draw') state.stats.draws++;
  const stars = result === 'win' ? 3 : result === 'draw' ? 1 : 0;
  state.stats.stars[state.match.level - 1] = Math.max(stars, state.stats.stars[state.match.level - 1]);
  saveState();
}

function renderStatus() {
  const pill = $('turn-pill');
  const message = $('game-message');
  pill.className = 'turn-pill';
  let status = 'Your move';
  let defaultMessage = 'Tap one of your pieces, then tap a glowing square.';
  if (game.isCheckmate()) {
    const won = game.turn() !== state.match.colour;
    status = won ? 'You did it! ★' : 'Checkmate';
    defaultMessage = won ? 'What an adventure! You won. Ready for another round?' : 'Good game! Every champion learns by playing.';
    pill.classList.add(won ? 'thinking' : 'danger');
  } else if (game.isDraw()) {
    status = 'A friendly draw';
    defaultMessage = 'A clever battle! This game is a draw. Try another adventure.';
  } else if (game.turn() !== state.match.colour || thinking) {
    status = 'Champion thinking…';
    defaultMessage = 'Pip’s chess champion is planning its next move.';
    pill.classList.add('thinking');
  } else if (game.isCheck()) {
    status = 'Your king is in check!';
    defaultMessage = 'Protect your king. Find a safe square or block the attack.';
    pill.classList.add('danger');
  }
  pill.textContent = status;
  message.textContent = flashMessage || defaultMessage;
  $('thinking-dots').hidden = !thinking;
  const history = state.match.moves.length;
  const minMoves = state.match.colour === 'b' ? 2 : 1;
  $('undo-button').disabled = game.isGameOver() || history < minMoves;
  $('hint-button').disabled = !humanTurn();
}

function renderCaptures() {
  const present = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const rank of game.board()) for (const piece of rank) if (piece && piece.type !== 'k') present[piece.color][piece.type]++;
  const starting = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const list = colour => Object.entries(starting).flatMap(([type, count]) =>
    Array.from({ length: Math.max(0, count - present[colour][type]) }, () => PIECES[colour][type])).reverse().join('');
  $('human-captured').textContent = list(otherColour(state.match.colour));
  $('opponent-captured').textContent = list(state.match.colour);
}

function renderMoveHistory() {
  const list = $('moves-list');
  list.replaceChildren();
  const history = game.history();
  if (!history.length) {
    const li = document.createElement('li'); li.className = 'empty-moves'; li.textContent = 'Your moves will appear here.'; list.append(li); return;
  }
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('li');
    li.textContent = `${Math.floor(i / 2) + 1}. ${history[i]}  ${history[i + 1] || '…'}`;
    list.append(li);
  }
}

function pipTip() {
  if (game.isCheckmate()) return state.match.result === 'win'
    ? 'Hooray, hero! You found checkmate. That deserves a golden star!'
    : 'Even grandmasters lose sometimes. A fresh game brings fresh ideas!';
  if (game.isDraw()) return 'A draw is a fair result. Both sides fought brilliantly!';
  if (game.isCheck() && game.turn() === state.match.colour) return 'Oh! Your king is in check. Move the king, block the attack or capture the attacker.';
  const moves = state.match.moves.length;
  if (moves === 0) return 'Tap one of your pieces. The glowing dots will show you where it can go!';
  if (moves < 6) return 'A lovely start! Try moving a pawn towards the middle, then bring out your knights and bishops.';
  if (moves < 16) return 'Clever players protect their pieces. Before you move, look for what your opponent might do next.';
  if (moves < 32) return 'Your king likes a safe home! Castling can help, if the squares between your king and rook are clear.';
  return 'Look at every check, capture and threat. One thoughtful move can change the whole game!';
}

function renderStats() {
  $('win-count').textContent = String(state.stats.wins);
  $('draw-count').textContent = String(state.stats.draws);
  $('game-count').textContent = String(state.stats.games);
  const stars = state.stats.stars.reduce((sum, count) => sum + count, 0);
  $('star-count').textContent = `${stars} / ${LEVELS.length*3} ★`;
  $('star-progress').firstElementChild.style.width = `${(stars / (LEVELS.length*3)) * 100}%`;
}

function render() {
  renderLevels();
  renderChoices();
  renderBoard();
  renderStatus();
  renderStats();
  const tip = pipTip();
  if ($('pip-tip').textContent !== tip) {
    $('pip-tip').textContent = tip;
    if (state.preferred.speech) speak(tip);
  }
}

function cancelComputer() {
  clearTimeout(computerTimer);
  aiWorker?.terminate(); aiWorker = null;
  hintWorker?.terminate(); hintWorker = null;
  requestNumber++;
  thinking = false;
}

function scheduleComputer() {
  if (game.isGameOver() || game.turn() === state.match.colour) return;
  thinking = true;
  renderStatus();
  const request = ++requestNumber;
  computerTimer = setTimeout(() => {
    if (request !== requestNumber) return;
    try {
      aiWorker?.terminate();
      const worker = new Worker('./ai-worker.js', { type: 'module' });
      aiWorker = worker;
      worker.onmessage = event => {
        if (request !== requestNumber) return;
        worker.terminate(); aiWorker = null; thinking = false;
        const move = event.data?.move;
        if (!move || !makeMove(move)) playFallback();
        else renderStatus();
      };
      worker.onerror = () => {
        if (request !== requestNumber) return;
        worker.terminate(); aiWorker = null; thinking = false; playFallback();
      };
      worker.postMessage({ id: request, fen: game.fen(), level: state.match.level });
    } catch { thinking = false; playFallback(); }
  }, 320);
}

function playFallback() {
  if (game.turn() === state.match.colour || game.isGameOver()) { render(); return; }
  const options = game.moves({ verbose: true });
  if (options.length) makeMove(options[Math.floor(Math.random() * options.length)]);
  else render();
}

function newGameNow() {
  cancelComputer();
  state.match = { level: state.preferred.level, colour: state.preferred.colour, moves: [], result: null, recorded: false };
  game = new Chess();
  state.flipped = false;
  selected = hint = null;
  flashMessage = null;
  saveState();
  render();
  if (game.turn() !== state.match.colour) scheduleComputer();
}

function requestNewGame() {
  if (state.match.moves.length && !game.isGameOver() && typeof confirmDialog.showModal === 'function') confirmDialog.showModal();
  else newGameNow();
}

function undo() {
  if (game.isGameOver()) return;
  cancelComputer();
  let count = 0;
  do {
    const move = game.undo();
    if (!move) break;
    state.match.moves.pop();
    count++;
  } while (game.turn() !== state.match.colour && state.match.moves.length && count < 2);
  selected = hint = null;
  saveState();
  render();
  if (game.turn() !== state.match.colour) scheduleComputer();
  else setFlash('A fresh chance! Take your time and try another move.');
}

function askHint() {
  if (!humanTurn()) return;
  hintWorker?.terminate();
  setFlash('Pip is looking for a clever move…', 3500);
  const snapshot = game.fen();
  try {
    const worker = new Worker('./ai-worker.js', { type: 'module' });
    hintWorker = worker;
    worker.onmessage = event => {
      if (hintWorker !== worker) return;
      worker.terminate(); hintWorker = null;
      if (game.fen() !== snapshot || !humanTurn()) return;
      const move = event.data?.move;
      if (!move) { setFlash('Try finding a safe square for your favourite piece!'); return; }
      hint = move;
      selected = null;
      renderBoard();
      const name = NAMES[game.get(move.from)?.type] || 'piece';
      const tip = `Pip suggests your ${name} from ${move.from} to ${move.to}. The orange squares show the idea!`;
      $('pip-tip').textContent = tip;
      setFlash(`Pip's idea: ${move.from} → ${move.to}`, 7000);
      if (state.preferred.speech) speak(tip);
    };
    worker.onerror = () => { worker.terminate(); hintWorker = null; setFlash('Have a look at the middle of the board!'); };
    worker.postMessage({ id: ++requestNumber, fen: snapshot, level: 3 });
  } catch { setFlash('Try bringing a knight or bishop towards the centre.'); }
}

function speak(message) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'en-GB'; utterance.rate = .9; utterance.pitch = 1.08;
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(v => /en[-_]GB/i.test(v.lang) && /female|serena|samantha|kate|susan|libby|sonia/i.test(v.name)) || voices.find(v => /en[-_]GB/i.test(v.lang)) || null;
    speechSynthesis.speak(utterance);
  } catch { /* Speech is optional and must never interrupt the game. */ }
}

function exportBackup() {
  const backup = { app: 'Hero Academy ChessQuest', version: 1, exportedAt: new Date().toISOString(), data: state };
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = objectUrl; link.download = 'hero-academy-chessquest-backup.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function importBackup(file) {
  if (!file || file.size > 1024 * 1024) { setFlash('Choose a ChessQuest backup smaller than 1 MB.'); return; }
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed.app !== 'Hero Academy ChessQuest' || parsed.version !== 1 || !Array.isArray(parsed.data?.match?.moves) || !parsed.data?.stats) throw new Error('Wrong file');
    const candidate = sanitiseState(parsed.data);
    if (candidate.match.moves.length !== parsed.data.match.moves.length) throw new Error('Malformed moves');
    const testGame = new Chess();
    for (const move of candidate.match.moves) testGame.move(move); // Throws on illegal moves.
    if (candidate.match.result && !testGame.isGameOver()) throw new Error('Incomplete game');
    cancelComputer();
    state = candidate;
    game = testGame;
    selected = hint = null;
    saveState();
    render();
    if (!game.isGameOver() && game.turn() !== state.match.colour) scheduleComputer();
    setFlash('Your ChessQuest adventure is back!');
  } catch { setFlash('That file is not a valid ChessQuest backup.'); }
}

function init() {
  rebuildGame();
  document.querySelectorAll('[data-colour]').forEach(button =>
    button.addEventListener('click', () => selectOption('colour', button.dataset.colour)));
  $('show-moves').addEventListener('change', event => { state.preferred.showMoves = event.target.checked; saveState(); renderBoard(); });
  $('speech').addEventListener('change', event => { state.preferred.speech = event.target.checked; saveState(); if (!event.target.checked && 'speechSynthesis' in window) speechSynthesis.cancel(); });
  $('large-text').addEventListener('change', event => { state.preferred.largeText = event.target.checked; saveState(); renderChoices(); });
  $('start-button').addEventListener('click', requestNewGame);
  $('new-button').addEventListener('click', requestNewGame);
  $('cancel-new').addEventListener('click', () => confirmDialog.close());
  $('confirm-new').addEventListener('click', () => { confirmDialog.close(); newGameNow(); });
  $('undo-button').addEventListener('click', undo);
  $('hint-button').addEventListener('click', askHint);
  $('flip-button').addEventListener('click', () => { state.flipped = !state.flipped; saveState(); renderBoard(); });
  $('listen-button').addEventListener('click', () => speak($('pip-tip').textContent));
  $('export-button').addEventListener('click', exportBackup);
  $('import-button').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => { await importBackup(event.target.files?.[0]); event.target.value = ''; });
  promotionDialog.addEventListener('cancel', () => { pendingPromotion = null; });
  render();
  saveState();
  if (!game.isGameOver() && game.turn() !== state.match.colour) scheduleComputer();
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

init();

try { academy=await bootAcademy(chessAdapter({getData:()=>family,persist:()=>localStorage.setItem(FAMILY_STORE,JSON.stringify(family)),before:()=>{clearTimeout(computerTimer);aiWorker?.terminate();hintWorker?.terminate();requestNumber++;thinking=false;},refresh:()=>{state=familyHero().arena?sanitiseState(familyHero().arena):defaultState();rebuildGame();render();if(!game.isGameOver()&&game.turn()!==state.match.colour)scheduleComputer();}})); } catch { setFlash('Local chess is ready. Connect through My Academy when online.'); }
