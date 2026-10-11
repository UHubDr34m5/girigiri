// 教員・生徒の公開状態と、発表前の非公開回答を分離します。
import { currentSubmissions } from './submissions.js?v=20261011-live1';
import { restoreOrSignIn } from './auth.js?v=20261011-live2';
const SDK = '11.10.0';
export const isConfigured = () => {
  const c=window.GIRIGIRI_FIREBASE_CONFIG||{};
  return ['apiKey','authDomain','databaseURL','projectId','appId'].every(k=>typeof c[k]==='string'&&c[k].trim()&&!c[k].includes('YOUR_'));
};
export async function createStore(){
 if(!isConfigured())throw new Error('オンライン接続の設定がありません。管理者にお問い合わせください。');
 const appSDK=await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`);
 const authSDK=await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`);
 const dbSDK=await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-database.js`);
 const app=appSDK.initializeApp(window.GIRIGIRI_FIREBASE_CONFIG);
 const auth=authSDK.getAuth(app),database=dbSDK.getDatabase(app);
 const user=await restoreOrSignIn(auth,authSDK.signInAnonymously);
 const path=(branch,code,id='')=>dbSDK.ref(database,`${branch}/${code}${id?'/'+id:''}`);
 return {
  uid:user.uid,
  async exists(code){return (await dbSDK.get(path('rooms',code))).exists();},
  // room: 公開状態 / privateSubmissions: 現在の回答 / privateLocked: 確定回答
  subscribe(code,asTeacher,fn){
   let publicRoom=null,privateSubs={},secretLocked=null;
   let hasRoom=false;
   const notify=()=>{
    if(!hasRoom)return;
    if(!publicRoom){fn(null);return;}
    const room={...publicRoom,submissions:currentSubmissions(publicRoom,asTeacher?privateSubs:(privateSubs?{[user.uid]:privateSubs}:{}))};
    if(asTeacher)room._secretLocked=secretLocked;
    fn(room);
   };
   const watch=(branch,id,cb)=>dbSDK.onValue(path(branch,code,id),ss=>{cb(ss.val());notify();},err=>fn(null,err));
   const unsub=[watch('rooms','',v=>{hasRoom=true;publicRoom=v;})];
   if(asTeacher){
    unsub.push(watch('privateSubmissions','',v=>{privateSubs=v||{};}));
    unsub.push(watch('privateLocked','',v=>{secretLocked=v||null;}));
   }else{
    unsub.push(watch('privateSubmissions',user.uid,v=>{privateSubs=v||null;}));
   }
   return ()=>unsub.forEach(f=>f());
  },
  async create(code,room){await dbSDK.set(path('rooms',code),room);},
  async mutate(code,recipe){
   const res=await dbSDK.runTransaction(path('rooms',code),old=>{
    if(!old||old.teacherUid!==user.uid)return;
    return recipe(old)||undefined;
   },{applyLocally:false});
   if(!res.committed)throw new Error('更新できませんでした。教員用の端末か確認してください。');
   return res.snapshot.val();
  },
  async join(code,player){
   for(let attempt=0;attempt<16;attempt++){
    const room=(await dbSDK.get(path('rooms',code))).val();
    if(!room)throw new Error('ルームが見つかりません。');
    if(room.players?.[user.uid])return;
    if(room.stage!=='lobby')throw new Error('受付は終了しています。');
    if(room.playerCount>=16)throw new Error('このルームは満員（16人）です。');
    try{
     await dbSDK.update(path('rooms',code),{[`players/${user.uid}`]:player,playerCount:room.playerCount+1});
     return;
    }catch(error){
     const latest=(await dbSDK.get(path('rooms',code))).val();
     if(latest?.playerCount===room.playerCount)throw error;
    }
   }
   throw new Error('参加が集中しています。もう一度お試しください。');
  },
  async submit(code,value){await dbSDK.set(path('privateSubmissions',code,user.uid),value);},
  async lock(code,locked){await dbSDK.set(path('privateLocked',code),locked);},
 };
}
