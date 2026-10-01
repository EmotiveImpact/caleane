import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Slider from '@radix-ui/react-slider';
import { capture, element, render, mount } from './markup.jsx';

const controllers = new Map();
const emit = (node, type, detail) => node?.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
window.CaleaneUI = {
  library: 'Radix UI',
  selectTab(button, focus = false) {
    const control = controllers.get(button?.id);
    if (!control) return;
    flushSync(() => control.select(control.value));
    if (focus) document.getElementById(button.id)?.focus({ preventScroll: true });
  },
};

function commonParent(nodes) {
  let parent = nodes[0].parentElement;
  while (parent && !nodes.every(node => parent.contains(node))) parent = parent.parentElement;
  return parent;
}

function TabIsland({ snapshot, model }) {
  const [value, select] = useState(model.initial);
  const root = useRef(null);
  useLayoutEffect(() => {
    model.tabs.forEach(tab => controllers.set(tab.id, { value: tab.value, select }));
    return () => model.tabs.forEach(tab => controllers.delete(tab.id));
  }, [model]);
  useLayoutEffect(() => {
    const current = model.tabs.find(tab => tab.value === value);
    emit(root.current, 'caleane:tabchange', { value, trigger: document.getElementById(current.id) });
  }, [value, model]);
  function transform(node, children, key) {
    if (node.props.role === 'tablist') {
      return <Tabs.List asChild key={key}>{element(node, {}, children)}</Tabs.List>;
    }
    const tab = model.tabs.find(tab => tab.id === node.props.id);
    if (tab) {
      const { role, tabIndex, 'aria-selected': selected, ...props } = node.props;
      return <Tabs.Trigger asChild value={tab.value} key={key} onClick={() => select(tab.value)}>
        {element({ ...node, props }, {
          'data-ui-value': tab.value,
          // Preserve inbound panel IDs and the authored accessibility relationship.
          'aria-controls': tab.panel,
        }, children)}
      </Tabs.Trigger>;
    }
    const panel = model.panels.find(panel => panel.id === node.props.id);
    if (panel) {
      const panelValue = panel.shared ? value : panel.value;
      const active = panelValue === value;
      const label = model.tabs.find(tab => tab.value === panelValue)?.id;
      return <Tabs.Content asChild forceMount value={panelValue} key={key} hidden={!active} aria-labelledby={label}>
        {element(node, { hidden: !active, 'aria-labelledby': label }, children)}
      </Tabs.Content>;
    }
  }
  return <Tabs.Root asChild value={value} onValueChange={select}>
    {element(snapshot, { ref: root, 'data-ui-tabs': '' }, snapshot.children.map((child, key) => render(child, transform, key)))}
  </Tabs.Root>;
}

function ToggleIsland({ snapshot, attribute }) {
  const buttons = snapshot.children.filter(node => node?.tag === 'button');
  const [value, select] = useState(buttons.find(node => node.props['aria-pressed'] === 'true')?.props[attribute] || buttons[0].props[attribute]);
  const root = useRef(null);
  useLayoutEffect(() => { emit(root.current, 'caleane:togglechange', { value }); }, [value]);
  return <ToggleGroup.Root asChild type="single" value={value} onValueChange={next => { if (next) select(next); }}>
    {element(snapshot, { ref: root, 'data-ui-toggle': '' }, snapshot.children.map((node, key) => {
      if (node?.tag !== 'button') return render(node, null, key);
      const { 'aria-pressed': pressed, ...props } = node.props;
      return <ToggleGroup.Item asChild value={props[attribute]} key={key}>{element({ ...node, props })}</ToggleGroup.Item>;
    }))}
  </ToggleGroup.Root>;
}

