import { Chess } from './vendor/chess.js';

// A small, self-contained chess opponent. The rules are provided by chess.js;
// all search and evaluation happen locally, in a worker, without a server.
const VALUES = { p: 100, n: 325, b: 338, r: 505, q: 910, k: 0 };
const LIMITS = [null,
  { depth: 0, nodes: 0, ms: 250 },
  { depth: 1, nodes: 1200, ms: 500 },
  { depth: 2, nodes: 6000, ms: 850 },
  { depth: 3, nodes: 22000, ms: 1800 },
  { depth: 4, nodes: 75000, ms: 3500 },
  { depth: 4, nodes: 90000, ms: 3800 },
  { depth: 4, nodes: 110000, ms: 4000 },
  { depth: 4, nodes: 140000, ms: 4400 },
  { depth: 4, nodes: 175000, ms: 4800 },
  { depth: 5, nodes: 205000, ms: 5200 },
  { depth: 5, nodes: 235000, ms: 5700 },
  { depth: 5, nodes: 285000, ms: 6300 },
  { depth: 5, nodes: 360000, ms: 7000 },
  { depth: 5, nodes: 430000, ms: 7600 },
  { depth: 5, nodes: 500000, ms: 8200 },
];

function evaluate(game) {
  let score = 0;
  const board = game.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const p = board[row][col];
      if (!p) continue;
      const progress = p.color === 'w' ? 6 - row : row - 1;
      const centre = 3.5 - Math.abs(col - 3.5) + 3.5 - Math.abs(row - 3.5);
      let positional = 0;
      switch (p.type) {
        case 'p': positional = progress * 9 + centre * 3; break;
        case 'n': positional = centre * 11; break;
        case 'b': positional = centre * 6; break;
        case 'q': positional = centre * 2; break;
        case 'r': positional = progress * 2; break;
        case 'k': positional = (game.moveNumber() < 25 ? -centre * 6 : centre * 8); break;
      }
      score += (p.color === 'w' ? 1 : -1) * (VALUES[p.type] + positional);
    }
  }
  return score;
}

function movePriority(move) {
  let score = 0;
  if (move.captured) score += 12 * VALUES[move.captured] - VALUES[move.piece];
  if (move.promotion) score += VALUES[move.promotion] + 1000;
  if (move.san.includes('#')) score += 100000;
  else if (move.san.includes('+')) score += 80;
  const file = move.to.charCodeAt(0) - 97;
  const rank = Number(move.to[1]) - 1;
  score += Math.round((7 - Math.abs(file - 3.5) - Math.abs(rank - 3.5)) * 3);
  return score;
}

function orderedMoves(game) {
  return game.moves({ verbose: true }).sort((a, b) => movePriority(b) - movePriority(a));
}

function chooseRandom(g) {
  const moves = orderedMoves(g);
  if (!moves.length) return null;
  // Little Pawn sometimes spots a capture but mostly explores safely.
  const weights = moves.map(m => 1 + (m.captured ? 2.1 : 0) + (m.promotion ? 7 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = Math.random() * total;
  for (let i = 0; i < moves.length; i++) if ((pick -= weights[i]) <= 0) return moves[i];
  return moves[moves.length - 1];
}

class BudgetExceeded extends Error {}

function searchPosition(game, level) {
  const cfg = LIMITS[level];
  let best = chooseRandom(game);
  if (!best || level === 1) return { move: best, depth: 0 };
  const started = Date.now();
  let nodes = 0;
  const stop = () => {
    if (++nodes > cfg.nodes || (nodes % 128 === 0 && Date.now() - started > cfg.ms)) throw new BudgetExceeded();
  };

  function negamax(depth, alpha, beta, ply) {
    stop();
    if (game.isCheckmate()) return -100000 + ply;
    if (game.isDraw()) return 0;
    if (depth === 0) return (game.turn() === 'w' ? 1 : -1) * evaluate(game);
    let bestValue = -Infinity;
    for (const move of orderedMoves(game)) {
      game.move(move);
      const value = -negamax(depth - 1, -beta, -alpha, ply + 1);
      game.undo();
      if (value > bestValue) bestValue = value;
      if (value > alpha) alpha = value;
      if (alpha >= beta) break;
    }
    return bestValue;
  }

  const options = orderedMoves(game);
  let completedDepth = 0;
  for (let depth = 1; depth <= cfg.depth; depth++) {
    let roundBest = null;
    let roundScore = -Infinity;
    let alpha = -Infinity;
    try {
      // Search the previous winner first for better alpha-beta pruning.
      const order = [...options].sort((a, b) =>
        Number(b.from === best?.from && b.to === best?.to) - Number(a.from === best?.from && a.to === best?.to));
      for (const move of order) {
        game.move(move);
        const value = -negamax(depth - 1, -Infinity, -alpha, 1);
        game.undo();
        if (value > roundScore) { roundScore = value; roundBest = move; }
        alpha = Math.max(alpha, value);
      }
      if (roundBest) { best = roundBest; completedDepth = depth; }
    } catch (err) {
      if (!(err instanceof BudgetExceeded)) throw err;
      break; // Keep the last *completed* iteration; never use partial results.
    }
  }
  return { move: best, depth: completedDepth };
}

self.addEventListener('message', event => {
  const { id, fen, level } = event.data || {};
  try {
    const game = new Chess(fen);
    const result = searchPosition(game, Math.max(1, Math.min(15, Number(level) || 1)));
    const m = result.move;
    self.postMessage({ id, move: m ? { from: m.from, to: m.to, promotion: m.promotion } : null, depth: result.depth });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
});
