export const STORE='heroacademy.chessquest.adventure.v1';
export const freshHero=(name='Hero')=>({id:crypto.randomUUID(),name:String(name).slice(0,24),completed:{},active:null});
export function readFamily(){
  try { const d=JSON.parse(localStorage.getItem(STORE));if(d?.profiles?.length&&d.profiles.length<=20){
    d.profiles=d.profiles.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string').map(p=>({...p,name:p.name.slice(0,24),completed:Object.fromEntries(Object.entries(p.completed||{}).filter(([k,v])=>/^(?:[1-9]|[1-9][0-9]|100)$/.test(k)&&v===true))}));
    if(d.profiles.length){if(!d.profiles.some(p=>p.id===d.current))d.current=d.profiles[0].id;return d;}
  }}catch{}const p=freshHero();return {version:1,profiles:[p],current:p.id,speech:false};
}
export function chessAdapter({getData,persist,refresh,before=()=>{}}){
  const current=()=>getData().profiles.find(p=>p.id===getData().current);
  return {game:'chessquest',identity:()=>current().id,
    select(id){const d=getData();if(!d.profiles.some(p=>p.id===id))return false;before();d.current=id;persist();refresh();return true;},
    create(hero){const d=getData();if(d.profiles.length>=20)throw Error('All twenty local hero spaces are in use.');before();const p=freshHero(hero.name||'Hero');d.profiles.push(p);d.current=p.id;persist();refresh();return p.id;},
    snapshot:()=>({version:1,...structuredClone(current())}),
    restore(remote){if(!remote||typeof remote.name!=='string'||!remote.completed||Array.isArray(remote.completed))throw Error('Invalid ChessQuest journey');before();const d=getData(),p={...structuredClone(remote),id:current().id,name:remote.name.slice(0,24),completed:Object.fromEntries(Object.entries(remote.completed).filter(([k,v])=>/^(?:[1-9]|[1-9][0-9]|100)$/.test(k)&&v===true))};d.profiles[d.profiles.findIndex(v=>v.id===p.id)]=p;persist();refresh();},
    milestones:()=>Object.keys(current().completed).filter(k=>current().completed[k]===true).map(k=>Number(k)-1),
  };
}
