// SAT-1600 EVO v4.1.0 FLAT
const LS_USERS_KEY = 'sat_evo_users';
const LS_ACTIVE_USER_KEY = 'sat_evo_active_user';
const LS_STATS_PREFIX = 'sat_evo_stats_';
const LS_GAM_PREFIX = 'sat_evo_gam_';
const LS_MISTAKES_PREFIX = 'sat_evo_mistakes_';

const STATE = {
  users: [],
  currentUser: null,
  questionsAll: [],
  mode: 'practice',
  subject: null,
  level: '1',
  questions: [],
  index: 0,
  score: 0,
  answered: false,
  timerId: null,
  timeLeft: 0,
  totalQuestions: 0,
  synth: window.speechSynthesis,
  voiceEnabled: true,
  isSpeaking: false,
  currentPhase: 1,
  audioCtx: null
};

function byId(id){ return document.getElementById(id); }
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
  const el = byId(id);
  if (el) el.classList.add('visible');
}

const Sound = {
  init: () => {
    if (!STATE.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) STATE.audioCtx = new AudioContext();
    }
  },
  playTone: (freq, type, duration) => {
    if (!STATE.audioCtx) Sound.init();
    if (!STATE.audioCtx) return;
    const ctx = STATE.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  },
  correct: () => {
    Sound.playTone(600, 'sine', 0.08);
    setTimeout(() => Sound.playTone(1200, 'sine', 0.15), 90);
  },
  wrong: () => {
    Sound.playTone(180, 'sawtooth', 0.25);
  },
  evolve: () => {
    [400, 520, 650, 800].forEach((f, i) => setTimeout(() => Sound.playTone(f, 'square', 0.18), i * 160));
  }
};

function triggerConfetti() {
  const canvas = byId('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#3b82f6', '#eab308', '#ec4899', '#22c55e'];
  const particles = [];
  for (let i = 0; i < 120; i++) {
    particles.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 100
    });
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    particles.forEach(p => {
      if (p.life > 0) {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 5, 5);
        active = true;
      }
    });
    if (active) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

function loadUsers(){
  try {
    STATE.users = JSON.parse(localStorage.getItem(LS_USERS_KEY) || '[]');
  } catch {
    STATE.users = [];
  }
}
function saveUsers(){
  localStorage.setItem(LS_USERS_KEY, JSON.stringify(STATE.users));
}

function loadGamification(userId){
  if (!userId) return { xpTotal: 0 };
  try {
    return Object.assign({ xpTotal: 0 }, JSON.parse(localStorage.getItem(LS_GAM_PREFIX + userId) || '{}'));
  } catch {
    return { xpTotal: 0 };
  }
}
function saveGamification(userId, data){
  if (!userId) return;
  localStorage.setItem(LS_GAM_PREFIX + userId, JSON.stringify(data));
}

function loadStats(userId){
  if (!userId) return { total: 0, correct: 0 };
  try {
    return Object.assign({ total: 0, correct: 0 }, JSON.parse(localStorage.getItem(LS_STATS_PREFIX + userId) || '{}'));
  } catch {
    return { total: 0, correct: 0 };
  }
}
function saveStats(userId, stats){
  if (!userId) return;
  localStorage.setItem(LS_STATS_PREFIX + userId, JSON.stringify(stats));
}

function loadMistakes(userId){
  if (!userId) return [];
  try {
    return JSON.parse(localStorage.getItem(LS_MISTAKES_PREFIX + userId) || '[]');
  } catch {
    return [];
  }
}
function saveMistakes(userId, arr){
  if (!userId) return;
  localStorage.setItem(LS_MISTAKES_PREFIX + userId, JSON.stringify(arr));
}

function calculateVirtualSATScore(xpTotal){
  const baseScore = 400;
  const xpForMax = 12000;
  let progress = xpTotal / xpForMax;
  if (progress > 1) progress = 1;
  const rawScore = baseScore + (progress * 1200);
  return Math.round(rawScore / 10) * 10;
}

