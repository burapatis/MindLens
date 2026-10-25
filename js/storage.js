/**
 * storage.js — the only localStorage gateway for MindLens.
 * ------------------------------------------------------------------
 * Load this before app.js on every page. Quiz history and unfinished
 * answers stay on this device. Nothing is sent to a server.
 *
 * Keys
 *   pp_theme
 *   pp_quiz_<slug>_history    newest result first, capped by quiz-engine.js
 *   pp_quiz_<slug>_progress   unfinished attempt, so a reload can resume
 *
 * readJSON never throws. `status` is:
 *   empty    — the key is not there (first visit, or the user cleared site data)
 *   ok       — JSON parsed
 *   corrupt  — the stored string is not JSON
 */
(() => {
  'use strict';

  const THEME_KEY = 'pp_theme';

  function assertSlug(slug) {
    if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
      throw new Error(`[MindLensStorage] invalid slug: ${slug}`);
    }
    return slug;
  }

  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); return true; } catch { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* private mode, quota, or storage disabled */ }
    },

    /**
     * @param {string} key
     * @param {*} fallback used for both a missing key and unreadable JSON
     * @returns {{ value: *, status: 'empty'|'ok'|'corrupt' }}
     */
    readJSON(key, fallback) {
      const raw = this.get(key);
      if (raw === null) return { value: fallback, status: 'empty' };
      try {
        return { value: JSON.parse(raw), status: 'ok' };
      } catch {
        return { value: fallback, status: 'corrupt' };
      }
    },

    /** Parsed value only. Unreadable JSON yields `fallback`. */
    getJSON(key, fallback) {
      return this.readJSON(key, fallback).value;
    },

    /** @returns {boolean} false when the browser refused the write */
    setJSON(key, value) {
      return this.set(key, JSON.stringify(value));
    }
  };

  function historyKey(slug) { return `pp_quiz_${assertSlug(slug)}_history`; }
  function progressKey(slug) { return `pp_quiz_${assertSlug(slug)}_progress`; }

  window.MindLensStorage = Object.freeze({
    THEME_KEY,
    storage,
    historyKey,
    progressKey
  });
})();
