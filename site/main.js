// SkimCare landing page.
// 1. Clauses: as each one scrolls into view, its key sentence is highlighted,
//    its note slides in, the clause list ticks it off and any stats count up.
// 2. Exhibit A: a sticky phone replays 1:1 replicas of the app's screens, one per scroll step.
// Content is fully readable without this script: every animation starts from
// a visible resting state, and reduced motion skips the animations entirely.
(() => {
  'use strict';

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  // Motion tokens (shared by every sequence below).
  const T = { fast: 180, base: 320, slow: 560, crawl: 1200 };
  const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
  const EASE_POP = 'cubic-bezier(.34,1.56,.64,1)';
  const easeOutQuart = (p) => 1 - Math.pow(1 - p, 4);

  /** Counts el's text from 0 to `to`. `alive()` stops it when a newer sequence starts. */
  function countUp(el, to, ms, alive = () => true) {
    const t0 = performance.now();
    el.textContent = '0';
    const step = (now) => {
      if (!alive()) return;
      const p = Math.min(1, (now - t0) / ms);
      el.textContent = String(Math.round(to * easeOutQuart(p)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- clauses ----------
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
    if (!reduceMotion) {
      el.querySelectorAll('.count[data-to]').forEach((c) => countUp(c, Number(c.dataset.to), T.crawl * 1.4));
    }
  }

  if (reduceMotion || !('IntersectionObserver' in window)) {
    clauses.forEach(catchClause);
  } else {
    const pending = new Set(clauses);
    const take = (el) => {
      pending.delete(el);
      catchClause(el);
      observer.unobserve(el);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) take(entry.target);
        });
        // A fast scroll on a slow frame can jump a clause from below the
        // reading line to above it with no intersection in between; anything
        // already scrolled past counts as read.
        const line = window.innerHeight * 0.7;
        pending.forEach((el) => {
          if (el.getBoundingClientRect().top < line) take(el);
        });
      },
      // Caught once a clause's top edge enters the upper 70% of the viewport.
      // threshold 0, not a ratio: Exhibit A is several screens tall and never
      // shows more than ~13% of itself at once.
      { rootMargin: '0px 0px -30% 0px', threshold: 0 }
    );
    clauses.forEach((el) => {
      el.classList.add('is-pending');
      observer.observe(el);
    });
  }

  // ---------- Exhibit A: the app replica ----------
  const demo = document.getElementById('demo');
  if (!demo) return;

  const screens = Array.from(demo.querySelectorAll('.scr'));
  const steps = Array.from(demo.querySelectorAll('.demo-step'));
  const dots = Array.from(demo.querySelectorAll('.demo-dot'));
  let current = -1;
  let token = 0;
  let running = [];

  // Split the model's explanation into words once, for the word-by-word reveal.
  demo.querySelectorAll('.a-ai-text').forEach((p) => {
    const words = p.textContent.trim().split(/\s+/);
    p.textContent = '';
    words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className = 'wd';
      span.textContent = w;
      p.append(span, i < words.length - 1 ? ' ' : '');
    });
  });

  /** Interrupt-safe animate: every animation is tracked and cancelled when the step changes. */
  function anim(el, keyframes, options) {
    if (!el) return Promise.resolve();
    const a = el.animate(keyframes, { fill: 'both', easing: EASE_OUT, ...options });
    running.push(a);
    return a.finished.catch(() => {});
  }
  const rise = (els, delay = 0, gap = 70) =>
    Promise.all(
      els.map((el, i) =>
        anim(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], {
          duration: T.slow,
          delay: delay + i * gap,
        })
      )
    );
  const later = (ms, tk, fn) => setTimeout(() => tk === token && fn(), ms);
  const $ = (scr, sel) => scr.querySelector(sel);
  const $$ = (scr, sel) => Array.from(scr.querySelectorAll(sel));

  /** Scrolls a replica screen's content like a finger would (translates its body). */
  function scrollBody(s, steps, start = 0) {
    const body = $(s, '.a-body');
    // Never scroll past the end of the content (the app screen is 844 tall).
    const max = Math.max(0, body.offsetHeight - 844);
    let from = Math.min(start, max);
    steps.forEach(([target, at]) => {
      const to = Math.min(target, max);
      anim(body, [{ transform: `translateY(${-from}px)` }, { transform: `translateY(${-to}px)` }], {
        duration: T.crawl * 0.8, delay: at, fill: 'forwards', easing: 'cubic-bezier(.45,0,.2,1)',
      });
      from = to;
    });
  }
  const tap = (el, at) =>
    anim(el, [{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: T.base * 1.3, delay: at, fill: 'none' });
  const pop = (el, at) =>
    anim(el, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: T.slow, delay: at, easing: EASE_POP, fill: 'backwards' });
  const top = (el, pad) => Math.max(0, el.offsetTop - pad);

  const sequences = [
    // 0. Home: content settles, then "Start a review" is tapped.
    (s) => {
      rise($$(s, '.a-body > *'));
      tap($(s, '.a-start'), 1400);
    },
    // 1. Capture: scanned pages land in the grid one after another.
    (s, tk) => {
      const tiles = $$(s, '.a-tile');
      const count = $(s, '.a-pages');
      count.textContent = '1';
      pop(tiles[0], 200);
      pop(tiles[1], 1300);
      later(1300, tk, () => { count.textContent = '2'; });
      tap($(s, '.a-foot .a-primary'), 2400);
    },
    // 2. Verify: each detail is confirmed against the paper.
    (s, tk) => {
      s.classList.add('pre-verify');
      const cards = $$(s, '.a-vcard');
      const left = $(s, '.a-left');
      left.textContent = String(cards.length);
      rise($$(s, '.a-body > *'));
      scrollBody(s, [[top(cards[0], 100), 400], [top(cards[1], 100), 1700], [top(cards[2], 100), 2900]]);
      cards.forEach((c, i) => {
        const at = 1000 + i * 1250;
        tap($(c, '.a-match'), at);
        later(at + 380, tk, () => {
          c.classList.add('is-ok');
          pop($(c, '.a-flag'), 0);
          left.textContent = String(cards.length - i - 1);
          if (i === cards.length - 1) s.classList.add('is-solved');
        });
      });
    },
    // 3. Processing: the five real pipeline steps run in order.
    (s, tk) => {
      const rows = $$(s, '.a-step');
      const sec = $(s, '.a-sec');
      const fill = $(s, '.a-fill');
      rows.forEach((r) => { r.className = 'a-step is-wait'; });
      const plan = [0, 700, 2600, 3300, 3900, 4400];
      rows.forEach((r, i) => {
        later(plan[i], tk, () => {
          if (i > 0) rows[i - 1].className = 'a-step is-done';
          r.className = 'a-step is-active';
        });
      });
      later(plan[5], tk, () => { rows[rows.length - 1].className = 'a-step is-done'; });
      sec.textContent = '1';
      [1, 2, 3, 4].forEach((n, k) => later(plan[1] + k * 450, tk, () => { sec.textContent = String(n); }));
      anim(fill, [{ width: '0%' }, { width: '25%', offset: 0.1 }, { width: '100%' }], { duration: plan[2] - plan[1], delay: plan[1] });
    },
    // 4. Overview: totals count up, the list scrolls to the findings, the first one is tapped.
    (s, tk) => {
      rise($$(s, '.a-body > *'), 0, 50);
      $$(s, '.a-stat b').forEach((b) => countUp(b, Number(b.dataset.count), T.crawl, () => tk === token));
      const first = $(s, '.a-tapme');
      scrollBody(s, [[top(first, 150), 1700]]);
      tap(first, 3000);
    },
    // 5. Finding: source quote first, then the model's explanation writes in.
    (s) => {
      rise($$(s, '.a-body > *'));
      $$(s, '.a-ai-text .wd').forEach((w, i) => {
        anim(w, [{ opacity: 0, transform: 'translateY(6px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: T.base, delay: 1100 + i * 45 });
      });
    },
    // 6. What-if: confirm both values against the page, then the exact result appears.
    (s, tk) => {
      s.classList.add('pre-whatif');
      const vals = $$(s, '.a-valcard');
      const p0 = top(vals[0], 120);
      const p1 = top(vals[1], 120);
      rise($$(s, '.a-body > *'));
      scrollBody(s, [[p0, 300], [p1, 1500]]);
      vals.forEach((v, i) => {
        const at = 1000 + i * 1300;
        tap($(v, '.a-confirm'), at);
        later(at + 380, tk, () => { v.classList.add('is-ok'); pop($(v, '.a-flag'), 0); });
      });
      later(3000, tk, () => {
        s.classList.add('is-solved');
        const res = $(s, '.a-result');
        scrollBody(s, [[top(res, 300), 0]], p1);
        anim(res, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: T.slow, delay: 250 });
      });
    },
  ];

  /** Returns every replica screen to its resting (final) state. */
  function settle() {
    demo.querySelectorAll('[data-count]').forEach((el) => { el.textContent = el.dataset.count; });
    demo.querySelectorAll('.a-left').forEach((el) => { el.textContent = '0'; });
    demo.querySelectorAll('.a-sec').forEach((el) => { el.textContent = '4'; });
    demo.querySelectorAll('.a-step').forEach((el) => { el.className = 'a-step is-done'; });
    demo.querySelectorAll('.is-ok').forEach((el) => el.classList.remove('is-ok'));
    screens.forEach((s) => s.classList.remove('pre-verify', 'pre-whatif', 'is-solved'));
  }

  function show(i) {
    if (i === current) return;
    current = i;
    token += 1;
    running.forEach((a) => a.cancel());
    running = [];
    settle();
    screens.forEach((s, k) => s.classList.toggle('is-on', k === i));
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    dots.forEach((d, k) => d.setAttribute('aria-current', k === i ? 'step' : 'false'));
    if (!reduceMotion) sequences[i]?.(screens[i], token);
  }

  dots.forEach((d) =>
    d.addEventListener('click', () => {
      steps[Number(d.dataset.go)]?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    })
  );

  // Pause running animations while the tab is hidden; resume when it is back.
  document.addEventListener('visibilitychange', () => {
    running.forEach((a) => (document.hidden ? a.pause() : a.play()));
  });

  if (!('IntersectionObserver' in window)) {
    show(0);
    return;
  }
  const narrow = window.matchMedia('(max-width: 860px)').matches;
  const stepObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) show(Number(e.target.dataset.step));
      });
    },
    // The active step is the one crossing a line through the caption area.
    { rootMargin: narrow ? '-62% 0px -30% 0px' : '-45% 0px -45% 0px' }
  );
  steps.forEach((s) => stepObserver.observe(s));
})();
