// 教員・生徒の公開状態と、発表前の非公開回答を分離します。
const SDK = '11.10.0';
export const isConfigured = () => {
  const c=window.GIRIGIRI_FIREBASE_CONFIG||{};
  return ['apiKey','authDomain','databaseURL','projectId','appId'].every(k=>typeof c[k]==='string'&&c[k].trim()&&!c[k].includes('YOUR_'));
};
const rnd=()=>Math.random().toString(36).slice(2,10);
export async function createStore(){
 if(!isConfigured())return new DemoStore();
 const appSDK=await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`);
 const authSDK=await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`);
 const dbSDK=await import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-database.js`);
 const app=appSDK.initializeApp(window.GIRIGIRI_FIREBASE_CONFIG);
 const auth=authSDK.getAuth(app),database=dbSDK.getDatabase(app);
 const user=auth.currentUser||(await authSDK.signInAnonymously(auth)).user;
 const path=(branch,code,id='')=>dbSDK.ref(database,`${branch}/${code}${id?'/'+id:''}`);
 return {
  demo:false,uid:user.uid,
  async exists(code){return (await dbSDK.get(path('rooms',code))).exists();},
  // room: 公開状態 / privateSubmissions: 現在の回答 / privateLocked: 確定回答
  subscribe(code,asTeacher,fn){
   let publicRoom=null,privateSubs={},secretLocked=null;
   let hasRoom=false;
   const notify=()=>{
    if(!hasRoom)return;
    if(!publicRoom){fn(null);return;}
    const room={...publicRoom,submissions:asTeacher?privateSubs:(privateSubs?{[user.uid]:privateSubs}:{})};
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
  async join(code,player){await dbSDK.set(path('rooms',code,`players/${user.uid}`),player);},
  async submit(code,value){await dbSDK.set(path('privateSubmissions',code,user.uid),value);},
  async lock(code,locked){await dbSDK.set(path('privateLocked',code),locked);},
 };
}
class DemoStore{
 constructor(){this.demo=true;this.uid=sessionStorage.getItem('gn_demo_uid')||`demo-${rnd()}`;sessionStorage.setItem('gn_demo_uid',this.uid);}
 key(code){return `gn_room_${code}`;}
 read(code){try{return JSON.parse(localStorage.getItem(this.key(code)))||null;}catch{return null;}}
 write(code,room){localStorage.setItem(this.key(code),JSON.stringify(room));window.dispatchEvent(new CustomEvent('gn-room-updated',{detail:code}));}
 async exists(code){return !!this.read(code);}
 subscribe(code,_asTeacher,fn){
  const handler=e=>{if(e.type==='storage'?e.key===this.key(code):e.detail===code)fn(this.read(code));};
  window.addEventListener('storage',handler);window.addEventListener('gn-room-updated',handler);fn(this.read(code));
  return ()=>{window.removeEventListener('storage',handler);window.removeEventListener('gn-room-updated',handler);};
 }
 async create(code,room){this.write(code,room);}
 async mutate(code,fn){const room=this.read(code);if(!room)throw new Error('ルームが見つかりません。');const next=fn(room);if(!next)throw new Error('ルームを更新できませんでした。');this.write(code,next);return next;}
 async join(code,p){const room=this.read(code);if(!room)throw new Error('ルームが見つかりません。');room.players||={};room.players[this.uid]=p;this.write(code,room);}
 async submit(code,value){const room=this.read(code);if(!room)throw new Error('ルームが見つかりません。');room.submissions||={};room.submissions[this.uid]=value;this.write(code,room);}
 async lock(code,value){const room=this.read(code);if(!room)throw new Error('ルームが見つかりません。');room._secretLocked=value;this.write(code,room);}
}
