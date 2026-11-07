// ChessQuest: The Royal Road — 100 deterministic, fully local missions.
// Trail activities deliberately isolate one piece so new players can practise
// movement without check rules. Real-position challenges use chess.js.
export const WORLDS = [
  { name: 'Training Meadow', icon: '♙', subtitle: 'Your very first moves', tone: 'mint', topic: 'Meet the board' },
  { name: 'Pawn Valley', icon: '♟', subtitle: 'Little pieces, big dreams', tone: 'peach', topic: 'Pawn power' },
  { name: 'Knight Forest', icon: '♞', subtitle: 'Leap to adventure', tone: 'sage', topic: 'Knight jumps' },
  { name: "Bishop's Bridge", icon: '♗', subtitle: 'Lines and diagonals', tone: 'lavender', topic: 'Piece powers' },
  { name: "King's Castle", icon: '♔', subtitle: 'Keep the crown safe', tone: 'gold', topic: 'Escape check' },
  { name: 'Castle Gate', icon: '♖', subtitle: 'Discover secret moves', tone: 'mint', topic: 'Special rules' },
  { name: 'Tactics Trail', icon: '♕', subtitle: 'Spot the treasure', tone: 'peach', topic: 'Winning captures' },
  { name: 'Checkmate Mountain', icon: '♚', subtitle: 'Find the winning move', tone: 'sage', topic: 'Checkmate' },
  { name: 'Endgame Islands', icon: '♙', subtitle: 'Finish with confidence', tone: 'lavender', topic: 'Final pieces' },
  { name: "Champion's Road", icon: '♛', subtitle: 'Your royal challenges', tone: 'gold', topic: 'Mini matches' },
];

const FILES = 'abcdefgh';
const PIECE_NAMES = {p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
const at = (x,y) => FILES[x] + String(y+1);
const coords = square => [FILES.indexOf(square[0]), Number(square[1])-1];
const within = (x,y) => x>=0 && x<8 && y>=0 && y<8;
const rng = seed => () => { let x = (seed = Math.imul(seed ^ (seed>>>13), 0x5bd1e995)) >>> 0; return x / 4294967296; };

export function legalTrailMoves(piece, square, obstacles = [], enemies = []) {
  const [x,y] = coords(square);
  const walls = new Set(obstacles), foes = new Set(enemies);
  const result = [];
  const steps = {
    k:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]],
    n:[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]],
  };
  if (piece === 'p') {
    const forward = at(x,y+1);
    if (within(x,y+1) && !walls.has(forward) && !foes.has(forward)) {
      result.push(forward);
      const double = at(x,y+2);
      if (y===1 && !walls.has(double) && !foes.has(double)) result.push(double);
    }
    for (const dx of [-1,1]) if (within(x+dx,y+1) && foes.has(at(x+dx,y+1))) result.push(at(x+dx,y+1));
    return result;
  }
  if (piece==='n'||piece==='k') {
    for (const [dx,dy] of steps[piece]) {
      const nx=x+dx,ny=y+dy;
      if (within(nx,ny) && !walls.has(at(nx,ny))) result.push(at(nx,ny));
    }
    return result;
  }
  const dirs = [];
  if (piece==='r'||piece==='q') dirs.push([1,0],[-1,0],[0,1],[0,-1]);
  if (piece==='b'||piece==='q') dirs.push([1,1],[-1,1],[1,-1],[-1,-1]);
  for (const [dx,dy] of dirs) {
    let nx=x+dx,ny=y+dy;
    while (within(nx,ny)) {
      const next=at(nx,ny);
      if (walls.has(next)) break;
      result.push(next);
      if (foes.has(next)) break;
      nx+=dx;ny+=dy;
    }
  }
  return result;
}

