/* Home page story: the scroll-driven walkthrough, the client phone and the live studio feed. */
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const flow = document.querySelector('[data-hs-flow]');
  if (flow) {
    const frame = flow.querySelector('[data-hs-frame]');
    const app = flow.querySelector('[data-hs-app]');
    const steps = [...flow.querySelectorAll('.hs-step')];
    const screens = [...flow.querySelectorAll('.hs-screen')];
    const dots = [...flow.querySelectorAll('[data-dot]')];
    const navItems = [...flow.querySelectorAll('[data-nav]')];
    const crumb = flow.querySelector('[data-hs-crumb]');
    const crumbs = ['Pipeline · New enquiry', 'Pipeline', 'Projects · Amelia’s wedding · Brief', 'Projects · Amelia’s wedding · Designs', 'Finances · Invoices', 'Projects · Amelia’s wedding'];
    let current = 0;

    const fit = () => app.style.setProperty('--hs-scale', String(frame.clientWidth / app.offsetWidth));
    fit();
    new ResizeObserver(fit).observe(frame);

    function show(step) {
      if (step === current) return;
      current = step;
      app.dataset.step = String(step);
      steps.forEach(item => item.classList.toggle('is-on', Number(item.dataset.step) === step));
      screens.forEach(item => item.classList.toggle('is-on', Number(item.dataset.screen) === step));
      dots.forEach(item => item.classList.toggle('is-on', Number(item.dataset.dot) === step));
      navItems.forEach(item => item.classList.toggle('is-on', item.dataset.nav.split(' ').includes(String(step))));
      crumb.textContent = crumbs[step - 1];
    }

    // The step whose text crosses the reading line drives the app window.
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) show(Number(entry.target.dataset.step)); });
    }, { rootMargin: '-48% 0px -51% 0px' });
    steps.forEach(step => observer.observe(step));
    current = 0;
    show(1);
  }

  const client = document.querySelector('.hs-client');
  if (client) {
    new IntersectionObserver((entries, observer) => {
      if (!entries[0].isIntersecting) return;
      client.classList.add('is-seen');
      observer.disconnect();
    }, { threshold: 0.3 }).observe(client);
  }

  const feed = document.querySelector('[data-hs-feed]');
  if (feed && !reducedMotion.matches) {
    const events = [
      ['', '✓', 'Contract accepted', 'Olivia Grant, wedding in September'],
      ['is-cal', '◷', 'Payment reminder sent', 'To Jas Patel, due Friday'],
      ['', '↗', 'Proposal opened', 'Theo Marsh viewed it twice'],
      ['is-pay', '£', 'Instalment paid', '£1,200 from Ruth & Sam'],
      ['is-cal', '◷', 'Date held', 'Kiln & Co., 3 April, for seven days'],
      ['', '✓', 'Brief shared', 'Revision 02 sent to Noah Bennett'],
      ['is-pay', '£', 'Deposit received', '£2,700 from Amelia Taylor'],
      ['is-cal', '◷', 'Consultation booked', 'Noah Bennett, Thursday at 10:00']
    ];
    let index = 0;
    let timer;

    function add() {
      const [tone, icon, title, detail] = events[index % events.length];
      index += 1;
      const item = document.createElement('li');
      item.className = 'is-new';
      const mark = document.createElement('i');
      if (tone) mark.className = tone;
      mark.textContent = icon;
      const text = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = title;
      text.append(strong, detail);
      const time = document.createElement('time');
      time.textContent = 'Just now';
      item.append(mark, text, time);
      feed.querySelectorAll('time').forEach(stamp => { if (stamp.textContent === 'Just now') stamp.textContent = '1m'; });
      feed.prepend(item);
      while (feed.children.length > 6) feed.lastElementChild.remove();
    }

    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        if (!timer) timer = window.setInterval(add, 2800);
      } else {
        window.clearInterval(timer);
        timer = undefined;
      }
    }, { threshold: 0.2 }).observe(feed);
  }
})();
