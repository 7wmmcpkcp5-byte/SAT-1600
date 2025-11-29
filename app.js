// SAT PRO V2 PRO FULL EXTENDED
const LS_USERS_KEY = 'sat_pro_v2_users';
const LS_ACTIVE_USER_KEY = 'sat_pro_v2_active_user';
const LS_THEME_GLOBAL_KEY = 'sat_pro_v2_theme_global';
const LS_MISTAKES_PREFIX = 'sat_pro_v2_mistakes_';
const LS_STATS_PREFIX = 'sat_pro_v2_stats_';

const TIMED_SECONDS_PER_QUESTION = 75;
const EXAM_TOTAL_SECONDS = 45 * 60;

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
  examGlobalTimerId: null,
  examTimeLeft: 0
};

function byId(id){ return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('visible'));
  const el = byId(id);
  if (el) el.classList.add('visible');
}

function saveUsers(){
  localStorage.setItem(LS_USERS_KEY, JSON.stringify(STATE.users));
}
function loadUsers(){
  try {
    const raw = localStorage.getItem(LS_USERS_KEY);
    STATE.users = raw ? JSON.parse(raw) : [];
  } catch {
    STATE.users = [];
  }
}

function mistakesKey(userId){ return LS_MISTAKES_PREFIX + userId; }
function statsKey(userId){ return LS_STATS_PREFIX + userId; }

