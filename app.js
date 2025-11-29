// SAT-1600 EVO v4.0 (Adaptive + Branching + Juice)
const LS_USERS_KEY = 'sat_evo_users';
const LS_ACTIVE_USER_KEY = 'sat_evo_active_user';
const LS_STATS_PREFIX = 'sat_evo_stats_';
const LS_GAM_PREFIX = 'sat_evo_gam_';

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
  answeredCount: 0,
  maxQuestions: 15,

  // Adaptive
  currentLevel: 1,
  streakCorrect: 0,
  failStreakByGroup: { math: 0, reading: 0, other: 0 },

  // AVATAR & AUDIO
  synth: window.speechSynthesis,
  voiceEnabled: true,
  isSpeaking: false,
  currentPhase: 1,
  currentSpec: 'none', // 'math', 'reading', 'balance', 'none'
  audioCtx: null
};

function byId(id){ return document.getElementById(id); }
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
  const el = byId(id); if (el) el.classList.add('visible');
}

/* ----------------- SOUND MANAGER (8-bit synth) ----------------- */
const Sound = {
  init: () => {
    if (!STATE.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      STATE.audioCtx = new AudioContext();
    }
  },
  playTone: (freq, type, duration) => {
    try{
      if (!STATE.audioCtx) Sound.init();
      const ctx = STATE.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch(e){
      // Mobile autoplay restrictions – quietly ignore
    }
  },
  playCorrect: () => {
    Sound.playTone(600, 'sine', 0.1);
    setTimeout(() => Sound.playTone(1200, 'sine', 0.15), 100);
  },
  playWrong: () => {
    Sound.playTone(180, 'sawtooth', 0.25);
  },
  playEvolve: () => {
    [400, 550, 700, 900].forEach((f, i) =>
      setTimeout(() => Sound.playTone(f, 'square', 0.18), i * 140)
    );
  }
};

/* ----------------- CONFETTI MINI SYSTEM ----------------- */
function triggerConfetti() {
  const colors = ['#3b82f6', '#eab308', '#ec4899', '#22c55e'];
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  for(let i=0; i<120; i++) {
    particles.push({
      x: window.innerWidth/2,
      y: window.innerHeight/3,
      vx: (Math.random()-0.5)*11,
      vy: (Math.random()-0.3)*11,
      color: colors[Math.floor(Math.random()*colors.length)],
      life: 90 + Math.random()*30
    });
  }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let active = false;
    particles.forEach(p => {
      if(p.life > 0) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.life--;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 6);
        active = true;
      }
    });
    if(active) requestAnimationFrame(draw);
    else canvas.remove();
  }
  draw();
}

/* ----------------- STORAGE HELPERS ----------------- */
function loadUsers(){
  try { STATE.users = JSON.parse(localStorage.getItem(LS_USERS_KEY) || '[]'); }
  catch { STATE.users = []; }
}
function saveUsers(){ localStorage.setItem(LS_USERS_KEY, JSON.stringify(STATE.users)); }

function loadGamification(userId){
  if (!userId) return { xpTotal:0 };
  try {
    return Object.assign({ xpTotal:0 }, JSON.parse(localStorage.getItem(LS_GAM_PREFIX + userId) || '{}'));
  } catch {
    return { xpTotal:0 };
  }
}
function saveGamification(userId, data){
  if (!userId) return;
  localStorage.setItem(LS_GAM_PREFIX + userId, JSON.stringify(data));
}

function loadStats(userId){
  if (!userId) return {
    total:0, correct:0,
    byGroup: { math:{total:0,correct:0}, reading:{total:0,correct:0}, other:{total:0,correct:0} }
  };
  try {
    return Object.assign(
      {
        total:0, correct:0,
        byGroup: { math:{total:0,correct:0}, reading:{total:0,correct:0}, other:{total:0,correct:0} }
      },
      JSON.parse(localStorage.getItem(LS_STATS_PREFIX + userId) || '{}')
    );
  } catch {
    return {
      total:0, correct:0,
      byGroup: { math:{total:0,correct:0}, reading:{total:0,correct:0}, other:{total:0,correct:0} }
    };
  }
}
function saveStats(userId, stats){
  if (!userId) return;
  localStorage.setItem(LS_STATS_PREFIX + userId, JSON.stringify(stats));
}

