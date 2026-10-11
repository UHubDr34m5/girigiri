import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateGame,availableNumbers, nextGame, leaderboard, INITIAL_RULES} from '../src/engine.js';
const players = {
 a: {nickname:'A',score:3,joinedAt:1,usedNumbers:{}},
 b: {nickname:'B',score:0,joinedAt:2,usedNumbers:{}},
 c: {nickname:'C',score:-2,joinedAt:3,usedNumbers:{}},
};
const subs = (a,b,c, extra={}) => ({a:{number:a,...extra.a},b:{number:b,...extra.b},c:{number:c,...extra.c}});
const calc=(s,r={})=>calculateGame(players,s,{...INITIAL_RULES,...r});
test('上限以下は正、超えると負',()=>{
 assert.equal(calc(subs(4,6,9),{limit:19}).scored.b.points,6);
 assert.equal(calc(subs(4,6,9),{limit:18}).scored.b.points,-6);
});
test('下限未満は最小だけ最大値の負点、同点最低すべて',()=>{
 const x=calc(subs(2,2,7),{limit:23,safeZone:true,lowerLimit:12});
 assert.equal(x.status,'under');assert.deepEqual([x.scored.a.points,x.scored.b.points,x.scored.c.points],[-7,-7,0]);
});
test('バッティング負点は0方向に切り捨て',()=>{
 const x=calc(subs(5,5,9),{limit:18,batting:true});
 assert.deepEqual([x.scored.a.points,x.scored.b.points,x.scored.c.points],[-2,-2,-9]);
});
test('ボーナス→予想→ダブルアップを順に適用',()=>{
 const x=calc(subs(4,4,9,{a:{prediction:'safe',doubleMultiplier:3},b:{prediction:'out'},c:{prediction:'safe'}}),
    {limit:16,bonus:true,bonusMultiplier:2,prediction:true,doubleUp:true,batting:true});
 assert.deepEqual([x.scored.a.points,x.scored.b.points,x.scored.c.points],[-24,0,-36]);
});
test('予想的中でセーフなら2倍、アウトなら0',()=>{
 const a=calc(subs(2,3,4,{a:{prediction:'safe'},b:{prediction:'out'},c:{prediction:'safe'}}),{limit:10,prediction:true});
 assert.deepEqual([a.scored.a.points,a.scored.b.points,a.scored.c.points],[4,0,8]);
 const b=calc(subs(2,3,4,{a:{prediction:'out'},b:{prediction:'safe'},c:{prediction:'out'}}),{limit:8,prediction:true});
 assert.deepEqual([b.scored.a.points,b.scored.b.points,b.scored.c.points],[0,-6,0]);
});
test('防御0は罰点を受けず、最低値判定でも除外',()=>{
 const x=calc(subs(0,2,8),{limit:20,safeZone:true,lowerLimit:15,defense:true});
 assert.deepEqual([x.scored.a.points,x.scored.b.points,x.scored.c.points],[0,-8,0]);
});
test('使用数字はラウンド内再利用不可',()=>{
 const p={usedNumbers:{n1:true,n5:true,n10:true}};
 assert.deepEqual(availableNumbers(p),[2,3,4,6,7,8,9]);
 const x=calculateGame({a:{...players.a,...p}},{a:{number:5}},{limit:10});
 assert.equal(x.scored.a.points,0);
});
test('5ゲームの次から新ラウンド',()=>{
 assert.deepEqual(nextGame({round:2,gameInRound:5,totalGame:10}),{round:3,gameInRound:1,totalGame:11,newRound:true});
});
test('合計点ランキング',()=>{
 assert.deepEqual(leaderboard(players).map(x=>x.id),['a','b','c']);
});
