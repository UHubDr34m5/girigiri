// 保存済みの教員・生徒IDを復元し、一時的な通信エラーだけ再試行する。
export async function restoreOrSignIn(auth, signIn, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  for (let attempt = 0; ; attempt++) {
    try {
      return (await signIn(auth)).user;
    } catch (error) {
      if (error.code !== 'auth/network-request-failed' || attempt >= 2) throw error;
      await wait(1000 * (attempt + 1));
      if (auth.currentUser) return auth.currentUser;
    }
  }
}
