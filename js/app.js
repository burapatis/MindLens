/**
 * app.js — Global UI behaviour for MindLens
 * ------------------------------------------------------------------
 * Theme toggle (dark by default), mobile navigation, sticky header,
 * scroll-reveal animations, reading progress + table of contents
 * (article page), share button, toast, back-to-top and the
 * "latest result" widget on the landing page.
 *
 * Exposes a small helper namespace on `window.PP` that quiz-engine.js reuses.
 * Persistence goes through js/storage.js. The quiz list lives in js/catalog.js.
 */
(() => {
  'use strict';

  const Store = window.MindLensStorage;
  const Catalog = window.MindLensCatalog;

  /** Same gateway as quiz-engine.js. A missing script degrades to a no-op store. */
  const storage = Store ? Store.storage : {
    get() { return null; },
    set() { return false; },
    remove() {},
    getJSON(_key, fallback) { return fallback; },
    setJSON() { return false; },
    readJSON(_key, fallback) { return { value: fallback, status: 'empty' }; }
  };

  const KEYS = Object.freeze({
    theme: Store ? Store.THEME_KEY : 'pp_theme'
  });

  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Escape text before inserting into HTML templates. */
  const escapeHTML = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  /** Format an ISO date in Thai locale, e.g. "24 ต.ค. 2569 18:22". */
  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('th-TH', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  /** Lightweight toast notification. */
  let toastTimer = null;
  function toast(message, icon = 'fa-circle-check') {
    let el = document.getElementById('pp-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pp-toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.innerHTML = `<i class="fa-solid ${escapeHTML(icon)}" aria-hidden="true"></i><span></span>`;
    el.querySelector('span').textContent = message;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /** Share via the Web Share API, falling back to copying the link. */
  async function share({ title, text, url }) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // user cancelled
      }
    }
    const payload = text ? `${text}\n${url}` : url;
    try {
      await navigator.clipboard.writeText(payload);
      toast('คัดลอกลิงก์แล้ว');
    } catch {
      // Last-resort fallback for browsers without async clipboard
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      toast(ok ? 'คัดลอกลิงก์แล้ว' : 'ไม่สามารถคัดลอกได้ กรุณาคัดลอกจากแถบที่อยู่', ok ? 'fa-circle-check' : 'fa-circle-exclamation');
    }
  }

  /* ================================================================
   * Theme (dark is the default — see the inline bootstrap in <head>)
   * ================================================================ */

  function syncThemeUI() {
    const isDark = root.classList.contains('dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#07080d' : '#f8fafc');
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-label', isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด');
      btn.setAttribute('title', isDark ? 'โหมดสว่าง' : 'โหมดมืด');
    });
  }

  function setTheme(theme) {
    if (!prefersReducedMotion) root.classList.add('theme-transition');
    root.classList.toggle('dark', theme === 'dark');
    storage.set(KEYS.theme, theme);
    syncThemeUI();
    window.setTimeout(() => root.classList.remove('theme-transition'), 400);
  }

  function initTheme() {
    syncThemeUI();
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTheme(root.classList.contains('dark') ? 'light' : 'dark');
      });
    });
  }

  /* ================================================================
   * Mobile navigation
   * ================================================================ */

  function initMobileMenu() {
    const btn = document.querySelector('[data-menu-toggle]');
    const menu = document.getElementById('mobile-menu');
    if (!btn || !menu) return;
    const icon = btn.querySelector('i');
    const background = () => [document.querySelector('main'), document.querySelector('footer'), document.getElementById('back-to-top'), document.getElementById('reading-progress')].filter(Boolean);
    const focusable = () => [btn, ...menu.querySelectorAll('a, button')];

    const setOpen = (open) => {
      menu.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
      if (icon) {
        icon.classList.toggle('fa-bars', !open);
        icon.classList.toggle('fa-xmark', open);
      }
      background().forEach((node) => { node.inert = open; });
      if (open) {
        const firstLink = menu.querySelector('a');
        if (firstLink) firstLink.focus();
      }
    };

    btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
      if (btn.getAttribute('aria-expanded') !== 'true') return;
      if (e.key === 'Escape') {
        setOpen(false);
        btn.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (btn.getAttribute('aria-expanded') === 'true' && !menu.contains(e.target) && !btn.contains(e.target)) {
        setOpen(false);
      }
    });
    window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => {
      if (e.matches) setOpen(false);
    });
  }

  /* ================================================================
   * Scroll-driven UI: header shadow, back-to-top, reading progress
   * One rAF-throttled listener drives all of them.
   * ================================================================ */

  function initScrollUI() {
    const header = document.getElementById('site-header');
    const backToTop = document.getElementById('back-to-top');
    const progress = document.getElementById('reading-progress');
    const article = document.getElementById('article-content');

    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      if (header) header.classList.toggle('is-scrolled', y > 8);
      if (backToTop) backToTop.classList.toggle('show', y > 700);

      if (progress && article) {
        const rect = article.getBoundingClientRect();
        const total = article.offsetHeight - window.innerHeight;
        const ratio = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : (rect.top < 0 ? 1 : 0);
        progress.style.transform = `scaleX(${ratio})`;
        progress.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
      }
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();

    if (backToTop) {
      backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      });
    }
  }

  /* ================================================================
   * Scroll reveal (fade + rise) via IntersectionObserver
   * ================================================================ */

  function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach((el) => io.observe(el));
  }

  /* ================================================================
   * Article helpers: reading time + active table of contents
   * ================================================================ */

  function initReadingTime() {
    const targets = document.querySelectorAll('[data-reading-time]');
    const article = document.getElementById('article-content');
    if (!targets.length || !article) return;

    // Thai has no word spaces, so estimate by characters (~650 chars/min),
    // plus Latin words at ~220 words/min.
    const text = article.textContent || '';
    const thaiChars = (text.match(/[฀-๿]/g) || []).length;
    const latinWords = (text.match(/[A-Za-z]+/g) || []).length;
    const minutes = Math.max(1, Math.round(thaiChars / 650 + latinWords / 220));
    targets.forEach((t) => { t.textContent = `~${minutes} นาที`; });
  }

  function initTOC() {
    const links = Array.from(document.querySelectorAll('.toc-link'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    const byId = new Map(links.map((l) => [decodeURIComponent(l.hash.slice(1)), l]));
    const headings = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);

    const setActive = (id) => {
      links.forEach((l) => {
        const active = l === byId.get(id);
        l.classList.toggle('active', active);
        if (active) l.setAttribute('aria-current', 'location');
        else l.removeAttribute('aria-current');
      });
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: '-15% 0px -70% 0px' });

    headings.forEach((h) => io.observe(h));
  }

  /* ================================================================
   * Share buttons
   * ================================================================ */

  function initShare() {
    document.querySelectorAll('[data-share]').forEach((btn) => {
      btn.addEventListener('click', () => {
        share({ title: document.title, text: '', url: window.location.href.split('#')[0] });
      });
    });
  }

  /* ================================================================
   * Landing page: results dashboard
   * Reads the latest entry of every quiz (written by quiz-engine.js,
   * key pp_quiz_<slug>_history, newest first) and shows one tile each.
   * The quiz list and data version come from js/catalog.js.
   * ================================================================ */

  const VALID_ZONES = ['green', 'yellow', 'red'];
  const QUIZ_DATA_VERSION = Catalog ? Catalog.dataVersion : 2;
  const QUIZ_REGISTRY = Catalog ? Catalog.quizzes : [];

  /** Only entries written by the current 5-question format (score 5–25). */
  const isValidQuizEntry = (e) =>
    e && e.version === QUIZ_DATA_VERSION &&
    Number.isInteger(e.score) && e.score >= 5 && e.score <= 25 &&
    VALID_ZONES.includes(e.zone);

  function latestResults() {
    return QUIZ_REGISTRY.map((quiz) => {
      const key = Store ? Store.historyKey(quiz.slug) : `pp_quiz_${quiz.slug}_history`;
      const raw = storage.getJSON(key, []);
      const history = Array.isArray(raw) ? raw.filter(isValidQuizEntry) : [];
      return history.length ? { quiz, last: history[0], count: history.length } : null;
    }).filter(Boolean);
  }

  function initLatestResult() {
    const section = document.getElementById('latest-result-section');
    const box = document.getElementById('latest-result');
    if (!section || !box) return;

    const results = latestResults();
    if (!results.length) return;

    const tiles = results.map(({ quiz, last, count }) => `
      <a href="quiz-${quiz.slug}.html" class="result-tile zone-${last.zone}" style="--c1:${quiz.c1};--c2:${quiz.c2}">
        <span class="topic-badge"><i class="fa-solid ${quiz.icon}" aria-hidden="true"></i></span>
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-semibold text-slate-500">${escapeHTML(quiz.name)}</span>
          <span class="mt-0.5 block truncate font-bold text-slate-900 dark:text-white">
            <span aria-hidden="true">${escapeHTML(last.emoji || '')}</span> ${escapeHTML(last.title || '')}
          </span>
          <span class="mt-0.5 block text-xs text-slate-500">${escapeHTML(formatDate(last.date))} · ทำแล้ว ${count} ครั้ง</span>
        </span>
        <span class="history-score !flex flex-col items-center justify-center leading-none">
          ${last.score}<span class="text-[9px] font-medium opacity-70">/25</span>
        </span>
      </a>`).join('');

    const done = results.length;
    const total = QUIZ_REGISTRY.length;
    box.innerHTML = `
      <div class="card reveal p-6 sm:p-8">
        <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p class="eyebrow">ผลของคุณ</p>
            <h2 id="latest-result-heading" class="mt-1 text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">ผลแบบทดสอบล่าสุดของคุณ</h2>
          </div>
          <div class="flex flex-col items-start gap-2">
            <p class="text-sm text-slate-500">ทำแล้ว ${done} จาก ${total} แบบทดสอบ · <i class="fa-solid fa-lock text-xs" aria-hidden="true"></i> เก็บบนเครื่องนี้เท่านั้น</p>
            <a href="dashboard.html" class="link-arrow text-sm">ดูเรดาร์และแนวโน้ม <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
          </div>
        </div>
        <div class="progress-track mt-5" role="progressbar" aria-label="จำนวนแบบทดสอบที่ทำแล้ว" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}">
          <div class="progress-fill" style="width:${Math.round((done / total) * 100)}%"></div>
        </div>
        <div class="mt-6 grid gap-3 md:grid-cols-2">${tiles}</div>
      </div>`;

    section.classList.remove('hidden');
    section.classList.add('pt-4');
    const card = box.firstElementChild;
    requestAnimationFrame(() => card && card.classList.add('is-visible'));
  }

  /* ================================================================
   * Misc
   * ================================================================ */

  function initYear() {
    const year = String(new Date().getFullYear());
    document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = year; });
  }

  /* Public helpers for quiz-engine.js */
  window.PP = Object.freeze({ KEYS, storage, escapeHTML, formatDate, toast, share, prefersReducedMotion });

  function init() {
    initTheme();
    initMobileMenu();
    initScrollUI();
    initReveal();
    initReadingTime();
    initTOC();
    initShare();
    initLatestResult();
    initYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
