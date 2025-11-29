// SAT PRO complete – root JSON version
// Uses external JSON files:
//   math_level1.json, math_level2.json, math_level3.json
//   reading_level1.json, reading_level2.json, reading_level3.json
//   vocab_level1.json, vocab_level2.json, vocab_level3.json

const STORAGE_USERS = "sat_pro_users_v2";
const STORAGE_CURRENT = "sat_pro_current_user_v2";

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

// ------- User storage helpers -------

function loadUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_USERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
}

function getCurrentUserId() {
  return localStorage.getItem(STORAGE_CURRENT);
}

function setCurrentUserId(id) {
  if (!id) localStorage.removeItem(STORAGE_CURRENT);
  else localStorage.setItem(STORAGE_CURRENT, id);
}

function ensureUserShape(user) {
  if (!user.stats) {
    user.stats = {
      totalAnswered: 0,
      totalCorrect: 0,
      bySection: {
        math: { answered: 0, correct: 0 },
        reading: { answered: 0, correct: 0 },
        vocab: { answered: 0, correct: 0 }
      }
    };
  }
  if (!user.mistakes) user.mistakes = []; // {id, section, level}
}

function findUser(users, id) {
  return users.find((u) => u.id === id);
}

// ------- UI helpers -------

function showScreen(screenId) {
  qsa(".screen").forEach((s) => {
    s.classList.toggle("active", s.id === screenId);
  });
}

function showSection(section) {
  qsa(".section").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `section-${section}`);
  });
  qsa(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === section);
  });
}

// ------- User login & creation -------

function renderUserList() {
  const list = qs("#userList");
  const users = loadUsers();

  if (!users.length) {
    list.classList.add("empty");
    list.innerHTML = '<p class="muted">No users yet. Create the first one.</p>';
    return;
  }

  list.classList.remove("empty");
  list.innerHTML = "";

  users.forEach((u) => {
    ensureUserShape(u);
    const row = document.createElement("div");
    row.className = "user-row";

    const left = document.createElement("div");
    left.className = "user-main";
    left.textContent = u.name;

    const meta = document.createElement("div");
    meta.className = "user-meta";
    const answered = u.stats.totalAnswered || 0;
    const correct = u.stats.totalCorrect || 0;
    const acc = answered ? Math.round((correct / answered) * 100) : 0;
    meta.textContent = `Answered: ${answered} · ${acc}%`;

    const right = document.createElement("div");
    const btn = document.createElement("button");
    btn.className = "secondary-btn small";
    btn.textContent = "Login";
    btn.addEventListener("click", () => promptPin(u));
    right.appendChild(btn);

    row.appendChild(left);
    row.appendChild(meta);
    row.appendChild(right);

    list.appendChild(row);
  });
}

function promptPin(user) {
  if (!user.pin) {
    completeLogin(user);
    return;
  }
  const pin = prompt(`PIN for ${user.name}:`);
  if (pin === null) return;
  if (pin === user.pin) {
    completeLogin(user);
  } else {
    alert("Incorrect PIN.");
  }
}

function completeLogin(user) {
  const users = loadUsers();
  const stored = users.find((u) => u.id === user.id);
  if (!stored) return;
  ensureUserShape(stored);
  saveUsers(users);

  setCurrentUserId(stored.id);
  qs("#currentUserName").textContent = stored.name;
  showScreen("appScreen");
  showSection("dashboard");
  updateDashboard(stored);
}

function setupCreateUser() {
  const showBtn = qs("#showCreateUserBtn");
  const form = qs("#createUserForm");
  const cancelBtn = qs("#cancelCreateUserBtn");
  const nameInput = qs("#newUserName");
  const pinInput = qs("#newUserPin");

  showBtn.addEventListener("click", () => {
    form.classList.remove("hidden");
    showBtn.classList.add("hidden");
    nameInput.focus();
  });

  cancelBtn.addEventListener("click", () => {
    form.classList.add("hidden");
    showBtn.classList.remove("hidden");
    nameInput.value = "";
    pinInput.value = "";
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const pin = pinInput.value.trim();
    if (!name) {
      alert("Enter a name");
      return;
    }

    const users = loadUsers();
    const exists = users.find((u) => u.name === name);
    if (exists) {
      alert("User with that name already exists.");
      return;
    }

    const newUser = {
      id: "u_" + Date.now(),
      name,
      pin: pin || null,
      stats: null,
      mistakes: []
    };
    ensureUserShape(newUser);
    users.push(newUser);
    saveUsers(users);

    nameInput.value = "";
    pinInput.value = "";
    form.classList.add("hidden");
    showBtn.classList.remove("hidden");

    renderUserList();
    completeLogin(newUser);
  });
}

