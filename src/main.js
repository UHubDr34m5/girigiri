import { INITIAL_RULES, RULE_NAMES, calculateGame, leaderboard, nextGame, availableNumbers, safeSubmission, normalizeRules, validRules, n } from './engine.js';
import { createStore } from './store.js?v=20261011-live3';

const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const state = {route:'home', code:'', room:null, loading:false, error:'', fullscreen:false};
const ui = {choice:null, prediction:'', doubleMultiplier:1, gameKey:'', draftRules:{...INITIAL_RULES}};
let store, unsubscribe = () => {}, toastTimer;
const esc = value => String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
function confirmAction(message){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');
  dialog.className='confirm-dialog';
  dialog.setAttribute('aria-labelledby','confirm-title');
  dialog.innerHTML=`<h2 id="confirm-title">操作の確認</h2><p>${esc(message)}</p><form method="dialog"><button class="btn secondary" value="cancel" autofocus>キャンセル</button><button class="btn" value="confirm">実行する</button></form>`;
  dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='confirm';dialog.remove();resolve(accepted);},{once:true});
  document.body.append(dialog);dialog.showModal();
 });
}
const sign = value => value > 0 ? `+${value}` : String(value);
const statusText = status => ({safe:'SAFE!',under:'LOW! / 下限未満',over:'OUT! / 上限超過'})[status] || '';
const playersArr = room => Object.entries(room?.players || {}).sort((a,b) => (a[1].joinedAt||0)-(b[1].joinedAt||0)||a[0].localeCompare(b[0]));
function tell(message){clearTimeout(toastTimer);toastEl.textContent=message;toastEl.classList.add('show');toastTimer=setTimeout(()=>toastEl.classList.remove('show'),3200);}
const copyText = async val => { try {await navigator.clipboard.writeText(val);tell('コピーしました');} catch {prompt('コピーしてください',val);} };
function toHome(){unsubscribe();unsubscribe=()=>{};state.route='home';state.code='';state.room=null;state.fullscreen=false;history.replaceState(null,'',location.pathname);render();}
function shell(content){
  return `<div class="shell"><header class="topbar"><a href="#" class="brand" data-action="home"><span class="brand-logo">9</span><span>ギリギリ・ナンバー</span></a><div class="right-header"><span class="mode-pill">LIVE</span>${state.route!=='home'?'<button class="ghost" data-action="home">ホームへ</button>':''}</div></header>${content}<footer class="footer">GIRIGIRI NUMBER © 2026 ・ 教室から生まれる数字の心理戦</footer></div>`;
}
function render(){
 if(!store)return;
 if(state.route==='home'){app.innerHTML=shell(homeHTML());return;}
 if(state.route==='join'){app.innerHTML=shell(joinHTML());return;}
 if(!state.room){app.innerHTML=shell(`<div class="panel waiting"><div class="spinner"></div><p>ルームを読み込み中…</p></div>`);return;}
 if(state.route==='teacher'&&state.room.teacherUid!==store.uid){state.error='この端末は教員画面の作成者ではありません。元のブラウザをご利用ください。';state.route='join';app.innerHTML=shell(joinHTML());return;}
 if(state.route==='student'&&!state.room.players?.[store.uid]){state.route='join';app.innerHTML=shell(joinHTML());return;}
 const content=state.route==='teacher'?teacherHTML():studentHTML();
 app.innerHTML=shell(content);
 if(state.fullscreen && state.route==='teacher' && state.room.stage==='revealing'){
  const scene=app.querySelector('#stage-panel');
  if(scene){scene.classList.add('full-screen');scene.querySelector('.stage-foot')?.classList.add('full-foot');}
 }
}
function homeHTML(){
 const last=localStorage.getItem('gn_last_teacher');
 return `<section class="hero"><div><span class="eyebrow">4〜16人で遊べる数字の心理戦</span><h1>攻めるか、守るか。<br><strong>ギリギリ</strong>を狙え。</h1><p class="lead">全員が1〜10の数字を同時に選択。<br>合計が上限以内ならプラス、超えたらマイナス。<br>読み合いと逆転が止まらない、クラス対戦ゲーム。</p><div class="mini-guide"><span class="guide-tag">数字カード不要</span><span class="guide-tag">先生が進行</span><span class="guide-tag">スマホで参加</span></div></div><div class="hero-visual"><div class="float-card one">3</div><div class="hero-number">9</div><div class="float-card two">7</div><div class="visual-label">HIGH RISK. HIGH REWARD.</div></div></section>
 <div class="home-actions"><section class="home-box"><div class="icon-tile">♛</div><h2>教員として開催</h2><p>ルームを作成し、ルール・上限・発表演出を管理します。</p><button data-action="create-room" class="btn wide">＋ 新しいルームを作る</button>${last?`<button data-action="restore-teacher" class="btn secondary wide" style="margin-top:9px">前回の教員ルームに戻る</button>`:''}</section>
 <section class="home-box"><div class="icon-tile mint">#</div><h2>生徒として参加</h2><p>先生から伝えられたルームコードとニックネームを入力。</p><form id="join-code-form"><label class="field"><span class="label">ルームコード</span><input name="code" class="input" maxlength="8" placeholder="例：AB7K2M9Q" required autocomplete="off" style="text-transform:uppercase"></label><button class="btn mint wide" type="submit">ルームに参加する →</button></form></section></div>
 <div class="notice ok">オンラインモードで接続しています。ルームコードを共有すると、生徒が各端末から参加できます。</div>`;
}
function joinHTML(){
 return `<section style="max-width:500px;margin:60px auto"><div class="panel"><div class="panel-heading"><h2>生徒として参加</h2><span class="mode-pill">${esc(state.code||'JOIN')}</span></div>${state.error?`<div class="notice error">${esc(state.error)}</div>`:''}<p class="muted">ニックネームを入力して、ゲームに参加しましょう。</p><form id="join-player-form"><label class="field"><span class="label">ニックネーム（1〜16文字）</span><input class="input" name="nickname" maxlength="16" required placeholder="例：数学マスター" autocomplete="nickname"></label><button class="btn wide" type="submit">参加する！</button></form><p class="tip">本名ではなくニックネームを使ってください。</p></div></section>`;
}
function headerRoom(room, teacher=false){
 const count=Object.keys(room.players||{}).length;
 return `<section class="room-banner"><div><p>${teacher?'TEACHER CONSOLE':'PLAYER ROOM'}</p><h1>${teacher?'ゲーム進行ダッシュボード':'対戦ルーム'}</h1><p>参加者 ${count}人 ／ ${room.stage==='lobby'?'エントリー受付中':room.stage==='finished'?'大会終了':`第${room.current?.round||1}ラウンド・${room.current?.gameInRound||1}/5ゲーム`}</p></div><button class="room-code" data-action="copy-room" title="ルーム参加URLをコピー"><small>ROOM CODE ⧉</small><strong>${esc(state.code)}</strong><small>タップして参加URLをコピー</small></button></section>`;
}
function scoreboard(room){
 const sorted=leaderboard(room.players||{});
 return `<section class="panel"><div class="panel-heading"><h2>🏆 総合ランキング</h2><span class="subheading">${sorted.length} PLAYERS</span></div><div class="rank-list">${sorted.map((p,i)=>`<div class="rank-row"><span class="rank-number ${i===0?'first':''}">${i+1}</span><div class="rank-name" title="${esc(p.nickname)}">${esc(p.nickname)}</div><strong class="rank-score ${p.score<0?'negative':''}">${sign(p.score)}<span class="rank-info"> pt</span></strong></div>`).join('')||'<p class="tiny-note">参加者がまだいません。</p>'}</div></section>`;
}
function currentRulePills(rules){
 return `<div class="rule-pills"><span class="rule-pill">上限 ${rules.limit}</span>${rules.safeZone?`<span class="rule-pill">下限 ${rules.lowerLimit}</span>`:''}${Object.keys(RULE_NAMES).filter(k=>rules[k]).map(k=>`<span class="rule-pill">${esc(RULE_NAMES[k])}${k==='bonus'?` ×${rules.bonusMultiplier}`:''}</span>`).join('')}</div>`;
}
function configForm(){const r=ui.draftRules;const t=(key,title,desc)=>`<div class="toggle-row"><label for="rule-${key}">${title}<small>${desc}</small></label><label class="switch"><input id="rule-${key}" type="checkbox" name="${key}" data-rules-toggle="1" ${r[key]?'checked':''}><span class="switch-track"></span></label></div>`;
 return `<form id="rules-form"><div class="num-control"><label class="field"><span class="label">上限（必須）</span><input class="input small-input" name="limit" type="number" min="1" max="160" value="${r.limit}" required></label>${r.safeZone?`<label class="field"><span class="label">下限</span><input class="input small-input" name="lowerLimit" type="number" min="0" max="160" value="${r.lowerLimit}" required></label>`:'<div class="field"><span class="label">1〜160で設定</span><div class="tip" style="padding-top:10px">参加人数×5 が目安です</div></div>'}</div>
 ${t('safeZone','セーフゾーン','下限未満なら最小値の人が減点')}
 ${t('bonus','ボーナス','成功・失敗どちらも倍率適用')}
 ${r.bonus?`<label class="field"><span class="label">ボーナス倍率</span><select class="select" name="bonusMultiplier">${[2,3,4,5,6,7,8,9,10].map(x=>`<option value="${x}" ${Number(r.bonusMultiplier)===x?'selected':''}>×${x}</option>`).join('')}</select></label>`:''}
 ${t('batting','バッティング','同じ数字の人数で得失点を割る')}
 ${t('prediction','セーフ・アウト予想','予想に応じて0点または2倍')}
 ${t('defense','ディフェンス','0を選択して得失点なし')}
 ${t('doubleUp','ダブルアップ','大会中1度だけ自分で×2〜5')}
 <div class="settings-foot">応用ルールは複数併用可能です。<br>確定したゲーム中は変更できません。</div></form>`;
}
function lobbyHTML(room){return `<section class="panel"><div class="panel-heading"><h2>参加者を受付中</h2><span class="mode-pill">LOBBY</span></div><div class="stats"><div class="stat"><label>参加者</label><strong>${playersArr(room).length}<span class="unit"> / 16</span></strong></div><div class="stat"><label>ラウンド</label><strong>1</strong></div><div class="stat"><label>ゲーム</label><strong>1<span class="unit"> / 5</span></strong></div></div><div class="players">${playerList(room,'lobby')}</div><div class="divider"></div><p class="tip">4〜16人がおすすめです。必要なら教員が参加者を削除できます。</p><button class="btn wide" data-action="start-game" ${playersArr(room).length?'':'disabled'}>▶ 最初のゲームを始める</button></section>`;}
function playerList(room, phase){return playersArr(room).map(([id,p],i)=>{
 const done=!!room.submissions?.[id];
 return `<div class="player-chip"><div class="avatar ${i%2?'teal':''}">${String(i+1).padStart(2,'0')}</div><div style="min-width:0;flex:1"><div class="player-name">${esc(p.nickname)}</div><div class="player-sub">${phase==='collecting'?done?'提出済み':'未提出':`PLAYER ${i+1}`}</div></div>${phase==='lobby'?`<button class="ghost" style="padding:5px 9px" data-action="remove-player" data-uid="${esc(id)}" title="参加者を削除">×</button>`:phase==='collecting'?`<span class="status-dot ${done?'':'wait'}">${done?'●':'○'}</span>`:''}</div>`;
 }).join('')||'<p class="tiny-note">参加者を待っています…</p>';}
