// 蟹鱼游旅行点原型：以京桥站为中心，按单程时间（公共交通 / 自驾）找旅行点；地图、时间圈、画册、想去的四页。
// 默认什么都不显示：开屏先选交通和时间，再选至少三个标签。标签是“或”：符合任何一个就显示。
// 标签的定义（emoji、说明、自动规则）在 data/places.json 的 tags 里，由人或 agent 维护。
// 「🍏 绿苹果」是单独的专区；地图上的「🎟️ 活动」按钮单独显示还没结束的活动。
(async () => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = new URLSearchParams(location.search);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // 原型里记不住也不影响使用
      }
    }
  };

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
  const daysUntil = w => (doyMD(w.from) - todayDoy + 365) % 365;

  function season(p) {
    if (!p.seasons.length) return { hot: false, tone: 'plain', text: '全年可去' };
    for (const w of p.seasons) {
      if (inWin(todayDoy, w)) return { hot: true, tone: w.tone, text: `${w.label}正当时` };
    }
    let best = null;
    for (const w of p.seasons) {
      const days = daysUntil(w);
      if (!best || days < best.days) best = { w, days };
    }
    const text = best.days <= 14 ? `${best.w.label}${best.days === 1 ? '明天' : best.days + '天后'}开始` : `${best.w.label} ${fmtMD(best.w.from)}起`;
    return { hot: false, tone: best.w.tone, text };
  }

  // ---------- 数据 ----------
  const [DATA, GA_DATA, EV_DATA] = await Promise.all([
    fetch('../../data/places.json').then(r => r.json()),
    fetch('../../data/greenapple.json').then(r => r.json()),
    fetch('../../data/events.current.json').then(r => r.json())
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

  // 活动：events.json 里还没结束的，加上绿苹果专区的；统一成一种形状
  const dateText = (from, to, note) => {
    if (!from) return `${note || '日期待公布'}–${fmtISO(to)}`;
    return from === to ? fmtISO(from) : `${fmtISO(from)}–${fmtISO(to)}`;
  };
  const EVENTS = [
    ...EV_DATA.events.map(e => ({
      id: 'ev-' + e.id, name: e.name, venue: e.venue, ll: e.ll, from: e.from, to: e.to, kind: e.kind || '活动',
      when: e.date || dateText(e.from, e.to), note: e.note, fee: e.fee, link: e.link, poster: e.poster ? '../../' + e.poster : null, ga: false, sources: []
    })),
    ...GA_DATA.events.map(e => ({
      id: e.id, name: e.name, venue: e.venue, ll: e.ll, from: e.from, to: e.to, kind: e.kind,
      when: dateText(e.from, e.to, e.dateNote), note: e.note, fee: '', link: '', poster: null, ga: true, sources: e.sources
    }))
  ].filter(e => !e.to || e.to >= today)
    .map(e => ({ ...e, live: !e.from || e.from <= today }))
    .sort((a, b) => (b.live - a.live) || String(a.live ? a.to : a.from).localeCompare(String(b.live ? b.to : b.from)));
  const evById = Object.fromEntries(EVENTS.map(e => [e.id, e]));
  const evStatus = e => (e.live ? `进行中 · 到${fmtISO(e.to)}` : `${e.from ? fmtISO(e.from) : '近期'}开始`);

  // ---------- 标签：定义来自数据 ----------
  const TAG_DEFS = DATA.tags;
  const TAG = Object.fromEntries(TAG_DEFS.map(t => [t.name, t]));
  const GA = TAG_DEFS.find(t => t.rule?.type === 'zone')?.name || '绿苹果';
  const EMOJI = Object.fromEntries(TAG_DEFS.map(t => [t.name, t.emoji]));
  function hasTag(p, name) {
    const rule = TAG[name]?.rule;
    if (!rule) return p.tags.includes(name);
    if (rule.type === 'list') return rule.ids.includes(p.id);
    if (rule.type === 'season') {
      return p.seasons.some(w => rule.labels.includes(w.label) && (inWin(todayDoy, w) || daysUntil(w) <= (rule.withinDays || 0)));
    }
    return false;
  }
  // 照片针下的emoji：先挑最能说明“是什么地方”的
  const MAIN_ORDER = ['温泉', '海边', '好吃', '好玩', '山里', '寺社', '人文古迹', '红叶', '赏花', '水边', '夜景', '建筑', '热闹', '风景美', '安静', '散步', '拍照', '雨天也行'];
  const mainEmo = (p, n = 2) => MAIN_ORDER.filter(t => p.tags.includes(t)).slice(0, n).map(t => EMOJI[t]).join('');
  const emojis = (p, n = 4) => p.tags.slice(0, n).map(t => EMOJI[t] || '').join('');

  // ---------- 状态 ----------
  const MEASURE = { transit: '公共交通', car: '自驾' };
  const BAND_NAME = { 30: '半小时', 60: '1小时', 120: '2小时', 180: '3小时' };
  const LIMITS = [30, 60, 120, 180];
  const saved = store.get('kaniyu-prefs-v1', {});
  const state = {
    measure: qs.get('m') || saved.measure || 'transit',
    limit: LIMITS.includes(saved.limit) ? saved.limit : 180,
    tags: new Set((qs.get('t') || '').split(',').filter(Boolean).concat(qs.get('t') ? [] : saved.tags || [])),
    events: false,
    view: ['map', 'rings', 'book', 'wish'].includes(qs.get('view')) ? qs.get('view') : 'map',
    sel: null,
    focus: null
  };
  const wish = new Set(store.get('kaniyu-wish-v1', []).filter(id => byId[id]));
  const savePrefs = () => store.set('kaniyu-prefs-v1', { measure: state.measure, limit: state.limit, tags: [...state.tags] });
  const saveWish = () => store.set('kaniyu-wish-v1', [...wish]);
  // 想去的备注：想什么时候去、备注，按地点存
  const plans = store.get('kaniyu-wish-plans-v1', {});
  const savePlans = () => store.set('kaniyu-wish-plans-v1', plans);

  // 绿苹果和其他标签一样可以同时选：选上就把它的活动一起列出来
  const mode = () => (state.events ? 'events' : state.tags.size ? 'places' : 'idle');
  const gaOn = () => state.tags.has(GA);
  const placeTags = () => new Set([...state.tags].filter(t => t !== GA));
  const minsOf = (p, m = state.measure) => p[m].mins;
  const bandOf = (p, m = state.measure) => {
    const v = minsOf(p, m);
    return v <= 30 ? '30' : v <= 60 ? '60' : v <= 120 ? '120' : v <= 180 ? '180' : null;
  };
  // 标签是“或”：符合任何一个选中的标签就显示
  const anyTag = (p, set = state.tags) => [...set].some(t => hasTag(p, t));
  const shown = p => mode() === 'places' && minsOf(p) <= state.limit && anyTag(p, placeTags());
  const eventShown = e => e.ll && (mode() === 'events' || (mode() === 'places' && gaOn() && e.ga));
  const timeBadge = p => `<span class="tb tb-${bandOf(p) || '180'}">${minsOf(p)}分</span>`;
  const photo = (p, cls = '') => (p.img
    ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(p.img.thumb)}" alt="" loading="lazy" decoding="async">`
    : `<span class="ph${cls ? ' ' + cls : ''}">${esc([...p.name][0])}</span>`);
  const evFace = (e, cls) => (e.poster
    ? `<img class="${cls}" src="${esc(e.poster)}" alt="" loading="lazy">`
    : `<span class="${cls} ev-face${e.ga ? ' ga' : ''}">${e.ga ? '🍏' : '🎟️'}<small>${esc(e.kind)}</small></span>`);

  let toastTimer;
  function toast(text) {
    $('toast').textContent = text;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
  }

  // ---------- 标签计数与排序：按“在当前时间上限内有几处”从多到少 ----------
  const countTag = (t, limit = state.limit, m = state.measure) => (t === GA
    ? EVENTS.filter(e => e.ga).length
    : PLACES.filter(p => p[m].mins <= limit && hasTag(p, t)).length);
  const orderedTags = (limit, m) => [GA, ...TAG_DEFS.filter(t => t.name !== GA)
    .map(t => ({ t: t.name, n: countTag(t.name, limit, m) }))
    .sort((a, b) => b.n - a.n)
    .map(x => x.t)];
  const tagChip = (t, n, on, cls = 'tag') => `<button type="button" class="${cls}${t === GA ? ' ga' : ''}" data-t="${t}" aria-pressed="${on}"${!on && n === 0 ? ' disabled' : ''}${TAG[t]?.desc ? ` title="${esc(TAG[t].desc)}"` : ''}>`
    + `<span class="emo" aria-hidden="true">${EMOJI[t]}</span>${t}${n === null ? '' : `<small>${n}</small>`}</button>`;

  // ---------- 顶部 ----------
  function renderHeader() {
    const icon = state.measure === 'car' ? '🚗' : '🚃';
    $('filter-btn').innerHTML = `<span>${icon} ${state.measure === 'car' ? '自驾' : '公交'}</span><span class="fb-sep"></span><span>${BAND_NAME[state.limit]}内</span><span class="fb-caret" aria-hidden="true">▾</span>`;
    $('measure').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === state.measure)));
    $('limit').innerHTML = LIMITS.map(l => {
      const n = PLACES.filter(p => minsOf(p) <= l && (!placeTags().size || anyTag(p, placeTags()))).length;
      return `<button type="button" data-l="${l}" aria-pressed="${state.limit === l}">${BAND_NAME[l]}内<small>${n}</small></button>`;
    }).join('');
    const tags = orderedTags(state.limit, state.measure);
    // 标签栏：已选的排最前，其余按数量从多到少；展开面板里全部按数量排
    const bar = [...tags.filter(t => state.tags.has(t)), ...tags.filter(t => !state.tags.has(t))];
    $('tags').innerHTML = bar.map(t => tagChip(t, countTag(t), state.tags.has(t))).join('');
    $('tag-grid').innerHTML = tags.map(t => tagChip(t, countTag(t), state.tags.has(t), 'tag big')).join('');
    const n = state.tags.size;
    $('tags-more').innerHTML = `<span aria-hidden="true">▾</span>${n ? `<small>${n}</small>` : ''}`;
    $('tag-panel-count').textContent = `已选 ${n} 个 · 符合任一标签的 ${PLACES.filter(p => minsOf(p) <= state.limit && anyTag(p, placeTags())).length} 处${gaOn() ? ' ＋🍏活动' : ''}`;
    $('ev-btn').innerHTML = `🎟️ 活动<small>${EVENTS.filter(e => e.ll).length}</small>`;
    $('ev-btn').setAttribute('aria-pressed', String(state.events));
  }

  function toggleTag(t) {
    state.events = false;
    state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t);
    refresh();
  }

  $('tags').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (b) toggleTag(b.dataset.t);
  });

  // 展开全部标签，可以一键全选或清空
  function setPanel(open) {
    $('tag-panel').hidden = !open;
    $('tags-more').setAttribute('aria-expanded', String(open));
    if (open) {
      $('filter-pop').hidden = true;
      $('filter-btn').setAttribute('aria-expanded', 'false');
    }
  }
  $('tags-more').addEventListener('click', () => setPanel($('tag-panel').hidden));
  $('tag-panel').addEventListener('click', e => {
    const b = e.target.closest('[data-t], [data-act]');
    if (!b) return;
    if (b.dataset.t !== undefined) {
      toggleTag(b.dataset.t);
      return;
    }
    if (b.dataset.act === 'all') {
      state.events = false;
      state.tags = new Set(TAG_DEFS.map(t => t.name));
      refresh();
    } else if (b.dataset.act === 'none') {
      state.tags = new Set();
      refresh();
    } else if (b.dataset.act === 'done') {
      setPanel(false);
    }
  });

  $('filter-btn').addEventListener('click', () => {
    const pop = $('filter-pop');
    pop.hidden = !pop.hidden;
    $('filter-btn').setAttribute('aria-expanded', String(!pop.hidden));
    if (!pop.hidden) setPanel(false);
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
    if (!$('tag-panel').hidden && !e.target.closest('#tag-panel, #tags-more, #tags')) setPanel(false);
  });

  // ---------- 开屏：先选交通和时间，再选至少三个标签 ----------
  const HELLO_KEY = 'kaniyu-hello-v2';
  const MIN_TAGS = 3;
  const hello = { step: 1, measure: state.measure, limit: state.limit, tags: new Set() };

  function renderHello() {
    $('hello-step1').hidden = hello.step !== 1;
    $('hello-step2').hidden = hello.step !== 2;
    $('hello-measure').innerHTML = [['transit', '🚃', '公共交通'], ['car', '🚗', '自驾']]
      .map(([v, i, t]) => `<button type="button" data-hm="${v}" aria-pressed="${hello.measure === v}"><span>${i}</span>${t}</button>`).join('');
    $('hello-limit').innerHTML = LIMITS
      .map(l => `<button type="button" data-hl="${l}" aria-pressed="${hello.limit === l}">${BAND_NAME[l]}内<small>${PLACES.filter(p => p[hello.measure].mins <= l).length}处</small></button>`).join('');
    const tags = orderedTags(hello.limit, hello.measure);
    $('hello-tags').innerHTML = tags.map(t => tagChip(t, countTag(t, hello.limit, hello.measure), hello.tags.has(t), 'tag big')).join('');
    const n = hello.tags.size;
    $('hello-go').disabled = n < MIN_TAGS;
    $('hello-go').textContent = n < MIN_TAGS ? `再选 ${MIN_TAGS - n} 个` : `开始探索（${n}个标签）`;
  }

  if (!store.get(HELLO_KEY, false) || qs.get('hello') === '1') {
    renderHello();
    $('hello').hidden = false;
  }

  $('hello').addEventListener('click', e => {
    const m = e.target.closest('[data-hm]');
    const l = e.target.closest('[data-hl]');
    const t = e.target.closest('[data-t]');
    if (m) hello.measure = m.dataset.hm;
    else if (l) hello.limit = +l.dataset.hl;
    else if (t) hello.tags.has(t.dataset.t) ? hello.tags.delete(t.dataset.t) : hello.tags.add(t.dataset.t);
    else if (e.target.closest('#hello-next')) hello.step = 2;
    else if (e.target.closest('#hello-back')) hello.step = 1;
    else if (e.target.closest('#hello-go') && hello.tags.size >= MIN_TAGS) {
      state.measure = hello.measure;
      state.limit = hello.limit;
      state.tags = new Set(hello.tags);
      state.events = false;
      store.set(HELLO_KEY, true);
      $('hello').classList.add('leaving');
      setTimeout(() => { $('hello').hidden = true; }, reduceMotion ? 0 : 380);
      refresh();
      return;
    } else return;
    renderHello();
  });

  // ---------- 视图 ----------
  const VIEWS = ['map', 'rings', 'book', 'wish'];
  function showView(v) {
    state.view = v;
    VIEWS.forEach(k => { $('view-' + k).hidden = k !== v; });
    $('tabbar').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    if (v === 'map') map.resize();
    renderView();
  }

  $('tabbar').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (b) showView(b.dataset.v);
  });

  function renderView() {
    document.body.classList.toggle('idle', mode() === 'idle' && state.view !== 'wish');
    document.body.dataset.mode = mode();
    $('wish-tab').textContent = wish.size ? `想去的 ${wish.size}` : '想去的';
    if (state.view === 'map') renderMapView();
    if (state.view === 'rings') renderRings();
    if (state.view === 'book') renderBook();
    if (state.view === 'wish') renderWish();
  }

  function refresh() {
    savePrefs();
    renderHeader();
    PLACES.forEach(p => { pins.get(p.id).el.dataset.band = bandOf(p) || ''; });
    deckKey = '';
    if (state.sel) renderSheet();
    renderView();
  }

  function toggleWish(id) {
    wish.has(id) ? wish.delete(id) : wish.add(id);
    saveWish();
    $('wish-tab').textContent = wish.size ? `想去的 ${wish.size}` : '想去的';
    document.querySelectorAll(`[data-wish="${id}"]`).forEach(b => {
      b.setAttribute('aria-pressed', String(wish.has(id)));
      b.textContent = wish.has(id) ? '♥' : '♡';
    });
    toast(wish.has(id) ? `已加入想去的：${byId[id].name}` : `已移出想去的：${byId[id].name}`);
    if (state.view === 'wish') renderWish();
  }
  const heart = p => `<span class="heart" role="button" tabindex="0" data-wish="${p.id}" aria-pressed="${wish.has(p.id)}" aria-label="想去">${wish.has(p.id) ? '♥' : '♡'}</span>`;
  document.addEventListener('click', e => {
    const h = e.target.closest('[data-wish]');
    if (!h) return;
    e.stopPropagation();
    toggleWish(h.dataset.wish);
  }, true);

  // ---------- 地图 ----------
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const STYLE_URL = dark ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron';
  const HOME_VIEW = { center: [135.6, 34.78], zoom: 8.6 };
  const map = new maplibregl.Map({
    container: 'map',
    style: STYLE_URL,
    ...HOME_VIEW,
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
  map.once('idle', () => document.querySelector('#map .maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));

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

  // 活动：小圆点，临时性的
  const evPins = new Map();
  EVENTS.filter(e => e.ll).forEach(ev => {
    const el = document.createElement('div');
    el.className = 'gpin' + (ev.ga ? ' ga' : '');
    el.dataset.hidden = '';
    el.innerHTML = `<button type="button" class="gpin-in" aria-label="${esc(ev.name)}">${ev.ga ? '🍏' : '🎟️'}</button><span class="pin-label">${esc(ev.name)}</span>`;
    el.querySelector('.gpin-in').addEventListener('click', e => {
      e.stopPropagation();
      focusItem(ev.id, { scroll: true, fly: true });
    });
    evPins.set(ev.id, { el, marker: new maplibregl.Marker({ element: el }).setLngLat(ev.ll).addTo(map) });
  });

  const homeEl = document.createElement('div');
  homeEl.className = 'home';
  homeEl.innerHTML = `<span>${esc(ORIGIN.name)}</span><i></i>`;
  new maplibregl.Marker({ element: homeEl, anchor: 'bottom' }).setLngLat(ORIGIN.ll).addTo(map);

  function mapPadding(extra = 20) {
    const box = map.getContainer().getBoundingClientRect();
    const top = $('head').getBoundingClientRect().bottom - box.top + extra;
    const deckTop = mode() === 'idle' ? $('tabbar').getBoundingClientRect().top : $('deck').getBoundingClientRect().top;
    return { top, bottom: box.bottom - deckTop + extra, left: extra, right: extra };
  }

  // 回到京桥：京桥放在中间，保持能看到大阪、京都、神户的范围
  $('home-btn').addEventListener('click', () => {
    const opts = { center: ORIGIN.ll, zoom: 9.2, padding: mapPadding(10) };
    reduceMotion ? map.jumpTo(opts) : map.flyTo({ ...opts, duration: 1100, easing: easeInOut });
  });

  // 活动按钮：单独显示还没结束的活动，再点一次回到旅行点
  $('ev-btn').addEventListener('click', () => {
    state.events = !state.events;
    refresh();
    if (state.events) {
      const b = new maplibregl.LngLatBounds();
      EVENTS.filter(e => e.ll).forEach(e => b.extend(e.ll));
      map.fitBounds(b, { padding: mapPadding(50), maxZoom: 11, duration: reduceMotion ? 0 : 900 });
    }
  });

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
      m.el.querySelector('.pin-emo').textContent = members.length > 1
        ? [...new Set(members.map(id => mainEmo(byId[id], 1)))].slice(0, 3).join('')
        : mainEmo(p);
      if (p.id === state.focus) m.el.dataset.focus = '';
      else delete m.el.dataset.focus;
    });
    evPins.forEach((g, id) => {
      if (eventShown(evById[id])) delete g.el.dataset.hidden;
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
    if (state.view === 'rings') renderRings('still');
  });

  // ---------- 卡片带：滑到哪张，地图就飞到哪里 ----------
  let deckKey = '';
  let deckTimer;
  let deckProgrammatic = false;
  const deckItems = () => {
    if (mode() === 'events') return EVENTS;
    return [...(gaOn() ? EVENTS.filter(e => e.ga) : []), ...PLACES.filter(shown).sort((a, b) => minsOf(a) - minsOf(b))];
  };
  const itemOf = id => byId[id] || evById[id];

  const eventCard = e => `<button type="button" class="dk dk-ev" data-id="${e.id}">${evFace(e, 'dk-img')}<span class="dk-txt">
      <span class="dk-head"><b>${esc(e.name)}</b></span>
      <span class="dk-meta">${esc(e.when)} · ${esc(e.venue)}</span>
      <span class="dk-blurb">${esc(e.note)}</span>
      <span class="st ${e.live ? 'tone-green' : 'tone-plain'}">${esc(evStatus(e))}</span>
    </span></button>`;

  const placeCard = p => `<button type="button" class="dk" data-id="${p.id}">${photo(p)}<span class="dk-txt">
      <span class="dk-head"><b>${esc(p.name)}</b>${timeBadge(p)}</span>
      <span class="dk-meta">${esc(p.area)} · <span class="dk-emo">${emojis(p)}</span></span>
      <span class="dk-blurb">${esc(p.blurb)}</span>
      <span class="dk-foot">${p.season.tone !== 'plain' ? `<span class="st tone-${p.season.tone}">${esc(p.season.text)}</span>` : '<span></span>'}${heart(p)}</span>
    </span></button>`;

  function renderDeck() {
    if (mode() === 'idle') {
      deckKey = '';
      $('deck-list').innerHTML = '';
      return;
    }
    const items = deckItems();
    const key = mode() + state.measure + state.limit + [...state.tags].join() + items.map(p => p.id).join(',');
    if (key === deckKey) return;
    deckKey = key;
    $('deck-count').textContent = mode() === 'events'
      ? `🎟️ 还没结束的活动 · ${items.length} 个`
      : `${PLACES.filter(shown).length} 处 · 符合任一标签 · 按${MEASURE[state.measure]}由近到远${gaOn() ? ` · 🍏活动${EVENTS.filter(e => e.ga).length}个在最前` : ''}`;
    $('deck-list').innerHTML = items.length
      ? items.map(p => (p.venue ? eventCard(p) : placeCard(p))).join('')
      : '<p class="dk-empty">这个时间范围里没有这些标签的地方。放宽单程时间试试。</p>';
    if (!items.some(p => p.id === state.focus)) state.focus = items.find(p => p.ll)?.id || null;
    scrollDeckTo(state.focus, false);
    if (state.focus) focusItem(state.focus, { fly: mode() === 'places' });
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
    evPins.forEach((g, gid) => {
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

  // ---------- 时间圈：抽象的时间雷达 ----------
  // 用途和地图不同：一屏扫完所有候选，看清“谁近谁远、在哪个方向”。
  // 半径＝单程时间，方向＝从京桥看的实际方位；不用照片和底图，每处是一个带emoji的小圆点。
  // 点圆点放进下面的比较栏（最多4处），两种交通方式在同一把尺子上并排比较。
  const DIRS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const cmp = [];
  let radarBuilt = false;

  function buildRadar() {
    const host = $('radar');
    host.innerHTML = '<svg aria-hidden="true"></svg><span class="radar-home">' + esc(ORIGIN.name) + '</span>'
      + PLACES.map(p => `<button type="button" class="rd" data-id="${p.id}" aria-label="${esc(p.name)}，点一下加入比较"><span class="rd-emo">${mainEmo(p, 1) || '·'}</span><span class="rd-no"></span></button><span class="rdl" data-for="${p.id}">${esc(p.name)}</span>`).join('');
    host.addEventListener('click', e => {
      const b = e.target.closest('.rd');
      if (!b) return;
      const id = b.dataset.id;
      const i = cmp.indexOf(id);
      if (i >= 0) cmp.splice(i, 1);
      else {
        cmp.push(id);
        if (cmp.length > 4) cmp.shift();
      }
      renderRings(true);
    });
    radarBuilt = true;
  }

  function renderRings(keep) {
    const first = !radarBuilt;
    if (first) buildRadar();
    const host = $('radar');
    host.classList.toggle('still', first || keep === 'still');
    const avail = $('radar-wrap').getBoundingClientRect();
    const W = Math.floor(Math.min(avail.width, avail.height));
    host.style.width = W + 'px';
    host.style.height = W + 'px';
    const C = W / 2;
    const R = C - 24;
    // 半径按时间的0.6次方：近处拉开，远处不出界；刻度圈照实标注
    const rad = m => R * Math.pow(Math.min(m, 180) / 180, 0.6);
    const vis = PLACES.filter(shown);
    const inBand = l => vis.filter(p => minsOf(p) <= l && minsOf(p) > ({ 30: 0, 60: 30, 120: 60, 180: 120 })[l]).length;
    const sectorLines = DIRS.map((_, i) => {
      const a = toRad(i * 45 + 22.5);
      return `<line class="radar-sector" x1="${C}" y1="${C}" x2="${C + R * Math.sin(a)}" y2="${C - R * Math.cos(a)}"/>`;
    }).join('');
    // 每个方位写上那个方向主要是哪些地区
    const sectorNames = DIRS.map((d, i) => {
      const inSec = PLACES.filter(p => Math.round(p.deg / 45) % 8 === i);
      const count = {};
      inSec.forEach(p => { count[p.area] = (count[p.area] || 0) + (p.area === '大阪' ? 0.1 : 1); });
      const areas = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 2).join('·');
      const a = toRad(i * 45);
      const r = R + 12;
      return areas ? `<text class="radar-dir" x="${C + r * Math.sin(a)}" y="${C - r * Math.cos(a) + 4}" text-anchor="middle">${areas}</text>` : '';
    }).join('');
    const svg = host.querySelector('svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
    svg.innerHTML = [180, 120, 60, 30].map(m => `<circle class="radar-ring rr-${m}${m > state.limit ? ' off' : ''}" cx="${C}" cy="${C}" r="${rad(m)}"/>`).join('')
      + sectorLines + sectorNames
      + [30, 60, 120, 180].map(m => `<text class="radar-label" x="${C}" y="${C - rad(m) + 13}" text-anchor="middle">${BAND_NAME[m]}${mode() === 'places' && m <= state.limit ? ` · ${inBand(m)}` : ''}</text>`).join('');

    // 目标位置，再做几轮碰撞松弛，圆点不叠在一起
    const S = 21;
    const nodes = PLACES.map(p => {
      const r = rad(minsOf(p));
      const a = toRad(p.deg);
      const tx = C + r * Math.sin(a);
      const ty = C - r * Math.cos(a);
      return { p, tx, ty, x: tx, y: ty, out: !shown(p) };
    });
    const live = nodes.filter(n => !n.out);
    for (let it = 0; it < 120; it++) {
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

    // 名字：比较中的一定显示，其余放得下才显示，先近后远
    const boxes = live.map(n => ({ x: n.x - S / 2, y: n.y - S / 2, w: S, h: S }));
    const hit = r => boxes.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    const labels = {};
    const order = [...live].sort((a, b) => (cmp.includes(b.p.id) - cmp.includes(a.p.id)) || minsOf(a.p) - minsOf(b.p));
    order.forEach(n => {
      const w = n.p.name.length * 10 + 4;
      for (const r of [{ x: n.x + 12, y: n.y - 6, w, h: 12 }, { x: n.x - 12 - w, y: n.y - 6, w, h: 12 }, { x: n.x - w / 2, y: n.y + 12, w, h: 12 }]) {
        if (r.x >= 0 && r.x + r.w <= W && (cmp.includes(n.p.id) || !hit(r))) {
          boxes.push(r);
          labels[n.p.id] = r;
          break;
        }
      }
    });

    nodes.forEach(n => {
      const b = host.querySelector(`.rd[data-id="${n.p.id}"]`);
      const l = host.querySelector(`.rdl[data-for="${n.p.id}"]`);
      const k = cmp.indexOf(n.p.id);
      b.style.transform = `translate(${n.x}px, ${n.y}px)`;
      b.dataset.band = bandOf(n.p) || '';
      b.toggleAttribute('data-out', n.out);
      b.toggleAttribute('data-cmp', k >= 0);
      b.querySelector('.rd-no').textContent = k >= 0 ? k + 1 : '';
      const r = labels[n.p.id];
      l.hidden = !r || n.out;
      l.toggleAttribute('data-cmp', k >= 0);
      if (r) l.style.transform = `translate(${r.x}px, ${r.y}px)`;
    });
    if (first || keep === 'still') requestAnimationFrame(() => host.classList.remove('still'));
    renderCompare();
  }

  // 比较栏：同一把尺子（0–3小时），公共交通和自驾各一条
  function renderCompare() {
    const tray = $('cmp');
    if (mode() !== 'places') {
      tray.innerHTML = '<p class="cmp-tip">活动请在地图或画册里看</p>';
      return;
    }
    const list = cmp.map(id => byId[id]).filter(Boolean);
    if (!list.length) {
      tray.innerHTML = `<p class="cmp-tip">离中心越远，单程越久。点圆点，把几个地方放到这里比一比。</p>`;
      return;
    }
    const bar = (v, cls) => `<span class="cb ${cls}"><i style="width:${Math.min(v, 180) / 180 * 100}%"></i><em>${v}分</em></span>`;
    tray.innerHTML = `<div class="cmp-head"><span>比较 ${list.length} 处 · 刻度到3小时</span><button type="button" data-cmp-clear>清空</button></div>`
      + list.map((p, i) => `<div class="cr"><button type="button" class="cr-name" data-open="${p.id}"><b>${i + 1}</b>${mainEmo(p, 1)} ${esc(p.name)}</button>
        <span class="cr-bars">${bar(p.transit.mins, 't' + (state.measure === 'transit' ? ' on' : ''))}${bar(p.car.mins, 'c' + (state.measure === 'car' ? ' on' : ''))}</span>
        <button type="button" class="cr-x" data-cmp-del="${p.id}" aria-label="移出比较">×</button></div>`).join('')
      + '<p class="cmp-key"><i class="t"></i>🚃 公共交通 <i class="c"></i>🚗 自驾（不含拥堵）</p>';
  }

  $('cmp').addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    const d = e.target.closest('[data-cmp-del]');
    if (o) select(o.dataset.open);
    else if (d) {
      cmp.splice(cmp.indexOf(d.dataset.cmpDel), 1);
      renderRings(true);
    } else if (e.target.closest('[data-cmp-clear]')) {
      cmp.length = 0;
      renderRings(true);
    }
  });

  // ---------- 画册 ----------
  const eventBook = (title, list) => `<section class="book-sec"><div class="book-head"><h2>${title}</h2><small>${list.length} 个</small></div>
    <div class="book-row">${list.map(e => `<button type="button" class="bk bk-ev${e.ga ? ' ga' : ''}" data-id="${e.id}">${e.poster ? `<img src="${esc(e.poster)}" alt="" loading="lazy">` : `<span class="bk-ga-face" aria-hidden="true">${e.ga ? '🍏' : '🎟️'}</span>`}
      <span class="bk-top"><span class="tb tb-ga">${esc(e.kind)}</span></span>
      <span class="bk-txt"><small class="bk-area">${esc(e.when)} · ${esc(evStatus(e))}</small><h3>${esc(e.name)}</h3><p>${esc(e.venue)} · ${esc(e.note)}</p></span></button>`).join('')}</div></section>`;

  function renderBook() {
    if (mode() === 'idle') {
      $('view-book').innerHTML = '';
      return;
    }
    if (mode() === 'events') {
      $('view-book').innerHTML = eventBook('🎟️ 还没结束的活动', EVENTS);
      return;
    }
    const secs = LIMITS.filter(l => l <= state.limit).map(String).map(b => {
      const list = PLACES.filter(p => bandOf(p) === b && shown(p)).sort((x, y) => (y.season.hot - x.season.hot) || minsOf(x) - minsOf(y));
      if (!list.length) return '';
      const cards = list.map(p => `<button type="button" class="bk" data-id="${p.id}">${photo(p)}
        <span class="bk-top">${timeBadge(p)}${heart(p)}</span>
        <span class="bk-txt"><small class="bk-area">${esc(p.area)} · ${emojis(p)}</small><h3>${esc(p.name)}</h3><p>${esc(p.blurb)}</p></span></button>`).join('');
      return `<section class="book-sec"><div class="book-head"><h2><span class="tb tb-${b}">${BAND_NAME[b]}</span>${BAND_NAME[b]}圈</h2><small>${MEASURE[state.measure]} · ${list.length} 处</small></div>
        <div class="book-row">${cards}</div></section>`;
    }).join('');
    const ga = gaOn() ? eventBook('🍏 绿苹果专区', EVENTS.filter(e => e.ga)) + `<p class="book-note">${esc(GA_DATA.placesNote)}</p>` : '';
    $('view-book').innerHTML = ga + secs || '<p class="book-empty book-none">这个时间范围里没有这些标签的地方。放宽单程时间试试。</p>';
  }
  $('view-book').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });

  // ---------- 想去的：标记过的地点，带明细 ----------
  const routeUrl = (ll, m) => `https://www.google.com/maps/dir/?api=1&origin=${ORIGIN.ll[1]},${ORIGIN.ll[0]}&destination=${ll[1]},${ll[0]}&travelmode=${m === 'car' ? 'driving' : 'transit'}`;

  function renderWish() {
    const list = [...wish].map(id => byId[id]).filter(Boolean).sort((a, b) => minsOf(a) - minsOf(b));
    if (!list.length) {
      $('view-wish').innerHTML = `<div class="wish-empty"><p class="wish-big">♡</p><p>还没有想去的地方。</p><p>在卡片右下角或详情里点「想去」，就会收到这里。</p></div>`;
      return;
    }
    $('view-wish').innerHTML = `<h2 class="wish-title">想去的<small>${list.length} 处 · 按${MEASURE[state.measure]}由近到远</small></h2>`
      + list.map(p => `<article class="wc" data-id="${p.id}">
        <div class="wc-photo">${photo(p)}<span class="wc-emo">${emojis(p, 5)}</span></div>
        <div class="wc-body">
          <div class="wc-head"><h3>${esc(p.name)}</h3>${heart(p)}</div>
          ${plans[p.id]?.when ? `<p class="wc-when" data-when-show="${p.id}">🗓 ${esc(plans[p.id].when)}</p>` : `<p class="wc-when" data-when-show="${p.id}" hidden></p>`}
          <p class="wc-meta">${esc(p.area)} · ${esc(p.kind)} · <span class="st tone-${p.season.tone}">${esc(p.season.text)}</span></p>
          <div class="wc-time">
            <span><small>🚃 公共交通</small><b>${p.transit.mins}分</b><em>${esc(p.transit.route)}</em></span>
            <span><small>🚗 自驾</small><b>${p.car.mins}分</b><em>约${p.car.km}公里，不含拥堵</em></span>
          </div>
          <p class="wc-blurb">${esc(p.blurb)}</p>
          ${p.tip ? `<p class="wc-tip">💡 ${esc(p.tip)}</p>` : ''}
          ${p.seasons.length ? yearStrip(p) : ''}
          <div class="wc-plan">
            <label>🗓 想什么时候去<input type="text" data-plan="when" data-id="${p.id}" value="${esc(plans[p.id]?.when || '')}" placeholder="比如：11月下旬看红叶" enterkeyhint="done"></label>
            <div class="wc-sugg">${planSuggestions(p).map(t => `<button type="button" data-sugg="${esc(t)}" data-id="${p.id}">${esc(t)}</button>`).join('')}</div>
            <label>📝 备注<textarea data-plan="note" data-id="${p.id}" rows="2" placeholder="想和谁去、想吃什么、要提前订什么…">${esc(plans[p.id]?.note || '')}</textarea></label>
            <span class="wc-saved" data-saved="${p.id}" aria-live="polite"></span>
          </div>
          <div class="wc-acts">
            <a href="${routeUrl(p.ll, 'transit')}" target="_blank" rel="noopener noreferrer">🚃 公交路线</a>
            <a href="${routeUrl(p.ll, 'car')}" target="_blank" rel="noopener noreferrer">🚗 开车路线</a>
            <button type="button" data-open="${p.id}">在地图上看</button>
          </div>
        </div>
      </article>`).join('');
  }
  // 建议的时间：这个地方的季节窗口，加上最近两个周末和下个月
  const WEEK = '日一二三四五六';
  function planSuggestions(p) {
    const out = p.seasons.map(w => `${w.label} ${fmtMD(w.from)}–${fmtMD(w.to)}`);
    const d = new Date(today + 'T12:00:00Z');
    // 周六、周日当天就是“这周末”
    const day = d.getUTCDay();
    const toSat = day === 0 ? 0 : 6 - day;
    for (const [label, add] of [['这周末', toSat], ['下周末', day === 0 ? 6 : toSat + 7]]) {
      const x = new Date(d);
      x.setUTCDate(x.getUTCDate() + add);
      out.push(`${label} ${x.getUTCMonth() + 1}/${x.getUTCDate()}（${WEEK[x.getUTCDay()]}）`);
    }
    out.push(`${(d.getUTCMonth() + 1) % 12 + 1}月`);
    return out;
  }

  let planTimer;
  function setPlan(id, key, value) {
    plans[id] = { ...plans[id], [key]: value.trim() };
    if (!plans[id].when && !plans[id].note) delete plans[id];
    clearTimeout(planTimer);
    planTimer = setTimeout(() => {
      savePlans();
      const tag = document.querySelector(`[data-saved="${id}"]`);
      if (tag) {
        tag.textContent = '已保存在这台设备';
        setTimeout(() => { tag.textContent = ''; }, 2000);
      }
    }, 400);
    const show = document.querySelector(`[data-when-show="${id}"]`);
    if (show && key === 'when') {
      show.hidden = !value.trim();
      show.textContent = '🗓 ' + value.trim();
    }
  }
  $('view-wish').addEventListener('input', e => {
    const f = e.target.closest('[data-plan]');
    if (f) setPlan(f.dataset.id, f.dataset.plan, f.value);
  });

  $('view-wish').addEventListener('click', e => {
    const g = e.target.closest('[data-sugg]');
    if (g) {
      const input = document.querySelector(`[data-plan="when"][data-id="${g.dataset.id}"]`);
      input.value = g.dataset.sugg;
      setPlan(g.dataset.id, 'when', g.dataset.sugg);
      return;
    }
    const b = e.target.closest('[data-open]');
    if (!b) return;
    const id = b.dataset.open;
    const p = byId[id];
    // 地图上要能看到它：没被当前标签选中时，临时加上它的第一个标签
    if (!shown(p)) {
      state.events = false;
      state.tags.add(p.tags[0]);
      if (minsOf(p) > state.limit) state.limit = LIMITS.find(l => minsOf(p) <= l) || 180;
      renderHeader();
      savePrefs();
    }
    showView('map');
    deckKey = '';
    renderDeck();
    focusItem(id, { scroll: true, fly: true });
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

  function eventSheet(e) {
    const src = e.sources.length
      ? `来源：${e.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.note)}</a>`).join(' · ')}。`
      : '';
    return `
      <div class="sh-hero ${e.poster ? '' : 'sh-ga'}">${e.poster ? `<img src="${esc(e.poster)}" alt="">` : `<span class="sh-ga-face" aria-hidden="true">${e.ga ? '🍏' : '🎟️'}</span>`}
        <button type="button" class="sh-close" id="sh-close" aria-label="关闭">×</button>
        <div class="sh-title"><h2>${esc(e.name)}</h2><p><span>${esc(e.kind)} · ${esc(e.when)}</span><span>${esc(evStatus(e))}</span></p></div>
      </div>
      <div class="sh-body">
        <h3>在哪里</h3>
        <p>${esc(e.venue)}</p>
        ${e.fee ? `<h3>门票</h3><p>${esc(e.fee)}</p>` : ''}
        <h3>要知道的</h3>
        <p>${esc(e.note)}</p>
        <div class="sh-acts">
          ${e.ll ? `<a href="${routeUrl(e.ll, state.measure)}" target="_blank" rel="noopener noreferrer">从${esc(ORIGIN.name)}怎么去</a>` : ''}
          ${e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">官方网站</a>` : ''}
        </div>
        <p class="sh-credit">${src}日期和购票以官方为准。</p>
      </div>`;
  }

  function renderSheet() {
    const id = state.sel;
    if (evById[id]) {
      $('sheet').innerHTML = eventSheet(evById[id]);
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
        <p class="sh-tags">${TAG_DEFS.filter(t => t.name !== GA && hasTag(p, t.name)).map(t => `<span>${t.emoji} ${t.name}</span>`).join('')}</p>
        <h3>为什么去</h3>
        <p>${esc(p.why)}</p>
        ${p.tip ? `<p class="sh-tip">${esc(p.tip)}</p>` : ''}
        ${p.seasons.length ? `<h3>一年里什么时候去</h3>${yearStrip(p)}` : ''}
        <div class="sh-acts">
          <button type="button" data-wish="${p.id}" aria-pressed="${wish.has(p.id)}">${wish.has(p.id) ? '♥' : '♡'}</button>
          <a href="${routeUrl(p.ll, state.measure)}" target="_blank" rel="noopener noreferrer">${state.measure === 'car' ? '开车路线' : '公交路线'}</a>
        </div>
        <p class="sh-credit">${credit}</p>
      </div>`;
    $('sh-close').addEventListener('click', () => closeSheet());
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
    if (e.key === 'Escape') {
      if (state.sel) closeSheet();
      setPanel(false);
    }
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