function setupCurrentUserButton() {
  qs("#currentUserBtn").addEventListener("click", () => {
    setCurrentUserId(null);
    qs("#currentUserName").textContent = "No user";
    showScreen("loginScreen");
    renderUserList();
  });
}

// ------- Dashboard -------

function updateDashboard(user) {
  ensureUserShape(user);
  const answered = user.stats.totalAnswered || 0;
  const correct = user.stats.totalCorrect || 0;
  const acc = answered ? Math.round((correct / answered) * 100) : 0;

  qs("#overallAnswered").textContent = answered;
  qs("#overallAccuracy").textContent = acc + "%";

  ["math", "reading", "vocab"].forEach((section) => {
    const secStats = user.stats.bySection[section] || {
      answered: 0,
      correct: 0
    };
    const a = secStats.answered || 0;
    const c = secStats.correct || 0;
    const sAcc = a ? Math.round((c / a) * 100) : 0;
    qs(`#${section}Answered`).textContent = a;
    qs(`#${section}Accuracy`).textContent = sAcc + "%";
  });

  const mistakesCount = user.mistakes.length;
  qs("#mistakesSummary").textContent =
    mistakesCount === 0
      ? "No mistakes stored yet."
      : `${mistakesCount} questions saved as mistakes.`;
}

function recordResult(user, section, isCorrect, questionId, level) {
  ensureUserShape(user);
  user.stats.totalAnswered++;
  if (isCorrect) user.stats.totalCorrect++;

  const secStats = user.stats.bySection[section];
  secStats.answered++;
  if (isCorrect) secStats.correct++;

  const idx = user.mistakes.findIndex((m) => m.id === questionId);
  if (!isCorrect) {
    if (idx === -1) {
      user.mistakes.push({ id: questionId, section, level });
    }
  } else {
    if (idx !== -1) {
      user.mistakes.splice(idx, 1);
    }
  }

  const users = loadUsers();
  const pos = users.findIndex((u) => u.id === user.id);
  if (pos !== -1) {
    users[pos] = user;
    saveUsers(users);
  }
  updateDashboard(user);
}

// ------- Question loading from JSON in root -------

const questionCache = {}; // { math: {1:[...],2:[...],3:[...]}, ... }

async function loadQuestions(section, level) {
  if (!questionCache._all) {
    const res = await fetch("questions.json");
    if (!res.ok) throw new Error("Cannot load questions.json");
    const data = await res.json();
    // Data is list of {q, opts, correct, category, level}
    questionCache._all = data.map((item, index) => ({
      id: `${item.category}_${item.level}_${index}`,
      section: item.category,
      level: item.level,
      text: item.q,
      options: item.opts,
      correctIndex: item.correct
    }));
  }

  if (!questionCache[section]) questionCache[section] = {};
  if (!questionCache[section][level]) {
    questionCache[section][level] = questionCache._all.filter(
      (q) => q.section === section && String(q.level) === String(level)
    );
  }
  return questionCache[section][level];
}

function renderQuestionCard(q, section, level, number, total) {
  const optionsHtml = q.options
    .map(
      (opt, i) =>
        `<button class="option-btn"><strong>${String.fromCharCode(
          65 + i
        )}.</strong> ${opt}</button>`
    )
    .join("");
  return `
    <article class="question-card">
      <div class="question-header">
        <span>${section.toUpperCase()} · L${level}</span>
        <span>Q ${number}/${total}</span>
      </div>
      <p class="question-text">${q.text}</p>
      <div class="options-list">
        ${optionsHtml}
      </div>
      <p class="feedback"></p>
      <div class="controls-row">
        <button class="secondary-btn small prev-btn">Prev</button>
        <button class="secondary-btn small next-btn">Next</button>
      </div>
    </article>
  `;
}

// ------- Practice mode -------

async function startPractice(section, level, containerSelector) {
  const currentId = getCurrentUserId();
  if (!currentId) {
    alert("Select or create a user first.");
    return;
  }
  const users = loadUsers();
  const user = findUser(users, currentId);
  if (!user) return;
  ensureUserShape(user);

  let bank;
  try {
    bank = await loadQuestions(section, level);
  } catch (e) {
    console.error(e);
    alert("Error loading questions for this level.");
    return;
  }

  if (!bank || !bank.length) {
    alert("No questions available for this level.");
    return;
  }

  const container = qs(containerSelector);
  container.classList.remove("hidden");

  const questions = [...bank].sort(() => Math.random() - 0.5);
  let index = 0;

  function render() {
    const q = questions[index];
    container.innerHTML = renderQuestionCard(
      q,
      section,
      level,
      index + 1,
      questions.length
    );

    const optionBtns = container.querySelectorAll(".option-btn");
    const feedbackEl = container.querySelector(".feedback");
    let answered = false;

    optionBtns.forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const isCorrect = idx === q.correctIndex;

        optionBtns.forEach((b, i) => {
          if (i === q.correctIndex) b.classList.add("correct");
          else if (i === idx) b.classList.add("incorrect");
        });

        feedbackEl.textContent = isCorrect
          ? "Correct."
          : "Not quite.";
        feedbackEl.classList.toggle("ok", isCorrect);
        feedbackEl.classList.toggle("bad", !isCorrect);

        recordResult(user, section, isCorrect, q.id, level);
      });
    });

    const prevBtn = container.querySelector(".prev-btn");
    const nextBtn = container.querySelector(".next-btn");
    prevBtn.addEventListener("click", () => {
      if (index > 0) {
        index--;
        render();
      }
    });
    nextBtn.addEventListener("click", () => {
      if (index < questions.length - 1) {
        index++;
        render();
      }
    });
  }

  render();
}

