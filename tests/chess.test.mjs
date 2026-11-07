import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../dist/vendor/chess.js';

test('a new game has all 32 pieces and 20 legal openings', () => {
  const game = new Chess();
  assert.equal(game.moves().length, 20);
  assert.equal(game.board().flat().filter(Boolean).length, 32);
});

test('illegal moves are refused', () => {
  const game = new Chess();
  assert.throws(() => game.move({ from: 'e2', to: 'e5' }));
  assert.equal(game.history().length, 0);
});

test('Fool’s mate correctly ends the game', () => {
  const game = new Chess();
  for (const move of ['f3', 'e5', 'g4', 'Qh4#']) game.move(move);
  assert.equal(game.isCheckmate(), true);
  assert.equal(game.turn(), 'w');
  assert.equal(game.isGameOver(), true);
});

test('castling moves the king and rook', () => {
  const game = new Chess();
  for (const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']) game.move(move);
  assert.equal(game.get('g1').type, 'k');
  assert.equal(game.get('f1').type, 'r');
});

test('en passant removes the bypassed pawn', () => {
  const game = new Chess();
  for (const move of ['e4', 'a6', 'e5', 'd5', 'exd6']) game.move(move);
  assert.equal(game.get('d6').type, 'p');
  assert.equal(game.get('d5'), undefined);
});

test('promotion lets a pawn become a selected piece', () => {
  const game = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  game.move({ from: 'a7', to: 'a8', promotion: 'n' });
  assert.equal(game.get('a8').type, 'n');
});

test('stalemate, fifty-move rule and insufficient material register as draws', () => {
  assert.equal(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').isStalemate(), true);
  assert.equal(new Chess('7k/8/8/8/8/8/8/K6R w - - 100 1').isDraw(), true);
  assert.equal(new Chess('7k/8/8/8/8/8/8/K7 w - - 0 1').isDraw(), true);
});

test('undo accurately restores the prior position', () => {
  const game = new Chess();
  const startingFen = game.fen();
  game.move('e4');
  game.move('c5');
  game.undo(); game.undo();
  assert.equal(game.fen(), startingFen);
});

test('all fifteen computer levels propose legal moves without an online engine', async () => {
  let receive;
  const replies = [];
  globalThis.self = {
    addEventListener(name, handler) { if (name === 'message') receive = handler; },
    postMessage(value) { replies.push(value); },
  };
  await import('../dist/ai-worker.js');
  for (let level = 1; level <= 15; level++) {
    // A small legal position keeps high-level smoke testing quick while still
    // exercising the complete worker search and its level-specific budget.
    const game = new Chess(level <= 5 ? undefined : '4k3/8/8/8/8/8/5P2/4K3 b - - 0 1');
    if(level<=5)game.move('e4');
    const turnFen = game.fen();
    receive({ data: { id: level, fen: turnFen, level } });
    const answer = replies.pop();
    assert.ok(!answer.error, `level ${level}: ${answer.error}`);
    assert.ok(answer.move, `level ${level} returned no move`);
    assert.doesNotThrow(() => game.move(answer.move));
    assert.equal(game.turn(), 'w');
  }
  delete globalThis.self;
});