function trail(piece, seed, length, mode='stars') {
  const random=rng(seed*37+19);
  const start=piece==='n' ? ['b1','c2','e3','g1','a4'][seed%5] :
    piece==='b' ? ['a1','b2','c1','d2','g1'][seed%5] :
    piece==='k' ? ['d3','c3','e4','b4','f4'][seed%5] :
    ['a1','b2','d1','f2','c3'][seed%5];
  const route=[start];
  for (let i=0;i<length;i++) {
    let candidates=legalTrailMoves(piece,route.at(-1)).filter(s=>!route.includes(s));
    // Favor short moves for early missions, a wider board exploration later.
    candidates.sort((a,b)=>{
      const [ax,ay]=coords(a),[bx,by]=coords(b),[px,py]=coords(route.at(-1));
      return (Math.abs(ax-px)+Math.abs(ay-py))-(Math.abs(bx-px)+Math.abs(by-py));
    });
    if (!candidates.length) candidates=legalTrailMoves(piece,route.at(-1));
    const pool=candidates.slice(0, Math.min(candidates.length, 7+i));
    const chosen=pool[Math.floor(random()*pool.length)];
    route.push(chosen);
  }
  if (mode==='capture') {
    const solve=(square,remaining)=>{
      if(!remaining.length)return [];
      const choices=legalTrailMoves(piece,square,[],remaining).filter(next=>remaining.includes(next));
      for(const next of choices){
        const suffix=solve(next,remaining.filter(item=>item!==next));
        if(suffix)return [next,...suffix];
      }
      return null;
    };
    const solved=solve(start,route.slice(1));
    if(solved)route.splice(1,route.length-1,...solved);
  }
  return { kind:'trail',mode,piece,start,route,stars:mode==='stars'?route.slice(1):[],
    enemies:mode==='capture'?route.slice(1):[],target:mode==='reach'?route.at(-1):null,obstacles:[] };
}

function pawnMission(seed) {
  const file=1+(seed%6),start=at(file,1);
  if (seed>=4) {
    const direction=seed%2===0?1:-1;
    const enemy=at(file+direction,2);
    return {kind:'trail',mode:'capture',piece:'p',start,route:[start,enemy],stars:[],enemies:[enemy],obstacles:[],target:null};
  }
  const steps=seed<2?2:3;
  const route=[start,at(file,3)];
  for(let i=0;i<steps;i++) route.push(at(file,4+i));
  return {kind:'trail',mode:'reach',piece:'p',start,route,stars:[],enemies:[],obstacles:[],target:route.at(-1)};
}

function toFen(pieces, turn='w', castle='-', ep='-') {
  const ranks=[];
  for(let y=7;y>=0;y--) {
    let run=0,line='';
    for(let x=0;x<8;x++) {
      const piece=pieces[at(x,y)];
      if(piece){if(run){line+=run;run=0;}line+=piece;}
      else run++;
    }
    if(run)line+=run;
    ranks.push(line);
  }
  return `${ranks.join('/')} ${turn} ${castle} ${ep} 0 1`;
}

function transform(square, variant) {
  let [x,y]=coords(square);
  if(variant&1)x=7-x;
  if(variant&2)y=7-y;
  if(variant&4)[x,y]=[y,x];
  return at(x,y);
}

function matePuzzle(index) {
  const variant=index%8;
  const base=index<8?{wk:'f6',wq:'g6',bk:'h8',from:'g6',to:'g7'}:
    {wk:'g6',wq:'f7',bk:'g8',from:'f7',to:'e8'};
  const t=s=>transform(s,variant);
  return {kind:'puzzle',mode:'mate',fen:toFen({[t(base.wk)]:'K',[t(base.wq)]:'Q',[t(base.bk)]:'k'}),
    answer:{from:t(base.from),to:t(base.to)},piece:'q'};
}

function safetyPuzzle(index) {
  const x=2+(index%5),rank=index<5?7:5;
  const king=at(x,0),rook=at(x,rank),bk=x===0?'h8':'a8';
  return {kind:'puzzle',mode:'escape',fen:toFen({[king]:'K',[rook]:'r',[bk]:'k'}),piece:'k'};
}

