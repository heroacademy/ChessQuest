import { bootAcademy } from './academy-client.js';
import { chessAdapter } from './academy-family.js';
import { Chess } from './vendor/chess.js';
import { WORLDS, MISSIONS, getMission, legalTrailMoves, pieceName } from './missions.js';

const STORE='heroacademy.chessquest.adventure.v1';
const PIECES={w:{p:'♙',n:'♘',b:'♗',r:'♖',q:'♕',k:'♔'},b:{p:'♟',n:'♞',b:'♝',r:'♜',q:'♛',k:'♚'}};
const FILES='abcdefgh';
const $=id=>document.getElementById(id);
const text=(id,value)=>{$(id).textContent=String(value);};
const safeId=id=>Number.isInteger(Number(id))&&Number(id)>=1&&Number(id)<=100?Number(id):null;
const newProfile=name=>({id:`hero-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name,completed:{},active:null});
const freshData=()=>{const hero=newProfile('Hero');return {version:1,profiles:[hero],current:hero.id,speech:false};};
const clone=value=>JSON.parse(JSON.stringify(value));
function restoreData() {
  try {
    const obj=JSON.parse(localStorage.getItem(STORE));
    if(!obj||!Array.isArray(obj.profiles)||!obj.profiles.length) return freshData();
    const profiles=obj.profiles.slice(0,20).filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name.trim()).map(p=>({
      id:p.id.slice(0,80), name:p.name.trim().slice(0,24),
      completed:Object.fromEntries(Object.entries(p.completed||{}).filter(([key,value])=>safeId(key)&&value===true)),
      active:p.active&&safeId(p.active.id)?p.active:null,
      ...(p.arena?{arena:clone(p.arena)}:{}),
    }));
    if(!profiles.length) return freshData();
    return {version:1,profiles,current:profiles.some(p=>p.id===obj.current)?obj.current:profiles[0].id,speech:obj.speech===true};
  } catch {return freshData();}
}
let data=restoreData();
let academy=null;
let mission=null;
let state=null;
let game=null;
let selected=null;
let hinted=[];
let finished=false;
let computerThinking=false;
let worker=null;
let computerTimeout=null;
let workerSerial=0;
let activeTab='worlds';
let selectedWorld=null;
let selectedType='stars';
let promotionPending=null;

function profile(){return data.profiles.find(p=>p.id===data.current)||data.profiles[0];}
function writeData(sync=true){try{localStorage.setItem(STORE,JSON.stringify(data));}catch{ /* Private mode may disable local saves. */ }if(sync)void academy?.flush();}
function saveMission(){if(mission&&state&&!finished){profile().active={id:mission.id,state:clone(state)};writeData();}}
function countWorld(world){return MISSIONS.filter(m=>m.world===world&&profile().completed[m.id]).length;}
function countCompleted(){return MISSIONS.filter(m=>profile().completed[m.id]).length;}
function nextUnfinished(){return MISSIONS.find(m=>!profile().completed[m.id])?.id||100;}

function stopComputer(){clearTimeout(computerTimeout);worker?.terminate();worker=null;workerSerial++;computerThinking=false;}
function speak(message){
  if(!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(message);
  utterance.lang='en-GB';utterance.rate=.87;utterance.pitch=1.12;
  const english=window.speechSynthesis.getVoices().filter(v=>/^en(-|_)/i.test(v.lang));
  const voice=english.find(v=>/en-GB/i.test(v.lang)&&/female|susan|serena|kate|samantha/i.test(v.name))||english.find(v=>/en-GB/i.test(v.lang))||english[0];
  if(voice)utterance.voice=voice;
  window.speechSynthesis.speak(utterance);
}
function coach(message,announce=false){text('coach-text',message);if(announce&&data.speech)speak(message);}
function chooseTab(which){
  activeTab=which;
  for(const tab of ['worlds','games','progress']){
    $(`tab-${tab}`).setAttribute('aria-selected',String(which===tab));
    $(`${tab}-view`).hidden=which!==tab;
  }
  if(which==='progress')renderProgress();
  if(which==='games')renderMiniGames();
}
function renderProfiles(){
  const selector=$('profile-select');
  selector.replaceChildren();
  for(const p of data.profiles){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;selector.append(option);}
  selector.value=profile().id;
  $('total-progress').textContent=`${countCompleted()} / 100 missions`;
  $('total-progress-fill').style.width=`${countCompleted()}%`;
  text('total-stars',`${countCompleted()*3} ★`);
  $('continue-button').innerHTML=`✦ ${countCompleted()?'Continue my adventure':'Start my adventure'} <span>→</span>`;
}
function renderWorlds(){
  const container=$('world-grid');container.replaceChildren();
  WORLDS.forEach((world,index)=>{
    const count=countWorld(index+1);
    const button=document.createElement('button');button.type='button';
    button.className=`world-card ${world.tone}`;
    button.setAttribute('aria-pressed',String(selectedWorld===index+1));
    button.setAttribute('aria-label',`World ${index+1}, ${world.name}, ${count} of 10 missions complete. Open levels.`);
    button.innerHTML=`<span class="world-number">WORLD ${String(index+1).padStart(2,'0')}</span><span class="world-completed">${count}/10 ★</span><span class="world-icon" aria-hidden="true">${world.icon}</span><strong>${world.name}</strong><small>${world.subtitle}</small><span class="world-progress-dots" aria-hidden="true">${Array.from({length:10},(_,n)=>`<i class="${n<count?'filled':''}"></i>`).join('')}</span>`;
    button.addEventListener('click',()=>openWorld(index+1));container.append(button);
  });
  if(selectedWorld)renderLevelPicker();
}
function missionButton(mission){
  const done=profile().completed[mission.id];
  const button=document.createElement('button');button.type='button';
  button.className=`mission-tile${done?' completed':''}`;
  button.setAttribute('aria-label',`Level ${mission.id}, ${mission.title}, ${done?'complete':'ready to play'}`);
  button.innerHTML=`<small>LEVEL ${String(mission.id).padStart(3,'0')}</small><span class="mission-symbol" aria-hidden="true">${done?'★':WORLDS[mission.world-1].icon}</span><strong>${mission.title}</strong><span class="mission-earned">${done?'★ ★ ★':'☆ ☆ ☆'}</span>`;
  button.addEventListener('click',()=>openMission(mission.id));return button;
}
function openWorld(world){
  selectedWorld=world;renderWorlds();
  $('level-picker').hidden=false;
  $('level-picker').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderLevelPicker(){
  if(!selectedWorld)return;
  const world=WORLDS[selectedWorld-1];
  text('selected-world-kicker',`WORLD ${String(selectedWorld).padStart(2,'0')} · ${countWorld(selectedWorld)}/10 COMPLETE`);
  text('selected-world-name',world.name);text('selected-world-subtitle',world.subtitle+' · Choose any of its ten missions.');
  const grid=$('mission-grid');grid.replaceChildren();
  MISSIONS.filter(m=>m.world===selectedWorld).forEach(m=>grid.append(missionButton(m)));
}
const CATEGORIES=[
  {id:'all',name:'All little games',icon:'🎲',description:'Explore every kind of mini game.'},
  {id:'stars',name:'Star Hunt',icon:'⭐',description:'Follow the pieces and gather stars.'},
  {id:'capture',name:'Treasure Capture',icon:'💎',description:'Use a piece to collect hidden treasure.'},
  {id:'reach',name:'Pawn Journey',icon:'♙',description:'Guide a pawn across the board.'},
  {id:'escape',name:'King Rescue',icon:'♔',description:'Find a safe home for the king.'},
  {id:'castle',name:'Castle Magic',icon:'🏰',description:'Learn a special two-piece move.'},
  {id:'enpassant',name:'Secret Pawn Move',icon:'✨',description:'Practise en passant captures.'},
  {id:'promote',name:'Superpower Pawns',icon:'♕',description:'Turn a pawn into a new piece.'},
  {id:'treasure',name:'Tactics Treasure',icon:'♛',description:'Spot the valuable capture.'},
  {id:'mate',name:'Checkmate Quest',icon:'👑',description:'Find the move that wins the game.'},
  {id:'mini',name:'Mini Matches',icon:'⚔️',description:'Play short chess battles against Pip.'},
];
function renderMiniGames(){
  const grid=$('game-types');grid.replaceChildren();
  CATEGORIES.forEach(item=>{
    const button=document.createElement('button');button.type='button';button.className='game-type-card';
    button.setAttribute('aria-pressed',String(selectedType===item.id));
    button.innerHTML=`<span class="game-type-icon" aria-hidden="true">${item.icon}</span><strong>${item.name}</strong><small>${item.description}</small>`;
    button.addEventListener('click',()=>{selectedType=item.id;renderMiniGames();});grid.append(button);
  });
  const results=$('game-filter-results');results.replaceChildren();
  MISSIONS.filter(m=>selectedType==='all'||m.mode===selectedType).forEach(m=>results.append(missionButton(m)));
}
function renderProgress(){
  text('profile-stars',`${countCompleted()*3} golden stars`);
  const rows=$('world-progress-list');rows.replaceChildren();
  WORLDS.forEach((w,i)=>{
    const done=countWorld(i+1);
    const entry=document.createElement('div');entry.className='world-progress-item';
    const title=document.createElement('strong');title.textContent=`${w.icon} ${w.name}`;
    const count=document.createElement('span');count.textContent=`${done} / 10`;
    const bar=document.createElement('div');bar.className='mini-track';
    const inside=document.createElement('i');inside.style.width=`${done*10}%`;bar.append(inside);
    entry.append(title,count,bar);rows.append(entry);
  });
}
function renderMap(){renderProfiles();renderWorlds();if(activeTab==='games')renderMiniGames();if(activeTab==='progress')renderProgress();}

function initialState(m){
  return m.kind==='trail'?{square:m.start,stars:[...m.stars],enemies:[...m.enemies],moves:[],history:[]}:
    {moves:[],history:[]};
}
function recoverState(m,raw){
  if(!raw||!Array.isArray(raw.moves)||raw.moves.length>200)return initialState(m);
  if(m.kind==='trail'){
    let result=initialState(m);
    for(const move of raw.moves){
      if(typeof move!=='string'||!legalTrailMoves(m.piece,result.square,m.obstacles,result.enemies).includes(move))return initialState(m);
      result.history.push({square:result.square,stars:[...result.stars],enemies:[...result.enemies]});
      result.square=move;result.moves.push(move);
      result.stars=result.stars.filter(s=>s!==move);result.enemies=result.enemies.filter(s=>s!==move);
    }
    return result;
  }
  try{
    const trial=new Chess(m.fen),accepted=[];
    for(const move of raw.moves){
      if(!move||typeof move.from!=='string'||typeof move.to!=='string')return initialState(m);
      const done=trial.move(move);
      accepted.push({from:done.from,to:done.to,...(done.promotion?{promotion:done.promotion}:{})});
    }
    return {moves:accepted,history:[]};
  }catch{return initialState(m);}
}
function prepareChess(){
  game=new Chess(mission.fen);
  for(const move of state.moves)game.move(move);
}
function openMission(id){
  academy?.recordAttempt();
  const next=getMission(id);if(!next)return;
  stopComputer();mission=next;selected=null;hinted=[];finished=false;promotionPending=null;
  const saved=profile().active;
  state=saved?.id===id?recoverState(mission,saved.state):initialState(mission);
  game=mission.kind==='trail'?null:new Chess(mission.fen);
  if(game)prepareChess();
  $('overview-screen').hidden=true;$('play-screen').hidden=false;
  text('play-world-label',`WORLD ${String(mission.world).padStart(2,'0')} · ${WORLDS[mission.world-1].name}`);
  text('play-mode',CATEGORIES.find(c=>c.id===mission.mode)?.name.toUpperCase()||'MISSION');
  text('play-mission-title',mission.title);text('play-badge',`${mission.id} / 100`);
  text('play-intro',mission.prompt);
  $('quest-voice').checked=data.speech;
  const nextMission=getMission(Math.min(100,mission.id+1));
  text('next-mission-name',nextMission?.title||'Free play');
  $('quest-success').hidden=true;
  $('quest-undo').disabled=!state.moves.length;
  text('rules-text',mission.kind==='trail'?
    `You are practising the ${pieceName(mission.piece)}. Tap a green dot to move. Each type of piece has its own special pattern.`:
    mission.kind==='duel'?'Play the white pieces against the computer. Tap a piece, then a glowing destination. You are practising for just a few turns.':
    'These are real chess positions. Tap a white piece, then a glowing destination. Chess rules keep each move safe.');
  coach(mission.prompt,true);
  history.replaceState({},'',`?mission=${mission.id}`);
  saveMission();renderPlay();
  window.scrollTo({top:0,behavior:'smooth'});
  if(mission.kind==='duel'&&game.turn()==='b')scheduleDuelComputer();
}
function returnToMap(){
  stopComputer();
  if(mission&&!finished)saveMission();
  mission=null;game=null;state=null;
  $('overview-screen').hidden=false;$('play-screen').hidden=true;
  history.replaceState({},'',location.pathname);
  renderMap();window.scrollTo({top:0,behavior:'smooth'});
}
function playable(){return mission&&!finished&&!computerThinking&&(mission.kind==='trail'||game.turn()==='w')&&!game?.isGameOver();}
function legalTargets(){
  if(!playable())return [];
  if(mission.kind==='trail')return legalTrailMoves(mission.piece,state.square,mission.obstacles,state.enemies);
  if(!selected)return [];
  return game.moves({square:selected,verbose:true}).map(move=>move.to);
}
function boardSquares(){return [...'87654321'].flatMap(rank=>[...FILES].map(file=>file+rank));}
function renderPlay(){
  if(!mission)return;
  const grid=$('quest-board'),targetSet=new Set(legalTargets());
  const focus=grid.contains(document.activeElement)?document.activeElement.dataset.square:null;
  const fragment=document.createDocumentFragment();
  const board=boardSquares();
  for(let index=0;index<64;index++){
    const square=board[index];
    const position=mission.kind==='trail'?(state.square===square?{type:mission.piece,color:'w'}:state.enemies.includes(square)?{type:'p',color:'b'}:null):game.get(square);
    const button=document.createElement('button');button.type='button';
    const light=(FILES.indexOf(square[0])+Number(square[1]))%2===0;
    button.className=`quest-square ${light?'light':'dark'}`;
    button.dataset.square=square;button.setAttribute('role','gridcell');
    const legal=targetSet.has(square);
    const isSelected=mission.kind==='trail'?state.square===square:selected===square;
    button.setAttribute('aria-selected',String(isSelected));
    if(isSelected)button.classList.add('selected');
    if(legal)button.classList.add('legal');
    if(hinted.includes(square))button.classList.add('hint');
    const label=`${square}, ${position?`${position.color==='w'?'white':'black'} ${pieceName(position.type)}`:'empty'}${state.stars?.includes(square)?', golden star':''}${mission.target===square?', golden destination':''}${legal?', legal move':''}`;
    button.setAttribute('aria-label',label);
    if(mission.kind==='trail'&&state.stars.includes(square)){
      const star=document.createElement('span');star.className='quest-star';star.textContent='★';star.setAttribute('aria-hidden','true');button.append(star);
    }
    if(mission.kind==='trail'&&mission.target===square){
      const target=document.createElement('span');target.className='quest-target';target.setAttribute('aria-hidden','true');button.append(target);
    }
    if(legal){const dot=document.createElement('span');dot.className='quest-legal-dot';dot.setAttribute('aria-hidden','true');button.append(dot);if(position&&position.color==='b')button.classList.add('capture');}
    if(position){const piece=document.createElement('span');piece.className=`quest-piece ${position.color==='w'?'white':'black'}`;piece.textContent=PIECES[position.color][position.type];piece.setAttribute('aria-hidden','true');button.append(piece);}
    if(index>=56){const coord=document.createElement('span');coord.className='quest-coord';coord.textContent=square[0];button.append(coord);}
    button.addEventListener('click',()=>tapSquare(square));
    button.addEventListener('keydown',event=>{
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
      if(!delta)return;
      const nx=index%8+delta[0],ny=Math.floor(index/8)+delta[1];
      if(nx<0||nx>7||ny<0||ny>7)return;
      event.preventDefault();grid.querySelector(`[data-square="${board[ny*8+nx]}"]`)?.focus();
    });
    fragment.append(button);
  }
  grid.replaceChildren(fragment);
  if(focus)grid.querySelector(`[data-square="${focus}"]`)?.focus({preventScroll:true});
  const remaining=mission.kind==='trail'?state.stars.length+state.enemies.length:null;
  const goal=mission.mode==='stars'?`★ ${remaining} golden ${remaining===1?'star':'stars'} left`:
    mission.mode==='capture'?`♟ ${remaining} treasure ${remaining===1?'piece':'pieces'} left`:
    mission.mode==='reach'?`✦ Reach the golden square ${mission.target}`:
    mission.mode==='mini'?`⚔️ ${Math.min(mission.turns,Math.ceil(state.moves.length/2))} / ${mission.turns} moves completed`:
    mission.mode==='escape'?'♔ Move your king out of check':
    mission.mode==='castle'?'♖ Move the king two squares towards a rook':
    mission.mode==='promote'?'♕ Reach the last row and choose a new piece':
    mission.mode==='mate'?'♛ Checkmate in one move':
    mission.mode==='treasure'?'💎 Capture the enemy queen':'♙ Make the secret pawn capture';
  text('quest-goal',finished?'★ Mission completed!':goal);
  text('quest-counter',`Moves: ${mission.kind==='duel'?Math.ceil(state.moves.length/2):state.moves.length}`);
  text('board-note',finished?'Beautifully done! ★':computerThinking?'The Castle Champion is thinking…':
    mission.kind==='trail'?'Tap any glowing dot to move your piece.':selected?'Tap a glowing square to make your move.':'Tap a white piece to see its legal moves.');
  $('quest-undo').disabled=finished||!state.moves.length||computerThinking;
  $('quest-hint').disabled=finished||computerThinking;
  $('quest-restart').disabled=computerThinking;
}
function tapSquare(square){
  if(!playable())return;
  if(mission.kind==='trail'){
    if(square===state.square)return;
    if(!legalTrailMoves(mission.piece,state.square,mission.obstacles,state.enemies).includes(square)){
      coach('Have another look at the glowing dots. You can do it!');return;
    }
    state.history.push({square:state.square,stars:[...state.stars],enemies:[...state.enemies]});
    if(state.history.length>150)state.history.shift();
    state.moves.push(square);state.square=square;
    state.stars=state.stars.filter(item=>item!==square);
    state.enemies=state.enemies.filter(item=>item!==square);
    hinted=[];
    const done=mission.mode==='reach'?state.square===mission.target:!state.stars.length&&!state.enemies.length;
    if(done)completeMission();
    else{coach('Lovely move! Follow the dots and keep going.');saveMission();renderPlay();}
    return;
  }
  const piece=game.get(square);
  if(selected===square){selected=null;hinted=[];renderPlay();return;}
  if(selected){
    const moves=game.moves({square:selected,verbose:true}).filter(move=>move.to===square);
    if(moves.length){
      if(moves.some(move=>move.promotion)){showPromotion(selected,square);return;}
      makeChessMove({from:selected,to:square});return;
    }
  }
  if(piece?.color==='w'){
    selected=square;hinted=[];renderPlay();
    if(!game.moves({square,verbose:true}).length)coach('That piece has no safe move right now. Try another one.');
  }else if(selected)coach('Try a glowing square, or pick a different white piece.');
}
function showPromotion(from,to){
  promotionPending={from,to};
  const choices=$('quest-promotion-choices');choices.replaceChildren();
  for(const [type,name] of [['q','Queen'],['r','Rook'],['b','Bishop'],['n','Knight']]){
    const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`Promote to ${name}`);
    button.innerHTML=`${PIECES.w[type]}<small>${name}</small>`;
    button.addEventListener('click',()=>{ $('quest-promotion-dialog').close();const move={...promotionPending,promotion:type};promotionPending=null;makeChessMove(move);});choices.append(button);
  }
  if(typeof $('quest-promotion-dialog').showModal==='function')$('quest-promotion-dialog').showModal();
  else makeChessMove({from,to,promotion:'q'});
}
function solutionMet(move){
  if(mission.mode==='escape')return true;
  if(mission.mode==='castle')return move.flags.includes('k')||move.flags.includes('q');
  if(mission.mode==='enpassant')return move.flags.includes('e');
  if(mission.mode==='promote')return !!move.promotion&&(![56,57,58].includes(mission.id)||move.promotion===mission.answer.promotion);
  if(mission.mode==='treasure')return move.captured==='q';
  if(mission.mode==='mate')return game.isCheckmate();
  return false;
}
function makeChessMove(move){
  if(!playable())return;
  let result;
  try{result=game.move(move);}catch{coach('Try a highlighted legal move, hero.');return;}
  selected=null;hinted=[];
  if(mission.kind==='puzzle'){
    if(!solutionMet(result)){
      game.undo();
      const desired={56:'rook',57:'bishop',58:'knight'}[mission.id];
      coach(desired?`A lovely promotion! This mission asks you to try a ${desired}. Choose that piece and see what it can do.`:`Good thinking! ${mission.tip} Try another move.`,true);
      renderPlay();return;
    }
    state.moves.push({from:result.from,to:result.to,...(result.promotion?{promotion:result.promotion}:{})});
    completeMission();return;
  }
  state.moves.push({from:result.from,to:result.to,...(result.promotion?{promotion:result.promotion}:{})});
  if(game.isGameOver()||Math.ceil(state.moves.length/2)>=mission.turns){completeMission();return;}
  coach('Great thinking! Now the Castle Champion will take a turn.');
  saveMission();renderPlay();scheduleDuelComputer();
}
function scheduleDuelComputer(){
  if(!mission||mission.kind!=='duel'||game.turn()!=='b'||game.isGameOver())return;
  computerThinking=true;renderPlay();
  const serial=++workerSerial;
  computerTimeout=setTimeout(()=>{
    if(serial!==workerSerial)return;
    try{
      const current=new Worker('./ai-worker.js',{type:'module'});worker=current;
      current.onmessage=event=>{
        if(serial!==workerSerial)return;
        current.terminate();worker=null;computerThinking=false;
        if(!applyComputerMove(event.data?.move))fallbackComputerMove();
      };
      current.onerror=()=>{
        if(serial!==workerSerial)return;
        current.terminate();worker=null;computerThinking=false;fallbackComputerMove();
      };
      current.postMessage({id:serial,fen:game.fen(),level:mission.aiLevel});
    }catch{computerThinking=false;fallbackComputerMove();}
  },300);
}
function applyComputerMove(move){
  if(!move||!mission||game.turn()!=='b')return false;
  try{
    const result=game.move(move);
    state.moves.push({from:result.from,to:result.to,...(result.promotion?{promotion:result.promotion}:{})});
    if(game.isGameOver()){completeMission();return true;}
    coach('The Castle Champion has moved. Your turn!');
    saveMission();renderPlay();return true;
  }catch{return false;}
}
function fallbackComputerMove(){
  if(!mission||!game||game.turn()!=='b')return;
  const choices=game.moves({verbose:true});
  if(choices.length)applyComputerMove(choices[Math.floor(Math.random()*choices.length)]);
  else completeMission();
}
function completeMission(){
  stopComputer();finished=true;profile().completed[mission.id]=true;profile().active=null;writeData();
  $('quest-success').hidden=false;
  text('success-text',mission.kind==='duel'?'You finished your mini match. Every thoughtful move makes you stronger.':`You mastered ${mission.title.replace(/[.!?]+$/,'')}! Three golden stars are yours.`);
  text('next-mission',mission.id===100?'Back to adventure map':'Next adventure →');
  coach('Brilliant work! Three golden stars for your adventure!',true);
  renderPlay();
  $('quest-success').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function undoMove(){
  if(!mission||finished||computerThinking||!state.moves.length)return;
  hinted=[];selected=null;
  if(mission.kind==='trail'){
    const previous=state.history.pop();if(!previous)return;
    state.moves.pop();state.square=previous.square;state.stars=previous.stars;state.enemies=previous.enemies;
  }else{
    const remove=mission.kind==='duel'?2:1;
    for(let n=0;n<remove&&state.moves.length;n++){state.moves.pop();game.undo();}
  }
  coach('That’s okay! Take your time and try a different move.');
  saveMission();renderPlay();
}
function showHint(){
  if(!mission||finished)return;
  hinted=[];
  if(mission.kind==='trail'){
    const moves=legalTrailMoves(mission.piece,state.square,mission.obstacles,state.enemies);
    let suggestion=mission.route[mission.route.indexOf(state.square)+1];
    if(!moves.includes(suggestion)) suggestion=moves.find(s=>state.stars.includes(s)||state.enemies.includes(s)||s===mission.target)||moves[0];
    if(suggestion)hinted=[suggestion];
    coach(`Try the orange-outlined square! ${mission.tip}`,true);
  }else if(mission.kind==='puzzle'){
    const move=mission.answer||game.moves({verbose:true})[0];
    if(move)hinted=[move.from,move.to];
    coach(`Follow the orange outlines. ${mission.tip}`,true);
  }else{
    const move=game.moves({verbose:true})[0];if(move)hinted=[move.from,move.to];
    coach('Look for a safe move. The orange outlines show one legal option.',true);
  }
  renderPlay();
}
function downloadBackup(){
  const backup=new Blob([JSON.stringify({type:'HeroAcademyChessQuestAdventure',...data,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(backup),link=document.createElement('a');
  link.href=url;link.download='hero-academy-chessquest-progress.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importBackup(file){
  if(!file||file.size>1024*1024){alert('Choose a ChessQuest backup smaller than 1 MB.');return;}
  try{
    const parsed=JSON.parse(await file.text());
    if(parsed.type!=='HeroAcademyChessQuestAdventure'||!Array.isArray(parsed.profiles)||!parsed.profiles.length)throw new Error('Not a ChessQuest adventure backup');
    if(!confirm('Restore this backup? This will replace the Royal Road progress on this device. Your separate chess arena saves are not affected.'))return;
    localStorage.setItem(STORE,JSON.stringify(parsed));
    data=restoreData();selectedWorld=null;renderMap();chooseTab('progress');
  }catch{alert('This backup could not be read. Please use a Royal Road progress file.');}
  $('import-file').value='';
}

$('continue-button').addEventListener('click',()=>openMission(nextUnfinished()));
$('first-button').addEventListener('click',()=>openMission(1));
$('back-to-map').addEventListener('click',returnToMap);
$('close-level-picker').addEventListener('click',()=>{selectedWorld=null;$('level-picker').hidden=true;renderWorlds();});
for(const tab of ['worlds','games','progress'])$(`tab-${tab}`).addEventListener('click',()=>chooseTab(tab));
$('profile-select').addEventListener('change',event=>{data.current=event.target.value;writeData();renderMap();});
$('add-profile').addEventListener('click',()=>{$('profile-dialog').showModal();$('profile-name').focus();});
$('cancel-profile').addEventListener('click',()=>$('profile-dialog').close());
$('profile-form').addEventListener('submit',event=>{
  event.preventDefault();const name=$('profile-name').value.trim().slice(0,24);
  if(!name)return;
  if(data.profiles.length>=20){alert('You have reached the limit of 20 local heroes.');return;}
  const hero=newProfile(name);data.profiles.push(hero);data.current=hero.id;writeData();$('profile-dialog').close();$('profile-name').value='';renderMap();
});
$('quest-restart').addEventListener('click',()=>{
  if(!mission)return;
  stopComputer();const id=mission.id;profile().active=null;writeData();openMission(id);
});
$('quest-hint').addEventListener('click',showHint);
$('quest-undo').addEventListener('click',undoMove);
$('quest-listen').addEventListener('click',()=>speak($('coach-text').textContent));
$('quest-voice').addEventListener('change',event=>{data.speech=event.target.checked;writeData();if(data.speech)speak($('coach-text').textContent);else window.speechSynthesis?.cancel();});
$('next-mission').addEventListener('click',()=>mission?.id===100?returnToMap():openMission(mission.id+1));
$('replay-mission').addEventListener('click',()=>{if(mission){const id=mission.id;profile().active=null;openMission(id);}});
$('export-progress').addEventListener('click',downloadBackup);
$('import-progress').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',event=>{if(event.target.files?.[0])importBackup(event.target.files[0]);});
renderMap();
const launchId=safeId(new URLSearchParams(location.search).get('mission'));
if(launchId)openMission(launchId);
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

try { academy=await bootAcademy(chessAdapter({getData:()=>data,persist:()=>writeData(false),before:()=>{stopComputer();},refresh:()=>{mission=null;game=null;state=null;selectedWorld=null;$('overview-screen').hidden=false;$('play-screen').hidden=true;renderMap();}})); } catch { coach('Your local journey is ready. Connect through My Academy when online.'); }
