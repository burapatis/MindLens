/**
 * quiz-engine.js — Shared engine for every MindLens self-assessment
 * ------------------------------------------------------------------
 * Each quiz page loads:
 *   storage.js → catalog.js → app.js → quiz-engine.js → quiz-<topic>.js
 * The topic file holds the content and calls
 *
 *     MindLensQuiz.init({ slug, name, prompt, questions, scale, results, articleLink, support })
 *
 * Questions live in that config. The HTML page is only the shell.
 *
 * Flow:   Intro  →  single-question screens  →  Dynamic result
 *
 * Scoring
 *   • Every answer is 1–5 on a Likert scale; total = plain sum (5–25 for 5 items)
 *   • getResult() grades the total with If / Else against each result's min/max:
 *       green (ดี) → yellow (ปานกลาง) → red (ต้องปรับปรุง)
 *
 * Persistence (Local Storage only — nothing leaves the device)
 *   • pp_quiz_<slug>_history  → results, newest first (max 20)
 *   • pp_quiz_<slug>_progress → unfinished attempt, so users can resume
 *   Entries carry `version` from catalog.js so the landing page can read every quiz the same way.
 */
(() => {
  'use strict';

  const DATA_VERSION = (window.MindLensCatalog && window.MindLensCatalog.dataVersion) || 2;
  const MAX_HISTORY = 20;
  const HISTORY_PREVIEW = 5;

  /* ================================================================
   * Shared helpers (from app.js, with fallbacks)
   * ================================================================ */
  const PP = window.PP || {};
  const escapeHTML = PP.escapeHTML || ((s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const toast = PP.toast || (() => {});
  const formatDate = PP.formatDate || ((iso) => new Date(iso).toLocaleString('th-TH'));
  const share = PP.share || null;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Default Likert scale (frequency). Topic files may pass their own. */
  const DEFAULT_SCALE = Object.freeze([
    { value: 1, emoji: '😌', label: 'ไม่เคยเลย' },
    { value: 2, emoji: '🙂', label: 'นานๆ ครั้ง' },
    { value: 3, emoji: '😐', label: 'เป็นบางครั้ง' },
    { value: 4, emoji: '😟', label: 'บ่อยครั้ง' },
    { value: 5, emoji: '😵‍💫', label: 'เป็นประจำ' }
  ]);

  /**
   * Validate the topic config early so content mistakes surface in the
   * console during development rather than as a broken page.
   */
  function validateConfig(cfg) {
    const errors = [];
    if (!cfg || typeof cfg.slug !== 'string' || !/^[a-z0-9-]+$/.test(cfg.slug)) errors.push('slug');
    ['green', 'yellow', 'red'].forEach((k) => {
      const r = cfg && cfg.results && cfg.results[k];
      if (!r || !Number.isInteger(r.min) || !Number.isInteger(r.max) || !r.description || !r.advice || !r.titleTh) {
        errors.push(`results.${k}`);
      }
    });
    if (cfg && cfg.scale && cfg.scale.length !== 5) errors.push('scale (needs 5 options)');
    if (!cfg || !Array.isArray(cfg.questions) || cfg.questions.length < 1) {
      errors.push('questions');
    } else {
      cfg.questions.forEach((q, i) => {
        if (!q || typeof q.text !== 'string' || !q.text.trim()) errors.push(`questions[${i}].text`);
        if (q && q.id != null && !/^[a-z0-9-]+$/.test(q.id)) errors.push(`questions[${i}].id`);
      });
      const green = cfg.results && cfg.results.green;
      const yellow = cfg.results && cfg.results.yellow;
      const red = cfg.results && cfg.results.red;
      const count = cfg.questions.length;
      if (green && yellow && red && Number.isInteger(green.min) && Number.isInteger(red.max)) {
        if (green.min !== count || red.max !== count * 5) errors.push('results range');
        if (green.max + 1 !== yellow.min || yellow.max + 1 !== red.min) errors.push('results gaps');
      }
    }
    if (errors.length) throw new Error(`[MindLensQuiz] invalid config: ${errors.join(', ')}`);
  }

  /* ================================================================
   * init(config) — builds one quiz instance on the current page
   * ================================================================ */
  function init(cfg) {
    validateConfig(cfg);

    const SCALE = Object.freeze((cfg.scale || DEFAULT_SCALE).map((o, i) => Object.freeze({ value: i + 1, emoji: o.emoji, label: o.label })));
    const RESULTS = cfg.results;
    const Store = window.MindLensStorage;
    if (!Store) throw new Error('[MindLensQuiz] load js/storage.js before quiz-engine.js');
    const storage = Store.storage;
    const STORAGE_KEYS = Object.freeze({
      history: Store.historyKey(cfg.slug),
      progress: Store.progressKey(cfg.slug)
    });
    const AUTO_ADVANCE_MS = reduceMotion ? 120 : 380; // pause after tapping an answer
    const SWAP_MS = reduceMotion ? 0 : 190;           // question slide-out duration

    const rangeText = (r) => `คะแนนรวม ${r.min} - ${r.max} คะแนน`;
    const fullTitle = (r) => (r.titleEn ? `${r.titleTh} (${r.titleEn})` : r.titleTh);

    /* ---------- Questions from the topic config ---------- */
    const QUESTIONS = Object.freeze(cfg.questions.map((q, i) => Object.freeze({
      id: q.id || `q${i + 1}`,
      tag: q.tag || `ข้อ ${i + 1}`,
      label: q.label || '',
      icon: /^fa-[a-z0-9-]+$/.test(q.icon || '') ? q.icon : 'fa-circle-question',
      text: String(q.text).replace(/\s+/g, ' ').trim()
    })));
    const MIN_SCORE = QUESTIONS.length * 1;
    const MAX_SCORE = QUESTIONS.length * 5;

    /* ---------- Scoring ---------- */

    /**
     * Sum the raw answers.
     * @param {number[]} answers  1–5 per question, in question order
     * @returns {number} total score
     */
    function calculateScore(answers) {
      if (!Array.isArray(answers) || answers.length !== QUESTIONS.length) {
        throw new RangeError('จำนวนคำตอบไม่ตรงกับจำนวนคำถาม');
      }
      return answers.reduce((sum, value) => {
        if (!Number.isInteger(value) || value < 1 || value > 5) throw new RangeError(`คำตอบไม่ถูกต้อง: ${value}`);
        return sum + value;
      }, 0);
    }

    /**
     * Grade a total with If / Else, using each level's min–max from the config.
     * @param {number} total
     * @returns {object} RESULTS.green | RESULTS.yellow | RESULTS.red
     */
    function getResult(total) {
      if (total >= RESULTS.green.min && total <= RESULTS.green.max) {
        return RESULTS.green;   // 🟢 ดี
      } else if (total >= RESULTS.yellow.min && total <= RESULTS.yellow.max) {
        return RESULTS.yellow;  // 🟡 ปานกลาง
      } else if (total >= RESULTS.red.min && total <= RESULTS.red.max) {
        return RESULTS.red;     // 🔴 ต้องปรับปรุง
      } else {
        throw new RangeError(`คะแนนรวมอยู่นอกช่วง ${MIN_SCORE}–${MAX_SCORE}: ${total}`);
      }
    }

    const toPercent = (score) => Math.round(((score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE)) * 100);
    const answerZone = (value) => (value <= 2 ? 'green' : value === 3 ? 'yellow' : 'red');

    /* ---------- Storage (via js/storage.js — never throws) ---------- */
    let storageNoteShown = false;
    function noteStorage(kind) {
      if (storageNoteShown) return;
      storageNoteShown = true;
      if (kind === 'corrupt') {
        toast('อ่านข้อมูลที่บันทึกไว้ไม่ได้ ข้อมูลในเครื่องอาจเสียหาย ผลใหม่จะถูกเก็บเมื่อทำแบบทดสอบจบ', 'fa-circle-exclamation');
      } else if (kind === 'stale') {
        toast('ประวัติบางรายการใช้รูปแบบเก่า จึงไม่ถูกนำมาแสดง', 'fa-circle-exclamation');
      }
    }

    const isValidEntry = (e) =>
      e && typeof e === 'object' && e.version === DATA_VERSION &&
      Number.isInteger(e.score) && e.score >= MIN_SCORE && e.score <= MAX_SCORE &&
      typeof e.date === 'string';

    const getHistory = () => {
      const read = storage.readJSON(STORAGE_KEYS.history, []);
      if (read.status === 'corrupt') {
        noteStorage('corrupt');
        return [];
      }
      const list = Array.isArray(read.value) ? read.value : [];
      const valid = list.filter(isValidEntry);
      if (list.length && valid.length !== list.length) noteStorage('stale');
      return valid;
    };

    const getProgress = () => {
      const read = storage.readJSON(STORAGE_KEYS.progress, null);
      if (read.status === 'corrupt') {
        noteStorage('corrupt');
        return null;
      }
      const p = read.value;
      if (!p || p.version !== DATA_VERSION || !Array.isArray(p.answers) || p.answers.length !== QUESTIONS.length) return null;
      const ok = p.answers.every((a) => a === null || (Number.isInteger(a) && a >= 1 && a <= 5));
      const answered = p.answers.filter((a) => a !== null).length;
      if (!ok || answered === 0 || answered === QUESTIONS.length) return null;
      return { answers: p.answers, startedAt: p.startedAt || Date.now() };
    };

    /* ---------- DOM ---------- */
    const $ = (id) => document.getElementById(id);
    const el = {
      intro: $('screen-intro'),
      quiz: $('screen-quiz'),
      result: $('screen-result'),
      startBtn: $('btn-start'),
      startLabel: $('btn-start-label'),
      resumeBtn: $('btn-resume'),
      resumeLabel: $('btn-resume-label'),
      legend: $('scale-legend'),
      historyWrap: $('intro-history'),
      historyLast: $('history-last'),
      historyList: $('history-list'),
      clearBtn: $('btn-clear-history'),
      quitBtn: $('btn-quit'),
      prevBtn: $('btn-prev'),
      counter: $('q-counter'),
      progress: $('q-progress'),
      progressFill: $('q-progress-fill'),
      card: $('question-card'),
      dimension: $('q-dimension'),
      question: $('question-text'),
      prompt: $('question-prompt'),
      lengthLabel: $('quiz-length-label'),
      maxLabel: $('quiz-max-label'),
      likert: $('likert'),
      resultContent: $('result-content')
    };

    const api = Object.freeze({ slug: cfg.slug, calculateScore, getResult, RESULTS, QUESTIONS, SCALE, MIN_SCORE, MAX_SCORE, STORAGE_KEYS });
    window.MindLensQuiz.instance = api;

    if (!el.intro || !el.quiz || !el.result || !QUESTIONS.length) return api;

    const state = {
      index: 0,
      answers: new Array(QUESTIONS.length).fill(null),
      startedAt: null,
      locked: false,
      screen: 'intro'
    };

    /* ---------- Screens ---------- */
    function showScreen(name) {
      state.screen = name;
      el.intro.classList.toggle('hidden', name !== 'intro');
      el.quiz.classList.toggle('hidden', name !== 'quiz');
      el.result.classList.toggle('hidden', name !== 'result');
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    /* ---------- Intro ---------- */
    function renderLegend() {
      if (!el.legend) return;
      el.legend.innerHTML = SCALE.map((o) =>
        `<li><span aria-hidden="true">${o.emoji}</span><b>${o.value}</b>${escapeHTML(o.label)}</li>`).join('');
    }

    function renderIntro() {
      const progress = getProgress();
      const history = getHistory();

      if (progress) {
        const answered = progress.answers.filter((a) => a !== null).length;
        el.resumeLabel.textContent = `ทำต่อจากเดิม (${answered}/${QUESTIONS.length})`;
        el.resumeBtn.classList.remove('hidden');
        el.startLabel.textContent = 'เริ่มใหม่';
      } else {
        el.resumeBtn.classList.add('hidden');
        el.startLabel.textContent = history.length ? 'ทำแบบทดสอบอีกครั้ง' : 'เริ่มทำแบบทดสอบ';
      }

      if (!history.length) {
        el.historyWrap.classList.add('hidden');
        return;
      }

      const [last, ...rest] = history;
      const lastResult = getResult(last.score);
      el.historyLast.innerHTML = `
        <div class="card zone-${lastResult.key} zone-glow p-5 sm:p-6">
          <div class="relative flex items-center gap-4">
            <div class="history-score !flex !h-16 !w-16 flex-col items-center justify-center text-2xl leading-none">
              ${last.score}<span class="text-[10px] font-medium opacity-70">/${MAX_SCORE}</span>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">ครั้งล่าสุด</p>
              <p class="mt-1 font-bold text-slate-900 dark:text-white"><span aria-hidden="true">${lastResult.emoji}</span> ${escapeHTML(lastResult.titleTh)}</p>
              <p class="text-xs text-slate-500">${escapeHTML(lastResult.titleEn || '')}${lastResult.titleEn ? ' · ' : ''}${escapeHTML(formatDate(last.date))}</p>
            </div>
            <button type="button" class="btn btn-secondary !px-4 !py-2.5 text-sm" data-view-result="0">
              ดูผล <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </button>
          </div>
        </div>`;

      el.historyList.innerHTML = rest.slice(0, HISTORY_PREVIEW - 1).map((entry, i) => {
        const r = getResult(entry.score);
        return `
          <li class="history-item zone-${r.key}">
            <span class="history-score">${entry.score}</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-slate-900 dark:text-white">${escapeHTML(fullTitle(r))}</p>
              <p class="text-xs text-slate-500">${escapeHTML(formatDate(entry.date))}</p>
            </div>
            <button type="button" class="btn btn-ghost !px-3 !py-2 text-xs" data-view-result="${i + 1}" aria-label="ดูผลวันที่ ${escapeHTML(formatDate(entry.date))}">
              <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
            </button>
          </li>`;
      }).join('');

      el.historyWrap.classList.remove('hidden');
    }

    function viewPastResult(historyIndex) {
      const history = getHistory();
      const entry = history[historyIndex];
      if (!entry) return;
      const answers = Array.isArray(entry.answers) && entry.answers.length === QUESTIONS.length ? entry.answers : null;
      renderResult(entry.score, answers, history[historyIndex + 1] || null, entry.date);
      showScreen('result');
    }

    /* ---------- Question screen ---------- */
    function buildLikert() {
      const frag = document.createDocumentFragment();
      SCALE.forEach((opt) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'likert-btn';
        b.dataset.value = String(opt.value);
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', `${opt.value} คะแนน — ${opt.label}`);
        b.innerHTML = `
          <span class="likert-emoji" aria-hidden="true">${opt.emoji}</span>
          <span class="likert-value" aria-hidden="true">${opt.value}</span>
          <span class="likert-label" aria-hidden="true">${escapeHTML(opt.label)}</span>`;

        // Micro-interaction: ripple from the touch/click point
        b.addEventListener('pointerdown', (e) => {
          if (reduceMotion) return;
          const rect = b.getBoundingClientRect();
          const size = Math.max(rect.width, rect.height) * 2;
          const ripple = document.createElement('span');
          ripple.className = 'likert-ripple';
          ripple.style.width = ripple.style.height = `${size}px`;
          ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
          ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
          b.appendChild(ripple);
          ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
        });

        b.addEventListener('click', () => selectAnswer(opt.value));
        frag.appendChild(b);
      });
      el.likert.appendChild(frag);
    }

    function setProgress(fraction) {
      const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
      el.progressFill.style.width = `${pct}%`;
      el.progress.setAttribute('aria-valuenow', String(pct));
    }

    function paintQuestion() {
      const q = QUESTIONS[state.index];
      el.counter.textContent = `ข้อ ${state.index + 1} / ${QUESTIONS.length}`;
      el.dimension.innerHTML = `<i class="fa-solid ${escapeHTML(q.icon)}" aria-hidden="true"></i>${escapeHTML(q.tag)}${q.label ? ` · ${escapeHTML(q.label)}` : ''}`;
      el.question.textContent = q.text;

      const current = state.answers[state.index];
      el.likert.querySelectorAll('.likert-btn').forEach((b) => {
        b.setAttribute('aria-pressed', String(Number(b.dataset.value) === current));
      });

      el.prevBtn.disabled = state.index === 0;
      setProgress(state.answers.filter((a) => a !== null).length / QUESTIONS.length);
    }

    function goTo(nextIndex, direction) {
      if (nextIndex < 0 || nextIndex >= QUESTIONS.length) return;
      state.locked = true;
      const outClass = direction === 'next' ? 'q-out-next' : 'q-out-prev';
      const inClass = direction === 'next' ? 'q-in-next' : 'q-in-prev';

      el.card.classList.remove('q-in-next', 'q-in-prev');
      el.card.classList.add(outClass);

      window.setTimeout(() => {
        state.index = nextIndex;
        paintQuestion();
        el.card.classList.remove(outClass);
        void el.card.offsetWidth; // restart the enter animation
        el.card.classList.add(inClass);
        el.question.focus({ preventScroll: true });
        state.locked = false;
      }, SWAP_MS);
    }

    function selectAnswer(value) {
      if (state.locked || state.screen !== 'quiz') return;
      state.answers[state.index] = value;

      el.likert.querySelectorAll('.likert-btn').forEach((b) => {
        b.setAttribute('aria-pressed', String(Number(b.dataset.value) === value));
      });
      if (navigator.vibrate && !reduceMotion) navigator.vibrate(8);

      saveProgress();
      setProgress(state.answers.filter((a) => a !== null).length / QUESTIONS.length);
      state.locked = true;

      window.setTimeout(() => {
        state.locked = false;
        const firstUnanswered = state.answers.indexOf(null);
        if (firstUnanswered === -1) finish();
        else if (state.index < QUESTIONS.length - 1) goTo(state.index + 1, 'next');
        else goTo(firstUnanswered, 'prev');
      }, AUTO_ADVANCE_MS);
    }

    let progressSaveFailed = false;
    function saveProgress() {
      const ok = storage.setJSON(STORAGE_KEYS.progress, { version: DATA_VERSION, answers: state.answers, startedAt: state.startedAt });
      if (!ok && !progressSaveFailed) {
        progressSaveFailed = true;
        toast('บันทึกความคืบหน้าไม่ได้ หากปิดหน้านี้จะต้องเริ่มใหม่', 'fa-circle-exclamation');
      }
    }

    function startQuiz({ resume = false } = {}) {
      const saved = resume ? getProgress() : null;
      if (saved) {
        state.answers = saved.answers.slice();
        state.index = Math.max(0, state.answers.indexOf(null));
        state.startedAt = saved.startedAt;
      } else {
        storage.remove(STORAGE_KEYS.progress);
        state.answers = new Array(QUESTIONS.length).fill(null);
        state.index = 0;
        state.startedAt = Date.now();
      }
      state.locked = false;
      showScreen('quiz');
      el.card.classList.remove('q-in-next', 'q-in-prev', 'q-out-next', 'q-out-prev');
      paintQuestion();
      el.question.focus({ preventScroll: true });
    }

    /* ---------- Finish: brief status → score → If/Else → save → render ---------- */
    function finish() {
      setProgress(1);
      const reveal = () => {
        const score = calculateScore(state.answers);
        const result = getResult(score);
        const previous = getHistory()[0] || null;

        const entry = {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          version: DATA_VERSION,
          quiz: cfg.slug,
          date: new Date().toISOString(),
          score,
          maxScore: MAX_SCORE,
          percent: toPercent(score),
          zone: result.key,
          label: `${result.zoneName} · ${rangeText(result)}`,
          title: fullTitle(result),
          emoji: result.emoji,
          answers: state.answers.slice(),
          durationSec: state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : null
        };

        const saved = storage.setJSON(STORAGE_KEYS.history, [entry, ...getHistory()].slice(0, MAX_HISTORY));
        storage.remove(STORAGE_KEYS.progress);

        el.resultContent.removeAttribute('aria-busy');
        renderResult(score, entry.answers, previous, entry.date);
        showScreen('result');
        if (!saved) toast('เบราว์เซอร์นี้ไม่อนุญาตให้บันทึกผล ผลลัพธ์จะไม่ถูกเก็บไว้', 'fa-circle-exclamation');
      };

      if (reduceMotion) {
        reveal();
        return;
      }

      showScreen('result');
      el.resultContent.setAttribute('aria-busy', 'true');
      el.resultContent.innerHTML = `
        <div class="result-pending" role="status">
          <div class="pending-track" aria-hidden="true"><div class="pending-bar"></div></div>
          <p id="result-pending-label" tabindex="-1">กำลังสรุปคำตอบของคุณ</p>
        </div>`;
      const label = $('result-pending-label');
      if (label) label.focus({ preventScroll: true });
      window.setTimeout(reveal, 720);
    }

    /* ---------- Result rendering ---------- */
    const GAUGE_RADIUS = 52;
    const GAUGE_CIRC = 2 * Math.PI * GAUGE_RADIUS;
    const SCALE_RANGE = MAX_SCORE - MIN_SCORE + 1;

    function compareHTML(score, previous) {
      if (!previous) {
        return `<p class="mt-5 text-sm text-slate-500"><i class="fa-solid fa-flag mr-1.5" aria-hidden="true"></i>นี่คือผลครั้งแรกของคุณ กลับมาทำซ้ำเพื่อดูความเปลี่ยนแปลงได้</p>`;
      }
      const diff = score - previous.score;
      if (diff < 0) return `<div class="mt-5"><span class="delta-pill delta-good"><i class="fa-solid fa-arrow-trend-down" aria-hidden="true"></i>ดีขึ้น ${Math.abs(diff)} คะแนนจากครั้งก่อน 🎉</span></div>`;
      if (diff > 0) return `<div class="mt-5"><span class="delta-pill delta-bad"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i>เพิ่มขึ้น ${diff} คะแนนจากครั้งก่อน</span></div>`;
      return `<div class="mt-5"><span class="delta-pill"><i class="fa-solid fa-equals" aria-hidden="true"></i>เท่ากับครั้งก่อน</span></div>`;
    }

    function answersHTML(answers) {
      if (!answers) return '';
      const rows = QUESTIONS.map((q, i) => {
        const v = answers[i];
        if (!Number.isInteger(v)) return '';
        const opt = SCALE[v - 1];
        return `
          <div class="answer-row zone-${answerZone(v)}">
            <div class="mb-2 flex items-center justify-between gap-3 text-sm">
              <span class="flex min-w-0 items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <i class="fa-solid ${escapeHTML(q.icon)} w-4 text-center text-slate-400" aria-hidden="true"></i>
                <span class="truncate">${escapeHTML(q.tag)}${q.label ? ` <span class="text-slate-500">· ${escapeHTML(q.label)}</span>` : ''}</span>
              </span>
              <span class="zone-text shrink-0 font-semibold tabular-nums">${opt.emoji} ${v}/5</span>
            </div>
            <div class="dim-bar" role="img" aria-label="${escapeHTML(q.tag)}: ${v} คะแนน (${escapeHTML(opt.label)})">
              <div class="dim-bar-fill" data-width="${v * 20}"></div>
            </div>
          </div>`;
      }).join('');

      return `
        <div class="card rise p-6 sm:p-8" style="--d:.24s">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">
            <i class="fa-solid fa-chart-simple mr-2 text-indigo-500" aria-hidden="true"></i>คำตอบของคุณรายข้อ
          </h3>
          <p class="mt-1 text-sm text-slate-500">ข้อที่คะแนนสูงคือจุดที่ควรเริ่มปรับก่อน</p>
          <div class="mt-6">${rows}</div>
        </div>`;
    }

    function renderResult(score, answers, previous, dateISO) {
      const result = getResult(score);
      const percent = toPercent(score);
      const offset = GAUGE_CIRC * (1 - percent / 100);
      const markerLeft = ((score - MIN_SCORE + 0.5) / SCALE_RANGE) * 100;
      const bucket = (r) => r.max - r.min + 1;
      const cols = `${bucket(RESULTS.green)}fr ${bucket(RESULTS.yellow)}fr ${bucket(RESULTS.red)}fr`;

      const showSupport = result.key === 'red' && cfg.support !== false;
      const supportCard = showSupport
        ? `<div class="card rise p-6 sm:p-8" style="--d:.32s">
             <div class="flex gap-4">
               <span class="principle-icon !bg-rose-500/10 !text-rose-500"><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i></span>
               <div>
                 <h3 class="font-bold text-slate-900 dark:text-white">คุณไม่จำเป็นต้องจัดการเรื่องนี้คนเดียว</h3>
                 <p class="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                   หากรู้สึกวิตกกังวลหรือทุกข์ใจต่อเนื่อง สามารถโทรปรึกษาสายด่วนสุขภาพจิต
                   <a href="tel:1323" class="font-semibold text-indigo-500 underline underline-offset-2">1323</a> ได้ตลอด 24 ชั่วโมง
                 </p>
               </div>
             </div>
           </div>`
        : '';

      const link = cfg.articleLink
        ? `<p class="text-center text-sm"><a href="${escapeHTML(cfg.articleLink.href)}" class="link-arrow">${escapeHTML(cfg.articleLink.label)} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></p>`
        : '';

      el.resultContent.innerHTML = `
        <div class="zone-${result.key} space-y-6">
          <div class="card zone-glow rise p-6 text-center sm:p-10">
            <div class="relative">
              <span class="zone-chip">${escapeHTML(result.zoneName)} · ${escapeHTML(rangeText(result))}</span>

              <div class="relative mx-auto mt-6 h-44 w-44 sm:h-52 sm:w-52">
                <svg viewBox="0 0 120 120" class="h-full w-full" style="transform:rotate(-90deg)" aria-hidden="true">
                  <circle class="gauge-track" cx="60" cy="60" r="${GAUGE_RADIUS}" fill="none" stroke-width="10"></circle>
                  <circle class="gauge-fill" cx="60" cy="60" r="${GAUGE_RADIUS}" fill="none" stroke-width="10" stroke-linecap="round"
                          stroke-dasharray="${GAUGE_CIRC.toFixed(2)}" stroke-dashoffset="${GAUGE_CIRC.toFixed(2)}" data-offset="${offset.toFixed(2)}"></circle>
                </svg>
                <div class="absolute inset-0 grid place-items-center">
                  <div>
                    <div class="text-5xl font-extrabold tabular-nums text-slate-900 dark:text-white sm:text-6xl" data-count-to="${score}" data-count-from="${MIN_SCORE}">${MIN_SCORE}</div>
                    <div class="mt-1 text-xs font-medium text-slate-500">คะแนนรวม / ${MAX_SCORE}</div>
                  </div>
                </div>
              </div>
              <p class="sr-only">คะแนนรวมของคุณคือ ${score} จาก ${MAX_SCORE} คะแนน ผลลัพธ์: ${escapeHTML(fullTitle(result))}</p>

              <div class="mt-6 text-4xl" aria-hidden="true">${result.emoji}</div>
              <h2 id="result-title" tabindex="-1" class="mt-2 text-2xl font-extrabold leading-snug text-slate-900 outline-none dark:text-white sm:text-3xl">${escapeHTML(result.titleTh)}</h2>
              ${result.titleEn ? `<p class="zone-text mt-1 text-base font-semibold tracking-wide">${escapeHTML(result.titleEn)}</p>` : ''}
              ${compareHTML(score, previous)}

              <div class="mx-auto mt-8 max-w-md">
                <div class="zone-scale" style="grid-template-columns:${cols}" aria-hidden="true">
                  <span></span><span></span><span></span>
                  <i class="zone-marker" style="left:0%" data-left="${markerLeft.toFixed(2)}"></i>
                </div>
                <div class="mt-2 grid text-[11px] font-medium text-slate-500" style="grid-template-columns:${cols}">
                  <span class="text-left">${RESULTS.green.min}–${RESULTS.green.max}</span>
                  <span class="text-center">${RESULTS.yellow.min}–${RESULTS.yellow.max}</span>
                  <span class="text-right">${RESULTS.red.min}–${RESULTS.red.max}</span>
                </div>
              </div>

              <p class="mt-6 text-xs text-slate-500"><i class="fa-regular fa-calendar mr-1" aria-hidden="true"></i>${escapeHTML(formatDate(dateISO))}</p>
            </div>
          </div>

          <section class="card rise p-6 sm:p-8" style="--d:.08s" aria-labelledby="result-desc-title">
            <h3 id="result-desc-title" class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <i class="fa-solid fa-magnifying-glass-chart zone-text" aria-hidden="true"></i>คำอธิบายผลลัพธ์
            </h3>
            <p id="result-description" class="mt-3 leading-[1.9] text-slate-700 dark:text-slate-300"></p>
          </section>

          <section class="card rise relative overflow-hidden p-6 sm:p-8" style="--d:.16s" aria-labelledby="result-advice-title">
            <span class="absolute inset-y-0 left-0 w-1.5" style="background:var(--zone)" aria-hidden="true"></span>
            <h3 id="result-advice-title" class="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <i class="fa-solid fa-lightbulb text-amber-500" aria-hidden="true"></i>คำแนะนำ
            </h3>
            <p id="result-advice" class="mt-3 leading-[1.9] text-slate-700 dark:text-slate-300"></p>
          </section>

          ${answersHTML(answers)}
          ${supportCard}

          <div class="rise flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:justify-center" style="--d:.4s">
            <button type="button" class="btn btn-primary" data-action="retake">
              <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> ทำแบบทดสอบอีกครั้ง
            </button>
            <button type="button" class="btn btn-secondary" data-action="share">
              <i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i> แชร์ผลลัพธ์
            </button>
            <button type="button" class="btn btn-secondary" data-action="history">
              <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> ดูประวัติ
            </button>
          </div>
          ${link}
          <p class="text-center text-sm">
            <a href="index.html#library" class="link-arrow">สำรวจบทความและแบบทดสอบอื่น <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
          </p>
          <p class="text-center text-xs leading-relaxed text-slate-500">ผลนี้เป็นการสะท้อนเพื่อการเรียนรู้จากข้อคำถามต้นฉบับของ MindLens ไม่ใช่แบบวัดมาตรฐาน และไม่ใช่การวินิจฉัยทางการแพทย์หรือทางจิตวิทยาคลินิก · <a href="privacy.html" class="footer-link">ข้อมูลทางกฎหมาย</a></p>
        </div>`;

      // Copy is inserted with textContent so it renders exactly as written
      $('result-description').textContent = result.description;
      $('result-advice').textContent = result.advice;

      el.resultContent.dataset.shareText =
        `ผลแบบทดสอบ ${cfg.name || ''} ของฉัน: ${score}/${MAX_SCORE} คะแนน — ${fullTitle(result)} ${result.emoji}`.replace(/\s+/g, ' ');

      animateResult();
      const title = $('result-title');
      if (title) title.focus({ preventScroll: true });
    }

    function animateResult() {
      const root = el.resultContent;
      const gauge = root.querySelector('.gauge-fill');
      const counter = root.querySelector('[data-count-to]');
      const marker = root.querySelector('.zone-marker');
      const bars = root.querySelectorAll('.dim-bar-fill');

      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (gauge) gauge.style.strokeDashoffset = gauge.dataset.offset;
        if (marker) marker.style.left = `${marker.dataset.left}%`;
        bars.forEach((b) => { b.style.width = `${b.dataset.width}%`; });
      }));

      if (!counter) return;
      const from = Number(counter.dataset.countFrom) || 0;
      const target = Number(counter.dataset.countTo) || 0;
      if (reduceMotion || target === from) { counter.textContent = String(target); return; }
      const duration = 1200;
      const start = performance.now();
      const easeOut = (t) => 1 - Math.pow(1 - t, 3);
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        counter.textContent = String(Math.round(from + easeOut(t) * (target - from)));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    /* ---------- Events ---------- */
    function bindEvents() {
      el.startBtn.addEventListener('click', () => startQuiz({ resume: false }));
      el.resumeBtn.addEventListener('click', () => startQuiz({ resume: true }));
      el.prevBtn.addEventListener('click', () => {
        if (!state.locked && state.index > 0) goTo(state.index - 1, 'prev');
      });

      el.quitBtn.addEventListener('click', () => {
        const answered = state.answers.some((a) => a !== null);
        renderIntro();
        showScreen('intro');
        if (answered) toast('บันทึกความคืบหน้าไว้แล้ว กลับมาทำต่อได้ทุกเมื่อ', 'fa-floppy-disk');
      });

      el.clearBtn.addEventListener('click', () => {
        if (!window.confirm('ต้องการล้างประวัติของแบบทดสอบนี้ทั้งหมดใช่ไหม? การกระทำนี้ย้อนกลับไม่ได้')) return;
        storage.remove(STORAGE_KEYS.history);
        renderIntro();
        toast('ล้างประวัติเรียบร้อยแล้ว', 'fa-trash-can');
      });

      el.intro.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-view-result]');
        if (btn) viewPastResult(Number(btn.dataset.viewResult));
      });

      el.resultContent.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'retake') startQuiz({ resume: false });
        if (action === 'history') { renderIntro(); showScreen('intro'); }
        if (action === 'share' && share) {
          const url = window.location.href.split('#')[0];
          share({ title: document.title, text: `${el.resultContent.dataset.shareText || ''}\nลองทำแบบทดสอบได้ที่:`, url });
        }
      });

      document.addEventListener('keydown', (e) => {
        if (state.screen !== 'quiz' || e.altKey || e.ctrlKey || e.metaKey) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (/^[1-5]$/.test(e.key)) {
          e.preventDefault();
          selectAnswer(Number(e.key));
        } else if (e.key === 'ArrowLeft' && state.index > 0 && !state.locked) {
          e.preventDefault();
          goTo(state.index - 1, 'prev');
        }
      });
    }

    /* ---------- Boot ---------- */
    const boot = () => {
      if (el.prompt && cfg.prompt) el.prompt.textContent = cfg.prompt;
      if (el.lengthLabel) el.lengthLabel.textContent = `${QUESTIONS.length} ข้อ`;
      if (el.maxLabel) el.maxLabel.textContent = `คะแนนเต็ม ${MAX_SCORE}`;
      renderLegend();
      buildLikert();
      bindEvents();
      renderIntro();
      showScreen('intro');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();

    return api;
  }

  window.MindLensQuiz = { init, DEFAULT_SCALE, DATA_VERSION };
})();
