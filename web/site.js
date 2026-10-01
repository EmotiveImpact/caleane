if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

document.querySelector('#year')?.replaceChildren(String(new Date().getFullYear()));

const siteHeader = document.querySelector('.site-header');
const hero = document.querySelector('.hero');
const heroCopy = document.querySelector('.hero-copy');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
if (siteHeader && hero) {
  let headerFrame = 0;
  function updateHeaderSurface() {
    headerFrame = 0;
    const headerBottom = siteHeader.getBoundingClientRect().bottom;
    siteHeader.classList.toggle('is-scrolled', hero.getBoundingClientRect().bottom <= headerBottom + 88);
    if (heroCopy) {
      const copyTop = heroCopy.getBoundingClientRect().top;
      const fadeEnd = headerBottom + 12;
      const fadeStart = fadeEnd + 180;
      const opacity = Math.max(0, Math.min(1, (copyTop - fadeEnd) / (fadeStart - fadeEnd)));
      heroCopy.style.opacity = String(reducedMotion.matches ? (copyTop > fadeEnd ? 1 : 0) : opacity);
      heroCopy.style.pointerEvents = opacity < 0.05 ? 'none' : '';
    }
  }
  function scheduleHeaderSurface() {
    if (!headerFrame) headerFrame = window.requestAnimationFrame(updateHeaderSurface);
  }
  window.addEventListener('scroll', scheduleHeaderSurface, { passive: true });
  window.addEventListener('resize', scheduleHeaderSurface);
  window.addEventListener('pageshow', scheduleHeaderSurface);
  reducedMotion.addEventListener?.('change', scheduleHeaderSurface);
  updateHeaderSurface();
}

const storyReel = document.querySelector('[data-story-reel]');

const heroSlides = [...document.querySelectorAll('[data-hero-slide]')];
if (hero && heroSlides.length > 1) {
  let activeSlide = 0;
  let heroVisible = true;
  let slidesReady = false;
  let heroTimer;
  let captionTimer;
  const heroCount = document.querySelector('[data-hero-count]');
  const heroCaption = document.querySelector('.hero-scene-caption');
  const heroNext = document.querySelector('[data-hero-next]');

  function showNextHeroSlide() {
    for (let offset = 1; offset < heroSlides.length; offset += 1) {
      const next = (activeSlide + offset) % heroSlides.length;
      if (!heroSlides[next].naturalWidth) continue;
      heroSlides[activeSlide].classList.remove('is-active');
      heroSlides[next].classList.add('is-active');
      activeSlide = next;
      window.clearTimeout(captionTimer);
      const updateCaption = () => {
        if (heroCount) heroCount.textContent = `${String(next + 1).padStart(2, '0')} / ${String(heroSlides.length).padStart(2, '0')}`;
        if (heroCaption) heroCaption.textContent = heroSlides[next].dataset.heroCaption || '';
      };
      if (reducedMotion.matches) updateCaption();
      else captionTimer = window.setTimeout(updateCaption, 600);
      break;
    }
  }

  function syncHeroFade() {
    window.clearInterval(heroTimer);
    heroTimer = undefined;
    if (!slidesReady || !heroVisible || document.hidden || reducedMotion.matches) return;
    heroTimer = window.setInterval(showNextHeroSlide, 9000);
  }

  heroNext?.addEventListener('click', () => {
    showNextHeroSlide();
    syncHeroFade();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      syncHeroFade();
    }, { threshold: 0.05 }).observe(hero);
  }
  document.addEventListener('visibilitychange', syncHeroFade);
  reducedMotion.addEventListener?.('change', syncHeroFade);
  Promise.all(heroSlides.slice(1).map(slide => slide.decode?.().catch(() => {}) ?? Promise.resolve()))
    .then(() => {
      slidesReady = true;
      syncHeroFade();
    });
}

