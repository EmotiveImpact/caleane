const chapters = document.querySelectorAll('section[id]');
const links = document.querySelectorAll('.chapter-nav a');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      links.forEach(link => {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current','location');
        else link.removeAttribute('aria-current');
      });
    }
  }, {rootMargin:'-20% 0px -50% 0px'});
  chapters.forEach(section => observer.observe(section));
}
