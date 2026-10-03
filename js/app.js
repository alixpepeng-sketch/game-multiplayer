// ALYZ MULTIPLAYER - UI, auth, lobby, realtime render
import { auth, db, isConfigured, ROOM_PREFIX } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, get, set, onValue, onDisconnect } from 'firebase/database';
import * as G from './game.js';

const $ = s => document.querySelector(s);
const S = { user: null, profile: null, code: null, room: null, unsub: null, offset: 0,
  fired: -1, shown: [], flash: null, lastSeq: null, slotKey: '', lettersKey: '', result: false };
const now = () => Date.now() + S.offset;
const me = () => S.user.uid;
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

onValue(ref(db, '.info/serverTimeOffset'), s => { S.offset = s.val() || 0; });

/* ---------- util UI ---------- */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  hideModals();
}
function hideModals() { $('#win-modal').classList.remove('show'); $('#lose-modal').classList.remove('show'); }
let toastT;
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 2200); }

document.addEventListener('pointerdown', e => { // ripple + haptic
  const b = e.target.closest('.btn,.bubble,.chip'); if (!b || b.disabled) return;
  navigator.vibrate?.(20);
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.6, s = mk('span', 'ripple');
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s); setTimeout(() => s.remove(), 650);
});

/* ---------- confetti liquid ---------- */
const cv = $('#fx'), cx = cv.getContext('2d'); let ps = [], raf = 0;
function fit() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
addEventListener('resize', fit); fit();
function burst(n = 40, big = false) {
  const col = ['#FFB6E6', '#A7E8FF', '#C3B1FF', '#ffffff', '#ff8fd6'], k = devicePixelRatio;
  for (let i = 0; i < n; i++) ps.push({ x: cv.width / 2 + (Math.random() - .5) * cv.width * (big ? .6 : .2), y: cv.height * (big ? .35 : .55),
    vx: (Math.random() - .5) * (big ? 16 : 10) * k, vy: (-Math.random() * (big ? 16 : 11) - 3) * k, r: (4 + Math.random() * 8) * k,
    s: .6 + Math.random() * .8, c: col[i % col.length], a: 1, rot: Math.random() * 6 });
  if (!raf) loop();
}
function loop() {
  cx.clearRect(0, 0, cv.width, cv.height);
  ps = ps.filter(p => p.a > .02 && p.y < cv.height + 40);
  for (const p of ps) {
    p.vy += .35 * devicePixelRatio; p.x += p.vx; p.y += p.vy; p.vx *= .99; p.a -= .008; p.rot += .08;
    cx.save(); cx.globalAlpha = Math.max(p.a, 0); cx.translate(p.x, p.y); cx.rotate(p.rot);
    cx.fillStyle = p.c; cx.beginPath(); cx.ellipse(0, 0, p.r, p.r * p.s, 0, 0, 7); cx.fill(); cx.restore();
  }
  raf = ps.length ? requestAnimationFrame(loop) : 0;
  if (!raf) cx.clearRect(0, 0, cv.width, cv.height);
}

/* ---------- auth ---------- */
if (!isConfigured) toast('Isi firebaseConfig di js/firebase-config.js dulu');
$('#btn-google').onclick = async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { toast('Login gagal: ' + (e.code || e.message)); }
};
onAuthStateChanged(auth, async u => {
  S.user = u;
  if (!u) { cleanupRoom(); $('#me-pill').classList.add('hidden'); return show('auth-screen'); }
  try {
    const s = await get(ref(db, `users/${u.uid}`));
    if (!s.exists()) return show('username-screen');
    S.profile = s.val(); enterLobby();
  } catch (e) { toast('Gagal memuat profil: ' + (e.code || e.message)); }
});
async function saveUsername() {
  const v = $('#username-input').value.trim(), err = $('#username-err');
  if (v.length < 3 || v.length > 12) { err.textContent = 'Username harus 3 sampai 12 karakter.'; return; }
  err.textContent = '';
  try {
    S.profile = { username: v, photo: S.user.photoURL || '', createdAt: Date.now() };
    await set(ref(db, `users/${me()}`), S.profile); enterLobby();
  } catch (e) { err.textContent = 'Gagal menyimpan: ' + (e.code || e.message); }
}
$('#btn-username').onclick = saveUsername;
$('#username-input').onkeydown = e => e.key === 'Enter' && saveUsername();
$('#btn-logout').onclick = () => signOut(auth);

