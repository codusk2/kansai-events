// 蟹鱼游旅行点原型：以京桥站为中心，按单程时间（公共交通 / 自驾）找旅行点，三种呈现方式（地图、时间圈、画册）。
// 默认什么都不显示，点顶部标签才开始探索；「🍏 绿苹果」是单独的专区（Mrs. GREEN APPLE 在关西的地点和活动）。
(async () => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = new URLSearchParams(location.search);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---------- 日期与季节 ----------
  const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const doyMD = s => CUM[+s.slice(0, 2) - 1] + +s.slice(3, 5);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const todayDoy = doyMD(today.slice(5));
  const fmtMD = s => `${+s.slice(0, 2)}/${+s.slice(3, 5)}`;
  const fmtISO = iso => fmtMD(iso.slice(5));
  const inWin = (d, w) => {
    const s = doyMD(w.from);
    const e = doyMD(w.to);
    return s <= e ? d >= s && d <= e : d >= s || d <= e;
  };

  function season(p) {
    if (!p.seasons.length) return { hot: false, tone: 'plain', text: '全年可去' };
    for (const w of p.seasons) {
      if (inWin(todayDoy, w)) return { hot: true, tone: w.tone, text: `${w.label}正当时` };
    }
    let best = null;
    for (const w of p.seasons) {
      const days = (doyMD(w.from) - todayDoy + 365) % 365;
      if (!best || days < best.days) best = { w, days };
    }
    const text = best.days <= 14 ? `${best.w.label}${best.days === 1 ? '明天' : best.days + '天后'}开始` : `${best.w.label} ${fmtMD(best.w.from)}起`;
    return { hot: false, tone: best.w.tone, text };
  }

  // ---------- 数据 ----------
  const [DATA, GA_DATA] = await Promise.all([
    fetch('../../data/places.json').then(r => r.json()),
    fetch('../../data/greenapple.json').then(r => r.json())
  ]);
  const ORIGIN = DATA.origin;
  const PLACES = DATA.places;
  const byId = Object.fromEntries(PLACES.map(p => [p.id, p]));
  const toRad = d => d * Math.PI / 180;
  // 从京桥看的方位角（0=北，顺时针）
  const bearing = ll => {
    const [lon1, lat1] = ORIGIN.ll.map(toRad);
    const [lon2, lat2] = ll.map(toRad);
    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  };
  PLACES.forEach(p => {
    p.deg = bearing(p.ll);
    p.season = season(p);
  });

  // 绿苹果专区：只留还没结束的活动
  const GA_ITEMS = GA_DATA.events.filter(e => !e.to || e.to >= today);
  const gaById = Object.fromEntries(GA_ITEMS.map(e => [e.id, e]));
  const gaDate = e => {
    if (!e.from) return `${e.dateNote}–${fmtISO(e.to)}`;
    return e.from === e.to ? fmtISO(e.from) : `${fmtISO(e.from)}–${fmtISO(e.to)}`;
  };

  // ---------- 状态 ----------
  const GA = '绿苹果';
  const state = {
    measure: qs.get('m') === 'car' ? 'car' : 'transit',
    limit: 180,
    tags: new Set((qs.get('t') || '').split(',').filter(Boolean)),
    view: ['map', 'rings', 'book'].includes(qs.get('view')) ? qs.get('view') : 'map',
    sel: null,
    focus: null
  };
  const wish = new Set(['tofukuji', 'arima']);
  const MEASURE = { transit: '公共交通', car: '自驾' };
  const BAND_NAME = { 30: '半小时', 60: '1小时', 120: '2小时', 180: '3小时' };
  const LIMITS = [30, 60, 120, 180];
  const TAGS = [GA, '风景美', '热闹', '好吃', '山里', '海边', '人文古迹', '最近热门', '水边', '寺社', '赏花', '红叶', '温泉', '夜景', '散步', '安静', '拍照', '建筑', '乐园', '雨天也行'];
  const EMOJI = {
    绿苹果: '🍏', 风景美: '🏞️', 热闹: '🎉', 好吃: '🍜', 山里: '⛰️', 海边: '🌊', 人文古迹: '🏯', 最近热门: '🔥', 水边: '🛶', 寺社: '⛩️', 赏花: '🌸',
    红叶: '🍁', 温泉: '♨️', 夜景: '🌃', 散步: '🚶', 安静: '🍃', 拍照: '📷', 建筑: '🏛️', 乐园: '🎢', 雨天也行: '☔'
  };
  // 照片针下的emoji：先挑最能说明“是什么地方”的
  const MAIN_ORDER = ['温泉', '海边', '山里', '寺社', '人文古迹', '红叶', '赏花', '水边', '夜景', '好吃', '建筑', '乐园', '热闹', '风景美', '安静', '散步', '拍照', '雨天也行'];
  const mainEmo = (p, n = 2) => MAIN_ORDER.filter(t => p.tags.includes(t)).slice(0, n).map(t => EMOJI[t]).join('');
  const emojis = (p, n = 4) => p.tags.slice(0, n).map(t => EMOJI[t] || '').join('');

  const gaMode = () => state.tags.has(GA);
  const exploring = () => state.tags.size > 0;
  const hasTag = (p, t) => (t === '最近热门' ? p.season.hot : p.tags.includes(t));
  const tagsOk = (p, set = state.tags) => [...set].every(t => hasTag(p, t));
  const minsOf = (p, m = state.measure) => p[m].mins;
  const bandOf = (p, m = state.measure) => {
    const v = minsOf(p, m);
    return v <= 30 ? '30' : v <= 60 ? '60' : v <= 120 ? '120' : v <= 180 ? '180' : null;
  };
  const shown = p => exploring() && !gaMode() && minsOf(p) <= state.limit && tagsOk(p);
  const timeBadge = p => `<span class="tb tb-${bandOf(p) || '180'}">${minsOf(p)}分</span>`;
  const photo = (p, cls = '') => (p.img
    ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(p.img.thumb)}" alt="" loading="lazy" decoding="async">`
    : `<span class="ph${cls ? ' ' + cls : ''}">${esc([...p.name][0])}</span>`);

  let toastTimer;
  function toast(text) {
    $('toast').textContent = text;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
  }

  // ---------- 顶部：一张卡，上行是站名和“交通·时间”，下行是主题标签 ----------
  const tagChip = (t, n, on, cls = 'tag') => `<button type="button" class="${cls}${t === GA ? ' ga' : ''}" data-t="${t}" aria-pressed="${on}"${!on && n === 0 ? ' disabled' : ''}>`
    + `<span class="emo" aria-hidden="true">${EMOJI[t]}</span>${t}${n === null ? '' : `<small>${n}</small>`}</button>`;

  function tagCount(t) {
    if (t === GA) return GA_ITEMS.length;
    const base = [...state.tags].filter(x => x !== GA);
    return PLACES.filter(p => minsOf(p) <= state.limit && tagsOk(p, new Set([...base, t]))).length;
  }

  function renderHeader() {
    const icon = state.measure === 'car' ? '🚗' : '🚃';
    $('filter-btn').innerHTML = `<span>${icon} ${state.measure === 'car' ? '自驾' : '公交'}</span><span class="fb-sep"></span><span>${BAND_NAME[state.limit]}内</span><span class="fb-caret" aria-hidden="true">▾</span>`;
    $('measure').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === state.measure)));
    const base = gaMode() ? new Set() : state.tags;
    $('limit').innerHTML = LIMITS.map(l => {
      const n = PLACES.filter(p => minsOf(p) <= l && tagsOk(p, base)).length;
      return `<button type="button" data-l="${l}" aria-pressed="${state.limit === l}">${BAND_NAME[l]}内<small>${n}</small></button>`;
    }).join('');
    // 选中的标签排在最前面，再点一次取消
    const order = [...TAGS.filter(t => state.tags.has(t)), ...TAGS.filter(t => !state.tags.has(t))];
    $('tags').innerHTML = order.map(t => tagChip(t, tagCount(t), state.tags.has(t))).join('');
  }

  function toggleTag(t) {
    if (t === GA) {
      state.tags = state.tags.has(GA) ? new Set() : new Set([GA]);
    } else {
      state.tags.delete(GA);
      state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t);
    }
    $('tags').scrollTo({ left: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    refresh();
  }

  $('tags').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (b) toggleTag(b.dataset.t);
  });

  $('filter-btn').addEventListener('click', () => {
    const pop = $('filter-pop');
    pop.hidden = !pop.hidden;
    $('filter-btn').setAttribute('aria-expanded', String(!pop.hidden));
  });
  $('filter-pop').addEventListener('click', e => {
    const m = e.target.closest('[data-m]');
    const l = e.target.closest('[data-l]');
    if (m) state.measure = m.dataset.m;
    else if (l) state.limit = +l.dataset.l;
    else return;
    refresh();
  });
  document.addEventListener('click', e => {
    if (!$('filter-pop').hidden && !e.target.closest('#filter-pop, #filter-btn')) {
      $('filter-pop').hidden = true;
      $('filter-btn').setAttribute('aria-expanded', 'false');
    }
  });

  // ---------- 开屏问候：第一次打开时显示，点标签就开始 ----------
  const HELLO_KEY = 'kaniyu-hello-v1';
  let seen = false;
  try {
    seen = localStorage.getItem(HELLO_KEY) === '1';
  } catch {
    seen = false;
  }
  if (!seen || qs.get('hello') === '1') {
    $('hello-tags').innerHTML = TAGS.filter(t => t !== '最近热门' || PLACES.some(p => p.season.hot)).map(t => tagChip(t, null, false, 'tag big')).join('');
    $('hello').hidden = false;
  }
  function closeHello() {
    $('hello').classList.add('leaving');
    setTimeout(() => { $('hello').hidden = true; }, reduceMotion ? 0 : 380);
    try {
      localStorage.setItem(HELLO_KEY, '1');
    } catch {
      // 记不住也只是下次再打一次招呼
    }
  }
  $('hello').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (b) {
      closeHello();
      toggleTag(b.dataset.t);
    } else if (e.target.closest('[data-close]')) {
      closeHello();
    }
  });

  // ---------- 视图 ----------
  function showView(v) {
    state.view = v;
    ['map', 'rings', 'book'].forEach(k => { $('view-' + k).hidden = k !== v; });
    $('tabbar').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    if (v === 'map') map.resize();
    renderView();
  }

  $('tabbar').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (b) showView(b.dataset.v);
  });

  function renderView() {
    document.body.classList.toggle('idle', !exploring());
    document.body.classList.toggle('ga-mode', gaMode());
    if (state.view === 'map') renderMapView();
    if (state.view === 'rings') renderRings();
    if (state.view === 'book') renderBook();
  }

  function refresh() {
    renderHeader();
    PLACES.forEach(p => { pins.get(p.id).el.dataset.band = bandOf(p) || ''; });
    deckKey = '';
    if (state.sel) renderSheet();
    renderView();
  }

  // ---------- 地图 ----------
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const STYLE_URL = dark ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  const map = new maplibregl.Map({
    container: 'map',
    style: STYLE_URL,
    center: [135.6, 34.78],
    zoom: 8.6,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    localIdeographFontFamily: '"Hiragino Sans", "PingFang SC", "Noto Sans CJK JP", sans-serif'
  });
  map.touchZoomRotate.disableRotation();

  const TINT = dark
    ? { bg: '#191B1D', water: '#1A2833', park: '#1E2820', wood: '#1C271E', resid: 'rgba(48,46,42,.35)', building: '#25272A' }
    : { bg: '#F3EEE4', water: '#BCD3DE', park: '#DCE5CD', wood: '#D2DEC1', resid: 'rgba(231,222,206,.55)', building: '#E6DDCD' };
  // faint：时间圈的底图只留城市名和水陆轮廓
  function tintMap(m, faint) {
    const set = (id, prop, val) => {
      if (m.getLayer(id)) m.setPaintProperty(id, prop, val);
    };
    set('background', 'background-color', TINT.bg);
    set('water', 'fill-color', TINT.water);
    set('park', 'fill-color', TINT.park);
    set('landcover_wood', 'fill-color', TINT.wood);
    set('landuse_residential', 'fill-color', TINT.resid);
    set('building', 'fill-color', TINT.building);
    for (const id of ['label_other', 'label_village', 'highway-name-path', 'highway-name-minor']) {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none');
    }
    for (const layer of m.getStyle().layers) {
      if (faint && (/^(highway|tunnel|railway|aeroway|road|building|boundary)/.test(layer.id) || (layer.type === 'symbol' && !/^label_(city|town|state)/.test(layer.id)))) {
        m.setLayoutProperty(layer.id, 'visibility', 'none');
        continue;
      }
      if (layer.type !== 'symbol' || /shield/.test(layer.id)) continue;
      m.setPaintProperty(layer.id, 'text-opacity', faint ? 0.8 : 0.65);
      if (m.getLayoutProperty(layer.id, 'text-field') !== undefined) {
        m.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ja'], ['get', 'name']]);
      }
    }
  }
  map.on('style.load', () => tintMap(map, false));
  map.on('load', () => document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));

  // 旅行点：圆形照片针，下面一枚emoji小签说明是什么地方；挤在一起时合并成一叠，标数字
  const pins = new Map();
  PLACES.forEach(p => {
    const el = document.createElement('div');
    el.className = 'pin';
    el.dataset.band = bandOf(p) || '';
    el.dataset.state = 'out';
    el.innerHTML = `<button type="button" class="pin-in" aria-label="${esc(p.name)}"><span class="pin-stack" aria-hidden="true"></span>${photo(p)}<span class="pin-n"></span></button>`
      + `<span class="pin-emo" aria-hidden="true"></span><span class="pin-label">${esc(p.name)}</span>`;
    el.querySelector('.pin-in').addEventListener('click', e => {
      e.stopPropagation();
      const m = pins.get(p.id);
      if (m.members.length > 1) {
        const b = new maplibregl.LngLatBounds();
        m.members.forEach(id => b.extend(byId[id].ll));
        map.fitBounds(b, { padding: mapPadding(60), maxZoom: 14, duration: reduceMotion ? 0 : 900 });
        return;
      }
      focusItem(p.id, { scroll: true, fly: true });
    });
    pins.set(p.id, { el, members: [], marker: new maplibregl.Marker({ element: el }).setLngLat(p.ll).addTo(map) });
  });

  // 绿苹果的活动：小圆点，临时性的
  const gaPins = new Map();
  GA_ITEMS.filter(e => e.ll).forEach(ev => {
    const el = document.createElement('div');
    el.className = 'gpin';
    el.dataset.hidden = '';
    el.innerHTML = `<button type="button" class="gpin-in" aria-label="${esc(ev.name)}">🍏</button><span class="pin-label">${esc(ev.venue)}</span>`;
    el.querySelector('.gpin-in').addEventListener('click', e => {
      e.stopPropagation();
      focusItem(ev.id, { scroll: true, fly: true });
    });
    gaPins.set(ev.id, { el, marker: new maplibregl.Marker({ element: el }).setLngLat(ev.ll).addTo(map) });
  });

  const homeEl = document.createElement('div');
  homeEl.className = 'home';
  homeEl.innerHTML = `<span>${esc(ORIGIN.name)}</span><i></i>`;
  new maplibregl.Marker({ element: homeEl, anchor: 'bottom' }).setLngLat(ORIGIN.ll).addTo(map);

  function mapPadding(extra = 20) {
    const box = map.getContainer().getBoundingClientRect();
    const top = $('head').getBoundingClientRect().bottom - box.top + extra;
    const deckTop = exploring() ? $('deck').getBoundingClientRect().top : $('tabbar').getBoundingClientRect().top;
    return { top, bottom: box.bottom - deckTop + extra, left: extra, right: extra };
  }

  // 合并：只在地图停下后算一次，拖动过程中不重排
  const CLUSTER_PX = 50;
  function cluster() {
    const list = PLACES.filter(shown)
      .map(p => ({ p, pt: map.project(p.ll) }))
      .sort((a, b) => (b.p.id === state.focus) - (a.p.id === state.focus) || (b.p.season.hot - a.p.season.hot) || minsOf(a.p) - minsOf(b.p));
    const leaders = [];
    for (const it of list) {
      const near = leaders.find(l => Math.hypot(l.pt.x - it.pt.x, l.pt.y - it.pt.y) < CLUSTER_PX);
      if (near) near.members.push(it.p.id);
      else leaders.push({ ...it, members: [it.p.id] });
    }
    const lead = new Map(leaders.map(l => [l.p.id, l.members]));
    PLACES.forEach(p => {
      const m = pins.get(p.id);
      const members = lead.get(p.id) || [];
      m.members = members;
      m.el.dataset.state = !shown(p) ? 'out' : members.length ? (members.length > 1 ? 'leader' : 'solo') : 'member';
      m.el.querySelector('.pin-n').textContent = members.length > 1 ? members.length : '';
      // 一叠照片：列出成员里有哪几类地方
      const emo = members.length > 1
        ? [...new Set(members.map(id => mainEmo(byId[id], 1)))].slice(0, 3).join('')
        : mainEmo(p);
      m.el.querySelector('.pin-emo').textContent = emo;
      if (p.id === state.focus) m.el.dataset.focus = '';
      else delete m.el.dataset.focus;
    });
    gaPins.forEach((g, id) => {
      if (gaMode()) delete g.el.dataset.hidden;
      else g.el.dataset.hidden = '';
      if (id === state.focus) g.el.dataset.focus = '';
      else delete g.el.dataset.focus;
    });
  }
  map.on('moveend', cluster);
  map.on('click', () => {
    if (state.sel) closeSheet();
  });
  window.addEventListener('resize', () => {
    cluster();
    if (state.view === 'rings') renderRings(true);
  });

  // ---------- 卡片带：滑到哪张，地图就飞到哪里 ----------
  let deckKey = '';
  let deckTimer;
  let deckProgrammatic = false;
  const deckItems = () => (gaMode() ? GA_ITEMS : PLACES.filter(shown).sort((a, b) => minsOf(a) - minsOf(b)));
  const itemOf = id => byId[id] || gaById[id];

  const gaCard = e => `<button type="button" class="dk dk-ga" data-id="${e.id}"><span class="ga-face">🍏<small>${esc(e.kind)}</small></span><span class="dk-txt">
      <span class="dk-head"><b>${esc(e.name)}</b></span>
      <span class="dk-meta">${esc(gaDate(e))} · ${esc(e.venue)}</span>
      <span class="dk-blurb">${esc(e.note)}</span>
    </span></button>`;

  const placeCard = p => `<button type="button" class="dk" data-id="${p.id}">${photo(p)}<span class="dk-txt">
      <span class="dk-head"><b>${esc(p.name)}</b>${timeBadge(p)}</span>
      <span class="dk-meta">${esc(p.area)} · <span class="dk-emo">${emojis(p)}</span></span>
      <span class="dk-blurb">${esc(p.blurb)}</span>
      ${p.season.tone !== 'plain' ? `<span class="st tone-${p.season.tone}">${esc(p.season.text)}</span>` : ''}
    </span></button>`;

  function renderDeck() {
    if (!exploring()) {
      deckKey = '';
      $('deck-list').innerHTML = '';
      return;
    }
    const items = deckItems();
    const key = state.measure + state.limit + [...state.tags].join() + items.map(p => p.id).join(',');
    if (key === deckKey) return;
    deckKey = key;
    $('deck-count').textContent = gaMode()
      ? `🍏 绿苹果专区 · ${items.length} 个活动 · 核实于${fmtISO(GA_DATA.checkedAt)}`
      : `${items.length} 处 · 按${MEASURE[state.measure]}由近到远`;
    $('deck-list').innerHTML = items.length
      ? items.map(p => (gaMode() ? gaCard(p) : placeCard(p))).join('')
      : '<p class="dk-empty">没有同时符合这些标签的地方。少选一个，或者放宽单程时间。</p>';
    if (!items.some(p => p.id === state.focus)) state.focus = items[0]?.id || null;
    scrollDeckTo(state.focus, false);
    if (state.focus) focusItem(state.focus, { fly: true });
  }

  function scrollDeckTo(id, smooth) {
    const card = id && $('deck-list').querySelector(`[data-id="${id}"]`);
    if (!card) return;
    deckProgrammatic = true;
    $('deck-list').scrollTo({ left: card.offsetLeft - parseFloat(getComputedStyle($('deck-list')).paddingLeft), behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    clearTimeout(deckTimer);
    deckTimer = setTimeout(() => { deckProgrammatic = false; }, smooth ? 600 : 50);
  }

  function focusItem(id, { scroll = false, fly = true } = {}) {
    const it = itemOf(id);
    if (!it) return;
    state.focus = id;
    pins.forEach((m, pid) => {
      if (pid === id) m.el.dataset.focus = '';
      else delete m.el.dataset.focus;
    });
    gaPins.forEach((g, gid) => {
      if (gid === id) g.el.dataset.focus = '';
      else delete g.el.dataset.focus;
    });
    $('deck-list').querySelectorAll('.dk').forEach(c => c.toggleAttribute('data-focus', c.dataset.id === id));
    if (scroll) scrollDeckTo(id, true);
    if (fly && it.ll && state.view === 'map') {
      const opts = { center: it.ll, zoom: Math.max(map.getZoom(), 10), padding: mapPadding(30) };
      if (reduceMotion) map.jumpTo(opts);
      else map.flyTo({ ...opts, duration: 1200, curve: 1.25, easing: easeInOut, essential: true });
    }
  }

  // 滑动停下后才切换焦点，地图不跟着手指抖
  $('deck-list').addEventListener('scroll', () => {
    if (deckProgrammatic) return;
    clearTimeout(deckTimer);
    deckTimer = setTimeout(() => {
      const list = $('deck-list');
      const mid = list.scrollLeft + list.clientWidth * 0.12;
      let best = null;
      list.querySelectorAll('.dk').forEach(c => {
        const d = Math.abs(c.offsetLeft - mid);
        if (!best || d < best.d) best = { d, id: c.dataset.id };
      });
      if (best && best.id !== state.focus) focusItem(best.id, { fly: true });
    }, 160);
  }, { passive: true });

  $('deck-list').addEventListener('click', e => {
    const c = e.target.closest('.dk');
    if (!c) return;
    if (c.dataset.id !== state.focus) focusItem(c.dataset.id, { scroll: true, fly: true });
    else select(c.dataset.id);
  });

  function renderMapView() {
    cluster();
    renderDeck();
  }

  // ---------- 时间圈：半径＝单程时间，方向＝从京桥看的方位；底下是淡淡的地图，只示意方位 ----------
  const ZOOMS = [1.5, 2, 2.7];
  let zoomIdx = 1;
  let ringsBuilt = false;
  let ringsMap = null;

  function buildRings() {
    const host = $('rings');
    host.innerHTML = '<div class="rings-map" id="rings-map"></div><svg aria-hidden="true"></svg><span class="home-dot">' + esc(ORIGIN.name) + '</span>'
      + PLACES.map(p => `<button type="button" class="rb" data-id="${p.id}" aria-label="${esc(p.name)}">${photo(p)}<span class="rb-emo" aria-hidden="true">${mainEmo(p, 1)}</span></button><span class="rl" data-for="${p.id}">${esc(p.name)}</span>`).join('');
    host.addEventListener('click', e => {
      const b = e.target.closest('.rb');
      if (b) select(b.dataset.id);
    });
    ringsMap = new maplibregl.Map({
      container: 'rings-map',
      style: STYLE_URL,
      center: ORIGIN.ll,
      zoom: 8,
      interactive: false,
      attributionControl: { compact: true },
      localIdeographFontFamily: '"Hiragino Sans", "PingFang SC", "Noto Sans CJK JP", sans-serif'
    });
    ringsMap.on('style.load', () => tintMap(ringsMap, true));
    ringsMap.on('load', () => document.querySelector('#rings-map .maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    ringsBuilt = true;
  }

  // 直线距离（公里）
  const km = ll => {
    const [lon1, lat1] = ORIGIN.ll.map(toRad);
    const [lon2, lat2] = ll.map(toRad);
    const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };

  function renderRings(keepCenter) {
    const first = !ringsBuilt;
    if (first) buildRings();
    const vp = $('rings-vp');
    const host = $('rings');
    const still = first || keepCenter;
    host.classList.toggle('still', still);
    // 保持当前看着的那一点
    const old = host.clientWidth || 1;
    const fx = (vp.scrollLeft + vp.clientWidth / 2) / old;
    const fy = (vp.scrollTop + vp.clientHeight / 2 - host.offsetTop) / old;
    const W = Math.round(vp.clientWidth * ZOOMS[zoomIdx]);
    host.style.width = W + 'px';
    host.style.height = W + 'px';
    const C = W / 2;
    const R = C - 30;
    // 半径按时间的0.6次方：近处拉开，远处不出界；刻度圈照实标注
    const rad = m => R * Math.pow(Math.min(m, 180) / 180, 0.6);
    const svg = host.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    svg.innerHTML = [180, 120, 60, 30].map(m => `<circle class="ring ring-fill-${m}" cx="${C}" cy="${C}" r="${rad(m)}"/>`).join('')
      + [30, 60, 120, 180].map(m => `<text class="ring-label" x="${C}" y="${C - rad(m) + 14}" text-anchor="middle">${BAND_NAME[m]}</text>`).join('')
      + `<text class="ring-north" x="${C}" y="14" text-anchor="middle">北</text>`;

    // 底图比例：让各地点在地图上的位置和照片大致落在同一方向、同一远近
    const ratios = PLACES.filter(p => km(p.ll) > 8 && minsOf(p) <= 180).map(p => rad(minsOf(p)) / km(p.ll)).sort((a, b) => a - b);
    const mPerPx = 1000 / ratios[Math.floor(ratios.length / 2)];
    ringsMap.resize();
    ringsMap.jumpTo({ center: ORIGIN.ll, zoom: Math.log2(78271.517 * Math.cos(toRad(ORIGIN.ll[1])) / mPerPx) });

    // 目标位置，再做几轮碰撞松弛，避免照片叠在一起
    const S = 40;
    const nodes = PLACES.map(p => {
      const r = rad(minsOf(p));
      const a = toRad(p.deg);
      const tx = C + r * Math.sin(a);
      const ty = C - r * Math.cos(a);
      return { p, tx, ty, x: tx, y: ty, out: !shown(p) };
    });
    const live = nodes.filter(n => !n.out);
    for (let it = 0; it < 140; it++) {
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const b = live[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d >= S) continue;
          if (d < 0.01) {
            dx = 1;
            dy = 0;
            d = 1;
          }
          const push = (S - d) / 2;
          a.x -= dx / d * push;
          a.y -= dy / d * push;
          b.x += dx / d * push;
          b.y += dy / d * push;
        }
      }
      for (const n of live) {
        n.x += (n.tx - n.x) * 0.06;
        n.y += (n.ty - n.y) * 0.06;
      }
    }

    // 名字：放得下才显示，先近后远
    const boxes = live.map(n => ({ x: n.x - S / 2, y: n.y - S / 2, w: S, h: S }));
    const hit = r => boxes.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    const labels = {};
    [...live].sort((a, b) => minsOf(a.p) - minsOf(b.p)).forEach(n => {
      const w = n.p.name.length * 11.5 + 6;
      for (const r of [{ x: n.x + 21, y: n.y - 7, w, h: 15 }, { x: n.x - 21 - w, y: n.y - 7, w, h: 15 }, { x: n.x - w / 2, y: n.y + 21, w, h: 15 }]) {
        if (r.x >= 0 && r.x + r.w <= W && !hit(r)) {
          boxes.push(r);
          labels[n.p.id] = r;
          break;
        }
      }
    });

    nodes.forEach(n => {
      const b = host.querySelector(`.rb[data-id="${n.p.id}"]`);
      const l = host.querySelector(`.rl[data-for="${n.p.id}"]`);
      b.style.transform = `translate(${n.x}px, ${n.y}px)`;
      b.dataset.band = bandOf(n.p) || '';
      if (n.out) b.dataset.out = '';
      else delete b.dataset.out;
      if (n.p.id === state.sel) b.dataset.sel = '';
      else delete b.dataset.sel;
      const r = labels[n.p.id];
      l.hidden = !r || n.out;
      if (r) l.style.transform = `translate(${r.x}px, ${r.y + 2}px)`;
    });

    if (first) {
      vp.scrollLeft = C - vp.clientWidth / 2;
      vp.scrollTop = host.offsetTop + C - vp.clientHeight / 2;
    } else if (keepCenter) {
      vp.scrollLeft = fx * W - vp.clientWidth / 2;
      vp.scrollTop = host.offsetTop + fy * W - vp.clientHeight / 2;
    }
    if (still) {
      void host.offsetWidth;
      requestAnimationFrame(() => host.classList.remove('still'));
    }
    $('rings-note').textContent = gaMode()
      ? '绿苹果专区是活动，请在地图或画册里看'
      : `${MEASURE[state.measure]} · 离中心越远单程越久，方向是实际方位`;
    $('rings-zoom').querySelectorAll('button').forEach(b => {
      b.disabled = (b.dataset.z === '+' && zoomIdx === ZOOMS.length - 1) || (b.dataset.z === '-' && zoomIdx === 0);
    });
  }

  $('rings-zoom').addEventListener('click', e => {
    const b = e.target.closest('[data-z]');
    if (!b) return;
    zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, zoomIdx + (b.dataset.z === '+' ? 1 : -1)));
    renderRings(true);
  });

  // ---------- 画册 ----------
  function renderBook() {
    if (!exploring()) {
      $('view-book').innerHTML = '';
      return;
    }
    if (gaMode()) {
      $('view-book').innerHTML = `<section class="book-sec"><div class="book-head"><h2>🍏 绿苹果专区</h2><small>核实于${fmtISO(GA_DATA.checkedAt)}</small></div>
        <div class="book-row">${GA_ITEMS.map(e => `<button type="button" class="bk bk-ga" data-id="${e.id}"><span class="bk-ga-face" aria-hidden="true">🍏</span>
          <span class="bk-top"><span class="tb tb-ga">${esc(e.kind)}</span></span>
          <span class="bk-txt"><small class="bk-area">${esc(gaDate(e))}</small><h3>${esc(e.name)}</h3><p>${esc(e.venue)} · ${esc(e.note)}</p></span></button>`).join('')}</div>
        <p class="book-note">${esc(GA_DATA.placesNote)}</p></section>`;
      return;
    }
    const secs = LIMITS.filter(l => l <= state.limit).map(String).map(b => {
      const list = PLACES.filter(p => bandOf(p) === b && shown(p)).sort((x, y) => (y.season.hot - x.season.hot) || minsOf(x) - minsOf(y));
      if (!list.length) return '';
      const cards = list.map(p => `<button type="button" class="bk" data-id="${p.id}">${photo(p)}
        <span class="bk-top">${timeBadge(p)}${p.season.tone !== 'plain' ? `<span class="st tone-${p.season.tone}">${esc(p.season.text)}</span>` : ''}</span>
        <span class="bk-txt"><small class="bk-area">${esc(p.area)} · ${emojis(p)}</small><h3>${esc(p.name)}</h3><p>${esc(p.blurb)}</p></span></button>`).join('');
      return `<section class="book-sec"><div class="book-head"><h2><span class="tb tb-${b}">${BAND_NAME[b]}</span>${BAND_NAME[b]}圈</h2><small>${MEASURE[state.measure]} · ${list.length} 处</small></div>
        <div class="book-row">${cards}</div></section>`;
    }).join('');
    $('view-book').innerHTML = secs || '<p class="book-empty book-none">没有同时符合这些标签的地方。少选一个，或者放宽单程时间。</p>';
  }
  $('view-book').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });

  // ---------- 详情面板 ----------
  const pct = d => ((d - 1) / 365 * 100).toFixed(2) + '%';
  function yearStrip(p) {
    const bars = [];
    for (const w of p.seasons) {
      const a = doyMD(w.from);
      const b = doyMD(w.to);
      for (const [s, e] of a <= b ? [[a, b]] : [[a, 365], [1, b]]) {
        bars.push(`<span class="w tone-${w.tone}" style="left:${pct(s)};width:calc(${pct(e + 1)} - ${pct(s)})" title="${esc(w.label)}"></span>`);
      }
    }
    return `<div class="sh-year">${bars.join('')}<span class="now" style="left:${pct(todayDoy + 0.5)}"></span></div>`
      + `<div class="sh-months">${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>`;
  }

  const routeUrl = (ll, mode) => `https://www.google.com/maps/dir/?api=1&origin=${ORIGIN.ll[1]},${ORIGIN.ll[0]}&destination=${ll[1]},${ll[0]}&travelmode=${mode}`;

  function gaSheet(e) {
    return `
      <div class="sh-hero sh-ga"><span class="sh-ga-face" aria-hidden="true">🍏</span>
        <button type="button" class="sh-close" id="sh-close" aria-label="关闭">×</button>
        <div class="sh-title"><h2>${esc(e.name)}</h2><p><span>${esc(e.kind)} · ${esc(gaDate(e))}</span></p></div>
      </div>
      <div class="sh-body">
        <h3>在哪里</h3>
        <p>${esc(e.venue)}</p>
        <h3>要知道的</h3>
        <p>${esc(e.note)}</p>
        ${e.ll ? `<div class="sh-acts"><a href="${routeUrl(e.ll, state.measure === 'car' ? 'driving' : 'transit')}" target="_blank" rel="noopener noreferrer">从${esc(ORIGIN.name)}怎么去</a></div>` : ''}
        <p class="sh-credit">来源：${e.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.note)}</a>`).join(' · ')}。日期和购票以官方为准。</p>
      </div>`;
  }

  function renderSheet() {
    const id = state.sel;
    if (gaById[id]) {
      $('sheet').innerHTML = gaSheet(gaById[id]);
      $('sh-close').addEventListener('click', () => closeSheet());
      return;
    }
    const p = byId[id];
    const credit = p.img
      ? `图：${esc(p.img.artist || '佚名')} · ${esc(p.img.license)} · <a href="${esc(p.img.page)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>`
      : '暂无配图';
    $('sheet').innerHTML = `
      <div class="sh-hero">${photo(p)}
        <button type="button" class="sh-close" id="sh-close" aria-label="关闭">×</button>
        <div class="sh-title"><h2>${esc(p.name)}</h2><p><span>${esc(p.area)} · ${esc(p.kind)}</span><span class="st tone-${p.season.tone}" style="color:#fff">${esc(p.season.text)}</span></p></div>
      </div>
      <div class="sh-body">
        <div class="sh-time">
          <div class="${state.measure === 'transit' ? 'on' : ''}"><small>🚃 公共交通 · 估算</small><b>${minsOf(p, 'transit')}<small>分</small></b><p>${esc(p.transit.route)}</p></div>
          <div class="${state.measure === 'car' ? 'on' : ''}"><small>🚗 自驾 · 不含拥堵</small><b>${minsOf(p, 'car')}<small>分</small></b><p>约${p.car.km}公里；高峰和停车另计</p></div>
        </div>
        <p class="sh-tags">${p.tags.map(t => `<span>${EMOJI[t]} ${t}</span>`).join('')}</p>
        <h3>为什么去</h3>
        <p>${esc(p.why)}</p>
        ${p.tip ? `<p class="sh-tip">${esc(p.tip)}</p>` : ''}
        ${p.seasons.length ? `<h3>一年里什么时候去</h3>${yearStrip(p)}` : ''}
        <div class="sh-acts">
          <button type="button" id="sh-wish" aria-pressed="${wish.has(p.id)}">${wish.has(p.id) ? '已想去' : '想去'}</button>
          <a href="${routeUrl(p.ll, state.measure === 'car' ? 'driving' : 'transit')}" target="_blank" rel="noopener noreferrer">${state.measure === 'car' ? '开车路线' : '公交路线'}</a>
        </div>
        <p class="sh-credit">${credit}</p>
      </div>`;
    $('sh-close').addEventListener('click', () => closeSheet());
    $('sh-wish').addEventListener('click', () => {
      wish.has(p.id) ? wish.delete(p.id) : wish.add(p.id);
      renderSheet();
    });
  }

  function select(id, fromHash) {
    const it = itemOf(id);
    if (!it) return;
    const fresh = state.sel !== id;
    state.sel = id;
    if (!fromHash && location.hash !== '#p=' + id) history.pushState(null, '', location.search + '#p=' + id);
    const sheet = $('sheet');
    renderSheet();
    sheet.hidden = false;
    sheet.scrollTop = 0;
    if (fresh) {
      sheet.classList.remove('open');
      void sheet.offsetWidth;
      sheet.classList.add('open');
    }
    document.body.classList.add('has-sheet');
    if (state.view === 'map' && it.ll) {
      state.focus = id;
      const opts = { center: it.ll, zoom: Math.max(map.getZoom(), 10.5), padding: { top: 140, bottom: sheet.offsetHeight + 20, left: 30, right: 30 } };
      reduceMotion ? map.jumpTo(opts) : map.easeTo({ ...opts, duration: 900, easing: easeInOut });
    }
    if (state.view === 'rings') renderRings();
  }

  function closeSheet(fromHash) {
    if (!fromHash && location.hash) history.pushState(null, '', location.pathname + location.search);
    state.sel = null;
    $('sheet').hidden = true;
    document.body.classList.remove('has-sheet');
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    renderView();
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.sel) closeSheet();
  });
  function fromHash() {
    const m = location.hash.match(/^#p=([\w-]+)/);
    if (m && itemOf(m[1])) select(m[1], true);
    else if (state.sel) closeSheet(true);
  }
  window.addEventListener('popstate', fromHash);

  // ---------- 启动 ----------
  renderHeader();
  showView(state.view);
  fromHash();
})();
