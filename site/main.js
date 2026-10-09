// SkimCare landing page.
// 1. Clauses: as each one scrolls into view, its key sentence is highlighted,
//    its note slides in, the clause list ticks it off and any stats count up.
// 2. Exhibit A: a sticky phone replays the app's screens, one per scroll step.
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
  demo.querySelectorAll('.s-ai-text').forEach((p) => {
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

  const sequences = [
    // 0. Home: content settles, then the "Start a review" card is tapped.
    (s, tk) => {
      rise($$(s, '.s-small, .s-title, .s-start, .s-pill, .s-label, .s-row'));
      later(1300, tk, () => {
        anim($(s, '.s-start'), [{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: T.base * 1.5 });
        anim($(s, '.s-ripple'), [{ opacity: 0.35, transform: 'scale(0)' }, { opacity: 0, transform: 'scale(5)' }], { duration: T.crawl, fill: 'none' });
      });
    },
    // 1. Capture: a tilted page, edge markers snap on, a scan pass, the page straightens.
    (s) => {
      const tilt = 'rotateX(28deg) rotateZ(-9deg) scale(.86)';
      anim($(s, '.s-paper'), [{ transform: tilt }, { transform: tilt, offset: 0.62 }, { transform: 'none' }], { duration: 2800 });
      const out = { tl: [-26, -30], tr: [26, -30], bl: [-26, 30], br: [26, 30] };
      $$(s, '.s-corner').forEach((c, i) => {
        const [dx, dy] = out[c.classList[1]];
        anim(c, [{ opacity: 0, transform: `translate(${dx}px,${dy}px)` }, { opacity: 1, transform: 'none' }], { duration: T.slow, delay: 250 + i * 60, easing: EASE_POP });
      });
      anim($(s, '.s-scanline'), [
        { opacity: 0, transform: 'translateY(0)' },
        { opacity: 1, offset: 0.12 },
        { opacity: 1, offset: 0.88 },
        { opacity: 0, transform: 'translateY(226px)' },
      ], { duration: 1300, delay: 450, fill: 'none' });
      anim($(s, '.s-shutter-btn'), [{ transform: 'scale(1)' }, { transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: T.base, delay: 1650 });
      anim($(s, '.s-toast'), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: T.base, delay: 2850 });
      anim($(s, '.s-thumb'), [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }], { duration: T.slow, delay: 2900, easing: EASE_POP });
    },
    // 2. Verify: each detail is confirmed against the paper, one after another.
    (s) => {
      rise($$(s, '.s-title, .s-sub, .s-field'));
      $$(s, '.s-field').forEach((f, i) => {
        const d = 1000 + i * 750;
        anim($(f, '.s-btn'), [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 1, transform: 'scale(.92)', offset: 0.45 },
          { opacity: 0, transform: 'scale(.92)' },
        ], { duration: T.slow, delay: d });
        anim($(f, '.s-ok'), [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: T.slow, delay: d + 260, easing: EASE_POP });
        anim($(f, '.s-ok path'), [{ strokeDashoffset: 24 }, { strokeDashoffset: 0 }], { duration: T.slow, delay: d + 380 });
      });
    },
    // 3. Processing: the ring fills, pipeline steps tick, one unmatched output is discarded.
    (s, tk) => {
      const total = 3200;
      anim($(s, '.s-ring-fg'), [{ strokeDashoffset: 289.03 }, { strokeDashoffset: 0 }], { duration: total, easing: 'cubic-bezier(.45,0,.2,1)' });
      countUp($(s, '.s-pct b'), 100, total, () => tk === token);
      $$(s, '.s-steps li').forEach((li, i) => {
        anim(li, [{ opacity: 0.35 }, { opacity: 1 }], { duration: T.base, delay: 300 + i * 750 });
        anim($(li, '.tick'), [{ transform: 'scale(0)' }, { transform: 'none' }], { duration: T.slow, delay: 500 + i * 750, easing: EASE_POP });
      });
      anim($(s, '.s-discard'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: T.slow, delay: 2100 });
      rise([$(s, '.s-pill-dark')], 200);
    },
    // 4. Overview: totals count up, findings stack in, the first one is tapped.
    (s, tk) => {
      rise($$(s, '.s-small, .s-title, .s-stats, .s-label'));
      $$(s, '.s-stats b').forEach((b) => countUp(b, Number(b.dataset.count), T.crawl, () => tk === token));
      rise($$(s, '.s-card'), 450, 110);
      anim($(s, '.s-card.is-tapped'), [
        { boxShadow: '0 0 0 0 rgba(18,160,158,0)', transform: 'scale(1)' },
        { boxShadow: '0 0 0 2px #12A09E', transform: 'scale(.98)', offset: 0.5 },
        { boxShadow: '0 0 0 2px #12A09E', transform: 'scale(1)' },
      ], { duration: T.slow, delay: 1600 });
    },
    // 5. Finding: the source sentence is highlighted, then the explanation writes in.
    (s) => {
      rise($$(s, '.s-back, .s-title, .s-label, .s-quote, .s-ai'));
      anim($(s, '.s-hl'), [{ backgroundSize: '0% 100%' }, { backgroundSize: '100% 100%' }], { duration: T.crawl, delay: 550 });
      $$(s, '.s-ai-text .wd').forEach((w, i) => {
        anim(w, [{ opacity: 0, transform: 'translateY(6px)', filter: 'blur(3px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: T.base, delay: 1500 + i * 45 });
      });
      anim($(s, '.s-ai-label'), [{ opacity: 0 }, { opacity: 1 }], { duration: T.slow, delay: 2400 });
      rise([$(s, '.s-link')], 2600);
    },
    // 6. What-if: days late slide to 10; the fee jumps to ₱225 on day one (any part of a month counts).
    (s, tk) => {
      rise($$(s, '.s-title, .s-label, .s-in'));
      const slide = 1600;
      const startAt = 700;
      anim($(s, '.s-thumbdot'), [{ left: '0%' }, { left: '33%' }], { duration: slide, delay: startAt, easing: 'cubic-bezier(.45,0,.2,1)' });
      anim($(s, '.s-fill'), [{ width: '0%' }, { width: '33%' }], { duration: slide, delay: startAt, easing: 'cubic-bezier(.45,0,.2,1)' });
      const days = $(s, '.s-days');
      const money = $(s, '.s-money');
      days.textContent = '0';
      money.textContent = '₱0';
      later(startAt, tk, () => countUp(days, 10, slide, () => tk === token));
      later(startAt + slide / 10, tk, () => {
        money.textContent = '₱225';
        anim(money, [{ transform: 'scale(1.3)', color: '#F2D27A' }, { transform: 'none', color: '#FFFBF2' }], { duration: T.slow * 1.4, easing: EASE_POP });
      });
    },
  ];

  /** Puts every counter back to its final value (the resting state). */
  function settleCounters() {
    demo.querySelectorAll('[data-count]').forEach((el) => { el.textContent = el.dataset.count; });
    demo.querySelectorAll('.s-money').forEach((el) => { el.textContent = '₱225'; });
  }

  function show(i) {
    if (i === current) return;
    current = i;
    token += 1;
    running.forEach((a) => a.cancel());
    running = [];
    settleCounters();
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
