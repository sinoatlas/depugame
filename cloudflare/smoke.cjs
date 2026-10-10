const assert=require('node:assert/strict');
const {WebSocket}=require('ws');
const base=process.env.GAME_URL||'http://127.0.0.1:8787';
function peer(){return new Promise((resolve,reject)=>{const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws',{origin:base});const p={ws,state:null,joined:null,waiters:[]};ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='state')p.state=m;if(m.type==='joined')p.joined=m;for(const w of [...p.waiters])if(w.test(m)){clearTimeout(w.timer);p.waiters.splice(p.waiters.indexOf(w),1);w.resolve(m);}});p.next=(test,ms=8000)=>new Promise((resolve,reject)=>{const w={test,resolve,timer:setTimeout(()=>reject(new Error('WebSocket response timeout')),ms)};p.waiters.push(w);});p.request=(type,data={},test=m=>m.type==='state')=>{const next=p.next(test);ws.send(JSON.stringify({type,actionKey:p.state?.actionKey,...data}));return next;};ws.once('open',()=>resolve(p));ws.once('error',reject);});}
async function main(){const peers=[];try{
 assert.equal((await fetch(base+'/healthz')).status,200);assert.equal((await fetch(base+'/server.js')).status,404);assert.equal((await fetch(base+'/cloudflare/worker.mjs')).status,404);assert.equal((await fetch(base+'/assets/backgrounds.js')).status,200);
 const host=await peer();peers.push(host);await host.request('create',{name:'部署验证'});const code=host.joined.code;
 for(let i=1;i<6;i++){const p=await peer();peers.push(p);await p.request('join',{code,name:'验证玩家'+i});}
 for(const p of peers)await p.request('ready',{ready:true},m=>m.type==='state'&&m.players[m.you].ready);await host.request('start',{},m=>m.type==='state'&&m.stage==='skill');
 const current=host.state;assert.equal(current.stage,'skill');assert(current.deadline-current.serverNow>=29000);
 for(let i=0;i<6;i++){const p=peers[i];if(p.state.actionKey!==current.actionKey)await p.next(m=>m.type==='state'&&m.actionKey===current.actionKey);assert.equal(p.state.board.length,0);p.state.players.forEach((q,j)=>{if(i!==j)assert.deepEqual(q.hand,[null,null]);});await p.request('pass',{},m=>m.type==='state'&&(m.skillSubmitted||m.stage!=='skill'));}
 let latest=peers[5].state,moves=0;
 while(latest.stage!=='result'){assert(++moves<40);const p=peers[latest.actor];if(p.state.actionKey!==latest.actionKey)await p.next(m=>m.type==='state'&&m.actionKey===latest.actionKey);const key=latest.actionKey;latest=await p.request('action',{action:'call'},m=>m.type==='state'&&m.actionKey!==key);}
 assert.equal(latest.players.reduce((s,p)=>s+p.chips,0),6000);
 const token=host.joined.token;host.ws.close();await new Promise(r=>host.ws.once('close',r));const resumed=await peer();peers.push(resumed);await resumed.request('join',{code,token,name:'部署验证'});assert.equal(resumed.joined.index,0);assert.equal(resumed.state.stage,'result');
 console.log('PASS: HTTP assets/security, six WebSockets, private cards, 30s deadline, three betting rounds, settlement and reconnect');
 if(process.env.TEST_ALARM==='1'){const timer=await peer();peers.push(timer);await timer.request('create',{name:'计时验证'});await timer.request('ready',{ready:true});await timer.request('start',{fillBots:true},m=>m.type==='state'&&m.stage==='skill');assert.equal(timer.state.stage,'skill');await timer.next(m=>m.type==='state'&&m.stage!=='skill',40000);console.log('PASS: Durable Object alarm automatically advances skill deadline');}
 }finally{for(const p of peers)p.ws.terminate();}}
 main().catch(e=>{console.error(e);process.exitCode=1;});
