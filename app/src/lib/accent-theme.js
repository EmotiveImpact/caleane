export const DEFAULT_ACCENT = '#202326';

export const ACCENT_PRESETS = [
  {name: 'Graphite', value: '#202326'},
  {name: 'Deep slate', value: '#344e5b'},
  {name: 'Mulberry', value: '#604852'},
  {name: 'Forest', value: '#344c40'},
  {name: 'Bronze', value: '#69502e'},
  {name: 'Indigo', value: '#3f4773'},
  {name: 'Clay', value: '#874a40'},
  {name: 'Aubergine', value: '#624663'},
];

export function accentContrast(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return 0;
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 1.05 / (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] + 0.05);
}

export function usableAccent(hex) {
  return accentContrast(hex) >= 4.5 ? hex.toLowerCase() : DEFAULT_ACCENT;
}
