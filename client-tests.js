const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const {Rooms}=require('./multiplayer');
const {document}=parseHTML(fs.readFileSync('index.html','utf8'));
const sent=[],sockets=[],intervals=[],storage=new Map();
class Socket{constructor(){sockets.push(this);}send(raw){sent.push(JSON.parse(raw));}}
const modal=document.getElementById('modal');modal.showModal=function(){this.open=true;};modal.close=function(){this.open=false;};
const context=vm.createContext({document,window:{CityBackgrounds:{}},WebSocket:Socket,location:{protocol:'http:',host:'localhost:5173',origin:'http://localhost:5173',search:''},history:{replaceState(){}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},navigator:{clipboard:{writeText:async()=>{}}},Image:class{},Date,Math,URLSearchParams,setTimeout:()=>1,clearTimeout(){},setInterval:fn=>intervals.push(fn)});
vm.runInContext(fs.readFileSync('engine.js','utf8'),context);vm.runInContext(fs.readFileSync('app.js','utf8'),context);sockets[0].onopen();
document.getElementById('createRoom').onclick();assert.equal(sent.at(-1).type,'create');assert.equal(sent.at(-1).name,'牌友');
const rooms=new Rooms();const ws={readyState:1,send(){},close(){}};rooms.create(ws,'测试玩家');const room=[...rooms.rooms.values()][0];room.members=room.members.map((m,i)=>m||{name:'玩家'+i,ws:{readyState:1,send(){}},ready:true,bot:false});room.members.forEach((m,i)=>{m.ready=true;room.game.players[i].name=m.name;});
function state(i){sockets[0].onmessage({data:JSON.stringify(rooms.view(room,i))});}
try{
  const index=room.game.players.findIndex(p=>p.role.type==='choose');room.host=(index+1)%6;state(index);assert.match(document.querySelector('.seat-0').textContent,new RegExp(room.members[index].name+' · 你'));assert.equal(document.getElementById('startBtn').textContent,'等待房主开局');
  rooms.startHand(room);rooms.schedule(room);state(index);assert.match(document.getElementById('timerLabel').textContent,/30s/);assert.equal(document.getElementById('handCards').querySelectorAll('.card:not(.back)').length,2);assert.equal(document.getElementById('seats').querySelectorAll('.seat-cards .card:not(.back)').length,0);
  document.getElementById('skillBtn').onclick();assert.equal(sent.at(-1).type,'choose');room.plans[index]={previewCard:room.game.deck.shift(),discard:2};state(index);assert.equal(modal.open,true);assert.equal(document.querySelectorAll('[data-discard]').length,3);document.querySelector('[data-discard="0"]').onclick();assert.equal(sent.at(-1).type,'skill');assert.equal(sent.at(-1).discard,0);assert.equal(modal.open,false);
  room.plans=Array(6).fill(null);rooms.resolveSkills(room);room.game.actor=index;rooms.schedule(room);state(index);assert.match(document.getElementById('timerLabel').textContent,/30s/);document.getElementById('callBtn').onclick();assert.equal(sent.at(-1).type,'action');assert.equal(sent.at(-1).action,'call');assert.equal(sent.at(-1).actionKey,rooms.key(room));
  const spy=room.game.players.findIndex(p=>p.role.type==='spy');room.game.stage='skill';room.submitted=new Set();room.plans=Array(6).fill(null);state(spy);document.getElementById('skillBtn').onclick();document.querySelector('[data-target="1"]').onclick();assert.equal(sent.at(-1).target,(spy+1)%6);
  room.game.stage='finished';room.game.result=null;room.game.handNo=10;room.game.players[index].chips=2500;room.game.players[index].buyIn=3000;state(index);assert.match(document.getElementById('modalContent').textContent,/净收益/);assert.match(document.getElementById('modalContent').textContent,/-500/);assert.equal(document.getElementById('againBtn').disabled,true);
  console.log('✓ 网页 DOM：房间操作、玩家座位旋转、私牌隐藏、服务器 30 秒时钟、筛选交互、察言目标映射、净收益排名与房主权限');
}finally{rooms.close();}