// ------- Mistakes mode -------

async function startMistakesPractice() {
  const currentId = getCurrentUserId();
  if (!currentId) {
    alert("Select a user first.");
    return;
  }
  const users = loadUsers();
  const user = findUser(users, currentId);
  if (!user) return;
  ensureUserShape(user);

  const mistakeRefs = user.mistakes;
  if (!mistakeRefs.length) {
    alert("No mistakes stored yet.");
    return;
  }

  const resolved = [];
  for (const m of mistakeRefs) {
    const bank = await loadQuestions(m.section, m.level);
    const q = bank.find((item) => item.id === m.id);
    if (q) resolved.push({ q, section: m.section, level: m.level });
  }

  if (!resolved.length) {
    alert("Could not resolve questions for mistakes.");
    return;
  }

  const container = qs("#mistakesQuestionContainer");
  container.classList.remove("hidden");

  let index = 0;

  function render() {
    const item = resolved[index];
    const q = item.q;
    container.innerHTML = renderQuestionCard(
      q,
      item.section,
      item.level,
      index + 1,
      resolved.length
    );

    const optionBtns = container.querySelectorAll(".option-btn");
    const feedbackEl = container.querySelector(".feedback");
    let answered = false;

    optionBtns.forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const isCorrect = idx === q.correctIndex;

        optionBtns.forEach((b, i) => {
          if (i === q.correctIndex) b.classList.add("correct");
          else if (i === idx) b.classList.add("incorrect");
        });

        feedbackEl.textContent = isCorrect
          ? "Correct – removed from mistakes."
          : "Still incorrect. Try again.";
        feedbackEl.classList.toggle("ok", isCorrect);
        feedbackEl.classList.toggle("bad", !isCorrect);

        recordResult(user, item.section, isCorrect, q.id, item.level);
      });
    });

    const prevBtn = container.querySelector(".prev-btn");
    const nextBtn = container.querySelector(".next-btn");
    prevBtn.addEventListener("click", () => {
      if (index > 0) {
        index--;
        render();
      }
    });
    nextBtn.addEventListener("click", () => {
      if (index < resolved.length - 1) {
        index++;
        render();
      }
    });
  }

  render();
}

function clearAllMistakes() {
  const currentId = getCurrentUserId();
  if (!currentId) {
    alert("Select a user first.");
    return;
  }
  const users = loadUsers();
  const user = findUser(users, currentId);
  if (!user) return;
  ensureUserShape(user);

  if (!user.mistakes.length) {
    alert("No mistakes to clear.");
    return;
  }
  if (!confirm("Clear all mistakes for this user?")) return;

  user.mistakes = [];
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx !== -1) {
    users[idx] = user;
    saveUsers(users);
  }
  updateDashboard(user);
  qs("#mistakesQuestionContainer").classList.add("hidden");
}

// ------- Timed tests -------

let timedInterval = null;
let timedRemainingSeconds = 0;

