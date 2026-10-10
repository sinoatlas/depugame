const assert=require('node:assert/strict');
const P=require('./engine');
const c=(r,s=0)=>({r,s,id:s*13+r-2});
const joker={r:0,s:4,id:52};
let checks=0;
function test(name,fn){fn();checks++;console.log('✓ '+name);}
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
test('53 张牌，小丑只有一张，所有 ID 唯一',()=>{assert.equal(P.deck().length,53);assert.equal(new Set(P.deck().map(c=>c.id)).size,53);assert.equal(P.deck().filter(c=>c.r===0).length,1);});
test('九种标准牌型及 A2345 顺子',()=>{
  const hands=[ [c(14),c(11,1),c(8,2),c(5,3),c(2)], [c(9),c(9,1),c(14,2),c(5),c(2)], [c(9),c(9,1),c(4),c(4,2),c(2)], [c(9),c(9,1),c(9,2),c(5),c(2)], [c(14),c(2,1),c(3,2),c(4),c(5)], [c(14),c(10),c(8),c(4),c(2)], [c(9),c(9,1),c(9,2),c(5),c(5,1)], [c(9),c(9,1),c(9,2),c(9,3),c(2)], [c(10),c(11),c(12),c(13),c(14)] ];
  hands.forEach((h,i)=>assert.equal(P.evaluate(h).score[0],i));assert.equal(P.evaluate(hands[4]).score[1],5);
});
test('七张牌选最强五张，踢脚牌正确',()=>{const a=P.evaluate([c(14),c(14,1),c(13,3),c(12,2),c(9),c(7,1),c(2,2)]);const b=P.evaluate([c(14),c(14,1),c(13,3),c(11,2),c(9),c(7,1),c(2,2)]);assert.equal(P.compare(a.score,b.score),1);});
test('万能小丑组成皇家同花顺，不生成五条',()=>{assert.deepEqual(P.evaluate([joker,c(10),c(11),c(12),c(13),c(3,2),c(6,3)]).score,[8,14]);assert.equal(P.evaluate([joker,c(9),c(9,1),c(9,2),c(9,3)]).score[0],7);});
const board=[c(2,0),c(4,1),c(6,2),c(8,3),c(10,0)];
test('短码赢主池，深码赢边池，未跟注金额退回',()=>{
  const ps=[{total:100,folded:false,hand:[c(14),c(14,1)]},{total:300,folded:false,hand:[c(13),c(13,1)]},{total:500,folded:false,hand:[c(12),c(12,1)]}];
  assert.deepEqual(P.settle(ps,board,0).awards,[300,400,200]);
});
test('弃牌贡献计入底池，相同牌力平分，零头从庄家左侧发放',()=>{
  const b=[c(10),c(11),c(12),c(13),c(14)];const ps=[{total:5,folded:false,hand:[c(2,1),c(3,1)]},{total:5,folded:false,hand:[c(4,1),c(5,1)]},{total:5,folded:true,hand:[c(6,1),c(7,1)]}];assert.deepEqual(P.settle(ps,b,0).awards,[7,8,0]);
});
test('六种技能效果与使用次数，公共牌稳定，察言观察最终手牌',()=>{
  for(const role of P.roles){const g=new P.Game(rng(12));g.players[0].role=role;g.startHand();const old=g.players[0].hand.map(c=>c.id),b=g.board.map(c=>c.id);g.setSkill({index:0,discard:0,target:1});g.resolveSkills();assert.equal(g.players[0].uses,2);assert.equal(g.players[0].hand.length,2);assert.deepEqual(g.board.map(c=>c.id),b);
    const h=g.players[0].hand.map(c=>c.id);if(role.type==='swap'){assert.notEqual(h[0],old[0]);assert.equal(h[1],old[1]);}if(role.type==='reset')assert(h.every(id=>!old.includes(id)));if(role.type==='choose'){assert.equal(h[0],old[1]);assert(!old.includes(h[1]));}if(role.type==='flop')assert.equal(g.intel[0].card.id,b[0]);if(role.type==='river')assert.equal(g.intel[0].card.id,b[4]);if(role.type==='spy')assert(g.players[1].hand.some(c=>c.id===g.intel[0].card.id));
    const cards=g.board.concat(g.players.flatMap(p=>p.hand));assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
  }
});
test('非法加注不会改变筹码，完整加注重新开放行动',()=>{const g=new P.Game(rng(1));g.startHand();g.resolveSkills();const i=g.actor,before=g.players[i].chips;assert.throws(()=>g.action(i,'raise',g.currentBet+1));assert.equal(g.players[i].chips,before);g.action(i,'raise',g.currentBet+g.minRaise);assert.equal(g.currentBet,40);assert.equal(g.pending.size,5);});
test('不足完整幅度的全下不会重新开放已行动者的加注',()=>{
  const g=new P.Game(rng(1));g.startHand();g.resolveSkills();const first=g.actor;g.action(first,'call');const second=g.actor;g.players[second].chips=25-g.players[second].bet;g.action(second,'raise',25);assert.equal(g.currentBet,25);assert.equal(g.canRaise(first),false);assert(g.pending.has(first));
});
test('技能和下注决策时间都不少于 30 秒',()=>{assert(P.rules.skillSeconds>=30);assert(P.rules.actionSeconds>=30);});
test('输光后只在下一局补充筹码，保留角色和技能次数，补充不改变净收益',()=>{
  const g=new P.Game(rng(7));g.startHand();g.resolveSkills();while(g.stage!=='result')g.action(g.actor,'call');
  const p=g.players[0],role=p.role,uses=p.uses;g.players[1].chips+=p.chips;p.chips=0;
  assert.equal(p.rebuys,0);assert.equal(g.net(0),-1000);g.startHand();
  assert.equal(p.rebuys,1);assert.equal(p.buyIn,2000);assert.equal(p.uses,uses);assert.equal(p.role,role);assert.equal(p.hand.length,2);assert.equal(p.folded,false);assert.equal(p.chips+p.total,1000);assert.equal(p.chips+p.total-p.buyIn,-1000);
  assert.equal(g.players.reduce((s,p)=>s+p.chips+p.total,0),7000);
});
test('即使只剩一人有筹码，六人仍重新入座；第十局后不再补充',()=>{
  const g=new P.Game(rng(3));g.handNo=1;g.stage='result';g.players.forEach((p,i)=>p.chips=i===0?6000:0);g.startHand();assert.equal(g.stage,'skill');assert.equal(g.live().length,6);assert.equal(g.players.reduce((s,p)=>s+p.buyIn,0),11000);
  g.handNo=10;g.stage='result';g.players[1].chips=0;const before=g.players[1].buyIn;g.startHand();assert.equal(g.stage,'finished');assert.equal(g.players[1].buyIn,before);assert.equal(g.players[1].chips,0);
});
test('净收益扣除全部补充筹码，不能靠补充提升排名',()=>{const g=new P.Game(rng(1));g.players[0].chips=2500;g.players[0].buyIn=3000;g.players[0].rebuys=2;g.players[1].chips=1200;assert.equal(g.net(0),-500);assert.equal(g.net(1),200);assert(g.net(1)>g.net(0));});
test('200 场随机模拟：每次行动筹码守恒、每局终止、每人技能不超额',()=>{
  for(let seed=1;seed<=200;seed++){
    const random=rng(seed),g=new P.Game(random);let guard=0;
    while(g.handNo<10){g.startHand();g.setSkill(g.players[0].uses&&!g.players[0].folded&&random()<.5?{index:0,discard:2,target:g.next(0,p=>!p.folded)}:null);g.resolveSkills();
      while(g.stage!=='result'){
        assert(++guard<1500,'对局未终止');const i=g.actor,p=g.players[i],call=g.toCall(i),max=p.bet+p.chips,min=g.currentBet+g.minRaise;
        if(random()<.04&&call>0)g.action(i,'fold');else if(g.canRaise(i)&&max>g.currentBet&&random()<.06)g.action(i,'raise',random()<.5?max:Math.min(max,min));else g.action(i,'call');
        const total=g.players.reduce((s,p)=>s+p.chips+(g.stage==='result'?0:p.total),0);assert.equal(total,g.players.reduce((s,p)=>s+p.buyIn,0));assert(g.players.every(p=>p.chips>=0));
      }
      assert.equal(g.players.reduce((s,p)=>s+p.chips,0),g.players.reduce((s,p)=>s+p.buyIn,0));assert.equal(g.players.reduce((s,p,i)=>s+g.net(i),0),0);assert(g.players.every(p=>p.uses>=0&&p.uses<=3));
    }
  }
});
console.log('\n'+checks+' 组检查通过。');
