(() => {
  const slider = document.querySelector('[data-reference-progress]');
  const title = document.querySelector('[data-reference-reveal]');
  const demo = document.querySelector('.ref-motion-demo');
  const words = title.textContent.split(' ');
  title.textContent = '';
  words.forEach((word, index) => {
    const span = document.createElement('span'); span.textContent = word;
    title.append(span); if (index < words.length - 1) title.append(' ');
  });
  const clamp = n => Math.max(0, Math.min(1, n));
  const update = (value = Number(slider.dataset.uiValue ?? slider.value)) => {
    const progress = value / 100;
    const intro = clamp(progress / .25);
    title.style.opacity = String(intro);
    title.querySelectorAll('span').forEach((word, index) => {
      const reveal = clamp((progress - .25 - index / words.length * .55) / .06);
      word.style.setProperty('--word-opacity', String(.07 + .93 * reveal));
    });
    const filmOpacity = clamp((progress - .9) / .1);
    demo.style.setProperty('--film-opacity', String(filmOpacity));
    const film = demo.querySelector('.ref-film');
    film.inert = filmOpacity === 0;
    film.setAttribute('aria-hidden', String(filmOpacity === 0));
    document.querySelector('[data-reference-output]').textContent = value + '%';
  };
  slider.addEventListener('caleane:rangechange', event => update(event.detail.value)); update();
})();