/* ---------- lobby ---------- */
const player = () => ({ uid: me(), username: S.profile.username, photo: S.profile.photo });
function enterLobby() {
  const p = $('#me-pill'); p.replaceChildren(avatar(S.profile), mk('b', '', S.profile.username)); p.classList.remove('hidden');
  $('#lobby-hello').textContent = `Halo, ${S.profile.username}. Buat room baru atau gabung dengan kode.`;
  $('#lobby-err').textContent = ''; show('lobby-screen');
}
$('#btn-create').onclick = async () => {
  try { enterRoom(await G.createRoom(player(), now())); }
  catch (e) { $('#lobby-err').textContent = 'Gagal membuat room: ' + (e.code || e.message); }
};
async function join() {
  let v = $('#join-input').value.trim().toUpperCase().replace(/\s/g, '');
  if (!v.startsWith(ROOM_PREFIX)) v = ROOM_PREFIX + v;
  const err = $('#lobby-err');
  if (!/^ALYZ-[A-Z]{6}$/.test(v)) { err.textContent = 'Kode harus berformat ALYZ-ABCDEF.'; return; }
  try {
    const r = await G.joinRoom(v, player(), now());
    if (r.ok) { err.textContent = ''; enterRoom(v); }
    else err.textContent = r.error === 'full' ? 'Room penuh atau game sudah berjalan.' : 'Room tidak ditemukan.';
  } catch (e) { err.textContent = 'Gagal join: ' + (e.code || e.message); }
}
$('#btn-join').onclick = join;
$('#join-input').onkeydown = e => e.key === 'Enter' && join();

/* ---------- room ---------- */
function enterRoom(code) {
  cleanupRoom(); S.code = code; S.lastSeq = null; S.result = false; S.slotKey = ''; S.lettersKey = ''; S.shown = []; S.flash = null;
  onDisconnect(ref(db, `rooms/${code}/players/${me()}`)).remove();
  S.unsub = onValue(ref(db, `rooms/${code}`), s => onRoom(s.val()));
  $('#room-code').textContent = code; $('#wait-code').textContent = code;
  show('game-screen');
}
function cleanupRoom() {
  if (S.unsub) { S.unsub(); S.unsub = null; }
  if (S.code && S.user) onDisconnect(ref(db, `rooms/${S.code}/players/${S.user.uid}`)).cancel().catch(() => {});
  S.room = null;
}
async function exitRoom(leave) {
  const code = S.code; cleanupRoom(); S.code = null;
  if (leave && code) { try { await G.leaveRoom(code, me()); } catch (e) { /* abaikan */ } }
  if (S.user && S.profile) enterLobby();
}
$('#btn-leave').onclick = () => exitRoom(true);
$('#win-lobby').onclick = $('#lose-lobby').onclick = () => exitRoom(true);
$('#win-again').onclick = $('#lose-again').onclick = () => G.restartRoom(S.code, now()).catch(() => toast('Gagal memulai ulang'));
$('#room-code').onclick = () => navigator.clipboard?.writeText(S.code).then(() => toast('Kode room disalin'));

function avatar(p) {
  if (p.photo) { const i = mk('img', 'avatar'); i.src = p.photo; i.alt = ''; i.referrerPolicy = 'no-referrer'; return i; }
  return mk('span', 'avatar', (p.username || '?')[0].toUpperCase());
}

function onRoom(r) {
  if (!r) { if (S.code) { toast('Room ditutup'); exitRoom(false); } return; }
  if (!r.players || !r.players[me()]) { toast('Kamu tidak ada di room ini'); exitRoom(false); return; }
  S.room = r;
  renderPlayers(r);
  const seq = r.event?.seq || 0;
  if (S.lastSeq !== null && seq !== S.lastSeq) handleEvent(r.event);
  S.lastSeq = seq;

  if (r.status === 'waiting') {
    $('#waiting').classList.remove('hidden'); $('#play').classList.add('hidden'); hideModals(); S.result = false; return;
  }
  $('#waiting').classList.add('hidden'); $('#play').classList.remove('hidden');
  if (r.status === 'playing') {
    hideModals(); S.result = false;
    if (Object.keys(r.players).length < 2) G.forfeit(S.code, me()); // lawan keluar
    renderPlay(r);
  } else if (r.status === 'finished') showResult(r);
}

function renderPlayers(r) {
  const box = $('#players'); box.replaceChildren();
  Object.entries(r.players).forEach(([uid, p]) => {
    const pill = mk('div', 'pill' + (r.status === 'playing' && r.currentTurn === uid ? ' active' : ''));
    pill.append(avatar(p), mk('b', '', uid === me() ? p.username + ' (kamu)' : p.username));
    if (r.scores) pill.append(mk('em', '', String(r.scores[uid] || 0)));
    box.append(pill);
  });
}

