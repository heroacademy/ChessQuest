import test from 'node:test';
import assert from 'node:assert/strict';
import {chessAdapter} from '../dist/academy-family.js';
test('ChessQuest maps first and final mission, preserves siblings and arena, and restores only the selected hero',()=>{
 const sibling={id:'b',name:'Other',completed:{3:true}};
 const data={current:'a',profiles:[{id:'a',name:'Hero',completed:{1:true,100:true},arena:{match:{moves:[]}}},sibling]};let stopped=0;
 const a=chessAdapter({getData:()=>data,persist(){},refresh(){},before:()=>stopped++});
 assert.deepEqual(a.milestones(),[0,99]);assert.equal(a.snapshot().arena.match.moves.length,0);
 a.restore({id:'cloud-id',name:'Cloud',completed:{100:true,101:true},arena:{stats:{wins:2}}});
 assert.equal(data.current,'a');assert.equal(data.profiles[0].id,'a');assert.deepEqual(a.milestones(),[99]);assert.deepEqual(data.profiles[1],sibling);
 assert(a.select('b'));assert(!a.select('unknown'));assert.equal(a.identity(),'b');assert.equal(stopped,2);
 while(data.profiles.length<20)data.profiles.push({id:'extra-'+data.profiles.length,name:'Hero',completed:{}});
 assert.throws(()=>a.create({name:'Next'}),/spaces/);
});
