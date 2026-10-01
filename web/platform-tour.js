// Radix owns selection and the full-screen dialog. Keep the existing 240ms resolve.
const tour = document.querySelector('[data-ui-tabs]');
tour?.addEventListener('caleane:tabchange', () => {
  tour.querySelectorAll('[data-platform-panel]').forEach(panel => {
    panel.classList.remove('is-changing');
    if (!panel.hidden) { void panel.offsetWidth; panel.classList.add('is-changing'); }
  });
});
