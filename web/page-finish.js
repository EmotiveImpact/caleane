(() => {
  const root = document.querySelector('.access-demo');
  if (!root) return;
  const tabs = [...root.querySelectorAll('[data-access]')];
  function select(tab, focus = false) {
    const client = tab.dataset.access === 'client';
    root.querySelector('#access-panel').setAttribute('aria-labelledby', tab.id);
    root.querySelector('.access-private').hidden = client;
    root.querySelector('.access-person img').src = client ? 'assets/cal-hero-portrait.webp' : 'assets/cal-hero-interior-original-grade.png';
    root.querySelector('[data-access-name]').textContent = client ? 'Amelia’s project' : 'Nadia’s workspace';
    root.querySelector('[data-access-caption]').textContent = client ? 'The shared direction, ready for your response.' : 'The complete project, for your team.';
    root.querySelector('.access-example-note').textContent = client ? 'This example shows only the brief and design shared with Amelia.' : 'Studio notes are only shown in the studio view.';
    if (focus) tab.focus();
  }
  root.addEventListener('caleane:tabchange', event => select(event.detail.trigger));
})();
