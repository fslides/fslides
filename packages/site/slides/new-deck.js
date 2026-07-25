// [+ new deck] — the primary CTA in every top bar. Two lines, two drivers.
(function () {
  const bar = document.querySelector('.bar nav');
  if (!bar) return;
  const btn = document.createElement('button');
  btn.className = 'btn primary';
  btn.id = 'cta-new-deck';
  btn.textContent = '+ new deck';
  btn.style.height = '26px';
  bar.insertBefore(btn, bar.firstChild);

  let menu = null;
  function close() { if (menu) { menu.remove(); menu = null; } }
  document.addEventListener('click', e => {
    if (menu && !menu.contains(e.target) && e.target !== btn) close();
  });

  btn.addEventListener('click', () => {
    if (menu) { close(); return; }
    menu = document.createElement('div');
    menu.className = 'cta-menu';
    menu.innerHTML = `
      <div class="cta-head">nothing → live deck — pick your driver</div>
      <div class="cta-row" data-cmd="curl -fsSL fslides.dev/new | sh -s -- my-deck">
        <span class="cmd">curl -fsSL fslides.dev/new | sh -s -- my-deck</span><span class="lbl">you drive</span><span class="cpy">copy</span>
      </div>
      <div class="cta-row" data-cmd="/plugin marketplace add fslides/fslides">
        <span class="cmd nodollar">/plugin marketplace add fslides/fslides</span><span class="lbl">your agent drives</span><span class="cpy">copy</span>
      </div>
      <div class="cta-head" style="padding-top:6px">ships with the charcoal template · <a href="/templates/" style="color:var(--acc-hi);text-decoration:none">more →</a></div>`;
    const r = btn.getBoundingClientRect();
    menu.style.left = Math.min(r.left, innerWidth - 500) + 'px';
    menu.style.top = (r.bottom + 8) + 'px';
    document.body.appendChild(menu);

    menu.querySelectorAll('.cta-row').forEach(row => {
      row.addEventListener('click', () => {
        navigator.clipboard.writeText(row.dataset.cmd).then(() => {
          row.classList.add('copied');
          row.querySelector('.cpy').textContent = 'copied ✓';
          setTimeout(() => { row.classList.remove('copied'); row.querySelector('.cpy').textContent = 'copy'; }, 1600);
        });
      });
    });
  });
})();
