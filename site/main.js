// SkimCare landing page: as each clause scrolls into view, its key sentence is
// highlighted, its SkimCare note slides in, and the clause list ticks it off.
// Content is fully visible without this script; it only arms the reveal.
(() => {
  'use strict';

  const clauses = Array.from(document.querySelectorAll('[data-clause]'));
  const railItems = new Map(
    Array.from(document.querySelectorAll('.rail-item'), (a) => [a.getAttribute('href').slice(1), a])
  );
  const readCount = document.getElementById('read-count');
  let read = 0;

  function catchClause(el) {
    el.classList.remove('is-pending');
    el.classList.add('is-caught');
    const item = railItems.get(el.id);
    if (item && !item.classList.contains('is-done')) {
      item.classList.add('is-done');
      read += 1;
      if (readCount) readCount.textContent = String(read);
    }
  }

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !('IntersectionObserver' in window)) {
    clauses.forEach(catchClause);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        catchClause(entry.target);
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -30% 0px', threshold: 0.15 }
  );

  clauses.forEach((el) => {
    el.classList.add('is-pending');
    observer.observe(el);
  });
})();
