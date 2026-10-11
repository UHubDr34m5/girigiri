import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSubmissions } from '../src/submissions.js';
import { calculateGame, INITIAL_RULES } from '../src/engine.js';

const players = {a: {nickname:'A', score:0}, b: {nickname:'B', score:0}};
test('ゲームが切り替わると前回の回答は未提出になり、得点にも入らない', () => {
  const room = {players, current:{totalGame:2}};
  const submissions = currentSubmissions(room, {
    a:{game:1, number:9}, b:{game:2, number:3},
  });
  assert.deepEqual(Object.keys(submissions), ['b']);
  const result = calculateGame(players, submissions, INITIAL_RULES);
  assert.equal(result.scored.a.absent, true);
  assert.equal(result.sum, 3);
});
test('受付前・削除済み参加者・ゲーム番号のない旧回答は対象外', () => {
  assert.deepEqual(currentSubmissions({players}, {a:{game:1, number:5}}), {});
  assert.deepEqual(currentSubmissions({players, current:{totalGame:1}}, {
    a:{number:5}, removed:{game:1, number:10},
  }), {});
});