function loadMistakes(userId){
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(mistakesKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveMistakes(userId, arr){
  if (!userId) return;
  localStorage.setItem(mistakesKey(userId), JSON.stringify(arr));
}

function loadStats(userId){
  if (!userId) return { total:0, correct:0, perCategory:{}, perLevel:{} };
  try {
    const raw = localStorage.getItem(statsKey(userId));
    const base = { total:0, correct:0, perCategory:{}, perLevel:{} };
    if (!raw) return base;
    return Object.assign(base, JSON.parse(raw));
  } catch {
    return { total:0, correct:0, perCategory:{}, perLevel:{} };
  }
}
function saveStats(userId, stats){
  if (!userId) return;
  localStorage.setItem(statsKey(userId), JSON.stringify(stats));
}

function renderUserList(){
  const list = byId('userList');
  const msg = byId('noUsersMsg');
  list.innerHTML = '';
  if (!STATE.users.length){
    msg.classList.remove('hidden');
    return;
  }
  msg.classList.add('hidden');
  STATE.users.forEach(u => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = u.name;
    const btn = document.createElement('button');
    btn.textContent = 'Select';
    btn.addEventListener('click', () => selectUser(u.id));
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
  updateHeaderUserLabel();
  applyThemeForUser();
  updateHomeTexts();
  populateSubjects();
  showScreen('screen-home');
}

function updateHeaderUserLabel(){
  const label = byId('currentUserLabel');
  label.textContent = STATE.currentUser ? STATE.currentUser.name : 'No user';
}

function updateHomeTexts(){
  const h = byId('homeGreeting');
  const statsP = byId('statsSummary');
  if (!STATE.currentUser){
    h.textContent = 'Hi!';
    statsP.textContent = 'Select or create a user to start practicing.';
    return;
  }
  h.textContent = `Hi, ${STATE.currentUser.name}!`;
  const stats = loadStats(STATE.currentUser.id);
  if (!stats.total){
    statsP.textContent = 'Answer some questions to see your statistics here.';
  } else {
    const pct = Math.round((stats.correct / Math.max(1, stats.total)) * 100);
    statsP.textContent = `You have answered ${stats.correct} of ${stats.total} questions correctly (${pct}%).`;
  }
}

function createUser(){
  const input = byId('newUserName');
  const name = (input.value || '').trim();
  if (!name) return;
  const exists = STATE.users.some(u => u.name.toLowerCase() === name.toLowerCase());
  if (exists){
    alert('That name already exists.');
    return;
  }
  const u = { id: 'u_' + Date.now(), name, theme: null };
  STATE.users.push(u);
  saveUsers();
  renderUserList();
  input.value = '';
  selectUser(u.id);
}

/* THEME */
function setTheme(theme){
  const body = document.body;
  if (theme === 'light'){
    body.classList.add('light');
  } else {
    body.classList.remove('light');
  }
}
function applyThemeGlobal(){
  const t = localStorage.getItem(LS_THEME_GLOBAL_KEY) || 'dark';
  setTheme(t);
}
function applyThemeForUser(){
  if (!STATE.currentUser){
    applyThemeGlobal();
    return;
  }
  const theme = STATE.currentUser.theme || 'dark';
  setTheme(theme);
}
function toggleTheme(){
  if (STATE.currentUser){
    const current = STATE.currentUser.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    STATE.currentUser.theme = next;
    saveUsers();
    setTheme(next);
  } else {
    const current = localStorage.getItem(LS_THEME_GLOBAL_KEY) || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(LS_THEME_GLOBAL_KEY, next);
    setTheme(next);
  }
}

/* QUESTIONS LOADING */
async function loadQuestions(){
  try {
    const res = await fetch('questions.json');
    const data = await res.json();
    STATE.questionsAll = data.map((q, idx) => ({
      _id: 'q' + idx,
      text: q.q,
      opts: q.opts,
      correctIndex: q.correct,
      category: q.category,
      level: String(q.level || 1),
      explanation: q.explanation || ''
    }));
    populateSubjects();
  } catch (e){
    console.error('Error loading questions.json', e);
    alert('Could not load questions.json');
  }
}

function populateSubjects(){
  const sel = byId('subjectSelect');
  if (!sel || !STATE.questionsAll.length) return;
  const cats = [...new Set(STATE.questionsAll.map(q => q.category))];
  sel.innerHTML = '';
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c.charAt(0).toUpperCase() + c.slice(1);
    sel.appendChild(opt);
  });
  if (!STATE.subject && cats.length) STATE.subject = cats[0];
}

/* STATS HELPERS */
function updateStatsForQuestion(isCorrect, q){
  if (!STATE.currentUser || !q) return;
  const stats = loadStats(STATE.currentUser.id);
  stats.total += 1;
  if (isCorrect) stats.correct += 1;

  if (!stats.perCategory[q.category]) stats.perCategory[q.category] = { total:0, correct:0 };
  const sc = stats.perCategory[q.category];
  sc.total += 1;
  if (isCorrect) sc.correct += 1;

  if (!stats.perLevel[q.level]) stats.perLevel[q.level] = { total:0, correct:0 };
  const sl = stats.perLevel[q.level];
  sl.total += 1;
  if (isCorrect) sl.correct += 1;

  saveStats(STATE.currentUser.id, stats);
}

function buildDashboard(){
  const o = byId('dashOverview');
  const bySub = byId('dashBySubject');
  const byLevel = byId('dashByLevel');
  if (!STATE.currentUser){
    o.textContent = 'Select a user to see stats.';
    bySub.innerHTML = '';
    byLevel.innerHTML = '';
    return;
  }
  const stats = loadStats(STATE.currentUser.id);
  if (!stats.total){
    o.textContent = 'No questions answered yet.';
    bySub.innerHTML = '';
    byLevel.innerHTML = '';
    return;
  }
  const pct = Math.round((stats.correct / Math.max(1, stats.total)) * 100);
  o.textContent = `Total answered: ${stats.total} • Correct: ${stats.correct} • Accuracy: ${pct}%`;

  bySub.innerHTML = '';
  for (const [cat, val] of Object.entries(stats.perCategory || {})){
    const p = Math.round((val.correct / Math.max(1, val.total)) * 100);
    const row = document.createElement('div');
    row.className = 'dash-row';
    row.innerHTML = `
      <div class="dash-row-label">
        <span>${cat}</span>
        <span>${val.correct}/${val.total} (${p}%)</span>
      </div>
      <div class="dash-bar"><div class="dash-bar-inner" style="width:${p}%;"></div></div>
    `;
    bySub.appendChild(row);
  }

  byLevel.innerHTML = '';
  const levels = ['1','2','3'];
  levels.forEach(lvl => {
    const val = (stats.perLevel || {})[lvl];
    if (!val) return;
    const p = Math.round((val.correct / Math.max(1, val.total)) * 100);
    const row = document.createElement('div');
    row.className = 'dash-row';
    row.innerHTML = `
      <div class="dash-row-label">
        <span>Level ${lvl}</span>
        <span>${val.correct}/${val.total} (${p}%)</span>
      </div>
      <div class="dash-bar"><div class="dash-bar-inner" style="width:${p}%;"></div></div>
    `;
    byLevel.appendChild(row);
  });
}

/* ADAPTIVE LOGIC */
function selectAdaptiveLevels(){
  if (!STATE.currentUser) return ['1','2','3'];
  const stats = loadStats(STATE.currentUser.id);
  const arr = [];
  ['1','2','3'].forEach(lvl => {
    const v = (stats.perLevel || {})[lvl];
    if (!v || !v.total){
      arr.push(lvl);
      return;
    }
    const p = v.correct / v.total;
    if (p < 0.8) arr.push(lvl);
  });
  if (!arr.length) return ['2','3'];
  return arr;
}

/* QUIZ BUILDERS */
function buildPool(subject, levels, fromMistakes, adaptive){
  let base = STATE.questionsAll;
  if (!base.length) return [];
  base = base.filter(q => (!subject || q.category === subject));
  if (adaptive){
    base = base.filter(q => levels.includes(q.level));
  } else if (levels){
    base = base.filter(q => levels.includes(q.level));
  }

  if (fromMistakes && STATE.currentUser){
    const ids = loadMistakes(STATE.currentUser.id);
    if (!ids.length) return [];
    const set = new Set(ids);
    base = base.filter(q => set.has(q._id));
  }
  return base.slice();
}

function shuffle(arr){
  for (let i = arr.length -1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}

/* TIMER */
function clearPerQuestionTimer(){
  if (STATE.timerId){
    clearInterval(STATE.timerId);
    STATE.timerId = null;
  }
}
function clearExamTimer(){
  if (STATE.examGlobalTimerId){
    clearInterval(STATE.examGlobalTimerId);
    STATE.examGlobalTimerId = null;
  }
}

/* START MODES */
function startQuiz(mode){
  if (!STATE.currentUser){
    alert('Select a user first.');
    showScreen('screen-auth');
    return;
  }
  STATE.mode = mode;
  const subjSel = byId('subjectSelect');
  STATE.subject = subjSel && subjSel.value ? subjSel.value : null;
  STATE.level = byId('levelSelect').value || '1';

  let levels = [STATE.level];
  let fromMistakes = false;
  let adaptive = false;

  if (mode === 'mistakes') {
    fromMistakes = true;
  }
  if (mode === 'adaptive'){
    adaptive = true;
    levels = selectAdaptiveLevels();
  }
  if (mode === 'exam'){
    levels = ['1','2','3'];
  }

  let pool = buildPool(STATE.subject, levels, fromMistakes, adaptive);
  if (!pool.length){
    alert('No questions available for this selection yet.');
    return;
  }

  shuffle(pool);
  if (mode === 'exam' && pool.length > 40){
    pool = pool.slice(0, 40);
  }

  STATE.questions = pool;
  STATE.index = 0;
  STATE.score = 0;
  STATE.answered = false;
  clearPerQuestionTimer();
  clearExamTimer();

  if (mode === 'exam'){
    STATE.examTimeLeft = EXAM_TOTAL_SECONDS;
    startExamTimer();
  }

  renderCurrentQuestion();
  showScreen('screen-quiz');
}

function startExamTimer(){
  const timerBox = byId('timerBox');
  const timerText = byId('timerText');
  timerBox.classList.remove('hidden');
  STATE.examGlobalTimerId = setInterval(() => {
    STATE.examTimeLeft -= 1;
    if (STATE.examTimeLeft <= 0){
      timerText.textContent = '0:00';
      clearExamTimer();
      endQuiz(true);
      return;
    }
    const m = Math.floor(STATE.examTimeLeft / 60);
    const s = STATE.examTimeLeft % 60;
    timerText.textContent = m + ':' + String(s).padStart(2,'0');
  }, 1000);
}

/* RENDER QUESTION */
function renderCurrentQuestion(){
  const q = STATE.questions[STATE.index];
  if (!q) return;

  const modeLabel = byId('quizModeLabel');
  const subjectLabel = byId('quizSubjectLabel');
  const timerBox = byId('timerBox');
  const timerText = byId('timerText');
  const progress = byId('progressText');
  const scoreText = byId('scoreText');
  const questionText = byId('questionText');
  const answersList = byId('answersList');
  const explBox = byId('explanationBox');
  const explText = byId('explanationText');
  const nextBtn = byId('btnNextQuestion');

  if (STATE.mode === 'practice') modeLabel.textContent = 'Practice mode';
  else if (STATE.mode === 'timed') modeLabel.textContent = 'Timed mode';
  else if (STATE.mode === 'mistakes') modeLabel.textContent = 'Mistakes mode';
  else if (STATE.mode === 'adaptive') modeLabel.textContent = 'Adaptive mode';
  else modeLabel.textContent = 'Exam mode';

  subjectLabel.textContent = `${(STATE.subject || 'All').toUpperCase()} • Level ${STATE.level}`;

  progress.textContent = `Question ${STATE.index + 1} / ${STATE.questions.length}`;
  scoreText.textContent = `Score: ${STATE.score}`;

  questionText.textContent = q.text || '';
  answersList.innerHTML = '';

  if (Array.isArray(q.opts)){
    q.opts.forEach((ans, idx) => {
      const li = document.createElement('li');
      li.className = 'answer-option';
      li.textContent = ans;
      li.dataset.index = String(idx);
      li.addEventListener('click', () => handleAnswerClick(li, idx));
      answersList.appendChild(li);
    });
  }

  explBox.classList.add('hidden');
  explText.textContent = '';
  nextBtn.classList.add('hidden');
  STATE.answered = false;

  clearPerQuestionTimer();
  if (STATE.mode === 'timed'){
    timerBox.classList.remove('hidden');
    STATE.timeLeft = TIMED_SECONDS_PER_QUESTION;
    timerText.textContent = STATE.timeLeft + 's';
    STATE.timerId = setInterval(() => {
      STATE.timeLeft -= 1;
      if (STATE.timeLeft <= 0){
        timerText.textContent = '0s';
        clearPerQuestionTimer();
        handleTimeout();
      } else {
        timerText.textContent = STATE.timeLeft + 's';
      }
    }, 1000);
  } else if (STATE.mode !== 'exam'){
    timerBox.classList.add('hidden');
  }
}

function handleTimeout(){
  if (STATE.answered) return;
  const q = STATE.questions[STATE.index];
  const answersList = byId('answersList');
  const children = answersList.querySelectorAll('.answer-option');
  children.forEach((el, idx) => {
    if (idx === q.correctIndex) el.classList.add('correct');
  });
  registerWrong(q);
  if (STATE.mode !== 'exam'){
    showExplanation(q);
  }
  byId('btnNextQuestion').classList.remove('hidden');
  STATE.answered = true;
}

/* ANSWERS */
function handleAnswerClick(li, idx){
  if (STATE.answered) return;
  const q = STATE.questions[STATE.index];
  const answersList = byId('answersList');
  const children = answersList.querySelectorAll('.answer-option');
  children.forEach(el => el.classList.remove('correct','wrong'));

  let isCorrect = false;
  if (idx === q.correctIndex){
    li.classList.add('correct');
    STATE.score += 1;
    isCorrect = true;
  } else {
    li.classList.add('wrong');
    const correct = children[q.correctIndex];
    if (correct) correct.classList.add('correct');
  }

  updateStatsForQuestion(isCorrect, q);
  if (isCorrect) registerCorrect(q);
  else registerWrong(q);

  if (STATE.mode !== 'exam'){
    showExplanation(q);
  }

  byId('scoreText').textContent = `Score: ${STATE.score}`;
  byId('btnNextQuestion').classList.remove('hidden');
  STATE.answered = true;
  clearPerQuestionTimer();
}

function showExplanation(q){
  const explBox = byId('explanationBox');
  const explText = byId('explanationText');
  if (q.explanation){
    explText.textContent = q.explanation;
    explBox.classList.remove('hidden');
  } else {
    explBox.classList.add('hidden');
  }
}

function registerCorrect(q){
  if (!STATE.currentUser || !q) return;
}
function registerWrong(q){
  if (!STATE.currentUser || !q) return;
  const arr = loadMistakes(STATE.currentUser.id);
  if (!arr.includes(q._id)){
    arr.push(q._id);
    saveMistakes(STATE.currentUser.id, arr);
  }
}

function nextQuestion(){
  if (STATE.index + 1 >= STATE.questions.length){
    endQuiz(false);
  } else {
    STATE.index += 1;
    renderCurrentQuestion();
  }
}

function endQuiz(fromTimer){
  clearPerQuestionTimer();
  if (STATE.mode === 'exam'){
    clearExamTimer();
  }
  const total = STATE.questions.length;
  const correct = STATE.score;
  const pct = Math.round((correct / Math.max(1,total)) * 100);

  const headline = byId('resultHeadline');
  const line = byId('resultLine');
  const extra = byId('resultExtra');

  if (STATE.mode === 'exam'){
    headline.textContent = fromTimer ? 'Time is up ⏱' : 'Exam finished 📝';
    line.textContent = `Correct answers: ${correct} / ${total} • Accuracy: ${pct}%`;
    extra.textContent = 'Use Mistakes mode to review the questions you missed. This simulates a SAT-style block: no explanations until the end.';
  } else {
    line.textContent = `You answered ${correct} of ${total} questions correctly (${pct}%).`;
    if (pct >= 80){
      headline.textContent = 'Great job! 🎯';
      extra.textContent = 'You are on track. Keep practicing to fine-tune small details.';
    } else if (pct >= 50){
      headline.textContent = 'Nice progress 💪';
      extra.textContent = 'Focus on reviewing your mistakes to strengthen weaker areas.';
    } else {
      headline.textContent = 'Good starting point 🚀';
      extra.textContent = 'Use Practice and Adaptive modes to build a solid base step by step.';
    }
  }

  showScreen('screen-results');
}

function quitQuiz(){
  clearPerQuestionTimer();
  clearExamTimer();
  showScreen('screen-home');
}

/* LOGOUT & DELETE USER */
function logout(){
  STATE.currentUser = null;
  localStorage.removeItem(LS_ACTIVE_USER_KEY);
  updateHeaderUserLabel();
  applyThemeGlobal();
  showScreen('screen-auth');
  const menu = byId('userMenu');
  if (menu) menu.classList.add('hidden');
}

function deleteUser(){
  if (!STATE.currentUser) return;
  const ok = confirm(`Delete user "${STATE.currentUser.name}"? This cannot be undone.`);
  if (!ok) return;
  const id = STATE.currentUser.id;

  STATE.users = STATE.users.filter(u => u.id !== id);
  saveUsers();

  localStorage.removeItem(statsKey(id));
  localStorage.removeItem(mistakesKey(id));

  logout();
}

/* EVENTS */
function setupListeners(){
  byId('btnCreateUser').addEventListener('click', createUser);
  byId('newUserName').addEventListener('keydown', e => {
    if (e.key === 'Enter') createUser();
  });

  byId('btnStartPractice').addEventListener('click', () => startQuiz('practice'));
  byId('btnStartTimed').addEventListener('click', () => startQuiz('timed'));
  byId('btnStartMistakes').addEventListener('click', () => startQuiz('mistakes'));
  byId('btnStartAdaptive').addEventListener('click', () => startQuiz('adaptive'));
  byId('btnStartExam').addEventListener('click', () => startQuiz('exam'));

  byId('btnNextQuestion').addEventListener('click', nextQuestion);
  byId('btnQuitQuiz').addEventListener('click', quitQuiz);
  byId('btnResultsHome').addEventListener('click', () => showScreen('screen-home'));
  byId('btnResultsMistakes').addEventListener('click', () => startQuiz('mistakes'));

  byId('btnChangeUser').addEventListener('click', () => {
    logout();
  });
  byId('btnLogoutHome').addEventListener('click', () => {
    logout();
  });

  byId('btnGoSettings').addEventListener('click', () => showScreen('screen-settings'));
  byId('btnSettingsBack').addEventListener('click', () => {
    if (STATE.currentUser) showScreen('screen-home');
    else showScreen('screen-auth');
  });
  byId('btnToggleTheme').addEventListener('click', toggleTheme);

  byId('btnGoDashboard').addEventListener('click', () => {
    buildDashboard();
    showScreen('screen-dashboard');
  });
  byId('btnDashboardBack').addEventListener('click', () => {
    if (STATE.currentUser) showScreen('screen-home');
    else showScreen('screen-auth');
  });

  const userLabel = byId('currentUserLabel');
  const userMenu = byId('userMenu');
  userLabel.addEventListener('click', (e) => {
    e.stopPropagation();
    userMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!userMenu.contains(e.target) && e.target !== userLabel){
      userMenu.classList.add('hidden');
    }
  });

  byId('menuProfile').addEventListener('click', () => {
    userMenu.classList.add('hidden');
    if (STATE.currentUser) showScreen('screen-home');
    else showScreen('screen-auth');
  });
  byId('menuToggleTheme').addEventListener('click', () => {
    toggleTheme();
  });
  byId('menuLogout').addEventListener('click', () => {
    logout();
  });
  byId('menuDeleteUser').addEventListener('click', () => {
    deleteUser();
  });

  byId('subjectSelect').addEventListener('change', e => {
    STATE.subject = e.target.value;
  });
}

/* INIT */
document.addEventListener('DOMContentLoaded', () => {
  setupListeners();
  loadUsers();
  const lastId = localStorage.getItem(LS_ACTIVE_USER_KEY);
  if (lastId){
    const u = STATE.users.find(x => x.id === lastId);
    if (u){
      STATE.currentUser = u;
      applyThemeForUser();
      updateHeaderUserLabel();
      updateHomeTexts();
      showScreen('screen-home');
    } else {
      applyThemeGlobal();
      renderUserList();
      showScreen('screen-auth');
    }
  } else {
    applyThemeGlobal();
    renderUserList();
    showScreen('screen-auth');
  }
  loadQuestions();
});
