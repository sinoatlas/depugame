const crypto=require('node:crypto');
const Poker=require('./engine');
const betting=new Set(['preflop','flop','river']);
const random=()=>crypto.randomInt(0,0x100000000)/0x100000000;
function cleanName(value){if(typeof value!=='string')throw new Error('请输入昵称');const name=value.replace(/[\x00-\x1f<>"'&`]/g,'').trim().slice(0,12);if(!name)throw new Error('请输入昵称');return name;}
class Rooms{
  constructor(options={}){this.rooms=new Map();this.skillMs=options.skillMs??30000;this.actionMs=options.actionMs??30000;this.botMs=options.botMs??900;this.roomTtl=options.roomTtl??2*60*60*1000;this.externalTimers=options.externalTimers??false;if(!this.externalTimers){this.cleanup=setInterval(()=>this.sweep(),60000);this.cleanup.unref();}}
  send(ws,msg){if(ws?.readyState===1)ws.send(JSON.stringify(msg));}
  key(room){const g=room.game;return `${room.match}:${g.handNo}:${g.stage}:${g.actor}:${g.logs.length}`;}
  requireHost(room,index){if(index!==room.host)throw new Error('只有房主可以执行此操作');}
  create(ws,name){if(this.rooms.size>=100)throw new Error('房间已满，请稍后再试');let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(this.rooms.has(code));const room={code,host:0,members:Array(6).fill(null),game:new Poker.Game(random),match:1,city:crypto.randomInt(0,5),plans:Array(6).fill(null),submitted:new Set(),deadline:0,timer:null,timerKey:'',lastActive:Date.now()};this.rooms.set(code,room);this.enter(room,ws,name,0);}
  join(ws,msg){const room=this.rooms.get(String(msg.code||'').toUpperCase());if(!room)throw new Error('房间不存在或已关闭，请重新创建');let index=-1;
    if(typeof msg.token==='string')index=room.members.findIndex(m=>m&&!m.bot&&m.token===msg.token);
    if(index<0){if(room.game.stage!=='lobby')throw new Error('这场比赛已经开始，只能原玩家重连');index=room.members.findIndex(m=>!m);if(index<0)throw new Error('房间已满');}
    this.enter(room,ws,msg.name,index);
  }
  enter(room,ws,name,index){const old=room.members[index];if(old?.ws&&old.ws!==ws)old.ws.close(4001,'Seat resumed on another connection');const member=old||{name:cleanName(name),token:crypto.randomBytes(24).toString('hex'),ready:false,bot:false};member.ws=ws;member.offlineAt=null;room.members[index]=member;room.game.players[index].name=member.name;ws.session={code:room.code,index};this.send(ws,{type:'joined',code:room.code,token:member.token,index});room.lastActive=Date.now();this.broadcast(room);}
  disconnect(ws){const s=ws.session;if(!s)return;const r=this.rooms.get(s.code),m=r?.members[s.index];if(m?.ws!==ws)return;m.ws=null;m.offlineAt=Date.now();if(r.host===s.index){const next=r.members.findIndex(member=>member&&!member.bot&&member.ws?.readyState===1);if(next>=0)r.host=next;}this.broadcast(r);}
  message(ws,msg){if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof msg.type!=='string')throw new Error('无效请求');
    if(msg.type==='create'||msg.type==='join'){if(ws.session)throw new Error('已经在房间中，请刷新后切换房间');return msg.type==='create'?this.create(ws,msg.name):this.join(ws,msg);}
    const s=ws.session,room=s&&this.rooms.get(s.code);if(!room||room.members[s.index]?.ws!==ws)throw new Error('请先进入房间');room.lastActive=Date.now();const g=room.game,i=s.index,m=room.members[i];
    if(msg.type==='ready'){if(g.stage!=='lobby')throw new Error('比赛已开始');m.ready=msg.ready===true;}
    else if(msg.type==='start'){this.requireHost(room,i);if(g.stage!=='lobby')throw new Error('比赛已经开始');if(!room.members.filter(m=>m&&!m.bot).every(m=>m.ready&&m.ws?.readyState===1))throw new Error('请等待所有真人玩家连接并准备');
      if(room.members.some(m=>!m)&&msg.fillBots!==true)throw new Error('需要六位玩家，或选择电脑补位');room.members=room.members.map((m,j)=>m||{name:'电脑 '+(j+1),ready:true,bot:true});room.members.forEach((m,j)=>g.players[j].name=m.name);this.startHand(room);
    }
    else if(msg.type==='skill'||msg.type==='choose'||msg.type==='pass'){
      if(g.stage!=='skill'||msg.actionKey!==this.key(room))throw new Error('技能阶段已变化，请按最新画面操作');const p=g.players[i];if(room.submitted.has(i))throw new Error('技能选择已确认');
      if(msg.type==='pass'){if(room.plans[i])throw new Error('已查看第三张牌，必须使用筛选');room.submitted.add(i);}
      else if(msg.type==='choose'){if(p.role.type!=='choose'||p.uses<=0||p.folded)throw new Error('当前不能使用筛选');if(!room.plans[i])room.plans[i]={discard:2,previewCard:g.deck.shift()};}
      else {if(p.uses<=0||p.folded)throw new Error('没有技能机会');let plan={};const t=p.role.type;
        if(t==='swap'){if(!Number.isInteger(msg.index)||msg.index<0||msg.index>1)throw new Error('请选择要替换的手牌');plan.index=msg.index;}
        if(t==='spy'){if(!Number.isInteger(msg.target)||msg.target<0||msg.target>5||msg.target===i||g.players[msg.target].folded)throw new Error('请选择其他玩家');plan.target=msg.target;}
        if(t==='choose'){if(!room.plans[i]?.previewCard)throw new Error('请先发动筛选');if(!Number.isInteger(msg.discard)||msg.discard<0||msg.discard>2)throw new Error('请选择要弃掉的牌');plan={...room.plans[i],discard:msg.discard};}
        room.plans[i]=plan;room.submitted.add(i);
      }
      if(room.members.every((m,j)=>m.bot||room.submitted.has(j)))this.resolveSkills(room);
    }
    else if(msg.type==='action'){if(msg.actionKey!==this.key(room))throw new Error('轮次已变化，请按最新画面操作');if(!['fold','call','raise'].includes(msg.action))throw new Error('未知动作');if(msg.action==='raise'&&!Number.isSafeInteger(msg.target))throw new Error('请输入整数筹码');g.action(i,msg.action,msg.target);}
    else if(msg.type==='next'){this.requireHost(room,i);if(g.stage!=='result')throw new Error('请等待本局结算');if(g.handNo>=Poker.rules.hands)g.stage='finished';else this.startHand(room);}
    else if(msg.type==='reset'){this.requireHost(room,i);if(g.stage!=='finished')throw new Error('请等待整场结束后重新开场');room.game=new Poker.Game(random);room.match++;room.city=crypto.randomInt(0,5);room.members.forEach((m,j)=>{if(m.bot)room.members[j]=null;else{m.ready=false;room.game.players[j].name=m.name;}});room.deadline=0;}
    else if(msg.type==='city'){this.requireHost(room,i);if(!Number.isInteger(msg.city)||msg.city<0||msg.city>4)throw new Error('无效城市');room.city=msg.city;}
    else throw new Error('未知请求');
    this.schedule(room);this.broadcast(room);
  }
  startHand(room){room.game.startHand();room.plans=Array(6).fill(null);room.submitted=new Set();}
  resolveSkills(room){room.members.forEach((m,i)=>{const p=room.game.players[i];if(m.bot&&!room.plans[i]&&p.uses&&random()<.45)room.plans[i]={index:p.hand[0].r<p.hand[1].r?0:1,target:room.game.next(i,p=>!p.folded),discard:2};});room.game.resolveSkills(room.plans);}
  schedule(room){const key=this.key(room);if(key===room.timerKey)return;clearTimeout(room.timer);room.timerKey=key;const g=room.game;let delay=0;
    if(g.stage==='skill')delay=this.skillMs;else if(betting.has(g.stage))delay=room.members[g.actor]?.bot?this.botMs:this.actionMs;
    room.deadline=delay?Date.now()+delay:0;if(!delay||this.externalTimers)return;
    room.timer=setTimeout(()=>this.advance(room),delay);room.timer.unref();
  }
  advance(room){if(!this.rooms.has(room.code))return;const g=room.game;if(g.stage==='skill')this.resolveSkills(room);else if(betting.has(g.stage)){if(room.members[g.actor]?.bot)g.botAction();else g.action(g.actor,g.toCall(g.actor)?'fold':'call');}this.schedule(room);this.broadcast(room);}
  view(room,index){const g=room.game,ended=['result','finished'].includes(g.stage);return {type:'state',code:room.code,match:room.match,you:index,host:room.host,city:room.city,actionKey:this.key(room),deadline:room.deadline,serverNow:Date.now(),stage:g.stage,handNo:g.handNo,dealer:g.dealer,sb:g.sb??-1,bb:g.bb??-1,actor:g.stage==='skill'?-1:g.actor,smallBlind:g.smallBlind||10,bigBlind:g.bigBlind||20,currentBet:g.currentBet||0,minRaise:g.minRaise||20,visible:g.visible||0,reveal:g.reveal||false,board:g.board?.slice(0,g.visible)||[],logs:g.logs,skillSubmitted:room.submitted.has(index),skillPlan:!!room.plans[index],chooseCards:room.plans[index]?.previewCard&&!room.submitted.has(index)?g.players[index].hand.concat(room.plans[index].previewCard):null,intel:g.players[index].intelList||[],canRaise:betting.has(g.stage)&&g.actor===index?g.canRaise(index):false,
      players:g.players.map((p,i)=>{const member=room.members[i],show=i===index||(ended&&g.reveal&&!p.folded);return {name:member?.name||'空位',role:p.role,chips:p.chips,buyIn:p.buyIn,rebuys:p.rebuys,uses:p.uses,folded:p.folded,bet:p.bet,total:p.total,used:p.used,hand:show?p.hand:p.hand.map(()=>null),occupied:!!member,bot:member?.bot||false,online:member?.bot||member?.ws?.readyState===1,ready:member?.ready||false};}),
      result:g.result?{awards:g.result.awards,pots:g.result.pots,ranks:g.result.ranks.map(rank=>rank?{name:rank.name}:null)}:null};}
  broadcast(room){room.members.forEach((m,i)=>{if(m&&!m.bot)this.send(m.ws,this.view(room,i));});}
  sweep(){const now=Date.now();for(const [code,r]of this.rooms){if(r.members.some(m=>m&&!m.bot&&m.ws?.readyState===1))continue;if(now-r.lastActive>this.roomTtl){clearTimeout(r.timer);this.rooms.delete(code);}}}
  close(){clearInterval(this.cleanup);for(const r of this.rooms.values())clearTimeout(r.timer);}
}
module.exports={Rooms};
