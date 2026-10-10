const assert=require('node:assert/strict');
const {WebSocket}=require('ws');
const {createApp}=require('./server');
function peer(url){const ws=new WebSocket(url),p={ws,state:null,joined:null,messages:[],waiters:[]};ws.on('message',raw=>{const msg=JSON.parse(raw);p.messages.push(msg);if(msg.type==='state')p.state=msg;if(msg.type==='joined')p.joined=msg;for(const w of [...p.waiters])if(w.condition(msg)){clearTimeout(w.timer);p.waiters.splice(p.waiters.indexOf(w),1);w.resolve(msg);}});p.next=condition=>new Promise((resolve,reject)=>{const w={condition,resolve,timer:setTimeout(()=>{p.waiters.splice(p.waiters.indexOf(w),1);reject(new Error('等待 WebSocket 响应超时'));},4000)};p.waiters.push(w);});p.request=async(type,data={},condition=m=>m.type==='state')=>{const response=p.next(condition);ws.send(JSON.stringify({type,actionKey:p.state?.actionKey,...data}));return response;};return new Promise((resolve,reject)=>{ws.once('open',()=>resolve(p));ws.once('error',reject);});}
async function main(){const app=createApp({skillMs:30000,actionMs:30000,botMs:5});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port,url=`ws://127.0.0.1:${port}/ws`,base=`http://127.0.0.1:${port}`,peers=[];
  try{
    assert.equal((await fetch(base+'/healthz')).status,200);assert.equal((await fetch(base+'/server.js')).status,404);assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/node_modules/ws/package.json')).status,404);
    const host=await peer(url);peers.push(host);await host.request('create',{name:'房主'});const code=host.joined.code;
    for(let i=1;i<6;i++){const p=await peer(url);peers.push(p);await p.request('join',{name:'玩家'+i,code});}
    const intruder=await peer(url);peers.push(intruder);let error=await intruder.request('join',{name:'多余玩家',code},m=>m.type==='error');assert.match(error.message,/已满/);
    error=await peers[1].request('start',{},m=>m.type==='error');assert.match(error.message,/房主/);
    error=await host.request('start',{},m=>m.type==='error');assert.match(error.message,/准备/);
    for(const p of peers.slice(0,6))await p.request('ready',{ready:true});await host.request('start');
    const room=app.rooms.rooms.get(code);assert.equal(room.game.stage,'skill');assert(room.deadline-Date.now()>29000);
    for(let i=0;i<6;i++){const v=app.rooms.view(room,i);assert.equal(v.board.length,0);assert(!('deck' in v));assert.equal(v.players[i].hand.length,2);v.players.forEach((p,j)=>{if(i!==j)assert.deepEqual(p.hand,[null,null]);});assert.deepEqual(v.intel,[]);}
    const chooser=room.game.players.findIndex(p=>p.role.type==='choose'),spy=room.game.players.findIndex(p=>p.role.type==='spy'),swap=room.game.players.findIndex(p=>p.role.type==='swap');
    for(const p of peers.slice(0,6))if(p.state.actionKey!==app.rooms.key(room))await p.next(m=>m.type==='state'&&m.actionKey===app.rooms.key(room));
    let preview=await peers[chooser].request('choose',{},m=>m.type==='state'&&m.chooseCards?.length===3);assert.equal(preview.chooseCards.length,3);const third=preview.chooseCards[2].id;assert.equal(app.rooms.view(room,(chooser+1)%6).chooseCards,null);
    await peers[chooser].request('choose');assert.equal(peers[chooser].state.chooseCards[2].id,third);
    error=await peers[chooser].request('pass',{},m=>m.type==='error');assert.match(error.message,/必须使用筛选/);
    for(let i=0;i<6;i++){const t=room.game.players[i].role.type;await peers[i].request('skill',{index:0,discard:0,target:t==='spy'?swap:undefined},m=>m.type==='state'&&(m.skillSubmitted||m.stage==='preflop'));}
    assert.equal(room.game.stage,'preflop');assert(room.deadline-Date.now()>29000);assert.equal(room.game.players[chooser].hand[1].id,third);assert(room.game.players[swap].hand.some(c=>c.id===app.rooms.view(room,spy).intel[0].card.id));
    for(let i=0;i<6;i++){const v=app.rooms.view(room,i);assert.equal(v.players[i].uses,2);assert.equal(v.intel.length,['flop','river','spy'].includes(room.game.players[i].role.type)?1:0);assert(!v.players.some(p=>'intelList'in p||'intel'in p));}
    for(const p of peers.slice(0,6))if(p.state.actionKey!==app.rooms.key(room))await p.next(m=>m.type==='state'&&m.actionKey===app.rooms.key(room));
    const actor=room.game.actor,other=(actor+1)%6,before=room.game.players[other].chips;error=await peers[other].request('action',{action:'raise',target:999999},m=>m.type==='error');assert.match(error.message,/轮到/);assert.equal(room.game.players[other].chips,before);
    const key=peers[actor].state.actionKey;await peers[actor].request('action',{action:'call'});error=await peers[actor].request('action',{actionKey:key,action:'call'},m=>m.type==='error');assert.match(error.message,/轮次/);
    let moves=0;while(room.game.stage!=='result'){assert(++moves<30);const i=room.game.actor;if(peers[i].state.actionKey!==app.rooms.key(room))await peers[i].next(m=>m.type==='state'&&m.actionKey===app.rooms.key(room));const priorKey=peers[i].state.actionKey;await peers[i].request('action',{action:'call'},m=>m.type==='state'&&m.actionKey!==priorKey);}
    assert.equal(room.game.players.reduce((s,p)=>s+p.chips,0),6000);for(let i=0;i<6;i++){const v=app.rooms.view(room,i);assert.equal(v.board.length,5);assert(v.players.every(p=>p.hand.every(Boolean)));assert(v.result.ranks.every(r=>r===null||Object.keys(r).join(',')==='name'));}
    error=await peers[1].request('next',{},m=>m.type==='error');assert.match(error.message,/房主/);
    const token=peers[2].joined.token;peers[2].ws.close();await new Promise(r=>peers[2].ws.once('close',r));const resume=await peer(url);peers.push(resume);await resume.request('join',{code,token,name:'不应改名'});assert.equal(resume.joined.index,2);assert.equal(resume.state.players[2].name,'玩家2');
    room.game.players[3].chips=0;const oldBuyIn=room.game.players[3].buyIn;await host.request('next',{},m=>m.type==='state'&&m.handNo===2);assert.equal(room.game.handNo,2);assert.equal(room.game.players[3].buyIn,oldBuyIn+1000);assert.equal(room.game.players[3].hand.length,2);assert.equal(room.game.players[3].uses,2);
    console.log('✓ 六个真实 WebSocket 客户端：建房、加入、准备、六技能、三轮下注、结算、重连、补筹码、权限与私牌隔离');
  }finally{for(const p of peers)p.ws.terminate();await app.close();}
  const timed=createApp({skillMs:40,actionMs:40,botMs:5});await new Promise(r=>timed.server.listen(0,'127.0.0.1',r));let p;
  try{p=await peer(`ws://127.0.0.1:${timed.server.address().port}/ws`);await p.request('create',{name:'超时测试'});await p.request('ready',{ready:true});await p.request('start',{fillBots:true});await p.next(m=>m.type==='state'&&m.stage==='result');assert.equal(p.state.result!==null,true);console.log('✓ 服务端倒计时自动推进，离线或未操作玩家不阻塞比赛');}finally{p?.ws.terminate();await timed.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
