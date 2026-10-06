/* Home page story: reveals each photographed moment as it arrives, the client phone and the live studio feed. */
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Without the script the moments simply show in full.
  document.documentElement.classList.add('hs-js');
  const chapters = [...document.querySelectorAll('[data-chapter]')];
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('is-in'); });
  }, { threshold: 0.55 });
  chapters.forEach(chapter => reveal.observe(chapter));

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
      ['is-cal', '◷', 'Payment reminder sent', 'To Jas Patel, due Friday'],
      ['', '↗', 'Proposal opened', 'Theo Marsh viewed it twice'],
      ['is-pay', '£', 'Instalment paid', '£1,200 from Kiln & Co.'],
      ['is-cal', '◷', 'Date held', 'Ruth & Sam, 3 April, for seven days'],
      ['', '✓', 'Brief shared', 'Revision 02 sent to Lena'],
      ['is-pay', '£', 'Deposit received', '£2,700 from Daniel Hart'],
      ['is-cal', '◷', 'Consultation booked', 'Maya Ellis, Thursday at 10:00'],
      ['', '✓', 'Contract accepted', 'Olivia Grant, wedding in September']
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
      while (feed.children.length > 5) feed.lastElementChild.remove();
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