/* ----------------- CATEGORY GROUPING (Math / Reading) ----------------- */
function getCategoryGroup(category) {
  if (!category) return 'other';
  const c = String(category).toLowerCase();
  if (c.includes('math') || c.includes('algebra') || c.includes('geometry') || c.includes('trig') || c.includes('function') || c.includes('graph') || c.includes('probability')) {
    return 'math';
  }
  if (c.includes('reading') || c.includes('writing') || c.includes('vocab') || c.includes('vocabulary') || c.includes('lit') || c.includes('verbal')) {
    return 'reading';
  }
  return 'other';
}

/* ----------------- SAT SCORE & EVOLUTION ----------------- */
function calculateVirtualSATScore(xpTotal) {
  const baseScore = 400;
  const xpForMax = 12000;
  let progress = xpTotal / xpForMax;
  if (progress > 1) progress = 1;
  const rawScore = baseScore + (progress * 1200);
  return Math.round(rawScore / 10) * 10;
}

function updateAvatarEvolution() {
  if (!STATE.currentUser) return;
  const avatar = byId('avatarCharacter');
  const scoreBadge = byId('avatarScoreDisplay');
  const homeScore = byId('homeScoreDisplay');
  const homeSpec = byId('homeSpecLabel');
  if (!avatar) return;

  const g = loadGamification(STATE.currentUser.id);
  const stats = loadStats(STATE.currentUser.id);
  const score = calculateVirtualSATScore(g.xpTotal || 0);

  if (scoreBadge) scoreBadge.textContent = `SAT: ${score}`;
  if (homeScore) homeScore.textContent = `Current SAT Score: ${score}`;

  // Fase de evolución por score
  let newPhase = 1;
  if (score >= 1000 && score < 1400) newPhase = 2;
  if (score >= 1400) newPhase = 3;

  // Detectar evolución de fase pura (1->2, 2->3)
  if (newPhase > STATE.currentPhase) {
    Sound.playEvolve();
    triggerConfetti();
    speakText("Evolution achieved. New systems online.");
  }
  STATE.currentPhase = newPhase;

  // Quitar clases previas
  avatar.classList.remove('phase-1','phase-2','phase-3','spec-math','spec-reading','spec-balance');
  avatar.classList.add('phase-' + newPhase);

  // --- BRANCHING REAL SEGÚN ESTADÍSTICAS ---
  const gm = stats.byGroup.math || {total:0,correct:0};
  const gr = stats.byGroup.reading || {total:0,correct:0};
  const go = stats.byGroup.other || {total:0,correct:0};

  const accMath = gm.total ? gm.correct / gm.total : 0;
  const accRead = gr.total ? gr.correct / gr.total : 0;
  const totalCore = gm.total + gr.total;

  let newSpec = 'none';
  let specText = 'Focus: Calibrating...';

  if (totalCore >= 6) {
    const diff = Math.abs(accMath - accRead);
    if (gm.total >= 4 && accMath >= 0.6 && accMath > accRead + 0.08) {
      newSpec = 'math';
      specText = `Focus: Math guardian (${Math.round(accMath*100)}% acc)`;
    } else if (gr.total >= 4 && accRead >= 0.6 && accRead > accMath + 0.08) {
      newSpec = 'reading';
      specText = `Focus: Reading guardian (${Math.round(accRead*100)}% acc)`;
    } else if (gm.total >= 4 && gr.total >= 4 && diff <= 0.1) {
      newSpec = 'balance';
      specText = `Focus: Balanced (Math & Reading)`;
    } else {
      newSpec = 'none';
      specText = 'Focus: Calibrating...';
    }
  }

  if (homeSpec) homeSpec.textContent = specText;

  if (newSpec !== 'none') {
    if (newSpec === 'math') avatar.classList.add('spec-math');
    if (newSpec === 'reading') avatar.classList.add('spec-reading');
    if (newSpec === 'balance') avatar.classList.add('spec-balance');
  }

  // Aviso cuando cambia especialización
  if (newSpec !== STATE.currentSpec && STATE.currentSpec !== 'none') {
    if (newSpec === 'math') speakText("Math specialization upgraded.");
    if (newSpec === 'reading') speakText("Verbal specialization upgraded.");
    if (newSpec === 'balance') speakText("Balanced build unlocked.");
  }
  STATE.currentSpec = newSpec;

  // Visual near-evolution
  const nearEvo = (score >= 950 && score < 1000) || (score >= 1350 && score < 1400);
  if (scoreBadge) {
    if (nearEvo) scoreBadge.classList.add('near-evolution');
    else scoreBadge.classList.remove('near-evolution');
  }
}

