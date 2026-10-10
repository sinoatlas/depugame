const $=id=>document.getElementById(id);
const cities=[
  {name:'南京',scene:'金陵夜宴',word:'金陵',line:'灯火入局，妙计先行',a:'#433c2d',b:'#193b33',felt:'#20483e',color:'#d6b377',glow:'rgba(220,171,96,.17)',image:'assets/nanjing.webp'},
  {name:'连云港',scene:'海风牌局',word:'云港',line:'潮起潮落，好牌靠岸',a:'#23434e',b:'#193c40',felt:'#215354',color:'#8bd3d3',glow:'rgba(127,219,222,.16)',image:'assets/lianyungang.webp'},
  {name:'武汉',scene:'江城晚风',word:'江城',line:'两江灯火，一桌风云',a:'#4a3a3f',b:'#31352f',felt:'#3a4c3e',color:'#e8a978',glow:'rgba(241,156,115,.16)',image:'assets/wuhan.webp'},
  {name:'盐城',scene:'鹤影清风',word:'鹤乡',line:'芦苇轻摇，静待好牌',a:'#34443d',b:'#26392b',felt:'#36533d',color:'#b9d19b',glow:'rgba(178,219,141,.16)',image:'assets/yancheng.webp'},
  {name:'天津',scene:'津门雅集',word:'津门',line:'海河夜色，谈笑出奇',a:'#473944',b:'#263741',felt:'#31494b',color:'#dcb0ca',glow:'rgba(224,151,193,.17)',image:'assets/tianjin.webp'}
];
const flavors={swap:'好牌未必天生，妙计可以改命。',flop:'风向已知，下一步心里有数。',reset:'放下旧牌，另寻一线生机。',spy:'听其言，更要看其牌。',river:'江流未尽，先看最后一程。',choose:'多一个选项，多一种好配方。'};
function emptyView(){return {stage:'lobby',handNo:0,dealer:0,actor:-1,logs:[],players:Poker.roles.map(role=>({role,name:'空位',chips:1000,buyIn:1000,rebuys:0,uses:3,hand:[],occupied:false,folded:false,total:0,bet:0})),toCall:()=>0,canRaise:()=>false,net:i=>0};}
let game=emptyView(),cityIndex=0,seconds=0,deadline=0,resultKey='',audioEnabled=false,audioContext=null,toastTimer;
let socket=null,session=null,connected=false,serverOffset=0,retry=0,reconnectTimer=null,awaitingChoose=false;
try{session=JSON.parse(sessionStorage.getItem('cityJokerSession')||'null');}catch{}
function send(type,extra={}){if(!connected){toast('连接尚未恢复，请稍候');return;}socket.send(JSON.stringify({type,actionKey:game.actionKey,...extra}));}
function applyState(state){const offset=state.you,rotate=i=>i<0?-1:(i-offset+6)%6;game={...state,players:state.players.map((_,j)=>state.players[(j+offset)%6]),actor:rotate(state.actor),dealer:rotate(state.dealer),sb:rotate(state.sb),bb:rotate(state.bb),skillPlan:state.skillPlan};game.toCall=i=>Math.max(0,game.currentBet-game.players[i].bet);game.canRaise=i=>i===0&&state.canRaise;game.net=i=>game.players[i].chips-game.players[i].buyIn;
  if(state.stage!=='skill'&&$('modal').open&&$('modalContent').textContent.includes('SKILL'))closeModal();
  if(state.result)game.result={...state.result,awards:state.result.awards.map((_,j)=>state.result.awards[(j+offset)%6]),ranks:state.result.ranks.length?state.result.ranks.map((_,j)=>state.result.ranks[(j+offset)%6]):[]};
  serverOffset=state.serverNow-Date.now();deadline=state.deadline;setCity(state.city);render();
  if(awaitingChoose&&state.chooseCards){awaitingChoose=false;showChoose(state.chooseCards);}
}
function connect(){socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');$('connectionStatus').textContent='连接服务中…';socket.onopen=()=>{connected=true;retry=0;$('connectionStatus').textContent='已连接';if(session)send('join',{...session,name:$('nickname').value});};socket.onmessage=e=>{let msg;try{msg=JSON.parse(e.data);}catch{return;}if(msg.type==='joined'){session={code:msg.code,token:msg.token};sessionStorage.setItem('cityJokerSession',JSON.stringify(session));$('roomCode').value=msg.code;history.replaceState(null,'','?room='+msg.code);}else if(msg.type==='state')applyState(msg);else if(msg.type==='error'){toast(msg.message);if(msg.message.includes('房间不存在')){session=null;sessionStorage.removeItem('cityJokerSession');game=emptyView();render();}}};socket.onclose=e=>{connected=false;$('connectionStatus').textContent=e.code===4001?'座位已在其他窗口恢复':'连接断开，正在重连…';document.querySelectorAll('#actions button,#skillBtn,#startBtn,#readyBtn').forEach(b=>b.disabled=true);if(e.code!==4001){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,Math.min(15000,1000*2**retry++));}};socket.onerror=()=>{};}
function createRoom(){send('create',{name:$('nickname').value});}
function joinRoom(){send('join',{name:$('nickname').value,code:$('roomCode').value.trim().toUpperCase()});}
function showChoose(options){modal('<p class="eyebrow">SKILL · 筛选</p><h2 class="modal-title">三张牌，留下最合适的两张。</h2><p class="modal-copy">筛选已发动。点选要弃掉的一张；超时默认弃掉第三张。</p><div class="choice-cards">'+options.map((c,i)=>`<button data-discard="${i}">${card(c)}<small>弃掉这张</small></button>`).join('')+'</div>');document.querySelectorAll('[data-discard]').forEach(b=>b.onclick=()=>submitSkill({discard:+b.dataset.discard}));}

function card(c,back=false,extra=''){
  if(back||!c)return `<span class="card back ${extra}" aria-label="未公开的牌">✦</span>`;
  const joker=c.r===0,r=joker?'★':({11:'J',12:'Q',13:'K',14:'A'}[c.r]||c.r),s=joker?'JOKER':Poker.suits[c.s];
  return `<span class="card ${c.s===1||c.s===3?'red':''} ${joker?'joker':''} ${extra}" aria-label="${joker?'万能小丑牌':s+r}"><span>${r}</span><span class="suit">${s}</span><span class="center-suit">${joker?'✦':s}</span></span>`;
}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2700);}
function sound(){if(!audioEnabled)return;try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=480;g.gain.setValueAtTime(.035,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.13);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.14);}catch{}}
function setCity(i){cityIndex=i;const c=cities[i],style=document.documentElement.style;style.setProperty('--sceneA',c.a);style.setProperty('--sceneB',c.b);style.setProperty('--felt',c.felt);style.setProperty('--city',c.color);style.setProperty('--cityGlow',c.glow);$('sceneName').textContent=c.name+' · '+c.scene;$('sceneSubtitle').textContent=c.line;$('sceneWord').textContent=c.word;
  $('cityButtons').innerHTML=cities.map((c,j)=>`<button class="city-pill ${j===i?'selected':''}" data-city="${j}">${c.name}</button>`).join('');
  document.querySelectorAll('[data-city]').forEach(b=>b.onclick=()=>send('city',{city:+b.dataset.city}));
  // Generated regional art can be dropped into assets later; missing assets never render broken images.
  document.querySelector('.arena').style.backgroundImage='';const art=window.CityBackgrounds?.[c.name];if(!art)return;
  const img=new Image();img.onload=()=>{if(cityIndex===i)document.querySelector('.arena').style.backgroundImage=`linear-gradient(#142b2380,#102b23a8),url('${art}')`;};img.onerror=()=>{};img.src=art;
}
function modal(html){$('modalContent').innerHTML=html;if(!$('modal').open)$('modal').showModal();}
function closeModal(){$('modal').close();}
function render(){
  const p=game.players[0],playing=game.stage!=='lobby',pot=game.players.reduce((n,p)=>n+p.total,0),ended=['result','finished'].includes(game.stage);
  $('lobbyOverlay').style.display=playing?'none':'flex';$('potValue').textContent=(ended?0:pot).toLocaleString();
  $('board').innerHTML=Array.from({length:5},(_,i)=>card(game.board?.[i],i>=(game.visible||0))).join('');
  $('seats').innerHTML=game.players.map((q,i)=>{
    const badge=i===game.dealer?'D':i===game.sb?'SB':i===game.bb?'BB':'';
    const shown=game.reveal&&!q.folded&&ended;
    let state=q.folded?(q.hand.length?'已弃牌':'观战中'):q.chips===0&&playing&&!ended?'已全下':q.used?'✧ 本局已用技能':q.role.skill;
    if(game.stage==='lobby')state=!q.occupied?'等待入座':q.ready?'已准备':'未准备';else if(!q.bot&&!q.online)state='离线 · 超时自动行动';
    if(ended&&q.chips===0)state=game.handNo<Poker.rules.hands?'下局补充 1,000 筹码':'本场结束';
    return `<div class="seat seat-${i} ${game.actor===i&&playing&&!ended?'active':''} ${q.folded?'folded':''}" style="--role-color:${q.role.color}"><div class="seat-cards">${playing&&q.hand.length?q.hand.map(c=>card(c,!shown)).join(''):card(null,true)+card(null,true)}</div><div class="avatar">${q.role.icon}${badge&&playing?`<span class="seat-badge">${badge}</span>`:''}</div><div class="seat-info"><strong>${q.occupied?q.name:q.role.city}${i===0&&q.occupied?' · 你':''}</strong><span>${q.chips.toLocaleString()}</span></div><span class="seat-role">${q.occupied?q.role.city+' · ':''}${state}</span>${q.bet>0&&playing&&!ended?`<span class="seat-bet">● ${q.bet}</span>`:''}</div>`;
  }).join('');
  $('handCounter').textContent='第 '+game.handNo+' / 10 局';$('blindLabel').textContent='小盲 / 大盲 · '+(game.smallBlind||10)+' / '+(game.bigBlind||20);$('dealerLabel').textContent=playing?'庄家 · '+game.players[game.dealer].role.city:'庄家轮换';
  const stageNames={lobby:'等待开场 · 六位角色已入座',skill:'技能阶段 · 同时提交，统一结算',preflop:'第一轮 · 翻牌前',flop:'第二轮 · 翻牌',river:'第三轮 · 最后两张公共牌',result:game.reveal?'本局结束 · 摊牌结算':'本局结束 · 其余玩家弃牌',finished:'十局落幕 · 查看最终排名'};
  $('stageText').textContent=stageNames[game.stage];$('roleEmblem').textContent=p.role.icon;$('roleEmblem').style.setProperty('--role-color',p.role.color);$('roleCity').textContent=p.role.city;$('roleCity').style.setProperty('--role-color',p.role.color);$('roleName').textContent=p.role.name;$('roleFlavor').textContent=flavors[p.role.type];$('skillName').textContent=p.role.skill;$('skillDescription').textContent=p.role.description;$('skillUses').textContent='● '.repeat(p.uses)+'○ '.repeat(3-p.uses);
  $('skillBtn').disabled=game.stage!=='skill'||p.uses===0||p.folded||game.skillSubmitted||!!game.skillPlan;
  $('skillBtn').textContent=game.stage==='skill'&&game.skillSubmitted?'✓ 已确认，等待其他玩家':game.stage==='skill'&&game.skillPlan?'筛选已发动，请完成选择':p.uses===0?'本场次数已用完':game.stage==='skill'?'发动技能 · '+p.role.skill:game.stage==='lobby'?'等待发牌':p.used?'✓ 本局技能已发动':'本局技能窗口已结束';
  $('skillHint').textContent=game.stage==='skill'&&game.skillSubmitted?'所有人确认或倒计时结束后统一结算':'每场 3 次 · 仅在下注前使用';
  $('handCards').innerHTML=p.hand.length?p.hand.map(c=>card(c)).join(''):card(null,true)+card(null,true);
  $('handRank').textContent=p.folded&&p.hand.length?'你已弃牌':game.visible>=3&&p.hand.length?Poker.evaluate(p.hand.concat(game.board.slice(0,game.visible))).name:p.hand.length?(p.hand.some(c=>c.r===0)?'万能小丑在手':p.hand[0].r===p.hand[1].r?'口袋对子':'等待公共牌'):'等待发牌';
  $('intelBox').hidden=!game.intel?.length;$('intelBox').innerHTML=game.intel?.map(v=>card(v.card)+`<span>仅你可见<br>${v.label}</span>`).join('')||'';
  $('logs').innerHTML=game.logs.length?game.logs.map(t=>`<p>${t}</p>`).join(''):'<p class="log-empty">城市灯火亮起，等你入座。</p>';$('logs').scrollTop=$('logs').scrollHeight;
  const net=p.chips-p.buyIn+(ended||game.stage==='lobby'?0:p.total);
  $('sessionScore').textContent='本场净收益 '+(net>=0?'+':'')+net+' · 已补充 '+p.rebuys+' 次';
  renderRoom();renderActions();syncClock();
  if(game.stage==='result'&&resultKey!==game.match+'-'+game.handNo){resultKey=game.match+'-'+game.handNo;setTimeout(()=>{if(game.stage==='result'&&!$('modal').open)showResult();},500);}
}
function renderActions(){
  const p=game.players[0],myTurn=game.actor===0&&['preflop','flop','river'].includes(game.stage),call=game.toCall?game.toCall(0):0;
  $('callHint').textContent=myTurn&&call?'需跟注 '+Math.min(call,p.chips):'';
  if(game.stage==='skill'){
    $('actionHint').textContent=game.skillSubmitted?'选择已确认，等待其他玩家。':game.skillPlan?'请完成筛选，超时默认弃掉第三张。':'选择发动技能，或确认本局保留技能。';
    $('actions').innerHTML='<button class="secondary-btn" id="skipSkill">'+(game.skillSubmitted?'等待其他玩家':game.skillPlan?'继续选择手牌':'确认保留技能')+' →</button>'; $('skipSkill').disabled=game.skillSubmitted;$('skipSkill').onclick=()=>resolveSkills();return;
  }
  if(game.stage==='result'||game.stage==='finished'){
    $('actionHint').textContent=game.handNo>=Poker.rules.hands?'本场结束，按扣除补充筹码后的净收益排名。':p.chips===0?'你已输光，下一局自动补充 1,000 筹码继续玩。':'本局结算完成，输光的玩家下局补充筹码重新入座。';
    $('actions').innerHTML='<button class="secondary-btn" id="viewResult">查看结算</button><button class="primary-btn" id="nextBtn">'+(game.you!==game.host?'等待房主继续':game.handNo>=Poker.rules.hands?'查看最终排名':'下一局 →')+'</button>';
    $('viewResult').onclick=()=>showResult();$('nextBtn').disabled=game.you!==game.host;$('nextBtn').onclick=()=>nextHand();return;
  }
  if(!myTurn){$('actionHint').textContent=game.stage==='lobby'?'坐下来，让这座城市发牌。':p.folded?'你已弃牌，正在观看这一局。':p.chips===0?'你已全下，等待牌局结算。':'等待 '+game.players[game.actor]?.role.city+' 行动…';$('actions').innerHTML='<button class="secondary-btn" disabled>弃牌</button><button class="secondary-btn" disabled>过牌 / 跟注</button><button class="primary-btn" disabled>加注</button>';return;}
  $('actionHint').textContent='轮到你了，出牌也要出其不意。';const canRaise=game.canRaise(0),max=p.bet+p.chips,min=game.currentBet+game.minRaise;
  $('actions').innerHTML=`<button class="secondary-btn" id="foldBtn">弃牌</button><button class="secondary-btn" id="callBtn">${call?'跟注 '+Math.min(call,p.chips):'过牌'}</button><div class="raise-controls"><input class="raise-input" id="raiseAmount" type="number" min="${min}" max="${max}" value="${Math.min(min,max)}" aria-label="本轮加注至的总金额" ${!canRaise||max<=game.currentBet?'disabled':''}><button class="primary-btn" id="raiseBtn" ${!canRaise||max<=game.currentBet?'disabled':''}>加注至</button><button class="quick-bet" id="halfBtn" ${!canRaise||max<=game.currentBet?'disabled':''}>半池</button></div><button class="secondary-btn allin" id="allinBtn" ${!canRaise&&max>game.currentBet?'disabled':''}>全下</button>`;
  $('foldBtn').onclick=()=>act('fold');$('callBtn').onclick=()=>act('call');$('raiseBtn').onclick=()=>act('raise',+$('raiseAmount').value);$('halfBtn').onclick=()=>{$('raiseAmount').value=Math.min(max,Math.max(min,game.currentBet+Math.floor(game.players.reduce((s,q)=>s+q.total,0)/2)));};$('allinBtn').onclick=()=>act(max<=game.currentBet?'call':'raise',max);
}
function act(type,target){send('action',{action:type,target});sound();}
function syncClock(){seconds=deadline?Math.max(0,Math.ceil((deadline-Date.now()-serverOffset)/1000)):0;drawClock();}
function drawClock(){$('timerLabel').textContent=seconds?`${game.stage==='skill'?'技能':game.actor===0?'你的行动':'对手行动'}倒计时 · ${seconds}s`:game.stage==='lobby'?'等待准备':game.stage==='result'?'结算完成':game.stage==='finished'?'本场结束':'等待服务器同步';}
setInterval(syncClock,250);
function resolveSkills(){closeModal();if(game.skillSubmitted)return;if(game.skillPlan&&game.chooseCards){showChoose(game.chooseCards);return;}send('pass');}
function submitSkill(plan){closeModal();send('skill',{...plan,target:plan.target===undefined?undefined:(plan.target+game.you)%6});}
function useSkill(){
  if(game.stage!=='skill')return;const p=game.players[0],type=p.role.type;
  if(type==='swap'){
    modal('<p class="eyebrow">SKILL · 易策</p><h2 class="modal-title">哪张牌，换个可能？</h2><p class="modal-copy">点选你要弃掉的那张牌。新牌将在技能阶段统一结算时发到手中。</p><div class="choice-cards">'+p.hand.map((c,i)=>`<button data-discard="${i}">${card(c)}<small>弃掉这张</small></button>`).join('')+'</div>');document.querySelectorAll('[data-discard]').forEach(b=>b.onclick=()=>submitSkill({index:+b.dataset.discard}));
  }else if(type==='choose'){
    awaitingChoose=true;send('choose');
  }else if(type==='spy'){
    modal('<p class="eyebrow">SKILL · 察言</p><h2 class="modal-title">这一次，观察谁？</h2><p class="modal-copy">对手换牌完成后，随机查看其最终手牌中的一张。信息只对你可见。</p><div class="target-grid">'+game.players.map((q,i)=>i&&!q.folded?`<button class="target-btn" data-target="${i}">${q.role.city} · ${q.role.name}<small>查看一张随机手牌</small></button>`:'').join('')+'</div>');document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>submitSkill({target:+b.dataset.target}));
  }else submitSkill({});
}
function start(){if(!game.code)return createRoom();if(!game.players[0].ready){send('ready',{ready:true});return;}if(game.you===game.host)send('start',{fillBots:$('fillBots').checked});else toast('等待房主开局');}
function nextHand(){closeModal();send('next');}
function newGame(){closeModal();send('reset');}
function renderRoom(){const inRoom=!!game.code,host=game.you===game.host;$('nickname').disabled=inRoom;$('roomCode').disabled=inRoom;$('createRoom').hidden=inRoom;$('joinRoom').hidden=inRoom;$('readyBtn').hidden=!inRoom||game.stage!=='lobby';$('readyBtn').textContent=game.players[0].ready?'取消准备':'准备';$('botOption').hidden=!inRoom||!host||game.stage!=='lobby';$('copyInvite').hidden=!inRoom;document.querySelector('.demo-tag').textContent=inRoom?'房间 '+game.code+' · '+game.players.filter(p=>p.occupied).length+'/6 人':'六人真人联机 · 可电脑补位';$('startBtn').textContent=!inRoom?'创建房间，邀请牌友 ↗':!game.players[0].ready?'准备入座':host?'全员准备后，开始比赛 ↗':'等待房主开局';$('newGameBtn').disabled=!inRoom||!host||game.stage!=='finished';$('sceneBtn').disabled=!inRoom||!host;document.querySelectorAll('[data-city]').forEach(b=>b.disabled=!inRoom||!host);if(game.stage==='finished')showRanking();}
function showResult(){
  if(!game.result){showRanking();return;}const r=game.result;
  const winners=r.awards.map((n,i)=>({i,n,net:n-game.players[i].total})).filter(x=>x.net>0);
  let summary=winners.map(x=>game.players[x.i].role.city+' 净赢 '+x.net+' 筹码').join(' · ')||'本局平分底池';
  modal('<p class="eyebrow">HAND '+game.handNo+' · SHOWDOWN</p><h2 class="modal-title">'+(game.reveal?'好牌，亮出来。':'这局，赢在气势。')+'</h2><div class="result-summary">'+summary+'</div>'+game.players.map((p,i)=>`<div class="result-row"><span>${p.role.city}${i===0?' · 你':''}</span><span>${p.folded?'弃牌':game.reveal?r.ranks[i].name:'未摊牌'}</span><strong>${r.awards[i]-p.total>=0?'+':''}${r.awards[i]-p.total}</strong><div class="result-cards">${p.hand.map(c=>card(c,i!==0&&(p.folded||!game.reveal))).join('')}</div></div>`).join('')+(game.handNo<Poker.rules.hands&&game.players.some(p=>p.chips===0)?'<div class="refill-notice">'+game.players.filter(p=>p.chips===0).map(p=>p.role.city+(p===game.players[0]?'（你）':'')).join('、')+' 已输光：下一局各补充 1,000 筹码重新入座，计入累计投入。</div>':'')+'<p class="modal-copy">筹码共 '+game.players.reduce((n,p)=>n+p.total,0)+' 枚，按主池与边池分别结算。没有被跟注的金额会退回。</p><div class="modal-actions"><button class="secondary-btn" id="backTable">回到牌桌</button><button class="primary-btn" id="modalNext">'+(game.you!==game.host?'等待房主继续':game.handNo>=Poker.rules.hands?'最终排名':'继续下一局 →')+'</button></div>');$('backTable').onclick=closeModal;$('modalNext').disabled=game.you!==game.host;$('modalNext').onclick=nextHand;
}
function showRanking(){
  const sorted=game.players.map((p,i)=>({...p,i,net:game.net(i)})).sort((a,b)=>b.net-a.net);
  modal('<p class="eyebrow">CITY JOKER CLUB · FINAL</p><h2 class="modal-title">今夜的赢家。</h2><p class="modal-copy">'+game.handNo+' 局结束，按净收益排名，相同净收益并列。<br>净收益 = 剩余筹码 − 初始 1,000 − 累计补充筹码。</p>'+sorted.map(p=>{const rank=sorted.findIndex(q=>q.net===p.net)+1;return `<div class="result-row"><strong>${String(rank).padStart(2,'0')}</strong><span>${p.role.city}${p.i===0?'（你）':''}<small class="ranking-detail">剩余 ${p.chips} · 补充 ${p.rebuys} 次</small></span><strong style="margin-left:auto">${p.net>=0?'+':''}${p.net}</strong></div>`;}).join('')+'<div class="modal-actions"><button class="primary-btn" id="againBtn">换座城市，再来一场 ↗</button></div>');$('againBtn').disabled=game.you!==game.host;$('againBtn').textContent=game.you===game.host?'重新随机角色，再来一场 ↗':'等待房主开启下一场';$('againBtn').onclick=newGame;
}
function showRoles(){modal('<p class="eyebrow">SIX CITIES · SIX TRICKS</p><h2 class="modal-title">每个人，都有一张奇招。</h2><p class="modal-copy">角色每场随机分配，不重复。每场 3 次技能机会，下注开始后不能再发动。</p><div class="role-grid">'+Poker.roles.map(r=>`<div class="role-tile" style="--role-color:${r.color}"><h3>${r.icon} · ${r.city}</h3><small>${r.name}</small><p><strong>${r.skill}</strong> · ${r.description}</p></div>`).join('')+'</div>');}
function showRules(){modal(`<p class="eyebrow">HOW TO PLAY</p><h2 class="modal-title">德扑底子，多一点奇招。</h2><div class="modal-copy"><p>六位玩家各自为战，朋友通过同一个房间码加入。房主可以选择让电脑补齐空位。每人初始 1,000 筹码，每场 10 局，按扣除初始与累计补充筹码后的净收益排名。角色整场固定，下一场重新随机。</p><p><strong>一局流程</strong><br>两张手牌 → 30 秒技能阶段 → 第一轮下注 → 三张公共牌 → 第二轮下注 → 同时翻开最后两张公共牌 → 第三轮下注 → 结算。</p><p><strong>技能怎么用</strong><br>每场可用 3 次，每局最多一次。先结算换牌，再查看信息。弃牌不回牌堆；提前查看的公共牌始终保持原位。</p><p><strong>小丑牌</strong><br>53 张牌中只有一张万能小丑，自动替代一张牌组成最强的五张牌。牌型仍为高牌、一对、两对、三条、顺子、同花、葫芦、四条、同花顺。不出现五条，花色不比较大小。</p><p><strong>下注与结算</strong><br>加注输入的是「本轮下注总额」，不是新增筹码。最低加注幅度为上次完整加注幅度，筹码不足时可以全下。全下后按主池、边池分别比牌，相同牌力平分，零头从庄家左侧开始分配。</p><p><strong>节奏</strong><br>每次下注决策时间 30 秒，超时可过牌则过牌，否则弃牌。盲注每 3 局上升：10/20 → 20/40 → 40/80 → 80/160。输光后本局等待结算，下一局自动补充 1,000 试玩筹码。角色与剩余技能次数保留，不提前淘汰。补充筹码计入累计投入，不增加净收益。最后一局结束后不再补充。</p><p>本版本通过 WebSocket 联机，发牌、技能、下注与计时都由服务器决定。断线后刷新可恢复原座位，离线玩家超时自动行动。房间暂存于内存，服务重启后需重新创建。微信登录和 AI 地域背景图尚未接入。所有游戏筹码均为虚拟筹码。</p></div>`);}
$('startBtn').onclick=start;$('skillBtn').onclick=useSkill;$('newGameBtn').onclick=newGame;
$('sceneBtn').onclick=()=>send('city',{city:(cityIndex+1+Math.floor(Math.random()*4))%5});$('rolesBtn').onclick=showRoles;$('rulesBtn').onclick=showRules;$('tableTab').onclick=closeModal;$('closeModal').onclick=closeModal;$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal();});$('soundBtn').onclick=()=>{audioEnabled=!audioEnabled;toast(audioEnabled?'轻量音效已开启':'音效已关闭');sound();};
$('createRoom').onclick=createRoom;$('joinRoom').onclick=joinRoom;$('readyBtn').onclick=()=>send('ready',{ready:!game.players[0].ready});$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText(location.origin+'/?room='+game.code);toast('邀请链接已复制');}catch{toast('房间码：'+game.code);}};
const invitation=new URLSearchParams(location.search).get('room');if(invitation)$('roomCode').value=invitation.toUpperCase();
setCity(0);render();connect();
