/**
 * dashboard.js — latest scores, trend, and a portable backup.
 * ------------------------------------------------------------------
 * Reads the same localStorage keys as quiz-engine.js. Nothing is uploaded.
 * A backup file can be merged back in, or used to replace this device.
 */
(() => {
  'use strict';

  const Store = window.MindLensStorage;
  const Catalog = window.MindLensCatalog;
  const PP = window.PP;
  if (!Store || !Catalog || !PP) return;

  const { storage } = Store;
  const { escapeHTML, formatDate, toast } = PP;
  const DATA_VERSION = Catalog.dataVersion;
  const QUIZZES = Catalog.quizzes;
  const MIN_SCORE = 5;
  const MAX_SCORE = 25;
  const HISTORY_CAP = 20;
  const QUESTION_COUNT = 5;
  const ZONES = ['green', 'yellow', 'red'];
  const ZONE_LABEL = { green: 'เกณฑ์ดี', yellow: 'ปานกลาง', red: 'ควรดูแล' };
  const SHORT = {
    doomscrolling: 'Doom',
    'cancel-culture': 'Cancel',
    'echo-chamber': 'Echo',
    imposter: 'Imposter',
    'hustle-culture': 'Hustle',
    empathy: 'Empathy',
    'toxic-positivity': 'Positivity',
    'later-life': 'Later',
    'kreng-jai': 'Kreng',
    'emerging-adulthood': 'Clock',
    'alone-together': 'Alone',
    'feed-comparison': 'Feed',
    'unread-share': 'Share',
    'online-disinhibition': 'Tone'
  };
  const SVG = 'http://www.w3.org/2000/svg';

  const known = new Set(QUIZZES.map((quiz) => quiz.slug));
  let pending = null;

  const isValidEntry = (entry) =>
    entry && entry.version === DATA_VERSION &&
    Number.isInteger(entry.score) && entry.score >= MIN_SCORE && entry.score <= MAX_SCORE &&
    ZONES.includes(entry.zone) && typeof entry.date === 'string';

  function clip(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : '';
  }

  function sanitizeEntry(entry, slug) {
    if (!isValidEntry(entry)) return null;
    const answers = Array.isArray(entry.answers) && entry.answers.length === QUESTION_COUNT &&
      entry.answers.every((answer) => Number.isInteger(answer) && answer >= 1 && answer <= 5)
      ? entry.answers.slice()
      : undefined;
    return {
      id: clip(entry.id, 64) || undefined,
      version: DATA_VERSION,
      quiz: slug,
      date: entry.date,
      score: entry.score,
      maxScore: MAX_SCORE,
      percent: Math.round(((entry.score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE)) * 100),
      zone: entry.score <= 10 ? 'green' : entry.score <= 18 ? 'yellow' : 'red',
      label: clip(entry.label, 160),
      title: clip(entry.title, 200),
      emoji: clip(entry.emoji, 16),
      answers,
      durationSec: Number.isInteger(entry.durationSec) && entry.durationSec >= 0 && entry.durationSec <= 86400
        ? entry.durationSec
        : null
    };
  }

  function sanitizeProgress(progress) {
    if (!progress || progress.version !== DATA_VERSION || !Array.isArray(progress.answers)) return null;
    if (progress.answers.length !== QUESTION_COUNT) return null;
    const answers = progress.answers.map((answer) => (answer === null ? null : answer));
    const ok = answers.every((answer) => answer === null || (Number.isInteger(answer) && answer >= 1 && answer <= 5));
    const answered = answers.filter((answer) => answer !== null).length;
    if (!ok || answered === 0 || answered === QUESTION_COUNT) return null;
    return {
      version: DATA_VERSION,
      answers,
      startedAt: Number.isFinite(progress.startedAt) ? progress.startedAt : Date.now()
    };
  }

  function readQuiz(slug) {
    const historyRead = storage.readJSON(Store.historyKey(slug), []);
    const progressRead = storage.readJSON(Store.progressKey(slug), null);
    const history = historyRead.status === 'ok' && Array.isArray(historyRead.value)
      ? historyRead.value.map((entry) => sanitizeEntry(entry, slug)).filter(Boolean)
      : [];
    return {
      history,
      progress: progressRead.status === 'ok' ? sanitizeProgress(progressRead.value) : null,
      corrupt: historyRead.status === 'corrupt' || progressRead.status === 'corrupt'
    };
  }

  function identity(entry) {
    if (entry.id) return `id:${entry.id}`;
    return `d:${entry.date}|${entry.score}|${JSON.stringify(entry.answers || [])}`;
  }

  function mergeHistory(local, incoming, slug) {
    const map = new Map();
    [...local, ...incoming].forEach((entry) => {
      const clean = sanitizeEntry(entry, slug);
      if (clean) map.set(identity(clean), clean);
    });
    return [...map.values()]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, HISTORY_CAP);
  }

  function incomingHistory(block, slug) {
    if (!block || !Object.prototype.hasOwnProperty.call(block, 'history')) return null;
    if (!Array.isArray(block.history)) return [];
    return block.history.map((entry) => sanitizeEntry(entry, slug)).filter(Boolean);
  }

  function writeQuiz(slug, history, progress) {
    const historyOk = storage.setJSON(Store.historyKey(slug), history);
    let progressOk = true;
    if (progress) progressOk = storage.setJSON(Store.progressKey(slug), progress);
    else storage.remove(Store.progressKey(slug));
    return historyOk && progressOk;
  }

  function snapshot() {
    const rows = QUIZZES.map((quiz) => ({ quiz, ...readQuiz(quiz.slug) }));
    const corrupt = rows.filter((row) => row.corrupt).map((row) => row.quiz.name);
    return { rows, corrupt };
  }

  function exportPayload(rows) {
    const quizzes = {};
    rows.forEach((row) => {
      if (row.corrupt) return;
      quizzes[row.quiz.slug] = { history: row.history, progress: row.progress };
    });
    return {
      format: 'mindlens-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      dataVersion: DATA_VERSION,
      quizzes
    };
  }

  function parseBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('ไฟล์นี้ไม่ใช่ JSON'); }
    if (!data || data.format !== 'mindlens-backup' || data.version !== 1 || !data.quizzes || typeof data.quizzes !== 'object' || Array.isArray(data.quizzes)) {
      throw new Error('ไฟล์นี้ไม่ใช่สำเนาของ MindLens');
    }
    return data;
  }

  function summarize(data) {
    let entries = 0;
    let withData = 0;
    let progress = 0;
    Object.entries(data.quizzes).forEach(([slug, block]) => {
      if (!known.has(slug)) return;
      const history = incomingHistory(block, slug) || [];
      const savedProgress = block && Object.prototype.hasOwnProperty.call(block, 'progress')
        ? sanitizeProgress(block.progress)
        : null;
      entries += history.length;
      if (savedProgress) progress += 1;
      if (history.length || savedProgress) withData += 1;
    });
    return { entries, withData, progress };
  }

  function applyBackup(data, mode) {
    let failed = false;
    Object.entries(data.quizzes).forEach(([slug, block]) => {
      if (!known.has(slug) || !block || typeof block !== 'object') return;
      const local = readQuiz(slug);
      const incoming = incomingHistory(block, slug);
      const hasProgress = Object.prototype.hasOwnProperty.call(block, 'progress');
      if (local.corrupt && incoming === null) return;
      const incomingProgress = hasProgress ? sanitizeProgress(block.progress) : null;
      let history;
      let progress;
      if (mode === 'replace' || local.corrupt) {
        history = incoming === null ? local.history : incoming.slice(0, HISTORY_CAP);
        progress = hasProgress ? incomingProgress : local.progress;
      } else {
        history = mergeHistory(local.history, incoming || [], slug);
        const localStarted = local.progress ? local.progress.startedAt : 0;
        const incomingStarted = incomingProgress ? incomingProgress.startedAt : 0;
        progress = hasProgress && incomingStarted >= localStarted && incomingProgress
          ? incomingProgress
          : local.progress;
      }
      if (!writeQuiz(slug, history, progress)) failed = true;
    });
    return !failed;
  }

  function polar(index, total, radius) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
    return { angle, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }

  function scoreRadius(score, radius) {
    const t = (score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);
    return radius * (0.16 + 0.84 * t);
  }

  function svgEl(name, attrs, parent) {
    const node = document.createElementNS(SVG, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (parent) parent.appendChild(node);
    return node;
  }

  function clearDrawing(svg) {
    [...svg.children].forEach((node) => {
      if (node.localName !== 'title' && node.localName !== 'desc') node.remove();
    });
  }

  function drawRadar(rows) {
    const svg = document.getElementById('radar-chart');
    const note = document.getElementById('radar-note');
    const desc = document.getElementById('radar-desc');
    if (!svg) return;
    clearDrawing(svg);
    const cx = 280;
    const cy = 228;
    const radius = 132;
    const total = rows.length;
    [10, 18, 25].forEach((score) => {
      const ring = rows.map((_, index) => {
        const p = polar(index, total, scoreRadius(score, radius));
        return `${cx + p.x},${cy + p.y}`;
      }).join(' ');
      svgEl('polygon', { class: 'radar-ring', points: ring }, svg);
    });
    rows.forEach((row, index) => {
      const p = polar(index, total, radius);
      svgEl('line', { class: 'radar-axis', x1: cx, y1: cy, x2: cx + p.x, y2: cy + p.y }, svg);
    });
    const scored = rows.filter((row) => row.history.length);
    if (scored.length === total) {
      const points = rows.map((row, index) => {
        const p = polar(index, total, scoreRadius(row.history[0].score, radius));
        return `${cx + p.x},${cy + p.y}`;
      }).join(' ');
      svgEl('polygon', { class: 'radar-area', points }, svg);
    }
    rows.forEach((row, index) => {
      const latest = row.history[0];
      const labelAt = polar(index, total, radius + 28);
      const text = svgEl('text', {
        x: cx + labelAt.x,
        y: cy + labelAt.y,
        'text-anchor': labelAt.x > 24 ? 'start' : labelAt.x < -24 ? 'end' : 'middle',
        'dominant-baseline': 'middle'
      }, svg);
      text.textContent = SHORT[row.quiz.slug] || row.quiz.name;
      if (!latest) return;
      const p = polar(index, total, scoreRadius(latest.score, radius));
      const dot = svgEl('circle', { cx: cx + p.x, cy: cy + p.y, r: 5, fill: row.quiz.c1 }, svg);
      const tip = svgEl('title', {}, dot);
      tip.textContent = `${row.quiz.name} ${latest.score} จาก 25`;
    });
    if (desc) {
      desc.textContent = rows.map((row) => (
        row.history.length
          ? `${row.quiz.name} ${row.history[0].score} คะแนน`
          : `${row.quiz.name} ยังไม่ได้ทำ`
      )).join(', ');
    }
    if (note) {
      note.textContent = scored.length === total
        ? `รูปร่างเชื่อมผลล่าสุดของทั้ง ${total} ชุด จุดที่อยู่ใกล้วงในคือคะแนนต่ำ`
        : `มีผล ${scored.length} จาก ${total} ชุด รูปร่างจะเชื่อมกันเมื่อทำครบ`;
    }
  }

  function drawTrend(rows) {
    const svg = document.getElementById('trend-chart');
    const legend = document.getElementById('trend-legend');
    const desc = document.getElementById('trend-desc');
    if (!svg || !legend) return;
    clearDrawing(svg);
    legend.replaceChildren();
    const left = 36;
    const top = 16;
    const width = 660;
    const height = 250;
    const yOf = (score) => top + ((MAX_SCORE - score) / (MAX_SCORE - MIN_SCORE)) * height;
    const band = (from, to, className) => {
      const y = yOf(to);
      svgEl('rect', { class: className, x: left, y, width, height: yOf(from) - y }, svg);
    };
    band(MIN_SCORE, 10, 'trend-band-green');
    band(10, 18, 'trend-band-yellow');
    band(18, MAX_SCORE, 'trend-band-red');
    [5, 10, 18, 25].forEach((score) => {
      const y = yOf(score);
      svgEl('line', { class: 'trend-grid', x1: left, y1: y, x2: left + width, y2: y }, svg);
      const label = svgEl('text', { x: 4, y: y + 4 }, svg);
      label.textContent = String(score);
    });

    const series = rows.map((row) => row.history
      .map((entry) => ({ ...entry, time: new Date(entry.date).getTime(), quiz: row.quiz }))
      .filter((entry) => !Number.isNaN(entry.time))
      .sort((a, b) => a.time - b.time));
    const times = series.flat().map((entry) => entry.time);
    const min = times.length ? Math.min(...times) : 0;
    const max = times.length ? Math.max(...times) : 1;
    const span = max - min || 1;
    const xOf = (time) => left + (max === min ? width / 2 : ((time - min) / span) * width);

    series.forEach((points, index) => {
      const quiz = rows[index].quiz;
      if (!points.length) return;
      if (points.length > 1) {
        svgEl('polyline', {
          class: 'trend-line',
          stroke: quiz.c1,
          points: points.map((entry) => `${xOf(entry.time)},${yOf(entry.score)}`).join(' ')
        }, svg);
      }
      points.forEach((entry) => {
        const dot = svgEl('circle', { cx: xOf(entry.time), cy: yOf(entry.score), r: 4.5, fill: quiz.c1 }, svg);
        const tip = svgEl('title', {}, dot);
        tip.textContent = `${quiz.name} ${entry.score} คะแนน ${formatDate(entry.date)}`;
      });
      const item = document.createElement('li');
      item.className = 'inline-flex items-center gap-2 text-slate-500';
      item.innerHTML = `<span class="legend-dot" style="background:${escapeHTML(quiz.c1)}"></span>${escapeHTML(quiz.name)}`;
      legend.appendChild(item);
    });

    if (times.length) {
      const first = svgEl('text', { x: left, y: 304 }, svg);
      first.textContent = formatDate(new Date(min).toISOString()).split(' ').slice(0, 3).join(' ');
      const last = svgEl('text', { x: left + width, y: 304, 'text-anchor': 'end' }, svg);
      last.textContent = formatDate(new Date(max).toISOString()).split(' ').slice(0, 3).join(' ');
    }
    if (desc) {
      desc.textContent = times.length
        ? `แนวโน้ม ${times.length} ผล จากคะแนน ${MIN_SCORE} ถึง ${MAX_SCORE} แถบล่างเป็นเกณฑ์ดี`
        : 'ยังไม่มีผลสำหรับเส้นแนวโน้ม';
    }
  }

  function sparkline(history, color) {
    const points = history
      .map((entry) => ({ score: entry.score, time: new Date(entry.date).getTime() }))
      .filter((entry) => !Number.isNaN(entry.time))
      .sort((a, b) => a.time - b.time);
    if (!points.length) return '';
    const min = points[0].time;
    const max = points[points.length - 1].time;
    const span = max - min || 1;
    const coords = points.map((entry) => {
      const x = points.length === 1 ? 50 : ((entry.time - min) / span) * 100;
      const y = 28 - ((entry.score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE)) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = points.length > 1 ? `<polyline class="trend-line" stroke="${escapeHTML(color)}" points="${coords.join(' ')}"></polyline>` : '';
    const dots = coords.map((pair) => {
      const [x, y] = pair.split(',');
      return `<circle cx="${x}" cy="${y}" r="2.4" fill="${escapeHTML(color)}"></circle>`;
    }).join('');
    return `<svg class="spark" viewBox="0 0 100 32" aria-hidden="true">${line}${dots}</svg>`;
  }

  function renderCounts(rows) {
    const box = document.getElementById('zone-counts');
    if (!box) return;
    const counts = { green: 0, yellow: 0, red: 0, empty: 0 };
    rows.forEach((row) => {
      if (!row.history.length) counts.empty += 1;
      else counts[row.history[0].zone] += 1;
    });
    const items = [
      ['green', 'เกณฑ์ดี', counts.green],
      ['yellow', 'ปานกลาง', counts.yellow],
      ['red', 'ควรดูแล', counts.red],
      ['empty', 'ยังไม่ได้ทำ', counts.empty]
    ];
    box.innerHTML = items.map(([zone, label, count]) => `
      <li class="card dash-stat${zone === 'empty' ? '' : ` zone-${zone}`}">
        <span class="text-sm text-slate-500">${label}</span>
        <strong class="zone-text">${count}</strong>
      </li>`).join('');
  }

  function renderCards(rows) {
    const box = document.getElementById('quiz-cards');
    if (!box) return;
    box.innerHTML = rows.map((row) => {
      const latest = row.history[0];
      const href = `quiz-${row.quiz.slug}.html`;
      if (!latest) {
        return `
          <article class="card dash-quiz p-5" style="--c1:${row.quiz.c1};--c2:${row.quiz.c2}">
            <div class="dash-quiz-top">
              <span class="topic-badge"><i class="fa-solid ${row.quiz.icon}" aria-hidden="true"></i></span>
              <div class="min-w-0">
                <h3 class="font-bold text-slate-900 dark:text-white">${escapeHTML(row.quiz.name)}</h3>
                <p class="mt-1 text-sm text-slate-500">ยังไม่ได้ทำ</p>
              </div>
            </div>
            <a href="${href}" class="link-arrow text-sm">เริ่มทำแบบทดสอบ <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
          </article>`;
      }
      return `
        <article class="card dash-quiz zone-${latest.zone} p-5" style="--c1:${row.quiz.c1};--c2:${row.quiz.c2}">
          <div class="dash-quiz-top">
            <span class="topic-badge"><i class="fa-solid ${row.quiz.icon}" aria-hidden="true"></i></span>
            <div class="min-w-0 flex-1">
              <h3 class="font-bold text-slate-900 dark:text-white">${escapeHTML(row.quiz.name)}</h3>
              <p class="mt-1 text-sm text-slate-500">${escapeHTML(latest.emoji)} ${escapeHTML(latest.title || ZONE_LABEL[latest.zone])}</p>
              <p class="mt-1 text-xs text-slate-500">${escapeHTML(formatDate(latest.date))}</p>
            </div>
          </div>
          <div class="flex flex-wrap items-end justify-between gap-3">
            <p class="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">${latest.score}<span class="text-sm font-medium text-slate-500">/25</span></p>
            ${sparkline(row.history, row.quiz.c1)}
            <a href="${href}" class="link-arrow text-sm">${row.history.length} ครั้ง · เปิดแบบทดสอบ <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
          </div>
        </article>`;
    }).join('');
  }

  function renderHistory(rows) {
    const body = document.getElementById('history-body');
    const empty = document.getElementById('history-empty');
    const table = document.getElementById('history-table');
    if (!body || !empty || !table) return;
    const entries = rows.flatMap((row) => row.history.map((entry) => ({ entry, quiz: row.quiz })))
      .sort((a, b) => String(b.entry.date).localeCompare(String(a.entry.date)));
    const hasRows = entries.length > 0;
    table.classList.toggle('hidden', !hasRows);
    empty.classList.toggle('hidden', hasRows);
    body.innerHTML = entries.map(({ entry, quiz }) => `
      <tr>
        <td><a href="quiz-${quiz.slug}.html" class="font-semibold text-slate-900 dark:text-white">${escapeHTML(quiz.name)}</a></td>
        <td class="text-slate-500">${escapeHTML(formatDate(entry.date))}</td>
        <td class="tabular-nums font-semibold">${entry.score}<span class="font-medium text-slate-500">/25</span></td>
        <td>${escapeHTML(entry.emoji)} ${escapeHTML(entry.title || ZONE_LABEL[entry.zone])}</td>
      </tr>`).join('');
  }

  function renderBackup(rows) {
    const button = document.getElementById('btn-export');
    const hint = document.getElementById('export-hint');
    if (!button || !hint) return;
    const usable = rows.some((row) => !row.corrupt && (row.history.length || row.progress));
    button.disabled = !usable;
    hint.textContent = usable
      ? 'ไฟล์นี้เก็บผลและแบบทดสอบที่ยังทำไม่จบ เก็บไว้ก่อนล้างข้อมูลเบราว์เซอร์'
      : 'ยังไม่มีผลให้ส่งออก ทำแบบทดสอบอย่างน้อยหนึ่งชุดก่อน';
  }

  function render() {
    const { rows, corrupt } = snapshot();
    renderCounts(rows);
    drawRadar(rows);
    drawTrend(rows);
    renderCards(rows);
    renderHistory(rows);
    renderBackup(rows);
    if (corrupt.length) toast(`อ่านประวัติของ ${corrupt.join(', ')} ไม่ได้`, 'fa-circle-exclamation');
  }

  function download(rows) {
    const payload = exportPayload(rows.filter((row) => !row.corrupt));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.download = `mindlens-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    toast('ดาวน์โหลดสำเนาแล้ว');
  }

  function showPreview(data) {
    const preview = document.getElementById('backup-preview');
    const summary = document.getElementById('backup-summary');
    const confirmBox = document.getElementById('backup-confirm');
    if (!preview || !summary || !confirmBox) return;
    const counts = summarize(data);
    const when = typeof data.exportedAt === 'string' ? formatDate(data.exportedAt) : '';
    summary.textContent = when
      ? `ไฟล์นี้มี ${counts.entries} ผล จาก ${counts.withData} แบบทดสอบ ส่งออกเมื่อ ${when}`
      : `ไฟล์นี้มี ${counts.entries} ผล จาก ${counts.withData} แบบทดสอบ`;
    confirmBox.classList.add('hidden');
    preview.classList.remove('hidden');
  }

  function hidePreview() {
    pending = null;
    const preview = document.getElementById('backup-preview');
    const file = document.getElementById('backup-file');
    if (preview) preview.classList.add('hidden');
    if (file) file.value = '';
  }

  function finishImport(ok, mode) {
    hidePreview();
    render();
    toast(ok
      ? (mode === 'replace' ? 'แทนที่ข้อมูลในเครื่องแล้ว' : 'รวมข้อมูลเข้ากับเครื่องนี้แล้ว')
      : 'บันทึกบางส่วนไม่ได้ พื้นที่เก็บของเบราว์เซอร์อาจเต็ม',
      ok ? 'fa-circle-check' : 'fa-circle-exclamation');
  }

  function init() {
    const exportButton = document.getElementById('btn-export');
    const importButton = document.getElementById('btn-import');
    const file = document.getElementById('backup-file');
    const mergeButton = document.getElementById('btn-merge');
    const replaceButton = document.getElementById('btn-replace');
    const confirmButton = document.getElementById('btn-replace-confirm');
    const cancelButton = document.getElementById('btn-cancel-import');
    const confirmBox = document.getElementById('backup-confirm');
    if (!exportButton || !file) return;

    exportButton.addEventListener('click', () => {
      const { rows } = snapshot();
      if (exportButton.disabled) return;
      download(rows);
    });
    if (importButton) importButton.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const chosen = file.files && file.files[0];
      if (!chosen) return;
      if (chosen.size > 1024 * 1024) {
        toast('ไฟล์ใหญ่เกิน 1 MB', 'fa-circle-exclamation');
        file.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          pending = parseBackup(String(reader.result || ''));
          showPreview(pending);
        } catch (error) {
          pending = null;
          hidePreview();
          toast(error.message || 'นำเข้าไฟล์ไม่ได้', 'fa-circle-exclamation');
        }
      };
      reader.onerror = () => toast('อ่านไฟล์ไม่ได้', 'fa-circle-exclamation');
      reader.readAsText(chosen);
    });
    if (mergeButton) {
      mergeButton.addEventListener('click', () => {
        if (!pending) return;
        const ok = applyBackup(pending, 'merge');
        finishImport(ok, 'merge');
      });
    }
    if (replaceButton && confirmBox) {
      replaceButton.addEventListener('click', () => confirmBox.classList.remove('hidden'));
    }
    if (confirmButton) {
      confirmButton.addEventListener('click', () => {
        if (!pending) return;
        const ok = applyBackup(pending, 'replace');
        finishImport(ok, 'replace');
      });
    }
    if (cancelButton) cancelButton.addEventListener('click', hidePreview);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