function collectionHTML(room){
 const members=playersArr(room);const done=members.filter(([id])=>room.submissions?.[id]).length;const p=Math.round(100*done/Math.max(1,members.length));const r=room.current.rules;
 return `<section class="panel"><div class="panel-heading"><h2>数字を受付中</h2><span class="mode-pill">COLLECTING</span></div><div class="stats"><div class="stat"><label>第${room.current.round}ラウンド</label><strong>${room.current.gameInRound}<span class="unit"> / 5</span></strong></div><div class="stat"><label>上限</label><strong>${r.limit}</strong></div><div class="stat"><label>提出済み</label><strong>${done}<span class="unit"> / ${members.length}</span></strong></div></div>${currentRulePills(r)}<div class="progress-row" style="margin-top:21px"><span>提出状況</span><div class="progressbar"><span style="width:${p}%"></span></div><strong>${p}%</strong></div><div class="players" style="margin-top:18px">${playerList(room,'collecting')}</div><button data-action="close-submissions" class="btn wide" style="margin-top:12px">🔒 締め切って発表へ</button><p class="tiny-note">未提出者がいても締め切れます（そのゲームは棄権・0点）。</p></section>`;
}
function revealInfo(room){
 const c=room.current;const order=c.revealOrder||[];const id=order[c.revealIndex];const p=room.players[id];const sub=room._secretLocked?.[id]||c.revealedNumbers?.[id];const isReady=c.revealIndex<0;const namePhase=c.revealPhase==='name';const numberPhase=c.revealPhase==='number';
 const doneCount=Math.max(0,c.revealIndex+(numberPhase?1:0));
 const visibleIds=order.slice(0,doneCount);
 const visibleSum=visibleIds.reduce((s,uid)=>s+(c.revealedNumbers?.[uid]?.number||0),0);
 const stage= `<section class="stage" id="reveal-stage"><span class="stage-meta">ROUND ${c.round} / GAME ${c.gameInRound}</span><span class="stage-count">${doneCount} / ${order.length} REVEALED</span>${isReady?`<span class="stage-label">READY TO REVEAL?</span><h2>全員の回答が集まりました</h2><div class="stage-big">？</div><p class="stage-note">一人ずつ、選んだ数字を発表します</p>`:namePhase?`<span class="stage-label">NEXT PLAYER</span><div class="stage-name">${esc(p?.nickname||'プレイヤー')}</div><h2>この人が選んだ数字は…</h2><div class="stage-big">？</div>`:`<span class="stage-label">NUMBER REVEALED</span><div class="stage-name">${esc(p?.nickname||'プレイヤー')}</div><div class="stage-num ${sub?.number===0?'defense':''}">${sub?.absent?'–':sub?.number===0?'🛡':sub?.number}</div><p class="stage-note">${sub?.absent?'未提出／0点':sub?.number===0?'ディフェンス：0点':sub?.prediction?`予想：${sub.prediction==='safe'?'セーフ':'アウト'}${sub.doubleMultiplier>1?` ・ ダブルアップ×${sub.doubleMultiplier}`:''}`:sub?.doubleMultiplier>1?`ダブルアップ×${sub.doubleMultiplier}`:'数字を公開しました'}</p>`}</section>`;
 const chips=visibleIds.map(uid=>`<span class="revealed-chip">${esc(room.players?.[uid]?.nickname)} <b>${c.revealedNumbers?.[uid]?.number||0}</b></span>`).join('');
 return {stage,chips,visibleSum,doneCount,allDone:doneCount>=order.length,canProceed:numberPhase&&doneCount===order.length};
}
function revealingHTML(room,student=false){const info=revealInfo(room);const c=room.current;
 return `<section id="stage-panel" class="panel" style="padding:15px"><div class="panel-heading" style="padding:7px 6px 0"><h2>🎤 1人ずつ発表！</h2>${!student?`<button class="ghost" data-action="fullscreen">${state.fullscreen?'縮小表示':'⛶ 全画面'}</button>`:''}</div>${info.stage}<div class="stage-foot"><span class="progress-row"><strong>現在の合計</strong><strong style="font-size:25px;color:${state.fullscreen?'#fff':'#6150cd'}">${info.visibleSum}</strong><span> / 上限 ${c.rules.limit}</span></span>${!student?`<button class="btn" data-action="advance-reveal">${info.canProceed?'✓ 結果を発表':c.revealIndex<0?'🎬 発表スタート':c.revealPhase==='name'?'数字をオープン →':'次の人を発表 →'}</button>`:'<span class="tiny-note">先生の発表を待っています</span>'}</div><div class="reveal-strip">${info.chips}</div></section>`;
}
function resultHTML(room){const c=room.current;const result=c.result;if(!result)return '<div class="panel">結果を計算中です…</div>';
 const sorted=Object.entries(result.scored).sort((a,b)=>b[1].points-a[1].points);
 return `<section class="panel"><div class="panel-heading"><h2>📊 ゲーム結果</h2><span class="mode-pill">RESULT</span></div><div class="stage" style="min-height:250px"><span class="stage-meta">ROUND ${c.round} / GAME ${c.gameInRound}</span><div class="stage-result ${result.status}">${statusText(result.status)}</div><div class="stage-big" style="font-size:62px">${result.sum}<span style="font-size:26px;color:#a6a1d8"> / ${c.rules.limit}</span></div><span class="stage-sub">${result.status==='safe'?'合計が上限以下！得点獲得':result.status==='over'?'上限オーバー！減点':`下限${c.rules.lowerLimit}未満！最小の数字を出した人が減点`}</span></div><div style="margin:17px 0">${currentRulePills(c.rules)}</div><div class="results-list">${sorted.map(([uid,p])=>`<div class="result-row"><div class="name">${esc(p.nickname)}${p.absent?' <span class="tiny-note">(棄権)</span>':''}</div><span class="number">${p.absent?'–':p.number}</span><strong class="delta ${p.points<0?'neg':''}">${sign(p.points)}</strong><span class="cumulative">累計 ${sign(p.totalScore)}</span></div>`).join('')}</div></section>`;}
