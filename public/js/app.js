import { evaluateAccess } from './policy.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const countries = { KG: 'Кыргызстан', KZ: 'Казахстан', UZ: 'Узбекистан', DE: 'Германия', US: 'США', UNKNOWN: 'Не определена' };
// Regions are illustrative selections, not measurements of the visitor's location.
const regions = { KG: [['KG-GB', 'Бишкек']], KZ: [['KZ-ALA', 'Алматы']], UZ: [['UZ-TK', 'Ташкент']], DE: [['DE-BE', 'Берлин'], ['DE-BY', 'Бавария']], US: [['US-CA', 'Калифорния'], ['US-NY', 'Нью-Йорк']] };
let mode = 'denylist';
let selectedRegions = new Set();
let lastResult = null;
let toastTimer;

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function fillRegions(countryId, regionId) {
  const country = $(countryId).value;
  const select = $(regionId);
  const unknown = new Option('Не определён', '');
  select.replaceChildren(unknown, ...(regions[country] || []).map(([value, name]) => new Option(name, value)));
  // Keep location incomplete unless the learner deliberately chooses a region.
  select.value = '';
  select.disabled = country === 'UNKNOWN';
}

function setMode(value) {
  mode = value;
  $$('[data-mode]').forEach(button => {
    const active = button.dataset.mode === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#mode-help').textContent = mode === 'denylist' ? 'Остальные страны и регионы получат доступ.' : 'Доступ получат только выбранные страны и регионы.';
}

function renderRegionChips() {
  $('#region-chips').replaceChildren(...[...selectedRegions].map(region => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'region-chip';
    button.textContent = region;
    const cross = document.createElement('span');
    cross.textContent = '×';
    cross.setAttribute('aria-hidden', 'true');
    button.append(cross);
    button.setAttribute('aria-label', `Удалить правило ${region}`);
    button.addEventListener('click', () => { selectedRegions.delete(region); renderRegionChips(); markDirty(); });
    return button;
  }));
}

function readState() {
  return {
    country: $('#visitor-country').value,
    region: $('#visitor-region').value || null,
    vpn: $('#use-vpn').checked,
    vpnCountry: $('#vpn-country').value,
    vpnRegion: $('#vpn-region').value || null,
    rules: { mode, countries: $$('input[name="rule-country"]:checked').map(input => input.value), regions: [...selectedRegions], unknownAction: $('#unknown-action').value }
  };
}

function locationLabel(country, region) {
  if (!country || country === 'UNKNOWN') return 'Не определена';
  const name = region ? regions[country]?.find(([code]) => code === region)?.[1] : null;
  return `${countries[country]}${name ? ` · ${name}` : ''} · ${country}`;
}

function markDirty() {
  if (lastResult) {
    $('#result-tag').textContent = 'Нужна проверка';
    $('#result-tag').className = 'tag neutral';
    $('#result-title').textContent = 'Настройки изменены';
    $('#result-description').textContent = 'Нажми «Проверить доступ», чтобы получить результат для новых правил.';
    $('#result-panel').classList.remove('allowed', 'denied');
    $('#result-emblem').textContent = '↻';
    $('#result-trace').hidden = true;
    $('#result-sees').textContent = '—';
    $('#result-rule').textContent = '—';
    lastResult = null;
  }
  const state = readState();
  $('#result-visitor').textContent = locationLabel(state.country, state.region);
  $('#result-vpn').textContent = state.vpn ? locationLabel(state.vpnCountry, state.vpnRegion) : 'Выключен';
  $$('[data-scenario]').forEach(button => button.classList.remove('selected'));
}

function checkAccess() {
  const state = readState();
  const effective = state.vpn ? { country: state.vpnCountry, region: state.vpnRegion } : { country: state.country === 'UNKNOWN' ? null : state.country, region: state.region };
  const result = evaluateAccess(effective, state.rules);
  lastResult = result;
  const panel = $('#result-panel');
  panel.classList.toggle('allowed', result.allowed);
  panel.classList.toggle('denied', !result.allowed);
  $('#result-tag').className = 'tag';
  $('#result-tag').textContent = result.allowed ? '200 OK' : '403 Forbidden';
  $('#result-emblem').textContent = result.allowed ? '✓' : '×';
  $('#result-title').textContent = result.allowed ? 'Доступ разрешён' : 'Доступ ограничен';
  let explanation;
  let rule;
  if (result.reason === 'unknown') {
    explanation = !effective.country ? 'Страна не определена. Применена настройка для неизвестной геолокации.' : 'Страна известна, но нужный регион не определён. Применена настройка для неизвестной геолокации.';
    rule = `Неизвестная геолокация → ${result.allowed ? 'разрешить' : 'запретить'}`;
  } else if (result.reason === 'country' || result.reason === 'region') {
    explanation = `Правило ${result.matched} ${state.rules.mode === 'allowlist' ? 'разрешает' : 'запрещает'} это подключение.${state.vpn ? ' Проверяется адрес VPN-сервера, а не исходная страна посетителя.' : ''}`;
    rule = `${state.rules.mode === 'allowlist' ? 'Разрешить' : 'Запретить'} · ${result.matched}`;
  } else {
    explanation = `Совпадений в списке ${state.rules.mode === 'denylist' ? 'запрета' : 'разрешения'} нет. По умолчанию такой запрос ${result.allowed ? 'разрешён' : 'запрещён'}.${state.vpn ? ' Сайт ориентируется на страну VPN-сервера.' : ''}`;
    rule = state.rules.mode === 'denylist' ? 'Нет в списке запрета' : 'Нет в списке разрешения';
  }
  $('#result-description').textContent = explanation;
  $('#result-visitor').textContent = locationLabel(state.country, state.region);
  $('#result-vpn').textContent = state.vpn ? locationLabel(state.vpnCountry, state.vpnRegion) : 'Выключен';
  $('#result-sees').textContent = locationLabel(effective.country, effective.region);
  $('#result-rule').textContent = rule;
  const trace = $('#result-trace');
  trace.replaceChildren();
  const source = document.createElement('span');
  source.textContent = state.country === 'UNKNOWN' ? '?' : state.country;
  trace.append(source);
  if (state.vpn) { const vpn = document.createElement('span'); vpn.textContent = `→ VPN ${state.vpnCountry}`; trace.append(vpn); }
  const decision = document.createElement('b');
  decision.textContent = `→ ${result.allowed ? '200 · вход разрешён' : '403 · запрос остановлен'}`;
  trace.append(decision);
  trace.hidden = false;
}

function resetLab() {
  $('#visitor-country').value = 'KG';
  $('#vpn-country').value = 'DE';
  fillRegions('#visitor-country', '#visitor-region');
  fillRegions('#vpn-country', '#vpn-region');
  $('#use-vpn').checked = false;
  $('#vpn-fields').hidden = true;
  $$('input[name="rule-country"]').forEach(input => { input.checked = false; });
  selectedRegions.clear();
  renderRegionChips();
  $('#unknown-action').value = 'deny';
  setMode('denylist');
  markDirty();
  lastResult = null;
  $('#result-tag').textContent = 'Ожидание';
  $('#result-tag').className = 'tag neutral';
  $('#result-emblem').textContent = '↗';
  $('#result-title').replaceChildren(document.createTextNode('Всё начинается'), document.createElement('br'), document.createTextNode('с одного запроса.'));
  $('#result-description').textContent = 'Выбери правила слева и нажми «Проверить доступ».';
  $('#result-panel').classList.remove('allowed', 'denied');
  $('#result-trace').hidden = true;
  $('#result-sees').textContent = '—';
  $('#result-rule').textContent = '—';
}

function setCountryRule(code) { $(`input[name="rule-country"][value="${code}"]`).checked = true; }

$$('[data-scenario]').forEach(button => button.addEventListener('click', () => {
  resetLab();
  switch (button.dataset.scenario) {
    case 'only-kg': setMode('allowlist'); setCountryRule('KG'); break;
    case 'block-de': $('#visitor-country').value = 'DE'; setCountryRule('DE'); break;
    case 'vpn-bypass':
      setCountryRule('KG');
      $('#use-vpn').checked = true;
      $('#vpn-fields').hidden = false;
      break;
    case 'region':
      $('#visitor-country').value = 'DE';
      selectedRegions.add('DE-BE');
      renderRegionChips();
      break;
  }
  fillRegions('#visitor-country', '#visitor-region');
  if (button.dataset.scenario === 'region') $('#visitor-region').value = 'DE-BE';
  checkAccess();
  button.classList.add('selected');
  if (matchMedia('(max-width: 560px)').matches) $('#result-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}));

$('#visitor-country').addEventListener('change', () => { fillRegions('#visitor-country', '#visitor-region'); markDirty(); });
$('#vpn-country').addEventListener('change', () => { fillRegions('#vpn-country', '#vpn-region'); markDirty(); });
$('#use-vpn').addEventListener('change', () => { $('#vpn-fields').hidden = !$('#use-vpn').checked; markDirty(); });
['#visitor-region', '#vpn-region', '#unknown-action'].forEach(selector => $(selector).addEventListener('change', markDirty));
$$('input[name="rule-country"]').forEach(input => input.addEventListener('change', markDirty));
$$('[data-mode]').forEach(button => button.addEventListener('click', () => { setMode(button.dataset.mode); markDirty(); }));
$('#add-region').addEventListener('click', () => {
  const region = $('#rule-region').value;
  if (selectedRegions.has(region)) return notify('Этот регион уже добавлен');
  selectedRegions.add(region);
  renderRegionChips();
  markDirty();
});
$('#check-access').addEventListener('click', checkAccess);
$('#reset-lab').addEventListener('click', resetLab);
fillRegions('#visitor-country', '#visitor-region');
fillRegions('#vpn-country', '#vpn-region');

$$('[data-route]').forEach(button => button.addEventListener('click', () => {
  const vpn = button.dataset.route === 'vpn';
  $('.network-visual').classList.toggle('direct', !vpn);
  $$('[data-route]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  $('#hero-visible').textContent = vpn ? 'Видит IP Германии' : 'Видит IP Кыргызстана';
  $('#tunnel-text').textContent = vpn ? 'Туннель зашифрован' : 'Без VPN-туннеля';
}));

const samples = {
  node: {
    file: 'middleware/geo-block.js · сокращённый пример',
    text: `import { evaluateAccess } from '../public/js/policy.js';
import { locate } from '../lib/geo.js';

// reader — открытая .mmdb-база, rules — правила сервера
export const geoBlock = (reader, rules) => {
  return (req, res, next) => {
    const location = locate(reader, req.ip);
    const result = evaluateAccess(location, rules);

    res.set('Cache-Control', 'private, no-store');
    if (!result.allowed) {
      return res.status(403).send('Доступ ограничен');
    }
    next();
  };
};`,
    explanation: 'Сокращённый пример с функциями из проекта. В архиве: загрузка базы, валидация правил, обработка ошибок и страница 403. Проверка выполняется до выдачи файлов.'
  },
  js: {
    file: 'public/js/app.js · учебная проверка',
    text: `import { evaluateAccess } from './policy.js';

// Условные данные: IP здесь не определяется
const location = {
  country: 'DE',
  region: 'DE-BE'
};

const rules = {
  mode: 'denylist',
  countries: ['DE'],
  regions: [],
  unknownAction: 'deny'
};

const result = evaluateAccess(location, rules);
console.log(result.allowed ? '200 OK' : '403 Forbidden');`,
    explanation: 'Это логика учебного симулятора. Она не блокирует реальные HTTP-запросы. Для настоящего ограничения проверка должна выполняться на сервере.'
  },
  waf: {
    file: 'Cloudflare · пример выражения для Custom Rule',
    text: `# Условие: страна IP — Германия
ip.src.country eq "DE"

# В панели правила выбери действие: Block

# Другой вариант: только Кыргызстан
not (ip.src.country in {"KG"})

# Выбери ОДНО выражение для своего сценария.
# Это не конфигурация Express или Nginx.
# Возможности и интерфейс зависят от сервиса.
# Закрой прямой доступ к исходному серверу.`,
    explanation: 'Пример выражения Cloudflare, а не готовый файл конфигурации. Действие Block задаётся отдельно. Перед применением проверь актуальную официальную документацию.'
  }
};
let currentCode = 'node';

function highlight(text) {
  const fragment = document.createDocumentFragment();
  // Tokenize once and create text nodes: no code string is inserted as HTML.
  const regex = /(\/\/[^\n]*|#[^\n]*|'[^'\n]*'|"[^"\n]*"|\b(?:import|from|export|const|return|if|not|in|eq)\b)/g;
  let last = 0;
  for (const match of text.matchAll(regex)) {
    fragment.append(document.createTextNode(text.slice(last, match.index)));
    const span = document.createElement('span');
    span.className = match[0].startsWith('//') || match[0].startsWith('#') ? 'syntax-comment' : /^['"]/.test(match[0]) ? 'syntax-string' : 'syntax-keyword';
    span.textContent = match[0];
    fragment.append(span);
    last = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(last)));
  return fragment;
}

function showCode(key) {
  currentCode = key;
  const sample = samples[key];
  $('#code-file').textContent = sample.file;
  $('#code-text').replaceChildren(highlight(sample.text));
  $('#code-explanation').textContent = sample.explanation;
  $('#code-content').setAttribute('aria-labelledby', `tab-${key}`);
  $$('[data-code]').forEach(button => { const selected = button.dataset.code === key; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
}
$$('[data-code]').forEach((button, index, buttons) => {
  button.addEventListener('click', () => showCode(button.dataset.code));
  button.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % buttons.length;
    if (event.key === 'ArrowLeft') target = (index - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = buttons.length - 1;
    if (target !== undefined) { event.preventDefault(); buttons[target].focus(); showCode(buttons[target].dataset.code); }
  });
});
$('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(samples[currentCode].text);
    notify('Код скопирован');
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('#code-text'));
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    notify('Код выделен. Нажми Ctrl+C или выбери «Копировать».');
  }
});
showCode('node');

const menu = $('.menu-toggle');
function closeMenu() { $('#main-nav').classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Открыть меню'); }
menu.addEventListener('click', () => { const open = $('#main-nav').classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню'); });
$$('#main-nav a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
const navLinks = $$('#main-nav a');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) navLinks.forEach(link => link.classList.toggle('active', link.hash === '#' + entry.target.id));
  }, { rootMargin: '-15% 0px -50% 0px', threshold: 0 });
  navLinks.forEach(link => observer.observe($(link.hash)));
}
