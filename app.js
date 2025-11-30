// SAT-1600 EVO v4.1 – multi-mode, adaptive, audio, avatar evolutions
const LS_USERS_KEY = 'sat_evo_users';
const LS_ACTIVE_USER_KEY = 'sat_evo_active_user';
const LS_GAM_PREFIX = 'sat_evo_gam_';
const LS_REVIEW_PREFIX = 'sat_evo_review_';

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

  // timer
  timerId: null,
  timeLeft: 0,

  // avatar / audio
  synth: window.speechSynthesis,
  voiceEnabled: true,
  isSpeaking: false,
  currentPhase: 1,
  audioCtx: null,

  // adaptive
  adaptiveLevel: 1,
  correctStreak: 0,
  wrongStreak: 0
};

function byId(id) { return document.getElementById(id); }
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
  const el = byId(id);
  if (el) el.classList.add('visible');
}

// ---------- SOUND (Web Audio synth, no external files) ----------
const Sound = {
  init: () => {
    if (!STATE.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) STATE.audioCtx = new AudioContext();
    }
  },
  playTone: (freq, type, duration) => {
    if (!STATE.audioCtx) Sound.init();
    const ctx = STATE.audioCtx;
    if (!ctx) return;
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
    setTimeout(() => Sound.playTone(1100, 'sine', 0.15), 90);
  },
  wrong: () => Sound.playTone(160, 'sawtooth', 0.25),
  evolve: () => {
    [350, 450, 650, 900].forEach((f, i) =>
      setTimeout(() => Sound.playTone(f, 'square', 0.18), i * 140)
    );
  }
};

// ---------- CONFETTI (mini canvas) ----------
function triggerConfetti() {
  const canvas = byId('confetti-canvas');
  if (!canvas) return;
  canvas.classList.remove('hidden');

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ['#3b82f6', '#eab308', '#ec4899', '#22c55e'];
  const parts = [];
  for (let i = 0; i < 120; i++) {
    parts.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 80 + Math.random() * 40
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of parts) {
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
      p.life--;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 4, 4);
    }
    if (alive) {
      requestAnimationFrame(draw);
    } else {
      canvas.classList.add('hidden');
    }
  }
  draw();
}

// ---------- STORAGE HELPERS ----------
function loadUsers() {
  try { STATE.users = JSON.parse(localStorage.getItem(LS_USERS_KEY) || '[]'); }
  catch { STATE.users = []; }
}
function saveUsers() {
  localStorage.setItem(LS_USERS_KEY, JSON.stringify(STATE.users));
}
function loadGamification(userId) {
  if (!userId) return { xpTotal: 0 };
  try {
    return Object.assign({ xpTotal: 0 }, JSON.parse(localStorage.getItem(LS_GAM_PREFIX + userId) || '{}'));
  } catch {
    return { xpTotal: 0 };
  }
}
function saveGamification(userId, data) {
  if (!userId) return;
  localStorage.setItem(LS_GAM_PREFIX + userId, JSON.stringify(data));
}
function loadReviewPool(userId) {
  if (!userId) return [];
  try {
    return JSON.parse(localStorage.getItem(LS_REVIEW_PREFIX + userId) || '[]');
  } catch { return []; }
}
function saveReviewPool(userId, arr) {
  if (!userId) return;
  localStorage.setItem(LS_REVIEW_PREFIX + userId, JSON.stringify(arr || []));
}

// ---------- SCORE & AVATAR EVOLUTION ----------
function calculateVirtualSATScore(xpTotal) {
  const base = 400;
  const xpForMax = 12000;
  let progress = xpTotal / xpForMax;
  if (progress > 1) progress = 1;
  const raw = base + progress * 1200; // 400–1600
  return Math.round(raw / 10) * 10;
}