async function startTimedTest() {
  const currentId = getCurrentUserId();
  if (!currentId) {
    alert("Select a user first.");
    return;
  }
  const users = loadUsers();
  const user = findUser(users, currentId);
  if (!user) return;
  ensureUserShape(user);

  const section = qs("#timedSectionSelect").value;
  const level = qs("#timedLevelSelect").value;
  const count = parseInt(qs("#timedCountSelect").value, 10);
  const minutes = parseInt(qs("#timedMinutesSelect").value, 10);

  let bank;
  try {
    bank = await loadQuestions(section, level);
  } catch (e) {
    console.error(e);
    alert("Error loading questions for timed test.");
    return;
  }

  if (!bank || !bank.length) {
    alert("No questions available.");
    return;
  }

  const shuffled = [...bank].sort(() => Math.random() - 0.5);
  const questions = shuffled.slice(0, Math.min(count, shuffled.length));
  if (!questions.length) {
    alert("No questions selected.");
    return;
  }

  const container = qs("#timedQuestionContainer");
  const resultBox = qs("#timedResult");
  const timerEl = qs("#timedTimer");
  const timerText = qs("#timedTimerText");

  container.classList.remove("hidden");
  resultBox.classList.add("hidden");

  let index = 0;
  let answered = 0;
  let correct = 0;

  if (timedInterval) clearInterval(timedInterval);
  timedRemainingSeconds = minutes * 60;
  timerEl.classList.remove("hidden", "urgent");
  updateTimerDisplay(timerText, timerEl);

  timedInterval = setInterval(() => {
    timedRemainingSeconds--;
    if (timedRemainingSeconds <= 0) {
      timedRemainingSeconds = 0;
      updateTimerDisplay(timerText, timerEl);
      clearInterval(timedInterval);
      finish();
    } else {
      updateTimerDisplay(timerText, timerEl);
    }
  }, 1000);

  function updateTimerDisplay(textEl, timerContainer) {
    const m = Math.floor(timedRemainingSeconds / 60);
    const s = timedRemainingSeconds % 60;
    textEl.textContent = `${m}:${s.toString().padStart(2, "0")}`;
    if (timedRemainingSeconds <= 60) {
      timerContainer.classList.add("urgent");
    } else {
      timerContainer.classList.remove("urgent");
    }
  }

  function renderTimed() {
    const q = questions[index];
    container.innerHTML = renderQuestionCard(
      q,
      section,
      level,
      index + 1,
      questions.length
    );

    const optionBtns = container.querySelectorAll(".option-btn");
    const feedbackEl = container.querySelector(".feedback");
    let localAnswered = false;

    optionBtns.forEach((btn, idx) => {
      btn.addEventListener("click", () => {
        if (localAnswered) return;
        localAnswered = true;
        const isCorrect = idx === q.correctIndex;
        answered++;
        if (isCorrect) correct++;

        optionBtns.forEach((b, i) => {
          if (i === q.correctIndex) b.classList.add("correct");
          else if (i === idx) b.classList.add("incorrect");
        });

        feedbackEl.textContent = isCorrect ? "Correct." : "Incorrect.";
        feedbackEl.classList.toggle("ok", isCorrect);
        feedbackEl.classList.toggle("bad", !isCorrect);

        recordResult(user, section, isCorrect, q.id, level);
      });
    });

    const prevBtn = container.querySelector(".prev-btn");
    const nextBtn = container.querySelector(".next-btn");
    prevBtn.addEventListener("click", () => {
      if (index > 0) {
        index--;
        renderTimed();
      }
    });
    nextBtn.addEventListener("click", () => {
      if (index < questions.length - 1) {
        index++;
        renderTimed();
      } else {
        finish();
      }
    });
  }

  function finish() {
    if (timedInterval) {
      clearInterval(timedInterval);
      timedInterval = null;
    }
    const total = questions.length;
    container.classList.add("hidden");
    resultBox.classList.remove("hidden");

    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    resultBox.innerHTML = `
      <h3>Timed test finished</h3>
      <p>You answered ${answered} / ${total} questions.</p>
      <p>Correct: ${correct}</p>
      <p>Accuracy: ${accuracy}%</p>
      <p class="muted">All results are saved into your personal stats.</p>
    `;
  }

  renderTimed();
}

// ------- Service worker registration -------

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
      .catch((err) => console.log("SW registration failed", err));
  }
}

// ------- Init -------

document.addEventListener("DOMContentLoaded", () => {
  console.log("SAT PRO complete – root JSON");

  renderUserList();
  setupCreateUser();
  setupCurrentUserButton();

  const currentId = getCurrentUserId();
  if (currentId) {
    const users = loadUsers();
    const user = findUser(users, currentId);
    if (user) {
      ensureUserShape(user);
      qs("#currentUserName").textContent = user.name;
      showScreen("appScreen");
      showSection("dashboard");
      updateDashboard(user);
    }
  }

  qsa(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  qsa("[data-jump]").forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.jump));
  });

  qs("#startMathBtn").addEventListener("click", () => {
    const level = qs("#mathLevelSelect").value;
    startPractice("math", level, "#mathQuestionContainer");
  });

  qs("#startReadingBtn").addEventListener("click", () => {
    const level = qs("#readingLevelSelect").value;
    startPractice("reading", level, "#readingQuestionContainer");
  });

  qs("#startVocabBtn").addEventListener("click", () => {
    const level = qs("#vocabLevelSelect").value;
    startPractice("vocab", level, "#vocabQuestionContainer");
  });

  qs("#startMistakesBtn").addEventListener("click", startMistakesPractice);
  qs("#clearMistakesBtn").addEventListener("click", clearAllMistakes);
  qs("#startTimedBtn").addEventListener("click", startTimedTest);

  registerServiceWorker();
});