function finishedHTML(room){const list=leaderboard(room.players||{}),first=list[0];const best=list.filter(p=>p.score===first?.score);
 return `<section class="panel"><div class="panel-heading"><h2>大会終了！</h2><span class="mode-pill">FINISHED</span></div><div class="winner"><div class="winner-crown">🏆</div><div class="stage-label">WINNER${best.length>1?'S':''}</div><div class="winner-name">${best.map(p=>esc(p.nickname)).join(' ・ ')}</div><div class="winner-score">${first?.score??0} ポイント${best.length>1?'（同点優勝）':''}</div></div><p class="tip">終了した大会は閲覧のみです。教員はCSVで成績を保存できます。</p></section>`;
}
function teacherHTML(){const r=state.room;const canSetup=['lobby','result'].includes(r.stage);
 const central=r.stage==='lobby'?lobbyHTML(r):r.stage==='collecting'?collectionHTML(r):r.stage==='revealing'?revealingHTML(r):r.stage==='result'?resultHTML(r):finishedHTML(r);
 const histCount=Object.keys(r.history||{}).length;
 const next=r.current?nextGame(r.current):null;
 return `${headerRoom(r,true)}<div class="dashboard"><div class="maincol">${central}${r.stage==='result'?`<section class="panel"><div class="panel-heading"><h2>次のゲーム</h2><span class="subheading">全${histCount}ゲーム完了</span></div><p class="muted">${next.newRound?`次は第${next.round}ラウンドです。全員の使用済み数字がリセットされます。`:`第${next.round}ラウンド・${next.gameInRound}/5ゲームへ進みます。`}</p><p class="tip">右側のルール設定を変更してから「次へ」を押してください。</p><button data-action="start-game" class="btn wide">▶ 第${next.round}R・${next.gameInRound}ゲームを開始</button><button data-action="end-tournament" class="btn critical wide" style="margin-top:10px">🏆 大会を終了する</button></section>`:''}${r.stage==='finished'?`<section class="panel"><button data-action="export-csv" class="btn wide">⬇ 結果をCSVで保存</button></section>`:''}</div>
 <aside class="sidecol">${canSetup?`<section class="panel"><div class="panel-heading"><h2>⚙ ルール設定</h2><span class="subheading">NEXT GAME</span></div>${configForm()}</section>`:`<section class="panel"><div class="panel-heading"><h2>現在のルール</h2></div>${r.current?currentRulePills(r.current.rules):''}<div class="notice" style="margin-bottom:0">ゲーム中は設定が固定されます。</div></section>`}${scoreboard(r)}<section class="panel"><h3>運営ツール</h3><button data-action="copy-room" class="btn outline wide sm">🔗 生徒用URLをコピー</button><button data-action="export-csv" class="btn outline wide sm" style="margin-top:8px">⬇ 得点履歴をCSV保存</button><p class="tiny-note">教員画面の権限は作成したブラウザに紐付きます。シークレットモードやブラウザデータ削除にご注意ください。</p></section></aside></div>`;
}
function waitingHTML(room){return `<div class="panel waiting"><div class="waiting-icon">⌛</div><h2>ゲーム開始を待っています</h2><p>先生が全員の参加を確認すると、数字を選べるようになります。</p><div class="notice ok">ルームに参加できています！参加者 ${playersArr(room).length}人</div></div>`;}
function numberSelectHTML(room){
 const p=room.players[store.uid];const rules=room.current.rules;const existing=room.submissions?.[store.uid];const gameKey=String(room.current.totalGame);
 if(ui.gameKey!==gameKey||(ui.choice===null&&existing)){ui.gameKey=gameKey;ui.choice=existing?.number??null;ui.prediction=existing?.prediction||'';ui.doubleMultiplier=existing?.doubleMultiplier||1;}
 const used=new Set(Object.keys(p.usedNumbers||{}).map(k=>Number(k.slice(1))));
 return `<div class="panel"><div class="panel-heading"><h2>数字を選ぼう</h2><span class="mode-pill">GAME ${room.current.gameInRound}/5</span></div><div class="stats"><div class="stat"><label>今回の上限</label><strong>${rules.limit}</strong></div><div class="stat"><label>現在の得点</label><strong>${sign(p.score||0)}</strong></div><div class="stat"><label>使用済み</label><strong>${used.size}<span class="unit"> / 10</span></strong></div></div>${currentRulePills(rules)}<p class="subheading" style="margin-top:21px">YOUR NUMBER / 1〜10</p><div class="number-grid">${Array.from({length:10},(_,i)=>i+1).map(num=>`<button data-action="choose-number" data-value="${num}" class="number-choice ${used.has(num)?'used':''} ${ui.choice===num?'selected':''}" ${used.has(num)?'disabled':''}>${num}</button>`).join('')}</div>${rules.defense?`<button data-action="choose-number" data-value="0" class="choice-button ${ui.choice===0?'active':''}" style="width:100%;margin-bottom:13px">🛡 ディフェンスする（0点・カード消費なし）</button>`:''}
 ${rules.prediction?`<div class="rule-box"><h3>🔮 セーフ・アウト予想 <span class="tiny-note">必須</span></h3><div class="prediction-row"><button class="choice-button ${ui.prediction==='safe'?'active':''}" data-action="choose-prediction" data-value="safe">✅ セーフを予想</button><button class="choice-button ${ui.prediction==='out'?'active':''}" data-action="choose-prediction" data-value="out">❌ アウトを予想</button></div><p class="tip">下限未満もアウトです。ディフェンス中は予想による得失点なし。</p></div>`:''}
 ${rules.doubleUp?`<div class="rule-box"><h3>🚀 ダブルアップ <span class="tiny-note">大会中1度のみ使用可能</span></h3>${p.usedDouble?'<div class="notice">使用済みのため選択できません。</div>':`<div class="multiplier-row">${[1,2,3,4,5].map(k=>`<button data-action="choose-double" data-value="${k}" class="choice-button ${Number(ui.doubleMultiplier)===k?'active':''}">${k===1?'使用しない':`×${k}`}</button>`).join('')}</div>`}</div>`:''}
 ${existing?`<div class="notice ok">✓ 提出済みです。締め切りまでは変更できます。</div>`:''}<button data-action="submit-choice" class="btn wide" ${ui.choice===null||rules.prediction&&!ui.prediction?'disabled':''}>${existing?'✓ 選択を更新する':'この数字で提出する →'}</button><p class="tip">同じ数字は5ゲームの間に1度しか使えません。第${room.current.round+1}ラウンドでリセットされます。</p></div>`;
}
function submittedWaitHTML(room){return `<section class="panel waiting"><div class="waiting-icon">✓</div><h2>提出ありがとうございます！</h2><p>先生が発表を始めるまでお待ちください。</p></section>`;}
function studentHTML(){const room=state.room,p=room.players[store.uid];const done=room.stage==='finished';const first=room.current;
 return `<div class="student-dashboard">${headerRoom(room,false)}<section class="panel" style="padding:17px 20px"><div class="panel-heading" style="margin:0"><div><span class="subheading">あなたのニックネーム</span><div style="font-weight:900;font-size:19px">${esc(p.nickname)}</div></div><div style="text-align:right"><span class="subheading">TOTAL SCORE</span><div style="font-weight:950;font-size:24px;color:#6256d9">${sign(p.score||0)} <small style="font-size:12px">pt</small></div></div></div></section>
 ${room.stage==='lobby'?waitingHTML(room):room.stage==='collecting'?numberSelectHTML(room):room.stage==='revealing'?revealingHTML(room,true):room.stage==='result'?resultHTML(room):finishedHTML(room)}${scoreboard(room)}${done?'<p class="tip">大会お疲れさまでした！</p>':''}</div>`;
}
function makeRoom(){
 const room={ teacherUid: store.uid,createdAt:Date.now(),stage:'lobby',playerCount:0,settings:{...INITIAL_RULES},players:{},submissions:{},history:{}};
 return room;
}
const randomRoomCode=()=>{
 const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const arr=new Uint8Array(8);crypto.getRandomValues(arr);
 return [...arr].map(x=>chars[x%chars.length]).join('');
};
async function newRoom(){
 state.loading=true;
 try{
  let code;
  for(let i=0;i<10;i++){const attempt=randomRoomCode();if(!(await store.exists(attempt))){code=attempt;break;}}
  if(!code)throw new Error('ルームコードを発行できません。');
  await store.create(code,makeRoom());
  ui.draftRules={...INITIAL_RULES};localStorage.setItem('gn_last_teacher',code);openRoom(code,'teacher');
  tell('新しいルームを作成しました');
 }finally{state.loading=false;}
}
function openRoom(code,role){
 unsubscribe();unsubscribe=()=>{};
 state.code=code;state.room=null;state.error='';state.route=role;
 history.replaceState(null,'',`${location.pathname}?${role==='teacher'?'teacher':'join'}=${encodeURIComponent(code)}`);
 unsubscribe=store.subscribe(code,role==='teacher',(data,error)=>{
  if(error){state.error=error.message;state.route='join';render();return;}
  if(!data){state.error='そのルームは存在しないか、閲覧する権限がありません。';state.route='join';render();return;}
  state.room=data;
  if((role==='student'||role==='join') && data.players?.[store.uid])state.route='student';
  render();
 });
 render();
}
function joinCode(code){
 const normalized=String(code||'').trim().toUpperCase();
 if(!/^[A-Z2-9]{8}$/.test(normalized))throw new Error('8文字のルームコードを入力してください。');
 state.route='join';openRoom(normalized,'join');
}
function parseRules(){
 const form=document.querySelector('#rules-form');
 if(!form)return ui.draftRules;
 const f=new FormData(form);
 ui.draftRules={
  limit:n(f.get('limit'),0),lowerLimit:n(f.get('lowerLimit'),ui.draftRules.lowerLimit),
  bonusMultiplier:n(f.get('bonusMultiplier'),ui.draftRules.bonusMultiplier),
  ...Object.fromEntries(Object.keys(RULE_NAMES).map(key=>[key,f.has(key)])),
 };
 return ui.draftRules;
}
async function beginGame(){
 const source=parseRules();
 if(!validRules(source))throw new Error('下限は上限より小さくしてください。');
 if(!Number.isInteger(Number(source.limit))||source.limit<1||source.limit>160)throw new Error('上限は1〜160の整数にしてください。');
 const rules=normalizeRules(source);
 const count=playersArr(state.room).length;
 if(count===0)throw new Error('先に生徒の参加を待ってください。');
 if(count<4&&!await confirmAction('参加者が4人未満ですが、開始しますか？'))return;
 await store.mutate(state.code,room=>{
  if(!['lobby','result'].includes(room.stage))return;
  const next=room.current?nextGame(room.current):{round:1,gameInRound:1,totalGame:1,newRound:false};
  if(next.newRound)Object.values(room.players||{}).forEach(p=>{p.usedNumbers={};});
  room.current={round:next.round,gameInRound:next.gameInRound,totalGame:next.totalGame,rules,revealOrder:[],revealIndex:-1,revealPhase:'ready'};
  room.settings=rules;room.stage='collecting';return room;
 });
 tell('数字の受付を開始しました');
}
const shuffle=list=>{
 const result=[...list];
 for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
 return result;
};
async function closeSubmissions(){
 const members=playersArr(state.room);const submitted=members.filter(([id])=>state.room.submissions?.[id]).length;
 if(submitted<members.length && !await confirmAction(`未提出者が${members.length-submitted}人います。0点（棄権）として締め切りますか？`))return;
 const locked={};
 for(const [id,p] of members)locked[id]=safeSubmission(state.room.submissions?.[id],state.room.current.rules,p);
 state.room._secretLocked=locked;
 await store.lock(state.code,locked);
 await store.mutate(state.code,room=>{
  if(room.stage!=='collecting')return;
  room.current.revealOrder=shuffle(playersArr(room).map(([id])=>id));
  room.current.revealIndex=-1;room.current.revealPhase='ready';room.current.revealedNumbers={};room.stage='revealing';return room;
 });
}
async function revealAdvance(){
 if(!state.room?._secretLocked || Object.keys(state.room._secretLocked).length!==playersArr(state.room).length)throw new Error('確定回答の読み込みを待ってから発表してください。');
 await store.mutate(state.code,room=>{
  if(room.stage!=='revealing')return;
  const c=room.current, count=c.revealOrder.length;
  if(c.revealIndex<0){c.revealIndex=0;c.revealPhase='name';}
  else if(c.revealPhase==='name'){c.revealPhase='number';c.revealedNumbers ||= {};const uid=c.revealOrder[c.revealIndex];c.revealedNumbers[uid]=state.room?._secretLocked?.[uid]||{number:0,absent:true};}
  else if(c.revealIndex<count-1){c.revealIndex+=1;c.revealPhase='name';}
  else{
   const result=calculateGame(room.players,state.room?._secretLocked,c.rules);
   for(const [id,scored] of Object.entries(result.scored)){
    const p=room.players[id];if(!p)continue;
    p.score=n(p.score)+scored.points;
    if(scored.number>0&&!scored.absent){p.usedNumbers ||= {};p.usedNumbers[`n${scored.number}`]=true;}
    if(scored.doubleMultiplier>1&&!scored.absent)p.usedDouble=true;
   }
   c.result=result;room.history ||= {};
   room.history[`g${c.totalGame}`]={round:c.round,gameInRound:c.gameInRound,totalGame:c.totalGame,result,finishedAt:Date.now()};
   room.stage='result';state.fullscreen=false;
  }
  return room;
 });
}
async function submitChoice(){
 const p=state.room.players?.[store.uid],r=state.room.current?.rules;
 if(!p||!r||state.room.stage!=='collecting')return;
 const num=ui.choice;
 if(!Number.isInteger(num)||num<0||num>10||num===0&&!r.defense||num>0&&!availableNumbers(p).includes(num))throw new Error('使用可能な数字を選んでください。');
 if(r.prediction&&!['safe','out'].includes(ui.prediction))throw new Error('セーフかアウトを予想してください。');
 const multiplier=r.doubleUp&&!p.usedDouble?Number(ui.doubleMultiplier):1;
 if(![1,2,3,4,5].includes(multiplier))throw new Error('倍率を選び直してください。');
 await store.submit(state.code,{game:state.room.current.totalGame,number:num,prediction:r.prediction?ui.prediction:'',doubleMultiplier:multiplier});
 tell('提出しました！締め切りまで変更できます。');
}
async function joinPlayer(nickname){
 if(!state.room)throw new Error('ルームを読み込めませんでした。');
 if(state.room.stage!=='lobby')throw new Error('受付は終了しています。');
 if(playersArr(state.room).length>=16)throw new Error('このルームは満員（16人）です。');
 const name=nickname.trim();
 if(!name||name.length>16)throw new Error('ニックネームは1〜16文字で入力してください。');
 if(playersArr(state.room).some(([,p])=>p.nickname.toLowerCase()===name.toLowerCase()))throw new Error('そのニックネームは使われています。別の名前をお願いします。');
 await store.join(state.code,{nickname:name,joinedAt:Date.now(),score:0,usedDouble:false,usedNumbers:{}});
 state.route='student';render();tell('ルームに参加しました！');
}
async function removePlayer(uid){
 const p=state.room?.players?.[uid];if(!p)return;
 if(!await confirmAction(`「${p.nickname}」をルームから削除しますか？`))return;
 await store.mutate(state.code,room=>{if(room.stage!=='lobby')return;delete room.players[uid];room.playerCount=Object.keys(room.players).length;return room;});
}
async function endTournament(){
 if(!await confirmAction('大会を終了して優勝者を発表しますか？終了後は再開できません。'))return;
 await store.mutate(state.code,room=>{if(room.stage!=='result')return;room.stage='finished';return room;});
}
function exportCSV(){
 const room=state.room,history=Object.values(room.history||{}).sort((a,b)=>a.totalGame-b.totalGame);
 const quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
 const rows=[['ゲーム通算','ラウンド','ゲーム','名前','選択数字','予想','ダブルアップ','ゲーム得点','累計得点','判定','全員合計','上限','下限']];
 for(const g of history){for(const [,p] of Object.entries(g.result.scored||{}))rows.push([g.totalGame,g.round,g.gameInRound,p.nickname,p.absent?'棄権':p.number,p.prediction==='safe'?'セーフ':p.prediction==='out'?'アウト':'',p.doubleMultiplier,p.points,p.totalScore,g.result.status,g.result.sum,g.result.rules.limit,g.result.rules.safeZone?g.result.rules.lowerLimit:'']);}
 const csv='\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
 const a=document.createElement('a');a.href=url;a.download=`girigiri_${state.code}_results.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);tell('得点履歴を保存しました');
}
async function onAction(action, node){
 switch(action){
  case 'home':toHome();break;
  case 'create-room':await newRoom();break;
  case 'restore-teacher':{const c=localStorage.getItem('gn_last_teacher');if(c)openRoom(c,'teacher');break;}
  case 'copy-room':await copyText(`${location.origin}${location.pathname}?join=${encodeURIComponent(state.code)}`);break;
  case 'start-game':await beginGame();break;
  case 'close-submissions':await closeSubmissions();break;
  case 'advance-reveal':await revealAdvance();break;
  case 'remove-player':await removePlayer(node.dataset.uid);break;
  case 'end-tournament':await endTournament();break;
  case 'export-csv':exportCSV();break;
  case 'fullscreen':state.fullscreen=!state.fullscreen;render();break;
  case 'choose-number':ui.choice=Number(node.dataset.value);render();break;
  case 'choose-prediction':ui.prediction=node.dataset.value;render();break;
  case 'choose-double':ui.doubleMultiplier=Number(node.dataset.value);render();break;
  case 'submit-choice':await submitChoice();break;
 }
}
app.addEventListener('click',async e=>{
 const node=e.target.closest('[data-action]');if(!node)return;
 e.preventDefault();
 try{await onAction(node.dataset.action,node);}catch(err){console.error(err);tell(`エラー：${err.message||err}`);}
});
app.addEventListener('submit',async e=>{
 e.preventDefault();
 const form=e.target;
 try{
  if(form.id==='join-code-form'){joinCode(new FormData(form).get('code'));return;}
  if(form.id==='join-player-form'){await joinPlayer(String(new FormData(form).get('nickname')||''));return;}
 }catch(err){console.error(err);tell(`エラー：${err.message||err}`);}
});
app.addEventListener('input', e=>{
 if(e.target.closest('#rules-form'))parseRules();
});
app.addEventListener('change', e=>{
 if(e.target.closest('#rules-form')){
  parseRules();
  if(e.target.hasAttribute('data-rules-toggle'))render();
 }
});
(async()=>{
 try{
  store=await createStore();
  const params=new URLSearchParams(location.search),teacher=params.get('teacher'),join=params.get('join');
  if(teacher&&/^[A-Z2-9]{8}$/.test(teacher))openRoom(teacher,'teacher');
  else if(join&&/^[A-Z2-9]{8}$/.test(join))openRoom(join,'join');
  else render();
 }catch(error){
  console.error(error);
  app.innerHTML=`<div class="shell"><div class="panel" style="margin:10vh auto;max-width:620px"><h2>Firebaseへの接続に失敗しました</h2><p>${esc(error.message)}</p><p class="tip">設定・Anonymous Authentication・Realtime Database の URL とルールをご確認ください。接続が復旧してから再読み込みしてください。</p><button class="btn" onclick="location.reload()">再読み込み</button></div></div>`;
 }
})();