/* ----------------- VOICE ----------------- */
function speakText(text) {
  if (!STATE.voiceEnabled || !STATE.synth) return;
  try { STATE.synth.cancel(); } catch(_){}

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
  const v = voices.find(val => val.name && val.name.includes("Google US English")) || voices.find(val => val.lang === "en-US");
  if (v) u.voice = v;

  u.onstart = () => {
    STATE.isSpeaking = true;
    if (avatar) avatar.classList.add('talking');
  };
  u.onend = () => {
    STATE.isSpeaking = false;
    if (avatar) avatar.classList.remove('talking');
    if (bubble) setTimeout(() => bubble.classList.add('hidden'), 1600);
  };
  u.onerror = () => {
    STATE.isSpeaking = false;
    if (avatar) avatar.classList.remove('talking');
  };

  try {
    STATE.synth.speak(u);
  } catch(e){}
}
function stopVoice() {
  try { if (STATE.synth) STATE.synth.cancel(); } catch(_){}
  const a = byId('avatarCharacter'); if (a) a.classList.remove('talking');
  const b = byId('speechBubble'); if (b) b.classList.add('hidden');
}

/* ----------------- USERS ----------------- */
function renderUserList(){
  const list = byId('userList');
  const msg = byId('noUsersMsg');
  if (!list || !msg) return;

  list.innerHTML = '';
  if (!STATE.users.length){
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
    li.style.borderBottom = '1px solid rgba(148,163,184,0.25)';

    const span = document.createElement('span');
    span.textContent = u.name;

    const btn = document.createElement('button');
    btn.textContent = 'Select';
    btn.onclick = () => selectUser(u.id);

    li.append(span, btn);
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
  const greet = byId('homeGreeting');
  if (greet) greet.textContent = `Hi, ${u.name}!`;
  showScreen('screen-home');
}

function createUser(){
  const input = byId('newUserName');
  if (!input) return;
  const name = input.value.trim();
  if (!name) return;
  const u = { id: 'u_'+Date.now(), name };
  STATE.users.push(u);
  saveUsers();
  input.value = '';
  renderUserList();
  selectUser(u.id);
}

/* ----------------- QUESTIONS ----------------- */
async function loadQuestions(){
  try {
    const [qR, eR] = await Promise.all([
      fetch('questions.json'),
      fetch('explanations.json').catch(()=>null)
    ]);

    const qD = await qR.json();
    let eD = {};
    if (eR && eR.ok) {
      try { eD = await eR.json(); } catch(_) { eD = {}; }
    }

    STATE.questionsAll = qD.map((q,i) => {
      const id = 'q'+i;
      const e = eD[id] || {};
      return {
        ...q,
        _id:id,
        explanation: e.theory || e.explanation || '',
        explanationExample: e.example || '',
        explanationTitle: e.title || ''
      };
    });
    populateSubjects();
  } catch(e){
    console.error('Error loading questions/explanations', e);
  }
}

function populateSubjects(){
  const sel = byId('subjectSelect');
  if (!sel) return;
  const cats = [...new Set(STATE.questionsAll.map(q => q.category))].filter(Boolean);
  sel.innerHTML = '';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c.toUpperCase();
    sel.appendChild(opt);
  });
}

