const ACCENT_PRESETS = ['#ffffff', '#d4d4d4', '#9a9a9a', '#404040', '#0a0a0a'];

const FONT_MAP = { sm: '13px', md: '15px', lg: '17px' };
const WIDTH_MAP = { compact: '580px', normal: '720px', wide: '900px' };

export function hexToRgba(hex, alpha = 1) {
  const cleaned = (hex || '').replace('#', '');
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((v) => v + v).join('')
    : cleaned;
  const int = parseInt(normalized, 16);
  const red = (int >> 16) & 255;
  const green = (int >> 8) & 255;
  const blue = int & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function darken(hex, percent = 10) {
  const cleaned = (hex || '#ffffff').replace('#', '');
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((v) => v + v).join('')
    : cleaned;

  const int = parseInt(normalized, 16);
  let red = (int >> 16) & 255;
  let green = (int >> 8) & 255;
  let blue = int & 255;

  const ratio = (100 - percent) / 100;
  red = Math.max(0, Math.floor(red * ratio));
  green = Math.max(0, Math.floor(green * ratio));
  blue = Math.max(0, Math.floor(blue * ratio));

  const toHex = (value) => value.toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

export function applyAccentColor(hex) {
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-hover', darken(hex, 10));
  root.style.setProperty('--accent-glow', hexToRgba(hex, 0.15));
}

export function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme || 'dark';
}

export function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.dataset.theme = resolved;
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transitioning');
  }, 300);
}

export function applyFontSize(font) {
  const size = FONT_MAP[font] || FONT_MAP.md;
  document.documentElement.style.setProperty('--chat-font-size', size);
  document.documentElement.dataset.font = font || 'md';
}

export function applyWidth(width) {
  const maxWidth = WIDTH_MAP[width] || WIDTH_MAP.normal;
  document.documentElement.style.setProperty('--chat-max-width', maxWidth);
  document.documentElement.dataset.width = width || 'normal';
}

export function getAccentPresets() {
  return ACCENT_PRESETS.slice();
}