function updateAvatarEvolution() {
  if (!STATE.currentUser) return;
  const avatar = byId('avatarCharacter');
  const badge = byId('avatarScoreDisplay');
  const homeScore = byId('homeScoreDisplay');
  const xpSummary = byId('xpSummary');
  if (!avatar) return;

  const g = loadGamification(STATE.currentUser.id);
  const score = calculateVirtualSATScore(g.xpTotal || 0);

  if (badge) badge.textContent = `SAT: ${score}`;
  if (homeScore) homeScore.textContent = `SAT: ${score}`;

  if (xpSummary) {
    if (score < 1000) xpSummary.textContent = 'Bitowl is booting up. Keep going!';
    else if (score < 1400) xpSummary.textContent = 'Cyberhoot online. Aim for 1400 to unlock Apexowl!';
    else xpSummary.textContent = 'Apexowl Prime online. Maintain your power.';
  }

  // Phase detection
  let newPhase = 1;
  if (score >= 1000 && score < 1400) newPhase = 2;
  else if (score >= 1400) newPhase = 3;

  // Evolution event
  if (newPhase > STATE.currentPhase) {
    STATE.currentPhase = newPhase;
    Sound.evolve();
    triggerConfetti();
    speakText('Evolution achieved! Systems upgraded.');
  }

  avatar.classList.remove('phase-1', 'phase-2', 'phase-3', 'spec-math', 'spec-reading');
  avatar.classList.add('phase-' + newPhase);

  // Simple specialization aura based on subject
  const subj = STATE.subject || byId('subjectSelect')?.value;
  if (score >= 900 && subj) {
    if (subj.toLowerCase().includes('math')) avatar.classList.add('spec-math');
    if (subj.toLowerCase().includes('read') || subj.toLowerCase().includes('verbal')) avatar.classList.add('spec-reading');
  }

  // Near evolution highlight
  if (badge) {
    const near = (score >= 950 && score < 1000) || (score >= 1350 && score < 1400);
    badge.classList.toggle('near-evolution', near);
  }
}

// ---------- VOICE ----------
function speakText(text) {
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
  const v = voices.find(vv => vv.name.includes('Google US English')) || voices.find(vv => vv.lang === 'en-US');
  if (v) u.voice = v;

  u.onstart = () => {
    STATE.isSpeaking = true;
    if (avatar) avatar.classList.add('talking');
  };
  u.onend = () => {
    STATE.isSpeaking = false;
    if (avatar) avatar.classList.remove('talking');
  };
  u.onerror = () => {
    if (avatar) avatar.classList.remove('talking');
  };

  STATE.synth.speak(u);
}
function stopVoice() {
  if (STATE.synth) STATE.synth.cancel();
  const avatar = byId('avatarCharacter');
  const bubble = byId('speechBubble');
  if (avatar) avatar.classList.remove('talking');
  if (bubble) bubble.classList.add('hidden');
}

// ---------- USERS ----------
function renderUserList() {
  const list = byId('userList');
  const msg = byId('noUsersMsg');
  list.innerHTML = '';
  if (!STATE.users.length) {
    msg.classList.remove('hidden');
    return;
  }
  msg.classList.add('hidden');
  STATE.users.forEach(u => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.padding = '6px 0';
    const s = document.createElement('span');
    s.textContent = u.name;
    const b = document.createElement('button');
    b.textContent = 'Select';
    b.onclick = () => selectUser(u.id);
    li.appendChild(s);
    li.appendChild(b);
    list.appendChild(li);
  });
}
function selectUser(id) {
  const u = STATE.users.find(x => x.id === id);
  if (!u) return;
  STATE.currentUser = u;
  localStorage.setItem(LS_ACTIVE_USER_KEY, u.id);
  byId('currentUserLabel').textContent = u.name;
  STATE.subject = null;
  updateAvatarEvolution();
  populateSubjects();
  updateHomeGreeting();
  showScreen('screen-home');
}
function updateHomeGreeting() {
  const h = byId('homeGreeting');
  if (!h || !STATE.currentUser) return;
  h.textContent = `Hi, ${STATE.currentUser.name}!`;
}
function createUser() {
  const input = byId('newUserName');
  const name = (input.value || '').trim();
  if (!name) return;
  const u = { id: 'u_' + Date.now(), name };
  STATE.users.push(u);
  saveUsers();
  input.value = '';
  renderUserList();
  selectUser(u.id);
}