/* ----------------- STATS UPDATE ----------------- */
function updateStatsForAnswer(q, isCorrect){
  if (!STATE.currentUser || !q) return;
  const stats = loadStats(STATE.currentUser.id);
  stats.total++;
  if (isCorrect) stats.correct++;

  const group = getCategoryGroup(q.category);
  if (!stats.byGroup[group]) stats.byGroup[group] = {total:0, correct:0};
  stats.byGroup[group].total++;
  if (isCorrect) stats.byGroup[group].correct++;

  saveStats(STATE.currentUser.id, stats);
}

/* ----------------- ADAPTIVE LOGIC ----------------- */
function refreshQuizHeader(){
  const modeLabel = byId('quizModeLabel');
  const levelLabel = byId('quizLevelLabel');
  if (modeLabel) modeLabel.textContent = STATE.mode === 'adaptive' ? 'Adaptive' : 'Practice';
  if (levelLabel) levelLabel.textContent = `Lv.${STATE.currentLevel}`;
}

function adaptDifficulty(q, isCorrect){
  const group = getCategoryGroup(q.category);
  if (isCorrect) {
    STATE.streakCorrect++;
    STATE.failStreakByGroup[group] = 0;
  } else {
    STATE.streakCorrect = 0;
    STATE.failStreakByGroup[group] = (STATE.failStreakByGroup[group] || 0) + 1;
  }

  let levelChanged = false;

  // Subir nivel si hay racha de 4 aciertos
  if (isCorrect && STATE.streakCorrect >= 4 && STATE.currentLevel < 3) {
    STATE.currentLevel++;
    STATE.streakCorrect = 0;
    levelChanged = true;
    speakText(`Level up. Welcome to level ${STATE.currentLevel}.`);
  }

  // Bajar nivel si hay 2 fallos seguidos en el mismo grupo
  if (!isCorrect && STATE.failStreakByGroup[group] >= 2 && STATE.currentLevel > 1) {
    STATE.currentLevel--;
    STATE.failStreakByGroup[group] = 0;
    levelChanged = true;
    speakText(`Adjusting difficulty. Dropping to level ${STATE.currentLevel} for a cleaner run.`);
  }

  if (levelChanged) {
    Sound.playEvolve();
    refreshQuizHeader();
    // Reordenar cola de preguntas para acercarlas al nuevo nivel
    reorderRemainingQuestions();
  }
}

function reorderRemainingQuestions(){
  if (STATE.mode !== 'adaptive') return;
  // Reordenamos preguntas desde index+1 según cercanía al currentLevel
  const start = STATE.index + 1;
  if (start >= STATE.questions.length) return;
  const head = STATE.questions.slice(0, start);
  const tail = STATE.questions.slice(start);
  tail.sort((a,b) => {
    const da = Math.abs((a.level || 1) - STATE.currentLevel);
    const db = Math.abs((b.level || 1) - STATE.currentLevel);
    return da - db;
  });
  STATE.questions = head.concat(tail);
}

