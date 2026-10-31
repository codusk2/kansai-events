// 蟹鱼游旅行点原型：以京桥站为中心，按单程时间（公共交通 / 自驾）分三档，四种呈现方式。
// 旅行点读 data/places.json；活动只做地图上的小点（读第一轮原型的样例）。
(async () => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qs = new URLSearchParams(location.search);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  const res = await fetch('../../data/places.json');
  const DATA = await res.json();
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

  const EVENTS = (window.WALK_DATA?.events || [])
    .filter(e => window.WALK_GEO?.items[e.id] && e.to >= today)
    .map(e => ({ ...e, ll: window.WALK_GEO.items[e.id].ll }));

  // ---------- 状态 ----------
  const state = {
    measure: qs.get('m') === 'car' ? 'car' : 'transit',
    bands: new Set(['30', '60', '120', '180']),
    tags: new Set(),
    view: ['map', 'rings', 'book'].includes(qs.get('view')) ? qs.get('view') : 'map',
    sel: null,
    focus: null
  };
  const wish = new Set(['tofukuji', 'arima']);
  const MEASURE = { transit: '公共交通', car: '自驾' };
  const BANDS = ['30', '60', '120', '180'];
  const BAND_NAME = { 30: '半小时', 60: '1小时', 120: '2小时', 180: '3小时' };
  const BAND_TITLE = { 30: '半小时圈', 60: '1小时圈', 120: '2小时圈', 180: '3小时圈' };
  // 主题标签：「最近热门」不存数据，按季节正当时判断
  const TAGS = ['风景美', '热闹', '好吃', '山里', '海边', '人文古迹', '最近热门', '水边', '寺社', '赏花', '红叶', '温泉', '夜景', '散步', '安静', '拍照', '建筑', '亲子', '乐园', '雨天也行'];
  const EMOJI = {
    风景美: '🏞️', 热闹: '🎉', 好吃: '🍜', 山里: '⛰️', 海边: '🌊', 人文古迹: '🏯', 最近热门: '🔥', 水边: '🛶', 寺社: '⛩️', 赏花: '🌸',
    红叶: '🍁', 温泉: '♨️', 夜景: '🌃', 散步: '🚶', 安静: '🍃', 拍照: '📷', 建筑: '🏛️', 亲子: '🧸', 乐园: '🎢', 雨天也行: '☔'
  };
  const emojis = (p, n = 4) => p.tags.slice(0, n).map(t => EMOJI[t] || '').join('');
  const hasTag = (p, t) => (t === '最近热门' ? p.season.hot : p.tags.includes(t));
  const tagsOk = (p, set = state.tags) => [...set].every(t => hasTag(p, t));
  const minsOf = (p, m = state.measure) => p[m].mins;
  const bandOf = (p, m = state.measure) => {
    const v = minsOf(p, m);
    return v <= 30 ? '30' : v <= 60 ? '60' : v <= 120 ? '120' : v <= 180 ? '180' : null;
  };
  const shown = p => {
    const b = bandOf(p);
    return Boolean(b) && state.bands.has(b) && tagsOk(p);
  };
  const timeBadge = p => {
    const b = bandOf(p);
    return `<span class="tb tb-${b || '180'}">${minsOf(p)}分</span>`;
  };
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

  // ---------- 顶栏：口径与时间档 ----------
  function renderBands() {
    $('bands').innerHTML = BANDS.map(b => {
      const n = PLACES.filter(p => bandOf(p) === b && tagsOk(p)).length;
      return `<button type="button" class="band" data-b="${b}" aria-pressed="${state.bands.has(b)}"><i></i>${BAND_NAME[b]}<small>${n}</small></button>`;
    }).join('');
    $('measure').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === state.measure)));
    // 每个标签旁的数字：再加上它之后还剩几处
    const inBand = PLACES.filter(p => state.bands.has(bandOf(p)));
    const order = [...TAGS.filter(t => state.tags.has(t)), ...TAGS.filter(t => !state.tags.has(t))];
    const chips = order.map(t => {
      const on = state.tags.has(t);
      const n = inBand.filter(p => tagsOk(p, new Set([...state.tags, t]))).length;
      return `<button type="button" class="tag" data-t="${t}" aria-pressed="${on}"${!on && !n ? ' disabled' : ''}><span class="emo" aria-hidden="true">${EMOJI[t]}</span>${t}<small>${n}</small></button>`;
    }).join('');
    $('tags').innerHTML = (state.tags.size ? '<button type="button" class="tag clear" data-t="">清除</button>' : '') + chips;
  }

  $('tags').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const t = b.dataset.t;
    if (!t) state.tags.clear();
    else state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t);
    refresh();
  });

  $('measure').addEventListener('click', e => {
    const b = e.target.closest('[data-m]');
    if (!b || b.dataset.m === state.measure) return;
    state.measure = b.dataset.m;
    refresh();
  });

  $('bands').addEventListener('click', e => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    const k = b.dataset.b;
    if (state.bands.has(k) && state.bands.size === 1) {
      state.bands = new Set(BANDS);
    } else if (state.bands.size === BANDS.length) {
      state.bands = new Set([k]);
    } else {
      state.bands.has(k) ? state.bands.delete(k) : state.bands.add(k);
    }
    refresh();
  });

  // ---------- 视图切换 ----------
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
    if (state.view === 'map') renderMapView();
    if (state.view === 'rings') renderRings();
    if (state.view === 'book') renderBook();
  }

  function refresh() {
    renderBands();
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

  // 旅行点：圆形照片针。挤在一起时合并成一叠照片并标数字，点一下放大展开。
  const pins = new Map();
  PLACES.forEach(p => {
    const el = document.createElement('div');
    el.className = 'pin';
    el.dataset.band = bandOf(p) || '';
    el.dataset.state = 'solo';
    el.innerHTML = `<button type="button" class="pin-in" aria-label="${esc(p.name)}"><span class="pin-stack" aria-hidden="true"></span>${photo(p)}<span class="pin-n"></span></button>`
      + `<span class="pin-label">${esc(p.name)}</span>`;
    el.querySelector('.pin-in').addEventListener('click', e => {
      e.stopPropagation();
      const m = pins.get(p.id);
      if (m.members && m.members.length > 1) {
        const b = new maplibregl.LngLatBounds();
        m.members.forEach(id => b.extend(byId[id].ll));
        map.fitBounds(b, { padding: mapPadding(60), maxZoom: 14, duration: reduceMotion ? 0 : 900 });
        return;
      }
      focusPlace(p.id, { scroll: true, fly: true });
    });
    pins.set(p.id, { el, members: [p.id], marker: new maplibregl.Marker({ element: el }).setLngLat(p.ll).addTo(map) });
  });

  EVENTS.forEach(ev => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'ev-dot';
    el.setAttribute('aria-label', '活动：' + ev.name);
    el.addEventListener('click', e => {
      e.stopPropagation();
      toast(`活动 · ${ev.name} · ${fmtISO(ev.from)}–${fmtISO(ev.to)}`);
    });
    new maplibregl.Marker({ element: el }).setLngLat(ev.ll).addTo(map);
  });

  const homeEl = document.createElement('div');
  homeEl.className = 'home';
  homeEl.innerHTML = `<span>${esc(ORIGIN.name)}</span><i></i>`;
  new maplibregl.Marker({ element: homeEl, anchor: 'bottom' }).setLngLat(ORIGIN.ll).addTo(map);

  function mapPadding(extra = 20) {
    const box = map.getContainer().getBoundingClientRect();
    const top = $('tags').getBoundingClientRect().bottom - box.top + extra;
    const bottom = box.bottom - $('deck').getBoundingClientRect().top + extra;
    return { top, bottom, left: extra, right: extra };
  }

  // 合并：只在地图停下后算一次，拖动过程中不重排
  const CLUSTER_PX = 46;
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
      const members = lead.get(p.id);
      m.members = members || [];
      m.el.dataset.state = !shown(p) ? 'out' : members ? (members.length > 1 ? 'leader' : 'solo') : 'member';
      m.el.querySelector('.pin-n').textContent = members && members.length > 1 ? members.length : '';
      if (p.id === state.focus) m.el.dataset.focus = '';
      else delete m.el.dataset.focus;
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

  // ---------- 卡片带：按单程时间由近到远，滑到哪张，地图就飞到哪里 ----------
  let deckKey = '';
  const deckItems = () => PLACES.filter(shown).sort((a, b) => minsOf(a) - minsOf(b));

  function renderDeck() {
    const items = deckItems();
    const key = state.measure + items.map(p => p.id).join(',');
    if (key === deckKey) return;
    deckKey = key;
    $('deck-count').textContent = `${items.length} 处 · 按${MEASURE[state.measure]}由近到远`;
    $('deck-list').innerHTML = items.length
      ? items.map(p => `<button type="button" class="dk" data-id="${p.id}">${photo(p)}<span class="dk-txt">
          <span class="dk-head"><b>${esc(p.name)}</b>${timeBadge(p)}</span>
          <span class="dk-meta">${esc(p.area)} · <span class="dk-emo">${emojis(p)}</span></span>
          <span class="dk-blurb">${esc(p.blurb)}</span>
          ${p.season.tone !== 'plain' ? `<span class="st tone-${p.season.tone}">${esc(p.season.text)}</span>` : ''}
        </span></button>`).join('')
      : '<p class="dk-empty">没有符合的地方。换个标签或时间档试试。</p>';
    if (!items.some(p => p.id === state.focus)) state.focus = items[0]?.id || null;
    scrollDeckTo(state.focus, false);
  }

  function scrollDeckTo(id, smooth) {
    const card = id && $('deck-list').querySelector(`[data-id="${id}"]`);
    if (!card) return;
    deckProgrammatic = true;
    $('deck-list').scrollTo({ left: card.offsetLeft - parseFloat(getComputedStyle($('deck-list')).paddingLeft), behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    clearTimeout(deckTimer);
    deckTimer = setTimeout(() => { deckProgrammatic = false; }, smooth ? 600 : 50);
  }

  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function focusPlace(id, { scroll = false, fly = true } = {}) {
    if (!byId[id]) return;
    state.focus = id;
    PLACES.forEach(p => {
      const el = pins.get(p.id).el;
      if (p.id === id) el.dataset.focus = '';
      else delete el.dataset.focus;
    });
    $('deck-list').querySelectorAll('.dk').forEach(c => c.toggleAttribute('data-focus', c.dataset.id === id));
    if (scroll) scrollDeckTo(id, true);
    if (fly) {
      const opts = { center: byId[id].ll, zoom: Math.max(map.getZoom(), 10), padding: mapPadding(30) };
      if (reduceMotion) map.jumpTo(opts);
      else map.flyTo({ ...opts, duration: 1200, curve: 1.25, easing: easeInOut, essential: true });
    }
  }

  // 用户滑动停下后才切换焦点，避免地图跟着手指抖
  let deckTimer;
  let deckProgrammatic = false;
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
      if (best && best.id !== state.focus) focusPlace(best.id, { fly: true });
    }, 160);
  }, { passive: true });

  $('deck-list').addEventListener('click', e => {
    const c = e.target.closest('.dk');
    if (!c) return;
    if (c.dataset.id !== state.focus) focusPlace(c.dataset.id, { scroll: true, fly: true });
    else select(c.dataset.id);
  });

  function renderMapView() {
    renderDeck();
    cluster();
    PLACES.forEach(p => {
      const el = pins.get(p.id).el;
      if (p.id === state.focus) el.dataset.focus = '';
      else delete el.dataset.focus;
    });
    $('deck-list').querySelectorAll('.dk').forEach(c => c.toggleAttribute('data-focus', c.dataset.id === state.focus));
  }

  // ---------- 时间圈：半径＝单程时间，方向＝从京桥看的方位；底下是淡淡的地图，只示意方位 ----------
  const ZOOMS = [1.5, 2, 2.7];
  let zoomIdx = 1;
  let ringsBuilt = false;
  let ringsMap = null;

  function buildRings() {
    const host = $('rings');
    host.innerHTML = '<div class="rings-map" id="rings-map"></div><svg aria-hidden="true"></svg><span class="home-dot">' + esc(ORIGIN.name) + '</span>'
      + PLACES.map(p => `<button type="button" class="rb" data-id="${p.id}" aria-label="${esc(p.name)}">${photo(p)}</button><span class="rl" data-for="${p.id}">${esc(p.name)}</span>`).join('');
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
    const pxPerKm = ratios[Math.floor(ratios.length / 2)];
    const mPerPx = 1000 / pxPerKm;
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
    const outside = PLACES.filter(p => !bandOf(p)).length;
    $('rings-note').textContent = `${MEASURE[state.measure]} · 离中心越远单程越久，方向是实际方位${outside ? ` · ${outside}处超过3小时未显示` : ''}`;
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

  // ---------- 画册：每档一行大卡 ----------
  function renderBook() {
    const secs = BANDS.filter(b => state.bands.has(b)).map(b => {
      const list = PLACES.filter(p => bandOf(p) === b && tagsOk(p)).sort((x, y) => (y.season.hot - x.season.hot) || minsOf(x) - minsOf(y));
      if (!list.length) return '';
      const cards = list.map(p => `<button type="button" class="bk" data-id="${p.id}">${photo(p)}
        <span class="bk-top">${timeBadge(p)}${p.season.tone !== 'plain' ? `<span class="st tone-${p.season.tone}">${esc(p.season.text)}</span>` : ''}</span>
        <span class="bk-txt"><small class="bk-area">${esc(p.area)} · ${emojis(p)}</small><h3>${esc(p.name)}</h3><p>${esc(p.blurb)}</p></span></button>`).join('');
      return `<section class="book-sec"><div class="book-head"><h2><span class="tb tb-${b}">${BAND_NAME[b]}</span>${BAND_TITLE[b]}</h2><small>${MEASURE[state.measure]} · ${list.length} 处</small></div>
        <div class="book-row">${cards || '<p class="book-empty">没有地点。</p>'}</div></section>`;
    }).join('');
    $('view-book').innerHTML = secs.includes('class="bk"') ? secs : '<p class="book-empty book-none">没有符合这些主题的地方。少选一个标签试试。</p>';
  }
  $('view-book').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });

  // ---------- 旅行点面板 ----------
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

  function renderSheet() {
    const p = byId[state.sel];
    const mode = state.measure === 'car' ? 'driving' : 'transit';
    const route = `https://www.google.com/maps/dir/?api=1&origin=${ORIGIN.ll[1]},${ORIGIN.ll[0]}&destination=${p.ll[1]},${p.ll[0]}&travelmode=${mode}`;
    const credit = p.img
      ? `图：${esc(p.img.artist || '佚名')} · ${esc(p.img.license)} · <a href="${esc(p.img.page)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a>`
      : '暂无配图';
    $('sheet').innerHTML = `
      <div class="sh-hero">${photo(p)}
        <button type="button" class="sh-close" id="sh-close" aria-label="关闭">×</button>
        <div class="sh-title"><h2>${esc(p.name)}</h2><p>${esc(p.area)} · ${esc(p.kind)} · <span class="st tone-${p.season.tone}" style="color:#fff">${esc(p.season.text)}</span></p></div>
      </div>
      <div class="sh-body">
        <div class="sh-time">
          <div class="${state.measure === 'transit' ? 'on' : ''}"><small>公共交通 · 估算</small><b>${minsOf(p, 'transit')}<small>分</small></b><p>${esc(p.transit.route)}</p></div>
          <div class="${state.measure === 'car' ? 'on' : ''}"><small>自驾 · 不含拥堵</small><b>${minsOf(p, 'car')}<small>分</small></b><p>约${p.car.km}公里；高峰和停车另计</p></div>
        </div>
        <p class="sh-tags">${p.tags.map(t => `<span>${EMOJI[t]} ${t}</span>`).join('')}</p>
        <h3>为什么去</h3>
        <p>${esc(p.why)}</p>
        ${p.tip ? `<p class="sh-tip">${esc(p.tip)}</p>` : ''}
        ${p.seasons.length ? `<h3>一年里什么时候去</h3>${yearStrip(p)}` : ''}
        <div class="sh-acts">
          <button type="button" id="sh-wish" aria-pressed="${wish.has(p.id)}">${wish.has(p.id) ? '已想去' : '想去'}</button>
          <a href="${route}" target="_blank" rel="noopener noreferrer">${state.measure === 'car' ? '开车路线' : '公交路线'}</a>
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
    if (!byId[id]) return;
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
    if (state.view === 'map') {
      state.focus = id;
      const opts = { center: byId[id].ll, zoom: Math.max(map.getZoom(), 10.5), padding: { top: 140, bottom: sheet.offsetHeight + 20, left: 30, right: 30 } };
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
    if (m && byId[m[1]]) select(m[1], true);
    else if (state.sel) closeSheet(true);
  }
  window.addEventListener('popstate', fromHash);

  // ---------- 启动 ----------
  renderBands();
  showView(state.view);
  fromHash();
})();
