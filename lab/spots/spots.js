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
    bands: new Set(['30', '60', '120']),
    view: ['map', 'rings', 'book', 'compare'].includes(qs.get('view')) ? qs.get('view') : 'map',
    style: ['photo', 'postcard', 'stamp'].includes(qs.get('style')) ? qs.get('style') : 'photo',
    sel: null
  };
  const wish = new Set(['tofukuji', 'arima']);
  const MEASURE = { transit: '公共交通', car: '自驾' };
  const BAND_NAME = { 30: '半小时', 60: '1小时', 120: '2小时' };
  const BAND_TITLE = { 30: '半小时圈', 60: '1小时圈', 120: '2小时圈' };
  const minsOf = (p, m = state.measure) => p[m].mins;
  const bandOf = (p, m = state.measure) => {
    const v = minsOf(p, m);
    return v <= 30 ? '30' : v <= 60 ? '60' : v <= 120 ? '120' : null;
  };
  const shown = p => {
    const b = bandOf(p);
    return Boolean(b) && state.bands.has(b);
  };
  const minsText = v => (v >= 60 ? `${Math.floor(v / 60)}小时${v % 60 ? (v % 60) + '分' : ''}` : `${v}分`);
  const timeBadge = p => {
    const b = bandOf(p);
    return `<span class="tb tb-${b || '120'}">${minsOf(p)}分</span>`;
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
    $('bands').innerHTML = ['30', '60', '120'].map(b => {
      const n = PLACES.filter(p => bandOf(p) === b).length;
      return `<button type="button" class="band" data-b="${b}" aria-pressed="${state.bands.has(b)}"><i></i>${BAND_NAME[b]}<small>${n}</small></button>`;
    }).join('');
    $('measure').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === state.measure)));
  }

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
      state.bands = new Set(['30', '60', '120']);
    } else if (state.bands.size === 3) {
      state.bands = new Set([k]);
    } else {
      state.bands.has(k) ? state.bands.delete(k) : state.bands.add(k);
    }
    refresh();
  });

  // ---------- 视图切换 ----------
  function showView(v) {
    state.view = v;
    ['map', 'rings', 'book', 'compare'].forEach(k => { $('view-' + k).hidden = k !== v; });
    $('tabbar').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    if (v === 'map') {
      map.resize();
      queueLayout();
    }
    renderView();
  }

  $('tabbar').addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (b) showView(b.dataset.v);
  });

  function renderView() {
    if (state.view === 'map') queueLayout();
    if (state.view === 'rings') renderRings();
    if (state.view === 'book') renderBook();
    if (state.view === 'compare') renderCompare();
  }

  function refresh() {
    renderBands();
    PLACES.forEach(p => {
      const m = markers.get(p.id);
      m.el.dataset.band = bandOf(p) || '';
      m.el.querySelector('.tb').outerHTML = timeBadge(p);
    });
    if (state.sel) renderSheet();
    renderView();
  }

  // ---------- 地图 ----------
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const map = new maplibregl.Map({
    container: 'map',
    style: dark ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/positron',
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
  map.on('style.load', () => {
    const set = (id, prop, val) => {
      if (map.getLayer(id)) map.setPaintProperty(id, prop, val);
    };
    set('background', 'background-color', TINT.bg);
    set('water', 'fill-color', TINT.water);
    set('park', 'fill-color', TINT.park);
    set('landcover_wood', 'fill-color', TINT.wood);
    set('landuse_residential', 'fill-color', TINT.resid);
    set('building', 'fill-color', TINT.building);
    for (const id of ['label_other', 'label_village', 'highway-name-path', 'highway-name-minor']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    }
    for (const layer of map.getStyle().layers) {
      if (layer.type !== 'symbol' || /shield/.test(layer.id)) continue;
      map.setPaintProperty(layer.id, 'text-opacity', 0.65);
      if (map.getLayoutProperty(layer.id, 'text-field') !== undefined) {
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ja'], ['get', 'name']]);
      }
    }
  });
  map.on('load', () => document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));

  const hash = s => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const markers = new Map();
  PLACES.forEach(p => {
    const el = document.createElement('div');
    el.className = 'mk';
    el.dataset.lv = 'dot';
    el.dataset.band = bandOf(p) || '';
    el.style.setProperty('--tilt', ((hash(p.id) % 7) - 3) * 0.8 + 'deg');
    const meta = `<span class="mk-meta">${timeBadge(p)}<span class="st tone-${p.season.tone}">${esc(p.season.text)}</span></span>`;
    el.innerHTML = `<button type="button" class="mk-card" aria-label="${esc(p.name)}">${photo(p)}<span class="mk-txt"><b>${esc(p.name)}</b>${meta}</span></button>`
      + '<span class="mk-pin" role="presentation"></span>';
    const open = e => {
      e.stopPropagation();
      select(p.id);
    };
    el.querySelector('.mk-card').addEventListener('click', open);
    el.querySelector('.mk-pin').addEventListener('click', open);
    markers.set(p.id, { el, lv: 'dot', marker: new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(p.ll).addTo(map) });
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

  const CARD_SIZE = { photo: [190, 84], postcard: [146, 144], stamp: [120, 108] };
  const MINI = [144, 44];
  const BUBBLE = [46, 46];

  let queued = false;
  function queueLayout() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (state.view === 'map') layoutMap();
    });
  }

  // 按屏幕空间让位：卡 → 小名牌 → 小圆照片 → 点
  function layoutMap() {
    const box = map.getContainer().getBoundingClientRect();
    const top = $('bands').getBoundingClientRect().bottom - box.top + 30;
    const bottom = (state.sel ? $('sheet').getBoundingClientRect().top : $('tabbar').getBoundingClientRect().top) - box.top - 6;
    const area = { left: 0, right: box.width, top, bottom };
    const cx = box.width / 2;
    const cy = (top + bottom) / 2;
    const hp = map.project(ORIGIN.ll);
    const placed = [{ x: hp.x - 42, y: hp.y - 46, w: 84, h: 46 }];
    const hits = r => placed.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    const inside = r => r.x >= 4 && r.x + r.w <= area.right - 4 && r.y >= area.top && r.y + r.h <= area.bottom;
    const [cw, ch] = CARD_SIZE[state.style];
    const list = PLACES.map(p => {
      const pt = map.project(p.ll);
      const rank = (p.id === state.sel ? 1e6 : 0) + (p.season.hot ? 400 : 0) + (wish.has(p.id) ? 200 : 0) - Math.hypot(pt.x - cx, pt.y - cy);
      return { p, pt, rank };
    }).sort((a, b) => b.rank - a.rank);
    for (const { p, pt } of list) {
      const m = markers.get(p.id);
      if (!shown(p)) {
        m.el.dataset.hidden = '';
        continue;
      }
      delete m.el.dataset.hidden;
      let lv = 'dot';
      const rc = { x: pt.x - cw / 2, y: pt.y - ch - 14, w: cw, h: ch };
      const rm = { x: pt.x - MINI[0] / 2, y: pt.y - MINI[1] - 14, w: MINI[0], h: MINI[1] };
      const rb = { x: pt.x - BUBBLE[0] / 2, y: pt.y - BUBBLE[1] - 14, w: BUBBLE[0], h: BUBBLE[1] };
      if (p.id === state.sel || (inside(rc) && !hits(rc))) {
        lv = 'card';
        placed.push(rc);
      } else if (inside(rm) && !hits(rm)) {
        lv = 'mini';
        placed.push(rm);
      } else if (!hits(rb)) {
        lv = 'bubble';
        placed.push(rb);
      }
      if (m.lv !== lv) {
        m.lv = lv;
        m.el.dataset.lv = lv;
      }
      if (p.id === state.sel) m.el.dataset.sel = '';
      else delete m.el.dataset.sel;
    }
  }
  map.on('move', queueLayout);
  map.on('click', () => {
    if (state.sel) closeSheet();
  });
  window.addEventListener('resize', () => {
    queueLayout();
    if (state.view === 'rings') renderRings();
  });

  const STYLES = [['photo', '照片卡'], ['postcard', '明信片'], ['stamp', '圆章']];
  function applyStyle() {
    document.body.dataset.style = state.style;
    $('style-btn').textContent = '卡片：' + STYLES.find(s => s[0] === state.style)[1];
    queueLayout();
  }
  $('style-btn').addEventListener('click', () => {
    const i = STYLES.findIndex(s => s[0] === state.style);
    state.style = STYLES[(i + 1) % STYLES.length][0];
    applyStyle();
  });

  // ---------- 时间圈：半径＝单程时间，方向＝从京桥看的方位 ----------
  const AREA_LABEL = ['大阪', '京都', '奈良', '兵库', '滋贺', '和歌山'];
  let ringsBuilt = false;

  function buildRings() {
    const host = $('rings');
    host.innerHTML = '<svg aria-hidden="true"></svg><span class="home-dot">' + esc(ORIGIN.name) + '</span>'
      + PLACES.map(p => `<button type="button" class="rb" data-id="${p.id}" aria-label="${esc(p.name)}">${photo(p)}</button><span class="rl" data-for="${p.id}">${esc(p.name)}</span>`).join('');
    host.addEventListener('click', e => {
      const b = e.target.closest('.rb');
      if (b) select(b.dataset.id);
    });
    ringsBuilt = true;
  }

  function renderRings() {
    const first = !ringsBuilt;
    if (first) buildRings();
    const host = $('rings');
    // 第一次直接就位，之后切换口径时才移动
    host.classList.toggle('still', first);
    const W = host.clientWidth;
    const C = W / 2;
    const R = C - 34;
    // 半径按时间的平方根，近处不至于挤成一团；刻度圈照实标注
    const rad = m => R * Math.sqrt(Math.min(m, 120) / 120);
    const svg = host.querySelector('svg');
    const rings = [120, 60, 30].map(m => `<circle class="ring ring-fill-${m}" cx="${C}" cy="${C}" r="${rad(m)}"/>`).join('')
      + [30, 60, 120].map(m => `<text class="ring-label" x="${C + 4}" y="${C - rad(m) + 12}">${BAND_NAME[m]}</text>`).join('');
    svg.setAttribute('viewBox', `0 0 ${W} ${W}`);

    // 目标位置，再做几轮碰撞松弛，避免照片叠在一起
    const S = 32;
    const nodes = PLACES.map(p => {
      const m = minsOf(p);
      const r = rad(m);
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

    // 地区名放在该地区各点的平均位置外侧
    const cities = AREA_LABEL.map(name => {
      const ns = live.filter(n => n.p.area === name);
      if (!ns.length) return '';
      const mx = ns.reduce((s, n) => s + n.x, 0) / ns.length;
      const my = ns.reduce((s, n) => s + n.y, 0) / ns.length;
      const far = Math.max(...ns.map(n => Math.hypot(n.x - C, n.y - C)));
      const ang = Math.atan2(my - C, mx - C);
      const x = Math.max(24, Math.min(W - 24, C + Math.cos(ang) * (far + 30)));
      const y = Math.max(12, Math.min(W - 4, C + Math.sin(ang) * (far + 30)));
      return `<text class="ring-city" x="${x}" y="${y}" text-anchor="middle">${name}</text>`;
    }).join('');
    svg.innerHTML = rings + cities;

    // 名字：放得下才显示，先近后远
    const boxes = live.map(n => ({ x: n.x - S / 2, y: n.y - S / 2, w: S, h: S }));
    const hit = r => boxes.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    const labels = {};
    [...live].sort((a, b) => minsOf(a.p) - minsOf(b.p)).forEach(n => {
      const w = n.p.name.length * 11 + 4;
      for (const r of [{ x: n.x + 18, y: n.y - 6, w, h: 13 }, { x: n.x - 18 - w, y: n.y - 6, w, h: 13 }, { x: n.x - w / 2, y: n.y + 18, w, h: 13 }]) {
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
      void host.offsetWidth;
      requestAnimationFrame(() => host.classList.remove('still'));
    }
    const outside = PLACES.filter(p => !bandOf(p)).length;
    $('rings-note').textContent = `离中心越远，${MEASURE[state.measure]}单程越久（圈半径按时间的平方根）。${outside ? `另有 ${outside} 处超过2小时，未显示。` : ''}`;
  }

  // ---------- 画册：每档一行大卡 ----------
  function renderBook() {
    const secs = ['30', '60', '120'].filter(b => state.bands.has(b)).map(b => {
      const list = PLACES.filter(p => bandOf(p) === b).sort((x, y) => (y.season.hot - x.season.hot) || minsOf(x) - minsOf(y));
      const cards = list.map(p => `<button type="button" class="bk" data-id="${p.id}">${photo(p)}
        <span class="bk-top">${timeBadge(p)}${p.season.tone !== 'plain' ? `<span class="st tone-${p.season.tone}">${esc(p.season.text)}</span>` : ''}</span>
        <span class="bk-txt"><h3>${esc(p.name)}</h3><p>${esc(p.why)}</p><small>${esc(p.area)} · ${MEASURE[state.measure]} ${minsText(minsOf(p))}</small></span></button>`).join('');
      return `<section class="book-sec"><div class="book-head"><h2><span class="tb tb-${b}">${BAND_NAME[b]}</span>${BAND_TITLE[b]}</h2><small>${MEASURE[state.measure]} · ${list.length} 处</small></div>
        <div class="book-row">${cards || '<p class="book-empty">没有地点。</p>'}</div></section>`;
    }).join('');
    $('view-book').innerHTML = secs;
  }
  $('view-book').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });

  // ---------- 对比：两个口径的时间条 ----------
  const MAXM = 180;
  function renderCompare() {
    const other = state.measure === 'transit' ? 'car' : 'transit';
    const bar = (p, m) => {
      const v = minsOf(p, m);
      const cls = (m === 'transit' ? 't' : 'c') + (m === state.measure ? ' on' : ' off');
      return `<span class="cmp-bar ${cls}"><span><i style="width:${Math.min(v, MAXM) / MAXM * 100}%"></i></span>${m === 'transit' ? '公交' : '自驾'} ${v}分</span>`;
    };
    const secs = ['30', '60', '120'].filter(b => state.bands.has(b)).map(b => {
      const list = PLACES.filter(p => bandOf(p) === b).sort((x, y) => minsOf(x) - minsOf(y));
      const rows = list.map(p => `<button type="button" class="cmp" data-id="${p.id}">${photo(p)}<span>
        <span class="cmp-name"><span>${esc(p.name)}</span><small>${esc(p.area)}</small></span>
        <span class="cmp-bars">${bar(p, state.measure)}${bar(p, other)}</span></span></button>`).join('');
      return `<section class="cmp-sec"><h2><span class="tb tb-${b}">${BAND_NAME[b]}</span>${BAND_TITLE[b]}<small>${list.length} 处 · 按${MEASURE[state.measure]}</small></h2>${rows}</section>`;
    }).join('');
    $('view-compare').innerHTML = `<div class="cmp-key"><span><i style="background:var(--ink)"></i>公共交通</span><span><i style="background:var(--accent)"></i>自驾（不含拥堵）</span><span>刻度每30分</span></div>${secs}`;
  }
  $('view-compare').addEventListener('click', e => {
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
    if (state.view === 'map') {
      const opts = { center: byId[id].ll, zoom: Math.max(map.getZoom(), 11.5), padding: { top: 140, bottom: sheet.offsetHeight + 20, left: 30, right: 30 } };
      reduceMotion ? map.jumpTo(opts) : map.easeTo({ ...opts, duration: 800 });
      queueLayout();
    }
    if (state.view === 'rings') renderRings();
  }

  function closeSheet(fromHash) {
    if (!fromHash && location.hash) history.pushState(null, '', location.pathname + location.search);
    state.sel = null;
    $('sheet').hidden = true;
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
  applyStyle();
  showView(state.view);
  fromHash();
})();
