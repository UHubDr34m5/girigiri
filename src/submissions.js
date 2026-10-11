// 遅れて届いた回答や前ゲームの回答を、今回の提出として扱わない。
export function currentSubmissions(room, submissions = {}) {
  const game = room?.current?.totalGame;
  if (!Number.isInteger(game)) return {};
  return Object.fromEntries(Object.entries(submissions || {}).filter(([uid, submission]) =>
    room.players?.[uid] && submission?.game === game
  ));
}
