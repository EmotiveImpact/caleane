(() => {
  const root = document.querySelector('.review-product');
  if (!root) return;
  const tabs = [...root.querySelectorAll('[data-review-stage]')];
  const image = root.querySelector('#review-image');
  const pin = root.querySelector('.review-pin');
  const live = root.querySelector('.review-live');
  const form = root.querySelector('#review-change-form');
  const request = root.querySelector('[data-review-request]');
  const approve = root.querySelector('[data-review-approve]');
  let outcome = 'pending';
  let selectedReference = 'reception';
  const references = {
    reception: ['assets/review-reception.png', 'Candlelit reception with low ivory floral centrepieces'],
    florals: ['assets/candlelit-table.webp', 'Ivory flowers and candlelight: the original floral reference'],
    materials: ['assets/studio-worktable.webp', 'Natural linen, stone and warm wood material references'],
    palette: ['assets/interior-outcome.webp', 'A warm neutral interior palette reference'],
    styling: ['assets/hospitality-studio.webp', 'Hospitality styling reference for the reception'],
    setting: ['assets/event-outcome.webp', 'A completed floral event setting reference']
  };
  function selectReference(key) {
    selectedReference = key;
    const [src, alt] = references[key];
    image.src = src; image.alt = alt;
    root.querySelectorAll('[data-reference]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.reference === key)));
    pin.hidden = key !== 'reception' || root.querySelector('[data-review-stage="design"]').getAttribute('aria-selected') !== 'true';
  }
  function setStage(stage, focusTab = false) {
    window.CaleaneUI?.selectTab(tabs.find(tab => tab.dataset.reviewStage === stage), focusTab);
    renderStage(stage);
  }
  function renderStage(stage) {
    root.querySelector('[data-review-status]').textContent = stage === 'brief' ? 'Shared brief · Revision 03' : stage === 'decision' ? 'Decision record · Version 03' : 'Design review · Version 03';
    pin.hidden = stage !== 'design' || selectedReference !== 'reception';
  }
  root.addEventListener('caleane:tabchange', event => renderStage(event.detail.value));
  root.querySelectorAll('[data-reference]').forEach(button => button.addEventListener('click', () => selectReference(button.dataset.reference)));
  root.querySelectorAll('[data-stage-next]').forEach(button => button.addEventListener('click', () => setStage(button.dataset.stageNext, true)));
  pin.addEventListener('click', () => root.querySelector('#review-feedback').focus({preventScroll: false}));
  function closeForm() { form.hidden = true; request.setAttribute('aria-expanded', 'false'); }
  request.addEventListener('click', () => {
    const open = form.hidden;
    form.hidden = !open; request.setAttribute('aria-expanded', String(open));
    if (open) form.querySelector('textarea').focus();
  });
  root.querySelector('[data-review-cancel]').addEventListener('click', () => {closeForm(); request.focus();});
  function updateDecision() {
    root.querySelector('[data-decision-heading]').textContent = outcome === 'approved' ? 'Approved. And kept with the work.' : outcome === 'changes' ? 'A change, clearly recorded.' : 'A clear answer, kept here.';
    root.querySelector('[data-decision-copy]').textContent = outcome === 'approved' ? 'Amelia approved the direction in version 03. Her response stays with this design and the shared brief.' : outcome === 'changes' ? 'Amelia’s feedback is saved against version 03. The studio can see exactly what needs attention.' : 'Review version 03 and approve the direction or request a change. The response will stay beside this exact version.';
    root.querySelector('[data-decision-response]').textContent = outcome === 'approved' ? 'Approved by Amelia · Just now' : outcome === 'changes' ? 'Changes requested · Just now' : 'Awaiting Amelia’s review';
    root.querySelector('[data-review-reset]').hidden = outcome === 'pending';
    root.querySelector('[data-outcome-label]').textContent = outcome === 'pending' ? 'THE DECISION' : 'SAMPLE RESPONSE SAVED';
    root.querySelector('[data-version-note]').textContent = outcome === 'approved' ? 'Version 03 · Approved for direction' : outcome === 'changes' ? 'Version 03 · Changes requested' : 'Version 03 · Ready for review';
    approve.textContent = outcome === 'approved' ? 'View the approval' : 'Approve this version';
  }
  approve.addEventListener('click', () => {
    outcome = 'approved'; updateDecision(); closeForm(); setStage('decision', true);
    live.textContent = 'Sample approval saved. Amelia approved version 03.';
  });
  form.addEventListener('submit', event => {
    event.preventDefault(); const input = form.querySelector('textarea');
    const value = input.value.trim();
    if (!value) {input.setCustomValidity('Please add your feedback.'); input.reportValidity(); return;}
    input.setCustomValidity('');
    root.querySelector('[data-new-feedback]').textContent = value;
    root.querySelector('.review-new-comment').hidden = false;
    outcome = 'changes'; updateDecision(); closeForm(); form.reset();
    live.textContent = 'Your sample feedback has been saved against version 03.';
    request.focus();
  });
  form.querySelector('textarea').addEventListener('input', event => event.target.setCustomValidity(''));
  root.querySelector('[data-review-reset]').addEventListener('click', () => {
    outcome = 'pending'; updateDecision(); closeForm(); form.reset();
    root.querySelector('.review-new-comment').hidden = true;
    root.querySelector('[data-new-feedback]').textContent = '';
    selectReference('reception'); setStage('design', true);
    live.textContent = 'Example reset. Version 03 is ready for review.';
  });
})();