function updateAvatarEvolution(){
  if (!STATE.currentUser) return;
  const avatar = byId('avatarCharacter');
  const scoreBadge = byId('avatarScoreDisplay');
  const homeScore = byId('homeScoreDisplay');
  const xpLabel = byId('xpSummary');
  if (!avatar) return;

  const g = loadGamification(STATE.currentUser.id);
  const score = calculateVirtualSATScore(g.xpTotal || 0);

  if (scoreBadge) scoreBadge.textContent = `SAT: ${score}`;
  if (homeScore) homeScore.textContent = `Current SAT Score: ${score}`;
  if (xpLabel) xpLabel.textContent = `XP: ${g.xpTotal || 0}`;

  let newPhase = 1;
  if (score >= 1000 && score < 1400) newPhase = 2;
  if (score >= 1400) newPhase = 3;

  if (newPhase > STATE.currentPhase) {
    STATE.currentPhase = newPhase;
    Sound.evolve();
    triggerConfetti();
    speakText("Evolution achieved. Systems upgraded. Keep going.");
  }

  avatar.classList.remove('phase-1', 'phase-2', 'phase-3', 'spec-math', 'spec-reading');
  avatar.classList.add('phase-' + newPhase);

  const subj = STATE.subject || 'math';
  if (subj.toLowerCase().includes('math')) avatar.classList.add('spec-math');
  if (subj.toLowerCase().includes('read') || subj.toLowerCase().includes('writing')) avatar.classList.add('spec-reading');

  const near = (score >= 950 && score < 1000) || (score >= 1350 && score < 1400);
  if (scoreBadge) {
    if (near) scoreBadge.classList.add('near-evolution');
    else scoreBadge.classList.remove('near-evolution');
  }
}

