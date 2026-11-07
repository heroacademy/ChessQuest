import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../dist/vendor/chess.js';
import { MISSIONS, WORLDS, legalTrailMoves, getMission } from '../dist/missions.js';

test('100 unique playable missions across ten worlds', () => {
  assert.equal(MISSIONS.length,100);
  assert.equal(WORLDS.length,10);
  assert.equal(new Set(MISSIONS.map(m=>m.title)).size,100);
  assert.deepEqual(MISSIONS.map(m=>m.id),Array.from({length:100},(_,i)=>i+1));
  for(let w=1;w<=10;w++) assert.equal(MISSIONS.filter(m=>m.world===w).length,10);
  assert.equal(getMission(100).title,'The Royal Tournament');
});

test('every trail mission has a valid solution using the actual mini-game rules', () => {
  for(const mission of MISSIONS.filter(m=>m.kind==='trail')) {
    let position=mission.start;
    const enemies=[...mission.enemies];
    const stars=[...mission.stars];
    for(const next of mission.route.slice(1)) {
      const valid=legalTrailMoves(mission.piece,position,mission.obstacles,enemies);
      assert.ok(valid.includes(next),`level ${mission.id}: ${position} -> ${next} illegal`);
      position=next;
      if(enemies.includes(next)) enemies.splice(enemies.indexOf(next),1);
      if(stars.includes(next)) stars.splice(stars.indexOf(next),1);
    }
    assert.equal(enemies.length,0,`level ${mission.id}: remaining enemies`);
    assert.equal(stars.length,0,`level ${mission.id}: remaining stars`);
    if(mission.mode==='reach') assert.equal(position,mission.target);
  }
});

test('all rules challenges have valid chess positions and legal solutions', () => {
  for(const mission of MISSIONS.filter(m=>m.kind==='puzzle')) {
    let game;
    assert.doesNotThrow(()=>{game=new Chess(mission.fen);},`level ${mission.id}: invalid FEN`);
    assert.ok(game.moves().length>0,`level ${mission.id}: no legal moves`);
    if(mission.mode==='escape') {
      assert.equal(game.isCheck(),true,`level ${mission.id} does not start in check`);
      game.move(game.moves()[0]);
      assert.equal(game.isCheck(),false);
      continue;
    }
    let result;
    assert.doesNotThrow(()=>{result=game.move(mission.answer);},`level ${mission.id}: illegal solution`);
    if(mission.mode==='mate') assert.equal(game.isCheckmate(),true,`level ${mission.id}: supposed mate not mate`);
    if(mission.mode==='castle') assert.ok(/[kq]/.test(result.flags),`level ${mission.id}: not castling`);
    if(mission.mode==='enpassant') assert.ok(result.flags.includes('e'),`level ${mission.id}: not en passant`);
    if(mission.mode==='promote') assert.equal(result.promotion,mission.answer.promotion,`level ${mission.id}: not promoted`);
    if(mission.mode==='treasure') assert.equal(result.captured,'q',`level ${mission.id}: queen not captured`);
  }
});

test('all mini-match positions can start and offer legal moves', () => {
  for(const mission of MISSIONS.filter(m=>m.kind==='duel')) {
    const game=new Chess(mission.fen);
    assert.equal(game.turn(),'w');
    assert.ok(game.moves().length>=5,`level ${mission.id} has too few moves`);
    assert.equal(game.isGameOver(),false);
  }
});