const problemHeading = document.querySelector('#problem-title');
const problemSection = document.querySelector('#why');
if (problemHeading && problemSection && !reducedMotion.matches) {
  const originalText = problemHeading.textContent.trim();
  const characters = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(document.documentElement.lang || 'en', { granularity: 'grapheme' }).segment(originalText)].map(part => part.segment)
    : Array.from(originalText);
  const fragment = document.createDocumentFragment();
  const letters = [];

  characters.forEach(character => {
    if (/\s/u.test(character)) {
      fragment.append(document.createTextNode(character));
      return;
    }
    const letter = document.createElement('span');
    letter.className = 'reveal-letter';
    letter.setAttribute('aria-hidden', 'true');
    letter.textContent = character;
    fragment.append(letter);
    letters.push(letter);
  });

  problemHeading.setAttribute('aria-label', originalText);
  problemHeading.replaceChildren(fragment);

  let visibleCount = 0;
  let revealFrame = 0;
  let lastScrollY = window.scrollY;
  let wasInView = false;
  let entrySide = 'top';
  let revealedProgress = 0;
  let furthestEntryTravel = 0;
  let introProgress = 0;
  function updateProblemReveal() {
    revealFrame = 0;
    const currentScrollY = window.scrollY;
    const direction = currentScrollY < lastScrollY ? 'up' : currentScrollY > lastScrollY ? 'down' : entrySide;
    lastScrollY = currentScrollY;
    const bounds = problemSection.getBoundingClientRect();
    const inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
    if (!inView) {
      if (wasInView) {
        letters.forEach(letter => letter.classList.remove('is-visible'));
        visibleCount = 0;
        revealedProgress = 0;
        furthestEntryTravel = 0;
        introProgress = 0;
        problemSection.style.setProperty('--problem-intro-opacity', '0');
        problemSection.classList.add('film-pending');
      }
      wasInView = false;
      return;
    }
    if (!wasInView) {
      entrySide = direction === 'up' ? 'bottom' : 'top';
      problemSection.classList.toggle('is-returning', entrySide === 'bottom');
      wasInView = true;
    }
    // The hero handoff follows the current scroll position in both directions.
    // Leave a little space after the hero disappears before this heading enters.
    const headerBottom = siteHeader?.getBoundingClientRect().bottom || 0;
    const heroFadeEnd = heroCopy
      ? currentScrollY + heroCopy.getBoundingClientRect().top - headerBottom - 12
      : currentScrollY + bounds.top - window.innerHeight * 0.6;
    const sectionStart = currentScrollY + bounds.top;
    const introStart = Math.min(sectionStart - window.innerHeight * 0.25, heroFadeEnd + 60);
    if (bounds.top > 0) {
      introProgress = Math.max(0, Math.min(1, (currentScrollY - introStart) / Math.max(1, sectionStart - introStart)));
    } else {
      introProgress = 1;
    }
    problemSection.style.setProperty('--problem-intro-opacity', String(Math.pow(introProgress, 1.5)));
    // Settle at the final heading position before the section pins. Compensating
    // for the approaching section avoids carrying the heading down and back up.
    const arrivalProgress = Math.min(1, introProgress / 0.8);
    const arrivalOffset = (1 - arrivalProgress) * Math.min(96, window.innerHeight * 0.12);
    const introOffset = bounds.top > 0 ? -bounds.top + arrivalOffset : 0;
    problemSection.style.setProperty('--problem-intro-offset', `${introOffset}px`);
    // Reveal from the entry edge, then keep the words bright until this section is left.
    const scrollTravel = Math.max(0, -bounds.top);
    const pinTravel = Math.max(1, problemSection.offsetHeight - window.innerHeight);
    const revealTravel = Math.max(1, Math.min(pinTravel * 0.72, window.innerHeight * 0.94));
    const entryTravel = entrySide === 'bottom' ? pinTravel : scrollTravel;
    furthestEntryTravel = Math.max(furthestEntryTravel, entryTravel);
    revealedProgress = Math.max(revealedProgress, Math.min(1, entryTravel / revealTravel));
    const nextCount = Math.round(revealedProgress * letters.length);
    if (nextCount > visibleCount) {
      for (let index = visibleCount; index < nextCount; index += 1) letters[index].classList.add('is-visible');
    }
    visibleCount = nextCount;
    // Keep the action in its lower-right position, showing it after the final word settles.
    const filmTravel = Math.min(pinTravel, revealTravel + window.innerHeight * 0.2);
    problemSection.classList.toggle('film-pending', furthestEntryTravel < filmTravel);
  }
  function scheduleProblemReveal() {
    if (!revealFrame) revealFrame = window.requestAnimationFrame(updateProblemReveal);
  }

  problemSection.classList.add('film-pending');
  problemSection.classList.add('is-entry-ready');
  updateProblemReveal();
  problemHeading.classList.add('is-reveal-ready');
  window.addEventListener('scroll', scheduleProblemReveal, { passive: true });
  window.addEventListener('resize', scheduleProblemReveal);
  window.addEventListener('pageshow', scheduleProblemReveal);
  document.fonts.ready.then(scheduleProblemReveal);
  reducedMotion.addEventListener?.('change', scheduleProblemReveal);
}