/* ----------------- QUIZ FLOW ----------------- */
function startQuiz(mode){
  if (!STATE.currentUser) {
    showScreen('screen-auth');
    return;
  }
  if (!STATE.questionsAll.length) return;

  Sound.init();

  STATE.mode = mode || 'practice';
  const subjSel = byId('subjectSelect');
  const lvlSel = byId('levelSelect');
  const subj = subjSel ? subjSel.value : '';
  const lvl = lvlSel ? lvlSel.value : '1';
  STATE.currentLevel = parseInt(lvl, 10) || 1;

  let pool = STATE.questionsAll.filter(q => (!subj || q.category === subj) && String(q.level) === String(lvl));

  if (!pool.length) {
    // Fallback: all questions of subject, any level
    pool = STATE.questionsAll.filter(q => !subj || q.category === subj);
  }
  if (!pool.length) {
    pool = STATE.questionsAll.slice();
  }

  // Barajar pool
  pool.sort(() => Math.random() - 0.5);

  // Para adaptive, usamos un pool algo más largo
  const count = (STATE.mode === 'adaptive') ? 30 : STATE.maxQuestions;
  STATE.questions = pool.slice(0, count);

  STATE.index = 0;
  STATE.score = 0;
  STATE.answered = false;
  STATE.answeredCount = 0;
  STATE.streakCorrect = 0;
  STATE.failStreakByGroup = { math:0, reading:0, other:0 };

  refreshQuizHeader();
  renderQuestion();
  showScreen('screen-quiz');
}

function renderQuestion(){
  const q = STATE.questions[STATE.index];
  if (!q) {
    endQuiz();
    return;
  }

  stopVoice();
  updateAvatarEvolution();

  const progress = byId('progressText');
  const scoreText = byId('scoreText');
  if (progress) {
    const total = Math.min(STATE.questions.length, STATE.maxQuestions);
    const current = Math.min(STATE.index + 1, total);
    progress.textContent = `Q ${current}/${total}`;
  }
  if (scoreText) scoreText.textContent = `Score: ${STATE.score}`;

  const qText = byId('questionText');
  if (qText) qText.textContent = q.q;

  const list = byId('answersList');
  if (list) {
    list.innerHTML = '';
    q.opts.forEach((opt, idx) => {
      const li = document.createElement('li');
      li.className = 'answer-option';
      li.innerHTML = `<span class="answer-letter">${String.fromCharCode(65+idx)}</span><span>${opt}</span>`;
      li.onclick = () => handleAnswer(idx, li);
      list.appendChild(li);
    });
  }

  const explBox = byId('explanationBox');
  if (explBox) explBox.classList.add('hidden');
  const nextBtn = byId('btnNextQuestion');
  if (nextBtn) nextBtn.classList.add('hidden');

  STATE.answered = false;
}

function handleAnswer(idx, li){
  if (STATE.answered) return;
  STATE.answered = true;
  STATE.answeredCount++;

  const q = STATE.questions[STATE.index];
  if (!q) return;
  const isCorrect = (idx === q.correct);

  if (isCorrect) {
    if (li) {
      li.classList.add('correct');
      li.classList.add('pop-effect');
      setTimeout(() => li.classList.remove('pop-effect'), 250);
    }
    Sound.playCorrect();
    STATE.score++;
    const g = loadGamification(STATE.currentUser.id);
    g.xpTotal = (g.xpTotal || 0) + 25;
    saveGamification(STATE.currentUser.id, g);
  } else {
    if (li) li.classList.add('wrong');
    const quizScreen = byId('screen-quiz');
    if (quizScreen) {
      quizScreen.classList.add('shake-effect');
      setTimeout(() => quizScreen.classList.remove('shake-effect'), 350);
    }
    Sound.playWrong();
    const list = byId('answersList');
    if (list && list.children[q.correct]) {
      list.children[q.correct].classList.add('correct');
    }
    const g = loadGamification(STATE.currentUser.id);
    g.xpTotal = (g.xpTotal || 0) + 5;
    saveGamification(STATE.currentUser.id, g);
  }

  // Actualizar estadísticas por grupo
  updateStatsForAnswer(q, isCorrect);

  // Adaptar dificultad solo en modo adaptive
  if (STATE.mode === 'adaptive') {
    adaptDifficulty(q, isCorrect);
  }

  updateAvatarEvolution();
  showExplanation(q, isCorrect);

  const nextBtn = byId('btnNextQuestion');
  if (nextBtn) nextBtn.classList.remove('hidden');
}

