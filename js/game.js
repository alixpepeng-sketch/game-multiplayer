// ALYZ MULTIPLAYER - logika game & operasi room (semua lewat transaction Realtime DB)
import { ref, runTransaction } from 'firebase/database';
import { db, ROOM_PREFIX } from './firebase-config.js';
import { QUESTIONS } from './questions.js';

export const NAME = 'ALYZ MULTIPLAYER';
export const TURN_MS = 15000;
export const PER_MATCH = 10;
const rooms = c => ref(db, `rooms/${c}`);
const rnd = n => Math.floor(Math.random() * n);
const ids = r => Object.keys(r.players || {});
const other = (r, uid) => ids(r).find(k => k !== uid) || uid;

export function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function pickQuestions() {
  return shuffle(QUESTIONS).slice(0, PER_MATCH).map(({ q, a }) => ({ q, a }));
}
export function scramble(ans) {
  const L = ans.split(''), A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  while (L.length < 12) L.push(A[rnd(26)]);
  return shuffle(L);
}
export function makeCode() {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return ROOM_PREFIX + Array.from({ length: 6 }, () => A[rnd(26)]).join('');
}

function ev(r, type, uid, extra = {}) { return { type, seq: (r.event?.seq || 0) + 1, uid: uid || null, ...extra }; }

function startMatch(r, now) {
  const list = ids(r), ql = pickQuestions();
  r.status = 'playing'; r.questionList = ql; r.currentQuestionIndex = 0;
  r.scrambled = scramble(ql[0].a); r.picked = null;
  r.scores = Object.fromEntries(list.map(i => [i, 0]));
  r.currentTurn = list.includes(r.host) ? r.host : list[0];
  r.turnId = (r.turnId || 0) + 1; r.turnStart = now;
  r.finished = false; r.winner = null; r.winnerName = null; r.matchId = now;
  r.event = ev(r, 'start');
  return r;
}
function finishWith(r, w) {
  r.status = 'finished'; r.finished = true; r.winner = w;
  r.winnerName = r.players[w]?.username || '-'; r.picked = null;
  return r;
}
function finishByScore(r, lastUid) {
  const [a, b] = ids(r), sa = r.scores[a] || 0, sb = r.scores[b] || 0;
  // seri: pemenang adalah yang menjawab soal terakhir
  return finishWith(r, sa === sb ? lastUid : (sa > sb ? a : b));
}

export async function createRoom(user, now) {
  for (let k = 0; k < 6; k++) {
    const code = makeCode();
    const res = await runTransaction(rooms(code), cur => cur === null ? {
      name: NAME, status: 'waiting', host: user.uid,
      players: { [user.uid]: { username: user.username, photo: user.photo || '' } },
      createdAt: now, currentQuestionIndex: 0, finished: false, event: { type: 'create', seq: 0 }
    } : undefined);
    if (res.committed) return code;
  }
  throw new Error('Gagal membuat room');
}

export async function joinRoom(code, user, now) {
  const res = await runTransaction(rooms(code), r => {
    if (r === null) return r;
    if (r.players && r.players[user.uid]) return r;
    if (r.status !== 'waiting' || ids(r).length >= 2) return;
    r.players[user.uid] = { username: user.username, photo: user.photo || '' };
    return startMatch(r, now);
  });
  if (res.committed && res.snapshot.exists()) return { ok: true };
  return { error: res.snapshot.exists() ? 'full' : 'notfound' };
}

export function pickLetter(code, uid, idx, now) {
  return runTransaction(rooms(code), r => {
    if (r === null) return r;
    if (r.status !== 'playing' || r.currentTurn !== uid) return;
    const q = r.questionList[r.currentQuestionIndex];
    const picked = r.picked || [];
    if (!q || picked.includes(idx) || idx < 0 || idx >= r.scrambled.length) return;
    const letter = r.scrambled[idx], pos = picked.length;
    if (letter !== q.a[pos]) { // huruf salah: reset board, acak ulang, ganti giliran
      r.event = ev(r, 'wrong', uid, { slot: pos, letter });
      r.picked = null; r.scrambled = scramble(q.a);
      r.currentTurn = other(r, uid);
      r.turnId = (r.turnId || 0) + 1; r.turnStart = now;
      return r;
    }
    picked.push(idx); r.picked = picked;
    if (picked.length < q.a.length) return r;
    r.scores[uid] = (r.scores[uid] || 0) + 10; // soal selesai: giliran tetap pemenang
    r.event = ev(r, 'correct', uid); r.picked = null; r.currentQuestionIndex++;
    if (r.currentQuestionIndex >= r.questionList.length) return finishByScore(r, uid);
    r.scrambled = scramble(r.questionList[r.currentQuestionIndex].a);
    r.turnId = (r.turnId || 0) + 1; r.turnStart = now;
    return r;
  });
}

export function passTurn(code, turnId, now) {
  return runTransaction(rooms(code), r => {
    if (r === null) return r;
    if (r.status !== 'playing' || r.turnId !== turnId) return;
    const q = r.questionList[r.currentQuestionIndex];
    r.event = ev(r, 'timeout', r.currentTurn);
    r.picked = null; r.scrambled = scramble(q.a);
    r.currentTurn = other(r, r.currentTurn);
    r.turnId = turnId + 1; r.turnStart = now;
    return r;
  });
}

export function forfeit(code, uid) {
  return runTransaction(rooms(code), r => {
    if (r === null) return r;
    if (r.status !== 'playing' || ids(r).length >= 2 || !r.players[uid]) return;
    r.event = ev(r, 'forfeit', uid);
    return finishWith(r, uid);
  });
}

export function restartRoom(code, now) {
  return runTransaction(rooms(code), r => {
    if (r === null) return r;
    if (r.status !== 'finished') return;
    if (ids(r).length >= 2) return startMatch(r, now);
    r.status = 'waiting'; r.questionList = null; r.picked = null; r.scrambled = null;
    r.scores = null; r.winner = null; r.winnerName = null; r.finished = false;
    r.currentQuestionIndex = 0; r.event = ev(r, 'reset');
    return r;
  });
}

export function leaveRoom(code, uid) {
  return runTransaction(rooms(code), r => {
    if (r === null) return r;
    if (r.players) delete r.players[uid];
    const left = ids(r);
    if (!left.length) return null;
    r.host = left[0];
    return r;
  });
}