// ---------- QUESTIONS ----------
async function loadQuestions() {
  try {
    const [qRes, eRes] = await Promise.all([
      fetch('questions.json'),
      fetch('explanations.json')
    ]);
    const qData = await qRes.json();
    const eData = await eRes.json();

    STATE.questionsAll = qData.map((q, idx) => {
      const id = 'q' + idx;
      const exp = eData[id] || {};
      return {
        ...q,
        _id: id,
        explanation: exp.theory,
        explanationExample: exp.example,
        explanationTitle: exp.title
      };
    });
    populateSubjects();
  } catch (err) {
    console.error('Error loading questions', err);
  }
}

function populateSubjects() {
  const sel = byId('subjectSelect');
  if (!sel || !STATE.questionsAll.length) return;
  const cats = [...new Set(STATE.questionsAll.map(q => q.category))];
  sel.innerHTML = '';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c.toUpperCase();
    sel.appendChild(opt);
  });
  if (!STATE.subject && cats.length) STATE.subject = cats[0];
}

// ---------- TIMER ----------
function clearTimer() {
  if (STATE.timerId) {
    clearInterval(STATE.timerId);
    STATE.timerId = null;
  }
  const box = byId('timerBox');
  if (box) box.classList.add('hidden');
}
function startTimer(seconds) {
  clearTimer();
  STATE.timeLeft = seconds;
  const box = byId('timerBox');
  const txt = byId('timerText');
  if (box) box.classList.remove('hidden');
  const update = () => {
    if (txt) {
      const m = Math.floor(STATE.timeLeft / 60);
      const s = STATE.timeLeft % 60;
      txt.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    }
  };
  update();
  STATE.timerId = setInterval(() => {
    STATE.timeLeft--;
    update();
    if (STATE.timeLeft <= 0) {
      clearTimer();
      endQuiz(true); // timeOut = true
    }
  }, 1000);
}

// ---------- QUIZ ENTRY ----------
function startQuiz(mode) {
  if (!STATE.currentUser) {
    showScreen('screen-auth');
    return;
  }
  Sound.init();
  stopVoice();
  STATE.mode = mode;
  STATE.score = 0;
  STATE.index = 0;
  STATE.answered = false;
  STATE.correctStreak = 0;
  STATE.wrongStreak = 0;
  STATE.adaptiveLevel = parseInt(byId('levelSelect').value || '1', 10);
  STATE.subject = byId('subjectSelect').value;

  const quizLabel = byId('quizModeLabel');
  if (quizLabel) {
    quizLabel.textContent = {
      practice: 'Practice',
      timed: 'Timed',
      review: 'Review mistakes',
      exam: 'Exam simulation',
      adaptive: 'Adaptive'
    }[mode] || 'Practice';
  }

  // Timer setup
  if (mode === 'timed') {
    startTimer(60); // 60 seconds sprint
  } else if (mode === 'exam') {
    startTimer(25 * 60); // 25 min
  } else {
    clearTimer();
  }

  // Build question pool
  if (mode === 'review') {
    const poolIds = loadReviewPool(STATE.currentUser.id);
    let pool = STATE.questionsAll.filter(q => poolIds.includes(q._id));
    if (!pool.length) {
      alert('You have no stored mistakes yet. Practice first!');
      showScreen('screen-home');
      return;
    }
    pool.sort(() => Math.random() - 0.5);
    STATE.questions = pool.slice(0, 15);
  } else if (mode === 'adaptive') {
    // On-demand generation per question
    STATE.questions = [];
  } else {
    const subj = STATE.subject;
    const lvl = byId('levelSelect').value;
    let pool = STATE.questionsAll.filter(q =>
      (!subj || q.category === subj) &&
      q.level == lvl
    );
    if (pool.length < 10 && STATE.questionsAll.length) {
      pool = STATE.questionsAll.slice(); // fallback
    }
    pool.sort(() => Math.random() - 0.5);
    const maxQ = mode === 'exam' ? 30 : 15;
    STATE.questions = pool.slice(0, maxQ);
  }

  renderQuestion();
  showScreen('screen-quiz');
}

