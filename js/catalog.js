/**
 * catalog.js — registry of every MindLens self-assessment.
 * ------------------------------------------------------------------
 * app.js uses this list for the landing-page results panel.
 * `dataVersion` is the `version` field quiz-engine.js stores on each
 * saved result. Bump both together when a saved entry changes shape.
 *
 * Order here is the library order on the home page.
 */
(() => {
  'use strict';

  const quizzes = [
    { slug: 'doomscrolling',  name: 'Doomscrolling',       icon: 'fa-mobile-screen',      c1: '#6366f1', c2: '#ec4899' },
    { slug: 'cancel-culture', name: 'Cancel Culture',      icon: 'fa-bullhorn',           c1: '#f43f5e', c2: '#8b5cf6' },
    { slug: 'echo-chamber',   name: 'Echo Chamber',        icon: 'fa-tower-broadcast',    c1: '#0ea5e9', c2: '#6366f1' },
    { slug: 'imposter',       name: 'Imposter Syndrome',   icon: 'fa-masks-theater',      c1: '#8b5cf6', c2: '#ec4899' },
    { slug: 'hustle-culture', name: 'Hustle Culture',      icon: 'fa-fire-flame-curved',  c1: '#f59e0b', c2: '#ef4444' },
    { slug: 'empathy',           name: 'Empathy & Bystander', icon: 'fa-hand-holding-heart', c1: '#10b981', c2: '#06b6d4' },
    { slug: 'toxic-positivity',  name: 'Toxic Positivity',    icon: 'fa-ear-listen',         c1: '#f97316', c2: '#ec4899' }
  ];

  window.MindLensCatalog = Object.freeze({
    dataVersion: 2,
    quizzes: Object.freeze(quizzes.map((quiz) => Object.freeze({ ...quiz })))
  });
})();
