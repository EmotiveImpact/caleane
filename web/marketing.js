(() => {
 const tabs=[...document.querySelectorAll('[data-stage]')];
 function stage(key,focus=false){window.CaleaneUI?.selectTab(tabs.find(tab=>tab.dataset.stage===key),focus);}
 document.querySelectorAll('[data-stage-jump]').forEach(b=>b.addEventListener('click',()=>stage(b.dataset.stageJump,true)));
 document.querySelector('[data-approve]')?.addEventListener('click',()=>{document.querySelector('[data-decision-label]').textContent='Direction agreed';document.querySelector('[data-decision-title]').textContent='Approved. With the work.';document.querySelector('[data-decision-copy]').textContent='Daniel’s sample approval is attached to version 03. Sofia can proceed to the printer proof with the agreed direction recorded.';document.querySelector('[data-response]').textContent='Daniel · Approved just now';document.querySelector('[data-live]').textContent='Sample approval recorded for version 03.';stage('decision',true);});
 document.querySelectorAll('[data-perspective]').forEach(b=>b.addEventListener('click',()=>{let client=b.dataset.perspective==='client';document.querySelectorAll('[data-perspective]').forEach(x=>x.setAttribute('aria-pressed',x===b));document.querySelector('[data-private]').hidden=client;document.querySelector('[data-person-initial]').textContent=client?'D':'S';document.querySelector('[data-person-title]').textContent=client?'The work, ready for your response.':'The whole project, in view.';document.querySelector('[data-person-copy]').textContent=client?'The shared brief, current direction and your feedback.':'Working notes, the shared brief and the latest client response.';}));
 if('IntersectionObserver' in window){const o=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)document.querySelectorAll('.step-rail a').forEach(a=>{if(a.hash==='#'+e.target.id)a.setAttribute('aria-current','step');else a.removeAttribute('aria-current');});}),{rootMargin:'-20% 0px -50% 0px'});document.querySelectorAll('.walk-scene').forEach(s=>o.observe(s));}
})();
document.querySelectorAll('[data-scenario-toggle]').forEach(b=>b.addEventListener('click',()=>{const r=b.closest('[data-scenario]'),show=r.querySelector('[data-after]').hidden;r.querySelector('[data-before]').hidden=show;r.querySelector('[data-after]').hidden=!show;b.textContent=show?'Reset the example':b.dataset.label;r.querySelector('[data-scenario-status]').textContent=show?'Sample updated. No project data is saved.':'Interactive illustration. No project data is saved.';}));
document.querySelector('.billing-switch')?.addEventListener('caleane:togglechange', event => {
  const annual = event.detail.value === 'annual';
  document.querySelectorAll('[data-monthly]').forEach(price => price.textContent = '£' + price.dataset[annual ? 'annual' : 'monthly']);
  document.querySelectorAll('[data-price-period]').forEach(period => period.textContent = annual ? '/ year' : '/ month');
});
document.querySelector('#help-search')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();let n=0;document.querySelectorAll('[data-help]').forEach(a=>{a.hidden=!a.textContent.toLowerCase().includes(q);if(!a.hidden)n++;});document.querySelector('[data-help-status]').textContent=n?n+' topics found':'No matching topics. Try brief, review or access.';});

if (new URLSearchParams(location.search).get('mode') === 'login' && document.querySelector('[data-entry-title]')) {
  document.querySelector('[data-entry-label]').textContent = 'Account access';
  document.querySelector('[data-entry-title]').textContent = 'Your studio. Your workspace.';
  document.querySelector('[data-entry-copy]').textContent = 'Account access is not connected to this website preview. You can explore the complete sample workflow below.';
  document.querySelector('[data-entry-note]').textContent = 'The samples work without an account. Public account access will be connected when the service is ready.';
}
const helpStatus = document.querySelector('[data-help-status]');
if (helpStatus) helpStatus.textContent = document.querySelectorAll('[data-help]').length + ' topics to explore';
document.querySelector('[data-reset-project]')?.addEventListener('click', () => {
  document.querySelector('[data-decision-label]').textContent = 'Awaiting a response';
  document.querySelector('[data-decision-title]').textContent = 'The answer belongs with the version.';
  document.querySelector('[data-decision-copy]').textContent = 'Review the packaging direction and try approving it. The decision will appear here beside the version Daniel saw.';
  document.querySelector('[data-response]').textContent = 'Pending';
  document.querySelector('[data-live]').textContent = 'Sample project reset.';
  document.querySelector('[data-stage="brief"]').click();
});

// Prepare a draft locally. Sending is only enabled when a public address is configured.
const enquiryForm = document.querySelector('#enquiry-form');
let enquiryDraft = '';
let enquiryObjectUrl = '';
if (enquiryForm) {
  const address = window.CALEANE_CONTACT_EMAIL;
  if (address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    document.querySelector('[data-enquiry-disclosure]').textContent = 'Prepare your enquiry, then open it in your email app to send to ' + address + '.';
  }
  enquiryForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!enquiryForm.reportValidity()) return;
    const fields = new FormData(enquiryForm);
    enquiryDraft = `Caleane studio enquiry\n\nName: ${fields.get('name').trim()}\nStudio: ${fields.get('studio').trim()}\nEmail: ${fields.get('email').trim()}\n\n${fields.get('message').trim()}\n`;
    document.querySelector('[data-enquiry-text]').textContent = enquiryDraft;
    const result = document.querySelector('[data-enquiry-result]');
    result.hidden = false;
    if (enquiryObjectUrl) URL.revokeObjectURL(enquiryObjectUrl);
    enquiryObjectUrl = URL.createObjectURL(new Blob([enquiryDraft], {type:'text/plain;charset=utf-8'}));
    document.querySelector('[data-enquiry-download]').href = enquiryObjectUrl;
    document.querySelector('[data-enquiry-status]').textContent = 'Draft prepared on your device. Nothing has been sent.';
    if (address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      let emailLink = result.querySelector('[data-enquiry-email]');
      if (!emailLink) { emailLink = document.createElement('a'); emailLink.dataset.enquiryEmail = ''; emailLink.className = 'text-link'; emailLink.textContent = 'Open in email app'; result.append(emailLink); }
      emailLink.href = `mailto:${address}?subject=${encodeURIComponent('Studio enquiry — ' + fields.get('studio'))}&body=${encodeURIComponent(enquiryDraft)}`;
    }
    result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'nearest'});
  });
  document.querySelector('[data-enquiry-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(enquiryDraft); document.querySelector('[data-enquiry-status]').textContent = 'Draft copied.'; }
    catch { document.querySelector('[data-enquiry-status]').textContent = 'Copy is unavailable here. Download the draft or select the text above.'; }
  });
  window.addEventListener('pagehide', () => { if (enquiryObjectUrl) URL.revokeObjectURL(enquiryObjectUrl); });
}