function Disclosure({ snapshot }) {
  const [open, setOpen] = useState(Boolean(snapshot.props.open));
  const summary = snapshot.children.find(node => node?.tag === 'summary');
  const contents = snapshot.children.filter(node => node !== summary);
  const { open: oldOpen, ...props } = snapshot.props;
  return <Collapsible.Root open={open} onOpenChange={setOpen} {...props} className={[props.className, 'ui-disclosure'].filter(Boolean).join(' ')}>
    <Collapsible.Trigger className="ui-disclosure-trigger">{summary.children.map((child, key) => render(child, null, key))}</Collapsible.Trigger>
    <Collapsible.Content>{contents.map((child, key) => render(child, null, key))}</Collapsible.Content>
  </Collapsible.Root>;
}

function RevealSlider({ snapshot }) {
  const [value, setValue] = useState(Number(snapshot.props.defaultValue || 100));
  const root = useRef(null);
  useLayoutEffect(() => { emit(root.current, 'caleane:rangechange', { value }); }, [value]);
  return <Slider.Root id={snapshot.props.id} ref={root} className="ui-slider" data-reference-progress="" data-ui-value={value}
    min={0} max={100} step={1} value={[value]} onValueChange={([next]) => setValue(next)}>
    <Slider.Track className="ui-slider-track"><Slider.Range className="ui-slider-range" /></Slider.Track>
    <Slider.Thumb className="ui-slider-thumb" aria-label="Explore the reveal" />
  </Slider.Root>;
}

