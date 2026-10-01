/* Focus feedback without moving the surrounding workspace. */
(() => {
  const root = document.querySelector('.review-product');
  if (!root) return;
  const pin = root.querySelector('.review-pin');
  const comment = root.querySelector('.review-comment');
  let highlightTimer;
  pin.addEventListener('click', () => {
    clearTimeout(highlightTimer);
    comment.classList.add('is-highlighted');
    highlightTimer = setTimeout(() => comment.classList.remove('is-highlighted'), 1800);
  });
  const image = root.querySelector('#review-image');
  let lastSource = image.getAttribute('src');
  let animation;
  image.addEventListener('load', () => {
    const source = image.getAttribute('src');
    if (source === lastSource) return;
    lastSource = source;
    animation?.cancel();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      animation = image.animate([{opacity:.35},{opacity:1}], {duration:280,easing:'cubic-bezier(.22,.68,.18,1)'});
  });
})();