function showExplanation(q, isCorrect){
  const box = byId('explanationBox');
  const t = byId('explanationText');
  const ex = byId('explanationExample');
  if (t) t.textContent = q.explanation || '';
  if (ex) ex.textContent = q.explanationExample || '';
  if (box) box.classList.remove('hidden');

  let speech = isCorrect ? 'Correct. ' : 'Not quite. ';
  if (q.explanation) speech += q.explanation + ' ';
  if (q.explanationExample) speech += 'Example: ' + q.explanationExample;
  speakText(speech);
}

function endQuiz(){
  stopVoice();
  const total = Math.min(STATE.questions.length, STATE.maxQuestions, STATE.answeredCount || STATE.questions.length);
  const headline = byId('resultHeadline');
  const line = byId('resultLine');
  const extra = byId('resultExtra');

  if (headline) headline.textContent = 'Session complete';
  if (line) line.textContent = `You answered ${STATE.score} out of ${total} correctly.`;

  if (extra) {
    let msg = '';
    if (STATE.mode === 'adaptive') {
      msg += `Final adaptive level: ${STATE.currentLevel}. `;
    }
    const g = loadGamification(STATE.currentUser ? STATE.currentUser.id : null);
    const sat = calculateVirtualSATScore(g.xpTotal || 0);
    msg += `Your current virtual SAT score is around ${sat}.`;
    extra.textContent = msg;
  }

  showScreen('screen-results');
}

/* ----------------- INIT & LISTENERS ----------------- */
document.addEventListener('DOMContentLoaded', () => {
  loadUsers();
  renderUserList();
  loadQuestions();

  const last = localStorage.getItem(LS_ACTIVE_USER_KEY);
  if (last) {
    selectUser(last);
  } else {
    showScreen('screen-auth');
  }

  const btnCreate = byId('btnCreateUser');
  if (btnCreate) btnCreate.onclick = createUser;

  const btnPractice = byId('btnStartPractice');
  if (btnPractice) btnPractice.onclick = () => startQuiz('practice');

  const btnAdaptive = byId('btnStartAdaptive');
  if (btnAdaptive) btnAdaptive.onclick = () => startQuiz('adaptive');

  const btnNext = byId('btnNextQuestion');
  if (btnNext) btnNext.onclick = () => {
    if (STATE.index + 1 >= STATE.questions.length || STATE.answeredCount >= STATE.maxQuestions) {
      endQuiz();
    } else {
      STATE.index++;
      renderQuestion();
    }
  };

  const btnQuit = byId('btnQuitQuiz');
  if (btnQuit) btnQuit.onclick = () => {
    stopVoice();
    showScreen('screen-home');
  };

  const btnResHome = byId('btnResultsHome');
  if (btnResHome) btnResHome.onclick = () => {
    showScreen('screen-home');
  };

  const btnVoice = byId('btnToggleVoice');
  if (btnVoice) btnVoice.onclick = () => {
    STATE.voiceEnabled = !STATE.voiceEnabled;
    if (!STATE.voiceEnabled) stopVoice();
    btnVoice.textContent = STATE.voiceEnabled ? '🔊' : '🔇';
  };

  const userLabel = byId('currentUserLabel');
  if (userLabel) userLabel.onclick = () => {
    const menu = byId('userMenu');
    if (menu) menu.classList.toggle('hidden');
  };

  const logoutBtn = byId('menuLogout');
  if (logoutBtn) logoutBtn.onclick = () => {
    STATE.currentUser = null;
    localStorage.removeItem(LS_ACTIVE_USER_KEY);
    stopVoice();
    showScreen('screen-auth');
    const label = byId('currentUserLabel');
    if (label) label.textContent = 'No user';
  };
});