function SiteHeader({ snapshot }) {
  const [mobile, setMobile] = useState(matchMedia('(max-width:820px)').matches);
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  useLayoutEffect(() => {
    const media = matchMedia('(max-width:820px)');
    const update = () => { setMobile(media.matches); setOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  function transform(node, children, key) {
    if (node.props.id === 'site-navigation' && mobile) {
      return <Popover.Portal key={key}><Popover.Content side="bottom" align="end" sideOffset={20} collisionPadding={0}
        className="ui-mobile-menu" aria-label="Main navigation" onOpenAutoFocus={event => {
          event.preventDefault(); document.querySelector('.ui-mobile-menu a')?.focus();
        }} onCloseAutoFocus={event => { event.preventDefault(); if (mobile) trigger.current?.focus(); }}>
        <nav id="site-navigation" aria-label="Main navigation">{node.children.map((link, index) => typeof link === 'string' ? link : element(link, { key: index, onClick: () => setOpen(false) }))}</nav>
      </Popover.Content></Popover.Portal>;
    }
    if (Object.hasOwn(node.props, 'data-site-menu')) {
      const { 'aria-expanded': expanded, ...props } = node.props;
      return <Popover.Trigger asChild key={key}>{element({ ...node, props }, { ref: trigger, 'aria-controls': 'site-navigation' }, open ? 'Close' : 'Menu')}</Popover.Trigger>;
    }
  }
  return <Popover.Root open={mobile && open} onOpenChange={setOpen} modal>
    {element(snapshot, { 'data-ui-header': '', 'data-menu-open': mobile && open ? '' : undefined }, snapshot.children.map((child, key) => render(child, transform, key)))}
  </Popover.Root>;
}

function FullscreenDialog({ snapshot, triggerSnapshot, triggerSlot, kind }) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState(null);
  const contentRef = useRef(null);
  const film = kind === 'film';
  const titleId = snapshot.props['aria-labelledby'];
  function change(next) {
    if (next && !film) {
      const panel = document.querySelector('[data-platform-panel]:not([hidden])');
      const image = panel.querySelector('img');
      setScreen({ src: image.src, alt: image.alt, title: panel.querySelector('h2').textContent });
    }
    setOpen(next);
  }
  useLayoutEffect(() => {
    if (!open) return;
    const className = film ? 'film-open' : 'pl-tour-open';
    document.body.classList.add(className);
    const video = contentRef.current?.querySelector('video');
    if (video?.dataset.src) {
      video.src = video.dataset.src;
      video.hidden = false;
      contentRef.current.querySelector('.film-placeholder').hidden = true;
      video.play().catch(() => {});
    }
    return () => { video?.pause(); document.body.classList.remove(className); };
  }, [open, film]);
  function transform(node, children, key) {
    if (Object.hasOwn(node.props, film ? 'data-film-close' : 'data-platform-close')) {
      return <Dialog.Close asChild key={key}>{element(node, {}, children)}</Dialog.Close>;
    }
    if (node.props.id === titleId) {
      return <Dialog.Title asChild key={key}>{element(node, {}, screen?.title || children)}</Dialog.Title>;
    }
    if (!film && node.tag === 'img' && screen) return element(node, { key, src: screen.src, alt: screen.alt });
  }
  const { 'aria-labelledby': label, ...dialogProps } = snapshot.props;
  return <Dialog.Root open={open} onOpenChange={change}>
    {createPortal(<Dialog.Trigger asChild>{element(triggerSnapshot, { 'aria-controls': snapshot.props.id })}</Dialog.Trigger>, triggerSlot)}
    <Dialog.Portal>
      <Dialog.Overlay className="ui-dialog-overlay" />
      <Dialog.Content asChild aria-labelledby={titleId} aria-describedby={undefined} onOpenAutoFocus={event => {
        event.preventDefault(); contentRef.current?.querySelector('button')?.focus();
      }}>
        {element({ ...snapshot, tag: 'div', props: dialogProps }, { ref: contentRef, 'data-ui-dialog': kind }, snapshot.children.map((child, key) => render(child, transform, key)))}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

// Mount synchronously before deferred sample-workflow and cinematic scripts run.
const header = document.querySelector('.cal-header');
if (header) mount(header, <SiteHeader snapshot={capture(header)} />);

for (const list of document.querySelectorAll('[role="tablist"]')) {
  const triggers = [...list.querySelectorAll('[role="tab"]')];
  if (!triggers.length) continue;
  const controls = [...new Set(triggers.map(tab => tab.getAttribute('aria-controls')))];
  const panelNodes = controls.map(id => document.getElementById(id)).filter(Boolean);
  if (!panelNodes.length) continue;
  const parent = commonParent([list, ...panelNodes]);
  const tabs = triggers.map(tab => ({ id: tab.id, panel: tab.getAttribute('aria-controls'),
    value: tab.dataset.reviewStage || tab.dataset.access || tab.dataset.trustView || tab.dataset.stage || tab.dataset.previewTab || tab.id }));
  const model = {
    tabs,
    initial: tabs[triggers.findIndex(tab => tab.getAttribute('aria-selected') === 'true')]?.value || tabs[0].value,
    panels: controls.map(id => ({ id, shared: controls.length === 1, value: tabs.find(tab => tab.panel === id).value })),
  };
  mount(parent, <TabIsland snapshot={capture(parent)} model={model} />);
}
for (const attribute of ['data-billing', 'data-perspective']) {
  const button = document.querySelector(`[${attribute}]`);
  if (button) mount(button.parentElement, <ToggleIsland snapshot={capture(button.parentElement)} attribute={attribute} />);
}
for (const details of document.querySelectorAll('details')) mount(details, <Disclosure snapshot={capture(details)} />);
const slider = document.querySelector('[data-reference-progress]');
if (slider) mount(slider, <RevealSlider snapshot={capture(slider)} />);
for (const [selector, triggerSelector, kind] of [
  ['#calenne-film', '[data-film-open]', 'film'],
  ['[data-platform-dialog]', '[data-platform-enlarge]', 'platform'],
]) {
  const dialog = document.querySelector(selector);
  const trigger = document.querySelector(triggerSelector);
  if (!dialog || !trigger) continue;
  const snapshot = capture(dialog), triggerSnapshot = capture(trigger);
  const triggerSlot = document.createElement('span'); triggerSlot.className = 'ui-island';
  trigger.replaceWith(triggerSlot);
  mount(dialog, <FullscreenDialog snapshot={snapshot} triggerSnapshot={triggerSnapshot} triggerSlot={triggerSlot} kind={kind} />);
}
document.documentElement.dataset.uiLibrary = 'radix';