function pickAdaptiveQuestion() {
  const subj = STATE.subject;
  const lvl = STATE.adaptiveLevel;
  const usedIds = new Set(STATE.questions.map(q => q && q._id));
  const candidates = STATE.questionsAll.filter(q =>
    (!subj || q.category === subj) &&
    q.level == lvl &&
    !usedIds.has(q._id)
  );
  if (!candidates.length) return null;
  const q = candidates[Math.floor(Math.random() * candidates.length)];
  STATE.questions.push(q);
  return q;
}

// ---------- RENDER QUESTION ----------
function getCurrentQuestion() {
  if (STATE.mode === 'adaptive') {
    if (!STATE.questions[STATE.index]) {
      return pickAdaptiveQuestion();
    }
  }
  return STATE.questions[STATE.index];
}

function renderQuestion() {
  const q = getCurrentQuestion();
  if (!q) {
    endQuiz(false);
    return;
  }
  stopVoice();
  updateAvatarEvolution();

  byId('progressText').textContent = `Question ${STATE.index + 1} / ${STATE.questions.length || '–'}`;
  byId('scoreText').textContent = `Score: ${STATE.score}`;
  byId('questionText').textContent = q.q;

  const list = byId('answersList');
  list.innerHTML = '';
  q.opts.forEach((opt, idx) => {
    const li = document.createElement('li');
    li.className = 'answer-option';
    li.innerHTML = `<span class="answer-letter">${String.fromCharCode(65 + idx)}</span><span>${opt}</span>`;
    li.onclick = () => handleAnswer(idx, li);
    list.appendChild(li);
  });

  byId('explanationBox').classList.add('hidden');
  byId('btnNextQuestion').classList.add('hidden');
  STATE.answered = false;
}

// ---------- ANSWER HANDLING ----------
function addXP(isCorrect) {
  const g = loadGamification(STATE.currentUser.id);
  let gain = 0;
  switch (STATE.mode) {
    case 'practice': gain = isCorrect ? 20 : 5; break;
    case 'timed': gain = isCorrect ? 30 : 10; break;
    case 'exam': gain = isCorrect ? 40 : 0; break;
    case 'adaptive': gain = isCorrect ? 25 : 5; break;
    case 'review': gain = isCorrect ? 15 : 5; break;
    default: gain = isCorrect ? 20 : 5;
  }
  g.xpTotal = (g.xpTotal || 0) + gain;
  saveGamification(STATE.currentUser.id, g);
}

function updateReviewPool(q, isCorrect) {
  const pool = loadReviewPool(STATE.currentUser.id);
  if (!q || !q._id) return;
  const idx = pool.indexOf(q._id);
  if (!isCorrect) {
    if (idx === -1) pool.push(q._id);
  } else if (STATE.mode === 'review') {
    // si en modo review acierta, podemos limpiar
    if (idx !== -1) pool.splice(idx, 1);
  }
  saveReviewPool(STATE.currentUser.id, pool);
}

function updateAdaptiveLevel(isCorrect) {
  if (STATE.mode !== 'adaptive') return;
  if (isCorrect) {
    STATE.correctStreak++;
    STATE.wrongStreak = 0;
  } else {
    STATE.wrongStreak++;
    STATE.correctStreak = 0;
  }

  if (STATE.correctStreak >= 3 && STATE.adaptiveLevel < 3) {
    STATE.adaptiveLevel++;
    STATE.correctStreak = 0;
    speakText('Difficulty increased. Level ' + STATE.adaptiveLevel);
  }
  if (STATE.wrongStreak >= 2 && STATE.adaptiveLevel > 1) {
    STATE.adaptiveLevel--;
    STATE.wrongStreak = 0;
    speakText('Dropping difficulty to level ' + STATE.adaptiveLevel + ' so we can rebuild.');
  }
}