function handleEvent(e) {
  if (!e) return;
  if (e.type === 'wrong') {
    S.flash = { slot: e.slot, letters: [...S.shown.slice(0, e.slot), e.letter], until: Date.now() + 650 };
    setTimeout(() => S.room && S.room.status === 'playing' && renderPlay(S.room), 670);
  } else if (e.type === 'timeout') toast('Waktu habis, giliran pindah');
  else if (e.type === 'correct') { burst(34); toast(e.uid === me() ? 'Benar! +10 poin' : 'Lawan menjawab benar'); }
}

function renderPlay(r) {
  const q = r.questionList?.[r.currentQuestionIndex]; if (!q) return;
  const mine = r.currentTurn === me(), picked = r.picked || [];
  $('#q-count').textContent = `Soal ${r.currentQuestionIndex + 1} dari ${r.questionList.length}`;
  $('#turn-label').textContent = mine ? 'Giliran kamu' : `Giliran ${r.players[r.currentTurn]?.username || 'lawan'}`;
  $('#turn-label').classList.toggle('mine', mine);
  $('#q-text').textContent = q.q;

  const board = $('#board'), key = r.matchId + '-' + r.currentQuestionIndex;
  if (S.slotKey !== key) {
    S.slotKey = key; board.replaceChildren();
    for (let i = 0; i < q.a.length; i++) { const s = mk('div', 'slot'); s.style.animationDelay = i * 40 + 'ms'; board.append(s); }
  }
  let letters = picked.map(i => r.scrambled[i]); S.shown = letters;
  const fl = S.flash && Date.now() < S.flash.until ? S.flash : null;
  if (fl) letters = fl.letters;
  [...board.children].forEach((s, i) => {
    const ch = letters[i] || '', bad = fl && fl.slot === i;
    s.textContent = ch; s.classList.toggle('filled', !!ch && !bad); s.classList.toggle('wrong', !!bad);
  });

  const box = $('#letters'), lk = r.matchId + '-' + r.currentQuestionIndex + '-' + r.turnId + r.scrambled.join('');
  if (S.lettersKey !== lk) {
    S.lettersKey = lk; box.replaceChildren();
    r.scrambled.forEach((c, i) => { const b = mk('button', 'bubble', c); b.dataset.i = i; b.style.animationDelay = i * 35 + 'ms'; box.append(b); });
  }
  [...box.children].forEach((b, i) => b.classList.toggle('used', picked.includes(i)));
  box.classList.toggle('locked', !mine);
}
$('#letters').onclick = e => {
  const b = e.target.closest('.bubble'); const r = S.room;
  if (!b || !r || r.status !== 'playing' || r.currentTurn !== me() || b.classList.contains('used')) return;
  b.classList.add('used');
  G.pickLetter(S.code, me(), +b.dataset.i, now()).catch(() => toast('Koneksi bermasalah'));
};

/* ---------- timer per giliran ---------- */
setInterval(() => {
  const r = S.room, fill = $('#timer-fill');
  if (!r || r.status !== 'playing' || !r.turnStart) { fill.style.transform = 'scaleX(0)'; return; }
  const left = G.TURN_MS - (now() - r.turnStart);
  fill.style.transform = `scaleX(${Math.max(0, Math.min(1, left / G.TURN_MS))})`;
  fill.classList.toggle('low', left < 5000);
  if (left <= 0 && S.fired !== r.turnId && (r.currentTurn === me() || left < -2500)) { // lawan offline: pemain lain yang menggeser
    S.fired = r.turnId; G.passTurn(S.code, r.turnId, now()).catch(() => {});
  }
}, 100);

/* ---------- hasil akhir ---------- */
function showResult(r) {
  if (S.result) return; S.result = true;
  const win = r.winner === me(), score = (r.scores && r.scores[me()]) || 0;
  if (win) {
    $('#win-text').textContent = `${r.winnerName} Wins ALYZ MULTIPLAYER`; $('#win-score').textContent = score;
    $('#win-modal').classList.add('show'); burst(220, true); setTimeout(() => burst(120, true), 500);
  } else {
    $('#lose-text').textContent = `Winner: ${r.winnerName} - ALYZ MULTIPLAYER`; $('#lose-score').textContent = score;
    $('#lose-modal').classList.add('show');
  }
}