function speakText(text){
  if (!STATE.voiceEnabled || !STATE.synth) return;
  STATE.synth.cancel();
  const avatar = byId('avatarCharacter');
  const bubble = byId('speechBubble');
  const bubbleText = byId('speechText');
  if (bubble && bubbleText) {
    bubbleText.textContent = text;
    bubble.classList.remove('hidden');
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  const voices = STATE.synth.getVoices();
  const best = voices.find(v => v.name && v.name.includes('Google US English')) || voices.find(v => v.lang === 'en-US');
  if (best) u.voice = best;
  u.onstart = () => {
    STATE.isSpeaking = true;
    if (avatar) avatar.classList.add('talking');
  };
  u.onend = () => {
    STATE.isSpeaking = false;
    if (avatar) avatar.classList.remove('talking');
  };
  STATE.synth.speak(u);
}

function stopVoice(){
  if (STATE.synth) STATE.synth.cancel();
  const avatar = byId('avatarCharacter');
  const bubble = byId('speechBubble');
  if (avatar) avatar.classList.remove('talking');
  if (bubble) bubble.classList.add('hidden');
}

function renderUserList(){
  const list = byId('userList');
  const msg = byId('noUsersMsg');
  if (!list) return;
  list.innerHTML = '';
  if (!STATE.users.length) {
    if (msg) msg.classList.remove('hidden');
    return;
  }
  if (msg) msg.classList.add('hidden');

  STATE.users.forEach(u => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.padding = '6px 0';
    const span = document.createElement('span');
    span.textContent = u.name;
    const btn = document.createElement('button');
    btn.textContent = 'Select';
    btn.onclick = () => selectUser(u.id);
    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function selectUser(id){
  const u = STATE.users.find(x => x.id === id);
  if (!u) return;
  STATE.currentUser = u;
  localStorage.setItem(LS_ACTIVE_USER_KEY, u.id);
  const label = byId('currentUserLabel');
  if (label) label.textContent = u.name;
  updateAvatarEvolution();
  populateSubjects();
  const h = byId('homeGreeting');
  if (h) h.textContent = `Hi, ${u.name}!`;
  showScreen('screen-home');
}

function createUser(){
  const input = byId('newUserName');
  const name = (input && input.value || '').trim();
  if (!name) return;
  const u = { id: 'u_' + Date.now(), name };
  STATE.users.push(u);
  saveUsers();
  if (input) input.value = '';
  renderUserList();
  selectUser(u.id);
}

async function loadQuestions(){
  try {
    const res = await fetch('questions.json');
    const qData = await res.json();
    const eData = (window.SAT_EXPLANATIONS) || {};
    STATE.questionsAll = qData.map((q, idx) => {
      const id = 'q' + idx;
      const exp = eData[id] || {};
      const theory = exp.theory || '';
      const example = exp.example || exp.solution || '';
      return Object.assign({}, q, {
        _id: id,
        explanationTitle: exp.title || '',
        explanation: theory,
        explanationExample: example
      });
    });
    populateSubjects();
  } catch (err) {
    console.error('Error loading questions:', err);
    STATE.questionsAll = [];
  }
}

function populateSubjects(){
  const sel = byId('subjectSelect');
  if (!sel) return;
  const cats = [...new Set(STATE.questionsAll.map(q => q.category))].filter(Boolean);
  sel.innerHTML = '';
  if (!cats.length) {
    const opt = document.createElement('option');
    opt.value = 'math';
    opt.textContent = 'MATH';
    sel.appendChild(opt);
    STATE.subject = 'math';
    return;
  }
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c.toUpperCase();
    sel.appendChild(opt);
  });
  STATE.subject = sel.value;
}

function startTimer(seconds){
  STATE.timeLeft = seconds;
  const box = byId('timerBox');
  const txt = byId('timerText');
  if (box) box.classList.remove('hidden');
  if (STATE.timerId) clearInterval(STATE.timerId);
  const update = () => {
    const t = STATE.timeLeft;
    if (txt) txt.textContent = formatTime(t);
    STATE.timeLeft--;
    if (STATE.timeLeft < 0) {
      clearInterval(STATE.timerId);
      STATE.timerId = null;
      endQuiz(true);
    }
  };
  update();
  STATE.timerId = setInterval(update, 1000);
}

function stopTimer(){
  if (STATE.timerId) clearInterval(STATE.timerId);
  STATE.timerId = null;
  const box = byId('timerBox');
  if (box) box.classList.add('hidden');
}

function formatTime(sec){
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2,'0')}`;
}

function startQuiz(mode){
  if (!STATE.currentUser) {
    showScreen('screen-auth');
    return;
  }
  Sound.init();
  STATE.mode = mode;
  STATE.subject = (byId('subjectSelect') && byId('subjectSelect').value) || STATE.subject || 'math';
  STATE.level = (byId('levelSelect') && byId('levelSelect').value) || '1';

  const label = byId('quizModeLabel');
  const map = {
    'practice': 'Practice mode',
    'adaptive': 'Adaptive mode',
    'timed': 'Timed mode (60s)',
    'review': 'Review mistakes',
    'exam': 'Exam mode (25 min)'
  };
  if (label) label.textContent = map[mode] || '';

  let pool = [];

  if (mode === 'review') {
    const mistakes = loadMistakes(STATE.currentUser.id);
    pool = STATE.questionsAll.filter(q => mistakes.includes(q._id));
    if (!pool.length) {
      alert('No mistakes saved yet. Do some practice first.');
      showScreen('screen-home');
      return;
    }
  } else {
    pool = STATE.questionsAll.filter(q =>
      (!STATE.subject || q.category === STATE.subject) && String(q.level) === String(STATE.level)
    );
    if (!pool.length) {
      pool = STATE.questionsAll.slice();
    }
  }

  pool.sort(() => Math.random() - 0.5);

  let n = 15;
  if (mode === 'exam') n = 30;
  STATE.questions = pool.slice(0, n);
  STATE.totalQuestions = STATE.questions.length;
  STATE.index = 0;
  STATE.score = 0;
  STATE.answered = false;

  if (mode === 'timed') {
    startTimer(60);
  } else if (mode === 'exam') {
    startTimer(25 * 60);
  } else {
    stopTimer();
  }

  renderQuestion();
  showScreen('screen-quiz');
}

function renderQuestion(){
  const q = STATE.questions[STATE.index];
  if (!q) {
    endQuiz(false);
    return;
  }
  stopVoice();
  updateAvatarEvolution();

  const prog = byId('progressText');
  const scoreText = byId('scoreText');
  if (prog) prog.textContent = `Q ${STATE.index + 1} / ${STATE.totalQuestions}`;
  if (scoreText) scoreText.textContent = `Score: ${STATE.score}`;

  const qText = byId('questionText');
  if (qText) qText.textContent = q.q;

  const list = byId('answersList');
  if (list) list.innerHTML = '';
  q.opts.forEach((opt, idx) => {
    const li = document.createElement('li');
    li.className = 'answer-option';
    li.innerHTML = `<span class="answer-letter">${String.fromCharCode(65+idx)}</span><span>${opt}</span>`;
    li.onclick = () => handleAnswer(idx, li);
    list.appendChild(li);
  });

  const box = byId('explanationBox');
  if (box) box.classList.add('hidden');
  const btnNext = byId('btnNextQuestion');
  if (btnNext) btnNext.classList.add('hidden');

  STATE.answered = false;
}

function handleAnswer(idx, li){
  if (STATE.answered) return;
  STATE.answered = true;
  const q = STATE.questions[STATE.index];
  const isCorrect = idx === q.correct;

  const screenQuiz = byId('screen-quiz');

  const stats = loadStats(STATE.currentUser.id);
  stats.total++;
  if (isCorrect) stats.correct++;
  saveStats(STATE.currentUser.id, stats);

  const mistakes = loadMistakes(STATE.currentUser.id);

  if (isCorrect) {
    li.classList.add('correct', 'pop-effect');
    Sound.correct();
    STATE.score++;
    const g = loadGamification(STATE.currentUser.id);
    const bonus = (STATE.mode === 'timed' || STATE.mode === 'exam') ? 30 : 20;
    g.xpTotal = (g.xpTotal || 0) + bonus;
    saveGamification(STATE.currentUser.id, g);

    if (STATE.mode === 'review') {
      const idxM = mistakes.indexOf(q._id);
      if (idxM >= 0) {
        mistakes.splice(idxM, 1);
        saveMistakes(STATE.currentUser.id, mistakes);
      }
    }
  } else {
    li.classList.add('wrong');
    if (screenQuiz) {
      screenQuiz.classList.add('shake-effect');
      setTimeout(() => screenQuiz.classList.remove('shake-effect'), 400);
    }
    Sound.wrong();
    const answersList = byId('answersList');
    if (answersList && answersList.children[q.correct]) {
      answersList.children[q.correct].classList.add('correct');
    }
    const g = loadGamification(STATE.currentUser.id);
    g.xpTotal = (g.xpTotal || 0) + 5;
    saveGamification(STATE.currentUser.id, g);

    if (!mistakes.includes(q._id)) {
      mistakes.push(q._id);
      saveMistakes(STATE.currentUser.id, mistakes);
    }
  }

  updateAvatarEvolution();
  showExplanation(q, isCorrect);

  const btnNext = byId('btnNextQuestion');
  if (btnNext) btnNext.classList.remove('hidden');
}

function showExplanation(q, isCorrect){
  const box = byId('explanationBox');
  const txt = byId('explanationText');
  const ex = byId('explanationExample');
  if (!box) return;

  const theory = q.explanation || 'Review this concept carefully.';
  const example = q.explanationExample || '';

  if (txt) txt.textContent = theory;
  if (ex) ex.textContent = example;

  box.classList.remove('hidden');

  let speech = isCorrect ? 'Correct. ' : 'Not quite. ';
  speech += theory;
  if (example) speech += ' Example: ' + example;
  speakText(speech);
}

function endQuiz(fromTimer){
  stopVoice();
  stopTimer();
  const head = byId('resultHeadline');
  const line = byId('resultLine');
  const extra = byId('resultExtra');

  if (head) head.textContent = 'Session complete';
  if (line) line.textContent = `You got ${STATE.score} out of ${STATE.totalQuestions} questions.`;

  const g = loadGamification(STATE.currentUser?.id);
  const scoreSAT = calculateVirtualSATScore((g && g.xpTotal) || 0);
  if (extra) {
    let txt = `Virtual SAT Score: ${scoreSAT}. `;
    if (fromTimer) txt += 'Time is up. ';
    txt += 'Keep training to evolve your Guardian.';
    extra.textContent = txt;
  }

  updateAvatarEvolution();
  showScreen('screen-results');
}

document.addEventListener('DOMContentLoaded', () => {
  const lbl = byId('currentUserLabel');
  if (lbl) {
    lbl.onclick = () => {
      const menu = byId('userMenu');
      if (menu) menu.classList.toggle('hidden');
    };
  }
  const logout = byId('menuLogout');
  if (logout) {
    logout.onclick = () => {
      STATE.currentUser = null;
      localStorage.removeItem(LS_ACTIVE_USER_KEY);
      showScreen('screen-auth');
      const menu = byId('userMenu');
      if (menu) menu.classList.add('hidden');
      const lbl2 = byId('currentUserLabel');
      if (lbl2) lbl2.textContent = 'No user';
    };
  }

  if (byId('btnCreateUser')) byId('btnCreateUser').onclick = createUser;
  if (byId('btnStartPractice')) byId('btnStartPractice').onclick = () => startQuiz('practice');
  if (byId('btnStartAdaptive')) byId('btnStartAdaptive').onclick = () => startQuiz('adaptive');
  if (byId('btnStartTimed')) byId('btnStartTimed').onclick = () => startQuiz('timed');
  if (byId('btnStartReview')) byId('btnStartReview').onclick = () => startQuiz('review');
  if (byId('btnStartExam')) byId('btnStartExam').onclick = () => startQuiz('exam');

  if (byId('btnNextQuestion')) byId('btnNextQuestion').onclick = () => {
    STATE.index++;
    if (STATE.index >= STATE.totalQuestions) endQuiz(false);
    else renderQuestion();
  };
  if (byId('btnQuitQuiz')) byId('btnQuitQuiz').onclick = () => {
    stopTimer();
    stopVoice();
    showScreen('screen-home');
  };
  if (byId('btnResultsHome')) byId('btnResultsHome').onclick = () => {
    showScreen('screen-home');
  };
  if (byId('btnToggleVoice')) byId('btnToggleVoice').onclick = () => {
    STATE.voiceEnabled = !STATE.voiceEnabled;
    stopVoice();
    const btn = byId('btnToggleVoice');
    if (btn) btn.textContent = STATE.voiceEnabled ? '🔊' : '🔇';
  };

  loadUsers();
  renderUserList();
  loadQuestions();

  const lastId = localStorage.getItem(LS_ACTIVE_USER_KEY);
  if (lastId) {
    selectUser(lastId);
  } else {
    showScreen('screen-auth');
  }
});