function handleAnswer(idx, li) {
  if (STATE.answered) return;
  STATE.answered = true;
  const q = getCurrentQuestion();
  if (!q) return;

  const isCorrect = idx === q.correct;

  const quizScreen = byId('screen-quiz');
  if (isCorrect) {
    li.classList.add('correct', 'pop-effect');
    Sound.correct();
    STATE.score++;
  } else {
    li.classList.add('wrong');
    if (quizScreen) {
      quizScreen.classList.add('shake-effect');
      setTimeout(() => quizScreen.classList.remove('shake-effect'), 350);
    }
    Sound.wrong();
    const correctLi = byId('answersList').children[q.correct];
    if (correctLi) correctLi.classList.add('correct');
  }

  addXP(isCorrect);
  updateReviewPool(q, !isCorrect ? false : true);
  updateAdaptiveLevel(isCorrect);
  updateAvatarEvolution();

  showExplanation(q, isCorrect);
  byId('btnNextQuestion').classList.remove('hidden');
}

function showExplanation(q, isCorrect) {
  const box = byId('explanationBox');
  const t = byId('explanationText');
  const ex = byId('explanationExample');

  const showNow = (STATE.mode !== 'exam'); // In exam mode, explanations still appear but we could hide if wanted
  if (!showNow) {
    box.classList.add('hidden');
    return;
  }

  t.textContent = q.explanation || 'Review this concept carefully.';
  ex.textContent = q.explanationExample || '';
  box.classList.remove('hidden');

  let speech = (isCorrect ? 'Correct. ' : 'Not quite. ') + (q.explanation || '');
  if (q.explanationExample) speech += ' Example: ' + q.explanationExample;
  speakText(speech);
}

// ---------- END QUIZ ----------
function endQuiz(timeOut) {
  stopVoice();
  clearTimer();
  const headline = byId('resultHeadline');
  const line = byId('resultLine');
  const extra = byId('resultExtra');

  const total = STATE.questions.length || (STATE.index + 1);
  const percent = total ? Math.round((STATE.score / total) * 100) : 0;

  if (headline) {
    if (timeOut) headline.textContent = 'Time is up!';
    else headline.textContent = 'Session complete';
  }
  if (line) line.textContent = `You answered ${STATE.score} out of ${total} correctly (${percent}%).`;

  if (extra && STATE.currentUser) {
    const g = loadGamification(STATE.currentUser.id);
    const sat = calculateVirtualSATScore(g.xpTotal || 0);
    extra.textContent = `Your current virtual SAT is ${sat}. Keep training to push it higher.`;
  }

  showScreen('screen-results');
}

// ---------- INIT ----------
function setupListeners() {
  byId('btnCreateUser').onclick = createUser;
  byId('btnStartPractice').onclick = () => startQuiz('practice');
  byId('btnStartTimed').onclick = () => startQuiz('timed');
  byId('btnStartReview').onclick = () => startQuiz('review');
  byId('btnStartExam').onclick = () => startQuiz('exam');
  byId('btnStartAdaptive').onclick = () => startQuiz('adaptive');

  byId('btnNextQuestion').onclick = () => {
    STATE.index++;
    renderQuestion();
  };
  byId('btnQuitQuiz').onclick = () => {
    stopVoice();
    clearTimer();
    showScreen('screen-home');
  };
  byId('btnResultsHome').onclick = () => {
    showScreen('screen-home');
  };

  byId('btnToggleVoice').onclick = () => {
    STATE.voiceEnabled = !STATE.voiceEnabled;
    stopVoice();
    const btn = byId('btnToggleVoice');
    if (btn) btn.textContent = STATE.voiceEnabled ? '🔊' : '🔇';
  };

  // user menu
  byId('currentUserLabel').onclick = () => {
    byId('userMenu').classList.toggle('hidden');
  };
  byId('menuLogout').onclick = () => {
    STATE.currentUser = null;
    localStorage.removeItem(LS_ACTIVE_USER_KEY);
    showScreen('screen-auth');
    byId('currentUserLabel').textContent = 'No user';
    stopVoice();
    clearTimer();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  loadUsers();
  renderUserList();
  loadQuestions();
  setupListeners();

  const last = localStorage.getItem(LS_ACTIVE_USER_KEY);
  if (last) selectUser(last);
  else showScreen('screen-auth');
});
