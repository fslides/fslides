// [+ new deck] — the primary CTA in every top bar. Opens a contextual menu
// of copyable commands; template select rewrites the scaffold line.
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
      <div class="cta-head">create a deck — click a line to copy</div>
      <div class="cta-row" data-cmd="curl -fsSL https://fslides.dev/install | sh">
        <span class="cmd">curl -fsSL https://fslides.dev/install | sh</span><span class="lbl">once</span><span class="cpy">copy</span>
      </div>
      <div class="cta-row" id="cta-scaffold">
        <span class="cmd"></span>
        <select id="cta-tpl" onclick="event.stopPropagation()">
          <option value="charcoal">charcoal</option>
          <option value="paper">paper</option>
          <option value="">minimal</option>
        </select>
        <span class="cpy">copy</span>
      </div>
      <div class="cta-head" style="margin-top:4px">or let your agent do it</div>
      <div class="cta-row" data-cmd="/plugin marketplace add fslides/fslides">
        <span class="cmd nodollar">/plugin marketplace add fslides/fslides</span><span class="lbl">claude code</span><span class="cpy">copy</span>
      </div>`;
    const r = btn.getBoundingClientRect();
    menu.style.left = Math.min(r.left, innerWidth - 500) + 'px';
    menu.style.top = (r.bottom + 8) + 'px';
    document.body.appendChild(menu);

    const scaffoldRow = menu.querySelector('#cta-scaffold');
    const tplSel = menu.querySelector('#cta-tpl');
    function scaffoldCmd() {
      const t = tplSel.value;
      return 'fslides scaffold my-deck' + (t ? ' --template ' + t : '');
    }
    function syncScaffold() { scaffoldRow.querySelector('.cmd').textContent = scaffoldCmd(); }
    tplSel.addEventListener('change', syncScaffold);
    syncScaffold();

    menu.querySelectorAll('.cta-row').forEach(row => {
      row.addEventListener('click', () => {
        const cmd = row.dataset.cmd || scaffoldCmd();
        navigator.clipboard.writeText(cmd).then(() => {
          row.classList.add('copied');
          row.querySelector('.cpy').textContent = 'copied ✓';
          setTimeout(() => { row.classList.remove('copied'); row.querySelector('.cpy').textContent = 'copy'; }, 1600);
        });
      });
    });
  });
})();
