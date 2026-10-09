import React, {useEffect, useState} from 'react';

const scenes = [
  '/assets/candlelit-table.webp',
  '/assets/interiors-studio.webp',
  '/assets/hospitality-studio.webp',
  '/assets/wellness-studio.webp',
];

export function AuthScenes() {
  const [active, setActive] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setActive(current => (current + 1) % scenes.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  return <div className="auth-story">
    <div className="auth-visual" aria-hidden="true">
      {scenes.map((image, index) => <img key={image} className={index === active ? 'is-active' : ''} src={image} alt="" decoding="async" />)}
    </div>
    <span className="auth-wordmark"><img src="/assets/identity/caleane-symbol-ivory.svg" alt=""/>Caleane</span>
    <div className="auth-story-copy">
      <p className="eyebrow">THE BUSINESS BEHIND THE BEAUTIFUL</p>
      <h1><span>Make room for</span>{' '}<span>the idea.</span></h1>
      <p>A shared home for your clients, designs<br/>and the conversations that bring them to life.</p>
    </div>
  </div>;
}
