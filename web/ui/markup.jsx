import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

// The authored HTML remains the content source and no-JavaScript fallback.
// Capture it once, before the page's sample-workflow scripts attach listeners.
// React owns only each enhanced island; subsequent sample text/form changes persist.
const names = { class: 'className', for: 'htmlFor', tabindex: 'tabIndex', readonly: 'readOnly',
  colspan: 'colSpan', rowspan: 'rowSpan', maxlength: 'maxLength', autocomplete: 'autoComplete',
  playsinline: 'playsInline', fetchpriority: 'fetchPriority', autofocus: 'autoFocus' };
const booleans = new Set(['hidden', 'disabled', 'required', 'multiple', 'controls', 'playsinline', 'readonly', 'autofocus']);
export function capture(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const props = {};
  for (const { name, value } of node.attributes) {
    if (name.startsWith('on') || name === 'style') continue;
    if (name === 'value') props.defaultValue = value;
    else if (name === 'checked') props.defaultChecked = true;
    else props[names[name] || name] = booleans.has(name) ? true : value;
  }
  if (node.hasAttribute('style')) {
    props.style = {};
    for (const name of node.style) {
      const key = name.startsWith('--') ? name : name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      props.style[key] = node.style.getPropertyValue(name);
    }
  }
  return { tag: node.localName, props, children: [...node.childNodes].map(capture).filter(n => n !== null) };
}
const voidTags = new Set(['img', 'input', 'br', 'hr', 'source', 'wbr', 'area', 'meta', 'link']);
export function element(node, props = {}, children) {
  const attributes = { ...node.props, ...props };
  return voidTags.has(node.tag)
    ? React.createElement(node.tag, attributes)
    : React.createElement(node.tag, attributes, children ?? node.children.map((child, key) => render(child, null, key)));
}
export function render(node, transform, key) {
  if (typeof node === 'string') return node;
  const children = node.children.map((child, index) => render(child, transform, index));
  return transform?.(node, children, key) ?? element(node, { key }, children);
}
export function mount(original, component) {
  const slot = document.createElement('div');
  slot.className = 'ui-island';
  original.replaceWith(slot);
  flushSync(() => createRoot(slot).render(component));
}
