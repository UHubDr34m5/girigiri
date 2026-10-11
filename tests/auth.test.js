import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreOrSignIn } from '../src/auth.js';

test('保存された認証の復元を待ち、教員IDを作り直さない', async () => {
  const saved = {uid:'teacher'};
  const auth = {currentUser:null, async authStateReady(){this.currentUser=saved;}};
  const user = await restoreOrSignIn(auth, () => assert.fail('must not create a new user'));
  assert.equal(user, saved);
});
test('一時的な通信失敗の後に自動で接続できる', async () => {
  let calls=0; const delays=[];
  const user=await restoreOrSignIn({async authStateReady(){}}, async () => {
    if(++calls===1)throw {code:'auth/network-request-failed'};
    return {user:{uid:'student'}};
  },async ms=>delays.push(ms));
  assert.equal(user.uid,'student'); assert.equal(calls,2); assert.deepEqual(delays,[1000]);
});
test('設定エラーは再試行せず、通信失敗も3回で終了する', async () => {
  for(const code of ['auth/operation-not-allowed','auth/network-request-failed']){
    let calls=0;
    await assert.rejects(restoreOrSignIn({async authStateReady(){}},async()=>{
      calls++; throw Object.assign(new Error(code),{code});
    },async()=>{}),{code});
    assert.equal(calls,code==='auth/network-request-failed'?3:1);
  }
});
