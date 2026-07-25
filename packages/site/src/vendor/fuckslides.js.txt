'use strict';

// Slides list is injected by the server as window.FUCKSLIDES_SLIDES
// Falls back to a single-slide no-op so slides still work opened directly
const SLIDES = window.FUCKSLIDES_SLIDES || [window.location.pathname.split('/').pop() || 'index.html'];

function currentSlideIndex() {
  const file = window.location.pathname.split('/').pop() || SLIDES[0];
  const idx  = SLIDES.indexOf(file);
  return idx === -1 ? 0 : idx;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
}

function saveFs() {
  if (document.fullscreenElement) sessionStorage.setItem('fs-fs', '1');
}

const inPlayer = window !== window.top;

if (inPlayer) {
  document.addEventListener('keydown', e => {
    window.parent.postMessage({ type: 'keydown', key: e.key }, '*');
  });
}

if (!inPlayer) {
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const idx = currentSlideIndex();
    if ((e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') && idx < SLIDES.length - 1) {
      e.preventDefault(); saveFs(); window.location.href = SLIDES[idx + 1];
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && idx > 0) {
      e.preventDefault(); saveFs(); window.location.href = SLIDES[idx - 1];
    }
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  });
}

function injectNav() {
  const style = document.createElement('style');
  style.textContent = `
    .fs-nav { position:fixed; bottom:1.5rem; right:1.5rem; display:flex; align-items:center; gap:.25rem; z-index:9999; background:rgba(34,36,44,.82); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); border:1px solid rgba(255,255,255,.12); border-radius:40px; padding:.3rem .45rem; }
    .fs-nav .nav-btn { display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:50%; color:rgba(255,255,255,.7); text-decoration:none; transition:background .15s,color .15s; cursor:pointer; }
    .fs-nav .nav-btn:hover { background:rgba(255,255,255,.15); color:#fff; }
    .fs-nav .nav-btn svg { width:13px; height:13px; }
    .fs-nav .nav-btn--disabled { opacity:.2; pointer-events:none; }
    .fs-nav .nav-counter { font-family:'Inter',-apple-system,sans-serif; font-size:.62rem; font-weight:600; color:rgba(255,255,255,.45); letter-spacing:.06em; padding:0 .35rem; user-select:none; }
  `;
  document.head.appendChild(style);

  const idx   = currentSlideIndex();
  const chevL = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L6 8l4 5"/></svg>`;
  const chevR = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l4 5-4 5"/></svg>`;
  const fsIco = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>`;

  const prevEl = idx > 0
    ? `<a href="${SLIDES[idx - 1]}" class="nav-btn" title="Previous (←)">${chevL}</a>`
    : `<span class="nav-btn nav-btn--disabled">${chevL}</span>`;
  const nextEl = idx < SLIDES.length - 1
    ? `<a href="${SLIDES[idx + 1]}" class="nav-btn" title="Next (→)">${chevR}</a>`
    : `<span class="nav-btn nav-btn--disabled">${chevR}</span>`;

  const nav = document.createElement('nav');
  nav.className = 'fs-nav';
  nav.innerHTML = `${prevEl}<span class="nav-counter">${idx + 1}&thinsp;/&thinsp;${SLIDES.length}</span><a href="#" id="fs-fullscreen" class="nav-btn" title="Fullscreen (F)">${fsIco}</a>${nextEl}`;
  document.body.appendChild(nav);

  document.getElementById('fs-fullscreen').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleFullscreen(); });
  nav.querySelectorAll('a[href]').forEach(a => a.addEventListener('click', e => { e.stopPropagation(); saveFs(); }));
}

document.addEventListener('DOMContentLoaded', () => {
  if (inPlayer) return;
  if (sessionStorage.getItem('fs-fs')) {
    sessionStorage.removeItem('fs-fs');
    document.documentElement.requestFullscreen().catch(() => {});
  }
  injectNav();
});

// Reveal on scroll
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(el => { if (el.isIntersecting) el.target.classList.add('visible'); });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// Animated stat counters
function animateCounter(el) {
  const target = parseFloat(el.dataset.target);
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const start  = performance.now();
  const dur    = 1400;
  function step(now) {
    const ease  = 1 - Math.pow(1 - Math.min((now - start) / dur, 1), 3);
    el.textContent = prefix + (Number.isInteger(target) ? Math.round(target * ease) : (target * ease).toFixed(1)) + suffix;
    if (ease < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
const counterObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting && !e.target.dataset.counted) {
      e.target.dataset.counted = 'true';
      animateCounter(e.target);
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll('[data-target]').forEach(el => counterObserver.observe(el));
