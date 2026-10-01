document.documentElement.classList.add('has-site-js');
// Account destinations are opt-in configuration; offline previews have working local entry pages.
let configuredApp = null;
try {
  const candidate = window.CALENNE_APP_URL && new URL(window.CALENNE_APP_URL);
  if (candidate && ['http:', 'https:'].includes(candidate.protocol)) configuredApp = candidate;
} catch {}
document.querySelectorAll('[data-app-link]').forEach(link => {
  const login = link.dataset.appLink === 'login' || link.textContent.trim().toLowerCase() === 'log in';
  const destination = configuredApp
    ? new URL('login', configuredApp)
    : new URL('get-started.html', location.href);
  if (configuredApp && !login) destination.searchParams.set('mode', 'signup');
  if (!configuredApp && login) destination.searchParams.set('mode', 'login');
  link.href = destination.href;
  link.hidden = false;
});
const currentYear = document.querySelector('#year');
if (currentYear) currentYear.textContent = new Date().getFullYear();