const professionList = document.querySelector('.profession-list');
if (professionList && !reducedMotion.matches) {
  const links = [...professionList.querySelectorAll('a')];
  const count = links.length;
  const track = document.createElement('div');
  track.className = 'profession-track';
  const makeCopies = () => links.map(link => {
    const copy = link.cloneNode(true);
    copy.removeAttribute('class');
    copy.setAttribute('aria-hidden', 'true');
    copy.tabIndex = -1;
    copy.inert = true;
    return copy;
  });
  track.append(...makeCopies(), ...links, ...makeCopies());
  professionList.append(track);
  professionList.classList.add('is-animated');
  const rows = [...track.children];
  let active = count + 2;
  let visible = false;
  let hovering = false;
  let focused = false;
  let timer;

  function render(animate = true) {
    track.style.transition = animate ? '' : 'none';
    rows.forEach((row, index) => {
      row.classList.toggle('is-active', index === active);
      row.dataset.distance = String(Math.min(Math.abs(index - active), 4));
    });
    const row = rows[active];
    const shift = professionList.clientHeight / 2 - row.offsetTop - row.offsetHeight / 2;
    track.style.transform = `translate3d(0, ${shift}px, 0)`;
    if (!animate) {
      void track.offsetHeight;
      track.style.transition = '';
    }
  }

  function stop() {
    window.clearInterval(timer);
    timer = undefined;
  }

  function start() {
    if (!visible || hovering || focused || timer) return;
    timer = window.setInterval(() => {
      if (active >= count * 2) {
        active -= count;
        render(false);
      }
      active += 1;
      render();
    }, 2600);
  }

  track.addEventListener('transitionend', event => {
    if (event.propertyName !== 'transform' || active < count * 2) return;
    active -= count;
    render(false);
  });
  professionList.addEventListener('pointerenter', () => { hovering = true; stop(); });
  professionList.addEventListener('pointerleave', () => { hovering = false; start(); });
  links.forEach((link, index) => {
    const center = () => { active = count + index; render(); };
    link.addEventListener('pointerenter', center);
    link.addEventListener('focus', () => { focused = true; stop(); center(); });
    link.addEventListener('blur', () => { focused = false; start(); });
  });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) start(); else stop();
  }, { threshold: 0.25 }).observe(professionList);
  window.addEventListener('resize', () => render(false));
  render(false);
} else if (professionList) {
  const links = [...professionList.querySelectorAll('a')];
  links.forEach(link => {
    const activate = () => links.forEach(item => item.classList.toggle('is-active', item === link));
    link.addEventListener('pointerenter', activate);
    link.addEventListener('focus', activate);
  });
}

if (storyReel && !reducedMotion.matches) {
  const scenes = [...storyReel.querySelectorAll('.feature')];
  const count = storyReel.querySelector('[data-story-count]');
  const progressFill = storyReel.querySelector('[data-story-progress]');
  const sceneProgress = [0, 0.39, 0.73];
  let currentScene = -1;

  function updateStory() {
    const travel = Math.max(1, storyReel.offsetHeight - window.innerHeight);
    const progress = Math.max(0, Math.min(1, -storyReel.getBoundingClientRect().top / travel));
    const scene = progress < 0.34 ? 0 : progress < 0.66 ? 1 : 2;
    if (scene !== currentScene) {
      scenes.forEach((item, index) => item.classList.toggle('is-current', index === scene));
      count.textContent = `${String(scene + 1).padStart(2, '0')} / 03`;
      currentScene = scene;
    }
    progressFill.style.transform = `scaleX(${progress})`;
  }

  function scrollToScene(index, behavior = 'smooth') {
    const travel = Math.max(1, storyReel.offsetHeight - window.innerHeight);
    const top = storyReel.getBoundingClientRect().top + window.scrollY + travel * sceneProgress[index];
    window.scrollTo({ top, behavior });
  }

  function restoreHashPosition() {
    if (!location.hash) return;
    const index = ['#relationship', '#brief', '#decision'].indexOf(location.hash);
    if (index >= 0) {
      scrollToScene(index, 'instant');
      return;
    }
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) {
      const headerOffset = (siteHeader?.offsetHeight || 0) + 12;
      window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - headerOffset), behavior: 'instant' });
    }
  }

  function initStory() {
    if (storyReel.classList.contains('is-enhanced')) return;
    storyReel.classList.add('is-enhanced');
    window.addEventListener('scroll', updateStory, { passive: true });
    window.addEventListener('resize', updateStory);
    document.querySelectorAll('a[href="#relationship"],a[href="#brief"],a[href="#decision"]').forEach(link => {
      link.addEventListener('click', event => {
        const index = ['#relationship', '#brief', '#decision'].indexOf(link.getAttribute('href'));
        if (index < 0) return;
        event.preventDefault();
        history.pushState(null, '', link.getAttribute('href'));
        scrollToScene(index);
      });
    });
    window.addEventListener('popstate', () => {
      const index = ['#relationship', '#brief', '#decision'].indexOf(location.hash);
      if (index >= 0) scrollToScene(index, 'auto');
    });
    restoreHashPosition();
    window.addEventListener('pageshow', restoreHashPosition);
    window.addEventListener('hashchange', restoreHashPosition);
    updateStory();
  }

  initStory();
}
