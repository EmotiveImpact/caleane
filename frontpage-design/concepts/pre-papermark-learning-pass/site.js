try {
  const appUrl = new URL(window.CALENNE_APP_URL);
  if (appUrl.protocol === 'http:' || appUrl.protocol === 'https:') {
    document.querySelectorAll('[data-app-link]').forEach(link => { link.href = appUrl.href; });
  }
} catch {
  // HTML contains the local preview destination.
}

document.querySelector('#year').textContent = new Date().getFullYear();

const menuButton = document.querySelector('.menu-button');
const menu = document.querySelector('#main-nav');
function closeMenu() {
  menu.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
}
menuButton.addEventListener('click', () => {
  const open = menu.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(open));
});
menu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menuButton.focus();
  }
});

const previewTabs = [...document.querySelectorAll('[data-preview-tab]')];
const previewPanels = [...document.querySelectorAll('[data-preview-panel]')];
previewTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    const choice = tab.dataset.previewTab;
    previewTabs.forEach(item => {
      const selected = item === tab;
      item.classList.toggle('is-active', selected);
      item.setAttribute('aria-selected', String(selected));
    });
    previewPanels.forEach(panel => {
      const selected = panel.dataset.previewPanel === choice;
      panel.classList.toggle('is-active', selected);
      panel.hidden = !selected;
    });
  });
  tab.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + previewTabs.length) % previewTabs.length;
    previewTabs[next].focus();
    previewTabs[next].click();
  });
});