function promotionPuzzle(index) {
  const file=index%7,pawn=at(file,6),target=at(file,7);
  return {kind:'puzzle',mode:'promote',fen:toFen({h1:'K',h6:'k',[pawn]:'P'}),answer:{from:pawn,to:target,promotion:'q'},piece:'p'};
}

function specialPuzzle(index) {
  if(index<2) return {kind:'puzzle',mode:'castle',fen:'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
    answer:{from:'e1',to:index===0?'g1':'c1'},piece:'k'};
  if(index<4) {
    const start=index===2?'e5':'d5',foe=index===2?'d5':'e5',target=index===2?'d6':'e6';
    return {kind:'puzzle',mode:'enpassant',fen:toFen({e1:'K',e8:'k',[start]:'P',[foe]:'p'},'w','-',target),
      answer:{from:start,to:target},piece:'p'};
  }
  const puzzle=promotionPuzzle(index-4);
  if(index===5)puzzle.answer.promotion='r';
  if(index===6)puzzle.answer.promotion='b';
  if(index===7)puzzle.answer.promotion='n';
  return puzzle;
}

const CAPTURES = [
  {piece:'R',from:'a1',to:'a5',wk:'e1',bk:'h8'},
  {piece:'R',from:'h1',to:'h5',wk:'e1',bk:'a8'},
  {piece:'N',from:'c3',to:'d5',wk:'e1',bk:'h8'},
  {piece:'N',from:'f3',to:'e5',wk:'e1',bk:'a8'},
  {piece:'B',from:'c4',to:'f7',wk:'e1',bk:'h8'},
  {piece:'B',from:'f4',to:'c7',wk:'e1',bk:'h8'},
  {piece:'Q',from:'d1',to:'h5',wk:'e1',bk:'a8'},
  {piece:'Q',from:'d1',to:'a4',wk:'e1',bk:'h8'},
  {piece:'R',from:'b2',to:'b6',wk:'e1',bk:'h8'},
  {piece:'B',from:'b2',to:'e5',wk:'e1',bk:'h8'},
];
function tacticsPuzzle(index) {
  const c=CAPTURES[index];
  return {kind:'puzzle',mode:'treasure',fen:toFen({[c.wk]:'K',[c.bk]:'k',[c.from]:c.piece,[c.to]:'q'}),
    answer:{from:c.from,to:c.to},piece:c.piece.toLowerCase()};
}

function duelMission(index) {
  const pawn=at(index%7,1),foe=at(index%7,6);
  const second=at((index+3)%7,1),secondFoe=at((index+3)%7,6);
  return {kind:'duel',mode:'mini',fen:toFen({e1:'K',e8:'k',a1:'R',h8:'r',[pawn]:'P',[foe]:'p',[second]:'P',[secondFoe]:'p'}),
    turns:2+Math.floor(index/3),aiLevel:Math.min(12,index+2),piece:'k'};
}

