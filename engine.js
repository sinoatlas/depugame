(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Poker=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const suits=['♠','♥','♣','♦'];
  const names=['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
  const rules={skillSeconds:30,actionSeconds:30,initialChips:1000,refillChips:1000,hands:10};
  function deck(){const d=[];for(let s=0;s<4;s++)for(let r=2;r<=14;r++)d.push({r,s,id:s*13+r-2});d.push({r:0,s:4,id:52});return d;}
  function shuffle(d,rng=Math.random){d=d.slice();for(let i=d.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
  function compare(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const v=(a[i]||0)-(b[i]||0);if(v)return Math.sign(v);}return 0;}
  function five(cards){
    const rs=cards.map(c=>c.r).sort((a,b)=>b-a), counts=new Map();rs.forEach(r=>counts.set(r,(counts.get(r)||0)+1));
    const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
    const flush=cards.every(c=>c.s===cards[0].s), unique=[...new Set(rs)];let straight=0;
    if(unique.length===5){if(unique[0]-unique[4]===4)straight=unique[0];else if(unique.join(',')==='14,5,4,3,2')straight=5;}
    if(flush&&straight)return [8,straight];
    if(groups[0][1]===4)return [7,groups[0][0],groups[1][0]];
    if(groups[0][1]===3&&groups[1][1]===2)return [6,groups[0][0],groups[1][0]];
    if(flush)return [5,...rs];if(straight)return [4,straight];
    if(groups[0][1]===3)return [3,groups[0][0],...groups.slice(1).map(g=>g[0])];
    if(groups[0][1]===2&&groups[1][1]===2)return [2,...groups.slice(0,2).map(g=>g[0]),groups[2][0]];
    if(groups[0][1]===2)return [1,groups[0][0],...groups.slice(1).map(g=>g[0])];
    return [0,...rs];
  }
  function evaluate(cards){
    if(cards.length<5)throw new Error('比牌至少需要五张牌');let best=null,bestCards;
    function choose(start,pick){if(pick.length===5){let value=five(pick);if(!best||compare(value,best)>0){best=value;bestCards=pick.slice();}return;}for(let i=start;i<=cards.length-(5-pick.length);i++)choose(i+1,pick.concat(cards[i]));}
    const wild=cards.findIndex(c=>c.r===0);
    if(wild<0)choose(0,[]);else{
      const original=cards[wild],used=new Set(cards.filter(c=>c.r).map(c=>c.id));
      cards=cards.slice();for(const replacement of deck().slice(0,52)){if(used.has(replacement.id))continue;cards[wild]=replacement;choose(0,[]);}cards[wild]=original;
    }
    return {score:best,name:names[best[0]],cards:bestCards};
  }
  // Award each contribution layer separately; folded players fund pots but cannot win.
  function settle(players,board,dealer){
    const awards=players.map(()=>0),pots=[],levels=[...new Set(players.map(p=>p.total).filter(n=>n>0))].sort((a,b)=>a-b);let previous=0;
    const alive=players.map((p,i)=>!p.folded?i:-1).filter(i=>i>=0);
    const ranks=alive.length>1?players.map(p=>p.folded?null:evaluate(p.hand.concat(board))):[];
    for(const level of levels){const contributors=players.map((p,i)=>p.total>=level?i:-1).filter(i=>i>=0);const amount=(level-previous)*contributors.length;previous=level;
      let eligible=contributors.filter(i=>!players[i].folded);
      if(contributors.length===1){awards[contributors[0]]+=amount;pots.push({amount,winners:contributors,refund:true});continue;}
      // Defensive fallback: if all contributors folded, remaining live players receive the layer.
      if(!eligible.length)eligible=alive;
      let winners=eligible.slice();if(eligible.length>1){let best=ranks[eligible[0]].score;for(const i of eligible)if(compare(ranks[i].score,best)>0)best=ranks[i].score;winners=eligible.filter(i=>compare(ranks[i].score,best)===0);}
      winners.sort((a,b)=>(a-dealer-1+players.length)%players.length-(b-dealer-1+players.length)%players.length);
      const share=Math.floor(amount/winners.length),remainder=amount%winners.length;winners.forEach((i,j)=>awards[i]+=share+(j<remainder?1:0));pots.push({amount,winners});
    }
    return {awards,pots,ranks};
  }
  const roles=[
    {city:'南京',name:'金陵谋士',skill:'易策',description:'弃掉一张手牌，重新摸一张。',type:'swap',icon:'策',color:'#e5b971'},
    {city:'连云港',name:'港城领航员',skill:'探潮',description:'私下查看第一张即将翻开的公共牌。',type:'flop',icon:'潮',color:'#75d3de'},
    {city:'盐城',name:'湿地守望者',skill:'新生',description:'弃掉两张手牌，重新摸两张。',type:'reset',icon:'鹤',color:'#a9d591'},
    {city:'天津',name:'津门说书人',skill:'察言',description:'选择一名对手，随机查看其一张最终手牌。',type:'spy',icon:'言',color:'#dfa4c2'},
    {city:'武汉',name:'江城策士',skill:'远见',description:'私下查看最后一张公共牌。',type:'river',icon:'江',color:'#e6a26e'},
    {city:'同济药学院',name:'药研学者',skill:'筛选',description:'多摸一张，从三张手牌中保留两张。',type:'choose',icon:'研',color:'#b4a6ed'}
  ];
  class Game{
    constructor(rng=Math.random){this.rng=rng;this.logs=[];this.handNo=0;this.dealer=Math.floor(rng()*6);this.players=shuffle(roles,rng).map((role,i)=>({name:i?'牌友 '+i:'你',role,chips:rules.initialChips,buyIn:rules.initialChips,rebuys:0,uses:3,hand:[],folded:false,total:0,bet:0}));this.stage='lobby';this.actor=-1;}
    net(i){const p=this.players[i];return p.chips-p.buyIn;}
    log(text){this.logs.push(text);if(this.logs.length>70)this.logs.shift();}
    live(){return this.players.map((p,i)=>!p.folded?i:-1).filter(i=>i>=0);}
    next(from,predicate){for(let k=1;k<=6;k++){const i=(from+k)%6;if(predicate(this.players[i],i))return i;}return -1;}
    pay(i,n){const p=this.players[i],paid=Math.max(0,Math.min(p.chips,Math.floor(n)));p.chips-=paid;p.bet+=paid;p.total+=paid;return paid;}
    startHand(){
      if(this.handNo>=rules.hands){this.stage='finished';return;}
      if(this.handNo)this.players.forEach(p=>{if(p.chips===0){p.chips=rules.refillChips;p.buyIn+=rules.refillChips;p.rebuys++;this.log(p.name+' 筹码归零，补充 '+rules.refillChips+' 筹码重新入座（累计补充 '+p.rebuys+' 次）');}});
      if(this.handNo)this.dealer=this.next(this.dealer,p=>p.chips>0);else if(!this.players[this.dealer].chips)this.dealer=this.next(this.dealer,p=>p.chips>0);
      this.handNo++;this.smallBlind=[10,20,40,80][Math.floor((this.handNo-1)/3)];this.bigBlind=this.smallBlind*2;
      this.deck=shuffle(deck(),this.rng);this.board=this.deck.splice(0,5);this.visible=0;this.result=null;this.intel=[];this.skillPlan=null;this.skillsResolved=false;this.reveal=false;
      this.players.forEach(p=>{p.bet=0;p.total=0;p.folded=p.chips===0;p.hand=p.folded?[]:this.deck.splice(0,2);p.used=false;p.intel=null;p.intelList=[];});
      const headsUp=this.live().length===2;this.sb=headsUp?this.dealer:this.next(this.dealer,p=>!p.folded);this.bb=this.next(this.sb,p=>!p.folded);
      this.pay(this.sb,this.smallBlind);this.pay(this.bb,this.bigBlind);this.stage='skill';this.actor=0;
      this.log('第 '+this.handNo+' 局 · 盲注 '+this.smallBlind+'/'+this.bigBlind+' · 庄家 '+this.players[this.dealer].name);
    }
    setSkill(plan){if(this.stage!=='skill'||this.skillsResolved)throw new Error('不在技能阶段');if(plan&&(!this.players[0].uses||this.players[0].folded))throw new Error('没有技能机会');this.skillPlan=plan;}
    resolveSkills(plansOverride){
      if(this.stage!=='skill'||this.skillsResolved)return;this.skillsResolved=true;
      const plans=plansOverride||this.players.map((p,i)=>{if(p.folded||p.uses===0)return null;if(i===0)return this.skillPlan;return this.rng()<0.45?{index:p.hand[0].r<p.hand[1].r?0:1,target:this.next(i,q=>!q.folded)}:null;});
      for(let i=0;i<6;i++){const p=this.players[i],plan=plans[i];if(!plan)continue;p.uses--;p.used=true;const t=p.role.type;
        if(t==='swap')p.hand[plan.index===1?1:0]=this.deck.shift();
        if(t==='reset')p.hand=this.deck.splice(0,2);
        if(t==='choose'){p.hand.push(plan.previewCard||this.deck.shift());const discard=plansOverride||i===0?Math.min(2,Math.max(0,plan.discard??2)):p.hand.reduce((best,c,j,a)=>c.r<a[best].r?j:best,0);p.hand.splice(discard,1);}
        this.log(p.name+' 使用了「'+p.role.skill+'」');
      }
      for(let i=0;i<6;i++){const p=this.players[i],plan=plans[i];if(!plan)continue;const t=p.role.type;let card,label;
        if(t==='flop'){card=this.board[0];label='探潮 · 首张公共牌';}
        if(t==='river'){card=this.board[4];label='远见 · 最后一张公共牌';}
        if(t==='spy'){const target=Number(plan.target);if(target>=0&&target<6&&target!==i&&!this.players[target].folded){card=this.players[target].hand[Math.floor(this.rng()*2)];label='察言 · '+this.players[target].role.city+'的一张手牌';}}
        if(card){p.intelList.push({card,label});p.intel=card;if(i===0)this.intel.push({card,label});}
      }
      this.beginBetting('preflop');
    }
    beginBetting(stage){this.stage=stage;this.currentBet=stage==='preflop'?this.bigBlind:0;this.minRaise=this.bigBlind;this.acted=new Set();if(stage!=='preflop')this.players.forEach(p=>p.bet=0);this.pending=new Set(this.players.map((p,i)=>!p.folded&&p.chips>0?i:-1).filter(i=>i>=0));
      const from=stage==='preflop'?this.bb:this.dealer;this.actor=this.next(from,(p,i)=>this.pending.has(i));this.progress();}
    toCall(i){return Math.max(0,this.currentBet-this.players[i].bet);}
    canRaise(i){return !this.acted.has(i)&&this.players.some((p,j)=>j!==i&&!p.folded&&p.chips>0);}
    action(i,type,target){
      if(i!==this.actor||!['preflop','flop','river'].includes(this.stage))throw new Error('尚未轮到该玩家');const p=this.players[i],call=this.toCall(i);
      if(type==='fold'){p.folded=true;this.log(p.name+' 弃牌');}
      else if(type==='call'){const paid=this.pay(i,call);this.log(p.name+(call?' 跟注 '+paid:' 过牌'));}
      else if(type==='raise'){
        target=Math.floor(Number(target));if(!Number.isFinite(target)||!this.canRaise(i))throw new Error('当前不能加注');const max=p.bet+p.chips;target=Math.min(target,max);
        if(target<=this.currentBet)throw new Error('加注必须超过当前下注');const increase=target-this.currentBet,full=increase>=this.minRaise;
        if(!full&&target!==max)throw new Error('加注金额不足');this.pay(i,target-p.bet);this.currentBet=p.bet;
        if(full){this.minRaise=increase;this.acted.clear();this.pending=new Set(this.players.map((q,j)=>j!==i&&!q.folded&&q.chips>0?j:-1).filter(j=>j>=0));}
        else this.players.forEach((q,j)=>{if(j!==i&&!q.folded&&q.chips>0&&q.bet<this.currentBet)this.pending.add(j);});
        this.log(p.name+(p.chips===0?' 全下至 ':' 加注至 ')+p.bet);
      }else throw new Error('未知动作');
      this.pending.delete(i);this.acted.add(i);this.actor=this.next(i,(q,j)=>this.pending.has(j)&&!q.folded&&q.chips>0);this.progress();
    }
    progress(){
      if(this.live().length===1){this.finish();return;}
      for(const i of [...this.pending])if(this.players[i].folded||!this.players[i].chips)this.pending.delete(i);
      const actionable=this.players.map((p,i)=>!p.folded&&p.chips>0?i:-1).filter(i=>i>=0);
      if(actionable.length<=1&&actionable.every(i=>this.toCall(i)===0)){this.visible=5;this.finish();return;}
      if(!this.pending.size||this.actor<0){if(this.stage==='preflop'){this.visible=3;this.log('翻牌已揭晓');this.beginBetting('flop');}else if(this.stage==='flop'){this.visible=5;this.log('最后两张公共牌已揭晓');this.beginBetting('river');}else this.finish();}
    }
    finish(){this.reveal=this.live().length>1;if(this.reveal)this.visible=5;this.result=settle(this.players,this.board,this.dealer);this.players.forEach((p,i)=>p.chips+=this.result.awards[i]);this.stage='result';this.actor=-1;this.log('结算：'+this.result.awards.map((n,i)=>n?this.players[i].name+' 收回 '+n:'').filter(Boolean).join('，'));}
    botAction(){const i=this.actor;if(i<0)return;const p=this.players[i],call=this.toCall(i),pot=this.players.reduce((s,q)=>s+q.total,0);let strength;
      if(this.visible>=3)strength=evaluate(p.hand.concat(this.board.slice(0,this.visible))).score[0]/8+0.23;
      else strength=(p.hand[0].r===p.hand[1].r?0.72:Math.max(...p.hand.map(c=>c.r))/23)+(p.hand.some(c=>c.r===0)?0.5:0);
      if(p.intel&&p.hand.some(c=>c.r===p.intel.r))strength+=0.12;
      if(call>0&&call>p.chips*0.28&&this.rng()>strength){this.action(i,'fold');return;}
      const min=this.currentBet+this.minRaise,max=p.bet+p.chips;
      if(this.canRaise(i)&&max>=min&&this.rng()<Math.min(0.22,strength*0.2)){this.action(i,'raise',Math.min(max,this.currentBet+Math.max(this.minRaise,Math.floor(pot*0.4))));return;}
      this.action(i,'call');
    }
  }
  return {deck,shuffle,compare,evaluate,settle,roles,Game,suits,names,rules};
});