const TITLES = [
  ['Hello, Chessboard!','The Rook Road','Two Golden Stars','The Quiet Queen','King Steps','Straight Ahead','Diagonal Discovery','A Little Longer','Three Brave Moves','Meadow Champion'],
  ['A Pawn Begins','The Double Step','Climb the Valley','Almost There','The First Capture','A Little Side Step','Pawn Treasure','A Brave Capture','The Valley Crossing','Pawn Hero'],
  ['Knight School','The First Leap','Hop Over','A Hidden Path','The Forest Corner','A Longer Jump','Find the Clearing','Knight Explorer','Leap of Faith','Forest Champion'],
  ["Bishop's Path","Rook's Road","Queen's Reach",'The Golden Diagonal','Capture the Jewel','Rook Rescue',"Queen's Treasure",'Diagonal Chase','The Long Way Round','Bridge Champion'],
  ['King in Trouble','The Safe Square','Watch the Rook','Step out of Check','The Royal Escape','A New Direction',"The King's Choice",'Find a Way Out','Defend the Crown','Castle Champion'],
  ['Castle to Safety','Castle the Other Way','Secret Pawn Capture','En Passant Return',"The Queen's Reward",'A New Rook','Bishop Promotion',"A Knight's Surprise",'Royal Transformation','The Golden Pawn'],
  ['Take the Queen','Rook Treasure','Knight Fork Practice','A Clever Leap','Diagonal Capture','Bishop Treasure',"Queen's Journey",'The Royal Capture','A Long Rook Move','Tactics Champion'],
  ['The Final Square',"Queen's Checkmate",'A Cornered King','The Last Escape','Royal Finish','The Winning Diagonal','A Mirror Challenge','Mountain Summit','Checkmate Again','The Crown Is Yours'],
  ['Last Pawn Standing','The Journey Home','One Step from Glory','Final Promotion','The Golden Endgame','Queen and King','Endgame Pattern','Corner Challenge','Find the Finish','Island Champion'],
  ['Your First Mini Match','The Pawn Duel','Rook and Pawn','The Small Arena','Protect and Play','A Clever Defence','The Royal Trial','Battle of the Rooks',"Champion's Practice",'The Royal Tournament'],
];

const PROMPTS={
  stars: 'Collect every golden star. Tap a glowing square to move!',
  capture: 'Capture all the treasure pieces. Your piece knows the way!',
  reach: 'Help your pawn reach the golden square.',
  escape: 'Your king is in check! Find any legal move that makes it safe.',
  castle: 'Help the king castle with a rook. Tap the king, then its new square.',
  enpassant: 'A pawn just raced past. Catch it with the special en passant move!',
  promote: 'Move your pawn to the last rank to give it a superpower!',
  treasure: 'An enemy queen is waiting to be captured. Can you find it?',
  mate: 'Find checkmate in one move! The other king must have no escape.',
  mini: 'Play a short mini match against the Castle Champion. Every move is practice!',
};

export const MISSIONS=Array.from({length:100},(_,i)=>{
  const world=Math.floor(i/10),step=i%10,id=i+1;
  let task;
  if(world===0) task=trail(['r','r','r','q','k','r','b','q','n','r'][step],i+11,step<3?1:step<7?2:3);
  if(world===1) task=pawnMission(step);
  if(world===2) task=trail('n',i+7,2+Math.floor(step/3));
  if(world===3) task=trail(['b','r','q','b','n','r','q','b','q','r'][step],i+37,2+Math.floor(step/4),step>=4&&step<=7?'capture':'stars');
  if(world===4) task=safetyPuzzle(step);
  if(world===5) task=specialPuzzle(step);
  if(world===6) task=tacticsPuzzle(step);
  if(world===7) task=matePuzzle(step);
  if(world===8) task=step<5?promotionPuzzle(step+1):matePuzzle(step-5);
  if(world===9) task=duelMission(step);
  const mode=task.mode;
  return {...task,id,world:world+1,step:step+1,title:TITLES[world][step],prompt:PROMPTS[mode],
    difficulty:Math.min(5,1+Math.floor(step/2)),tip: mode==='stars'?'See where your piece can travel. Follow the little dots!':
      mode==='capture'?'Your piece can take a treasure piece when it lands on its square.':
      mode==='reach'?'Pawns go forwards. On their first move they may go two squares.':
      mode==='escape'?'The king cannot stay in check. Look for a safe square.':
      mode==='castle'?'Move your king two squares towards its rook.':
      mode==='enpassant'?'The secret capture happens immediately after a pawn moves two squares.':
      mode==='promote'?'Reaching the last rank lets your pawn become a queen, rook, bishop or knight.':
      mode==='treasure'?'Find a piece that can capture the opponent’s queen.':
      mode==='mate'?'Checkmate means the king is attacked and cannot escape.':
      'Keep your king safe, develop pieces, and enjoy the mini battle!'};
});

export const getMission=id=>MISSIONS.find(m=>m.id===Number(id));
export const pieceName=piece=>PIECE_NAMES[piece]||'piece';
