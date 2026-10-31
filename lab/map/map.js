// 遛弯地图原型：地图做底层，攻略卡悬浮在地点上方。移动、缩放地图时按空间让位：放得下就展开成卡，放不下收成小圆照片或点。
(() => {
  'use strict';

  const D = window.WALK_DATA;
  const G = window.WALK_GEO;
  const $ = id => document.getElementById(id);

  // ---------- 工具 ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const doyMD = s => CUM[+s.slice(0, 2) - 1] + +s.slice(3, 5);
  const doyISO = iso => doyMD(iso.slice(5));
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const fmtISO = iso => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const fare = mins => Math.round((mins * 14 + 160) / 10) * 10;
  const yen = n => '¥' + n.toLocaleString('ja-JP');
  const hrs = h => String(h).replace(/\.0$/, '') + 'h';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = () => matchMedia('(min-width: 900px)').matches;

  const inWin = (d, w) => {
    const s = doyMD(w.from);
    const e = doyMD(w.to);
    return s <= e ? d >= s && d <= e : d >= s || d <= e;
  };

  function seasonState(p) {
    if (!p.seasons.length) return { state: 'always' };
    const d = doyISO(today);
    for (const w of p.seasons) {
      if (inWin(d, w)) return { state: 'now', w, days: (doyMD(w.to) - d + 365) % 365 };
    }
    let best = null;
    for (const w of p.seasons) {
      const days = (doyMD(w.from) - d + 365) % 365;
      if (!best || days < best.days) best = { state: days <= 14 ? 'soon' : 'later', w, days };
    }
    return best;
  }

  function eventState(e) {
    if (today < e.from) {
      const days = daysBetween(today, e.from);
      return { state: days <= 14 ? 'soon' : 'later', days };
    }
    if (today > e.to) return { state: 'over' };
    return { state: 'now', days: daysBetween(today, e.to) };
  }

  const SEKKI = [
    ['01-05', '小寒'], ['01-20', '大寒'], ['02-04', '立春'], ['02-19', '雨水'], ['03-05', '惊蛰'], ['03-20', '春分'],
    ['04-04', '清明'], ['04-20', '谷雨'], ['05-05', '立夏'], ['05-21', '小满'], ['06-05', '芒种'], ['06-21', '夏至'],
    ['07-07', '小暑'], ['07-22', '大暑'], ['08-07', '立秋'], ['08-23', '处暑'], ['09-07', '白露'], ['09-23', '秋分'],
    ['10-08', '寒露'], ['10-23', '霜降'], ['11-07', '立冬'], ['11-22', '小雪'], ['12-07', '大雪'], ['12-21', '冬至']
  ];
  const sekki = () => {
    const d = doyISO(today);
    let cur = SEKKI[SEKKI.length - 1][1];
    for (const [md, name] of SEKKI) if (doyMD(md) <= d) cur = name;
    return cur;
  };

  // ---------- 数据 ----------
  const EVENTS = Object.fromEntries(D.events.map(e => [e.id, { ...e, isEvent: true, seasons: [] }]));
  const ITEMS = [
    ...D.places.map(p => ({ ...p, isEvent: false })),
    ...Object.values(EVENTS)
  ].filter(it => G.items[it.id]).map(it => ({ ...it, ll: G.items[it.id].ll, img: G.items[it.id].img }));
  const byId = Object.fromEntries(ITEMS.map(it => [it.id, it]));

  const attached = {};
  for (const [eid, pid] of Object.entries(G.attach)) (attached[pid] ||= []).push(EVENTS[eid]);
  const liveEvents = it => (attached[it.id] || []).filter(e => eventState(e).state === 'now');

  const footBy = {};
  for (const f of D.footprints) {
    const it = ITEMS.find(x => x.name === f.place);
    if (it) footBy[it.id] = f;
  }

  const wish = new Set(['tofukuji', 'e-genji']);

  // 卡片上的一行状态：文字 + 色调
  function status(it) {
    if (it.isEvent) {
      const s = eventState(it);
      if (s.state === 'now') return { hot: true, tone: 'event', text: s.days <= 30 ? `展期至${fmtISO(it.to)}` : '展期中' };
      if (s.state === 'over') return { hot: false, tone: 'plain', text: '已结束' };
      return { hot: false, tone: 'event', text: `${fmtISO(it.from)}开始` };
    }
    const live = liveEvents(it);
    const s = seasonState(it);
    if (s.state === 'now') return { hot: true, tone: s.w.tone, text: `${s.w.label}正当时` };
    if (live.length) return { hot: true, tone: 'event', text: '有展览' };
    if (s.state === 'soon') return { hot: false, tone: s.w.tone, text: `${s.w.label}${s.days === 1 ? '明天' : s.days + '天后'}开始` };
    if (s.state === 'later') return { hot: false, tone: s.w.tone, text: `${s.w.label} ${+s.w.from.slice(0, 2)}/${+s.w.from.slice(3, 5)}起` };
    return { hot: false, tone: 'plain', text: '全年可去' };
  }

  const FILTERS = [
    ['all', '全部', () => true],
    ['now', '正当时', it => status(it).hot],
    ['half', '半天往返', it => it.mins <= 60],
    ['art', '展览', it => it.isEvent || it.kind === '美术馆'],
    ['nature', '自然寺社', it => ['自然', '寺社', '历史'].includes(it.kind)],
    ['town', '街区美食', it => ['街区', '美食', '校园', '祭典'].includes(it.kind)],
    ['relax', '温泉夜景', it => ['温泉', '夜景', '灯光'].includes(it.kind)],
    ['wish', '想去', it => wish.has(it.id)],
    ['been', '去过', it => Boolean(footBy[it.id])]
  ];
  let filter = 'all';
  const pass = it => eventState(it).state !== 'over' && FILTERS.find(f => f[0] === filter)[2](it);

  // ---------- 地图 ----------
  const STYLE_URL = {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark'
  };
  const TINT = {
    light: { bg: '#F3EEE4', water: '#BCD3DE', park: '#DCE5CD', wood: '#D2DEC1', resid: 'rgba(231,222,206,.55)', building: '#E6DDCD' },
    dark: { bg: '#191B1D', water: '#1A2833', park: '#1E2820', wood: '#1C271E', resid: 'rgba(48,46,42,.35)', building: '#25272A' }
  };

  let theme = 'auto';
  try {
    theme = localStorage.getItem('walk-map-theme') || 'auto';
  } catch {
    theme = 'auto';
  }
  const qTheme = new URLSearchParams(location.search).get('theme');
  if (['auto', 'light', 'dark'].includes(qTheme)) theme = qTheme;
  const schemeMedia = matchMedia('(prefers-color-scheme: dark)');
  const modeOf = () => (theme === 'auto' ? (schemeMedia.matches ? 'dark' : 'light') : theme);
  let mode = modeOf();
  document.documentElement.dataset.mode = mode;

  const map = new maplibregl.Map({
    container: 'map',
    style: STYLE_URL[mode],
    bounds: [[134.98, 34.62], [135.8, 35.03]],
    fitBoundsOptions: { padding: { top: 130, bottom: 150, left: 24, right: 24 } },
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    localIdeographFontFamily: '"Hiragino Sans", "PingFang SC", "Noto Sans CJK JP", sans-serif'
  });
  map.touchZoomRotate.disableRotation();

  function tint() {
    const t = TINT[mode];
    const set = (id, prop, val) => {
      if (map.getLayer(id)) map.setPaintProperty(id, prop, val);
    };
    set('background', 'background-color', t.bg);
    set('water', 'fill-color', t.water);
    set('park', 'fill-color', t.park);
    set('landcover_wood', 'fill-color', t.wood);
    set('landuse_residential', 'fill-color', t.resid);
    set('building', 'fill-color', t.building);
    // 底图文字退后一层，让地点卡做主角
    for (const id of ['label_other', 'label_village', 'highway-name-path', 'highway-name-minor']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    }
    for (const layer of map.getStyle().layers) {
      if (layer.type !== 'symbol' || /shield/.test(layer.id)) continue;
      map.setPaintProperty(layer.id, 'text-opacity', 0.7);
      if (map.getLayoutProperty(layer.id, 'text-field') === undefined) continue;
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:ja'], ['get', 'name:zh'], ['get', 'name']]);
    }
  }
  map.on('style.load', tint);

  // ---------- 地点卡 ----------
  const photo = (it, cls) => (it.img ? `<img${cls ? ` class="${cls}"` : ''} src="${esc(it.img)}" alt="" loading="lazy" decoding="async">` : `<span class="mk-ph${cls ? ' ' + cls : ''}">${esc([...it.name][0])}</span>`);
  const hash = s => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

  const markers = new Map();
  ITEMS.forEach((it, i) => {
    const st = status(it);
    const el = document.createElement('div');
    el.className = 'mk enter' + (st.hot ? ' hot' : '');
    el.dataset.lv = 'dot';
    el.style.setProperty('--tilt', ((hash(it.id) % 7) - 3) * 0.8 + 'deg');
    el.style.setProperty('--delay', (i * 35) + 'ms');
    const badge = wish.has(it.id) ? '<span class="mk-badge" aria-label="想去">♥</span>' : footBy[it.id] ? '<span class="mk-badge" aria-label="去过">✓</span>' : '';
    const txt = `<span class="mk-txt"><b>${esc(it.name)}</b><span class="mk-st tone-${st.tone}">${esc(st.text)}</span><span class="mk-mins">单程 ${it.mins}分</span></span>`;
    el.innerHTML = `<button type="button" class="mk-card" aria-label="${esc(it.name)}，${esc(st.text)}，单程${it.mins}分">${photo(it)}${txt}${badge}</button>`
      + '<span class="mk-pin" role="presentation"></span>';
    el.querySelector('.mk-card').addEventListener('click', e => {
      e.stopPropagation();
      select(it.id);
    });
    el.querySelector('.mk-pin').addEventListener('click', e => {
      e.stopPropagation();
      select(it.id);
    });
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(it.ll).addTo(map);
    markers.set(it.id, { el, marker, lv: 'dot' });
  });
  setTimeout(() => markers.forEach(m => m.el.classList.remove('enter')), 2000);

  function refreshBadge(id) {
    const m = markers.get(id);
    const old = m.el.querySelector('.mk-badge');
    if (old) old.remove();
    const html = wish.has(id) ? '<span class="mk-badge" aria-label="想去">♥</span>' : footBy[id] ? '<span class="mk-badge" aria-label="去过">✓</span>' : '';
    if (html) m.el.querySelector('.mk-card').insertAdjacentHTML('beforeend', html);
  }

  const homeEl = document.createElement('div');
  homeEl.className = 'home';
  homeEl.innerHTML = `<span>${esc(G.home.name)}</span><i></i>`;
  new maplibregl.Marker({ element: homeEl, anchor: 'bottom' }).setLngLat(G.home.ll).addTo(map);

  // 每种卡片样式在屏幕上占的大小（含阴影的余量），用于让位
  const CARD_SIZE = { photo: [182, 80], postcard: [144, 140], stamp: [116, 104] };
  const MINI = [136, 44];
  const BUBBLE = [46, 46];
  let cardStyle = 'photo';
  let sel = null;

  function safeArea() {
    const W = map.getContainer().clientWidth;
    const H = map.getContainer().clientHeight;
    const top = $('filters').getBoundingClientRect().bottom + 4;
    let bottom = $('strip').getBoundingClientRect().top - 4;
    let right = W;
    if (sel) {
      if (desktop()) right = W - 432;
      else bottom = $('sheet').getBoundingClientRect().top - 4;
    }
    if ($('strip').classList.contains('away') && !sel) bottom = H;
    return { left: 0, right, top, bottom, W, H };
  }

  let queued = false;
  function queueLayout() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      layout();
    });
  }

  function layout() {
    const area = safeArea();
    const cx = (area.left + area.right) / 2;
    const cy = (area.top + area.bottom) / 2;
    const hp = map.project(G.home.ll);
    const placed = [{ x: hp.x - 42, y: hp.y - 46, w: 84, h: 46 }];
    const hits = r => placed.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    const inside = r => r.x >= area.left + 4 && r.x + r.w <= area.right - 4 && r.y >= area.top && r.y + r.h <= area.bottom;
    const list = ITEMS.map(it => {
      const p = map.project(it.ll);
      const st = status(it);
      const rank = (it.id === sel ? 1e6 : 0) + (st.hot ? 600 : 0) + (wish.has(it.id) ? 200 : 0) - Math.hypot(p.x - cx, p.y - cy);
      return { it, p, rank };
    }).sort((a, b) => b.rank - a.rank);
    const [cw, ch] = CARD_SIZE[cardStyle];
    for (const { it, p } of list) {
      const m = markers.get(it.id);
      if (!pass(it)) {
        m.el.dataset.hidden = '';
        continue;
      }
      delete m.el.dataset.hidden;
      let lv = 'dot';
      const rc = { x: p.x - cw / 2, y: p.y - ch - 12, w: cw, h: ch };
      const rm = { x: p.x - MINI[0] / 2, y: p.y - MINI[1] - 12, w: MINI[0], h: MINI[1] };
      const rb = { x: p.x - BUBBLE[0] / 2, y: p.y - BUBBLE[1] - 12, w: BUBBLE[0], h: BUBBLE[1] };
      if (it.id === sel || (inside(rc) && !hits(rc))) {
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
      if (it.id === sel) m.el.dataset.sel = '';
      else delete m.el.dataset.sel;
    }
  }

  // ---------- 底部条：视野里的地点，由近到远 ----------
  function renderStrip() {
    const area = safeArea();
    const cx = (area.left + area.right) / 2;
    const cy = (area.top + area.bottom) / 2;
    const seen = ITEMS.filter(pass).map(it => ({ it, p: map.project(it.ll) }))
      .filter(({ p }) => p.x >= 0 && p.x <= area.W && p.y >= 0 && p.y <= area.H)
      .sort((a, b) => Math.hypot(a.p.x - cx, a.p.y - cy) - Math.hypot(b.p.x - cx, b.p.y - cy));
    $('strip-count').textContent = `视野里 ${seen.length} 处`;
    $('strip-list').innerHTML = seen.length
      ? seen.slice(0, 14).map(({ it }) => {
        const st = status(it);
        return `<button type="button" class="strip-item" data-id="${it.id}">${photo(it)}<span><b>${esc(it.name)}</b><span class="tone-${st.tone}">${esc(st.text)}</span><span>${esc(it.area)} · 单程 ${it.mins}分</span></span></button>`;
      }).join('')
      : '<p class="strip-empty">这里没有符合的地点。拖动或缩小地图看看。</p>';
  }

  $('strip-list').addEventListener('click', e => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });

  map.on('move', queueLayout);
  map.on('moveend', renderStrip);
  map.on('load', () => {
    document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    layout();
    renderStrip();
  });
  window.addEventListener('resize', () => {
    queueLayout();
    renderStrip();
  });

  // ---------- 攻略面板 ----------
  const commonsPage = url => {
    const parts = url.split('/thumb/')[1];
    return parts ? 'https://commons.wikimedia.org/wiki/File:' + parts.split('/')[2] : 'https://commons.wikimedia.org/';
  };
  const pct = d => ((d - 1) / 365 * 100).toFixed(2) + '%';

  function yearStrip(it) {
    const bars = [];
    if (it.isEvent) {
      const y = today.slice(0, 4);
      const a = it.from < `${y}-01-01` ? 1 : doyISO(it.from);
      const b = it.to > `${y}-12-31` ? 365 : doyISO(it.to);
      bars.push(`<span class="w tone-event" style="left:${pct(a)};width:calc(${pct(b + 1)} - ${pct(a)})"></span>`);
    } else {
      for (const w of it.seasons) {
        const a = doyMD(w.from);
        const b = doyMD(w.to);
        const segs = a <= b ? [[a, b]] : [[a, 365], [1, b]];
        for (const [s, e] of segs) bars.push(`<span class="w tone-${w.tone}" style="left:${pct(s)};width:calc(${pct(e + 1)} - ${pct(s)})" title="${esc(w.label)}"></span>`);
      }
    }
    return `<div class="sh-year">${bars.join('')}<span class="now" style="left:${pct(doyISO(today) + 0.5)}"></span></div><div class="sh-months">${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>`;
  }

  function renderSheet() {
    const it = byId[sel];
    const st = status(it);
    const cost = fare(it.mins) * 2 + it.fee;
    const evs = liveEvents(it).concat((attached[it.id] || []).filter(e => eventState(e).state === 'soon'));
    const foot = footBy[it.id];
    const route = `https://www.google.com/maps/dir/?api=1&origin=${G.home.ll[1]},${G.home.ll[0]}&destination=${it.ll[1]},${it.ll[0]}&travelmode=transit`;
    const seasonTitle = it.isEvent ? '展期' : it.seasons.length ? '一年里什么时候去' : '';
    $('sheet').innerHTML = `
      <div class="sh-hero">${it.img ? `<img src="${esc(it.img)}" alt="${esc(it.name)}">` : ''}
        ${it.img ? `<a class="sh-credit" href="${esc(commonsPage(it.img))}" target="_blank" rel="noopener noreferrer">图：Wikimedia Commons</a>` : ''}
        <button type="button" class="sh-close" id="sh-close" aria-label="关闭">×</button>
        <div class="sh-title"><h2>${esc(it.name)}</h2><p>${esc(it.area)} · ${esc(it.isEvent ? it.venue : it.kind)}</p></div>
      </div>
      <div class="sh-body">
        <div class="sh-facts">
          <div><small>单程</small><b>${it.mins}分</b></div>
          <div><small>建议</small><b>约${hrs(it.hours)}</b></div>
          <div><small>往返＋门票</small><b>约${yen(cost)}</b></div>
          <div><small>雨天</small><b>${it.rain ? '可去' : '不宜'}</b></div>
        </div>
        <span class="sh-status tone-${st.tone}">${esc(st.text)}</span>
        <h3>为什么去</h3>
        <p>${esc(it.why)}</p>
        <p class="sh-tip">${esc(it.tip)}</p>
        ${evs.length ? `<h3>这里的展览</h3>${evs.map(e => `<div class="sh-ev"><i></i><span>${esc(e.name)}<small>${fmtISO(e.from)}–${fmtISO(e.to)} · ${esc(e.why)}</small></span></div>`).join('')}` : ''}
        ${seasonTitle ? `<h3>${seasonTitle}</h3>${yearStrip(it)}` : ''}
        ${foot ? `<h3>我去过</h3><div class="sh-foot"><small>${esc(foot.date)} · ${'★'.repeat(foot.rating)}${'☆'.repeat(5 - foot.rating)}</small><br>${esc(foot.note)}</div>` : ''}
        <div class="sh-acts">
          <button type="button" id="sh-wish" aria-pressed="${wish.has(it.id)}">${wish.has(it.id) ? '已想去' : '想去'}</button>
          <a href="${route}" target="_blank" rel="noopener noreferrer">从${esc(G.home.name)}怎么去</a>
        </div>
      </div>`;
    $('sh-close').addEventListener('click', () => closeSheet());
    $('sh-wish').addEventListener('click', () => {
      wish.has(it.id) ? wish.delete(it.id) : wish.add(it.id);
      refreshBadge(it.id);
      renderSheet();
      renderFilters();
    });
  }

  function select(id, fromHash) {
    if (!byId[id]) return;
    const fresh = sel !== id;
    if (!fromHash && location.hash !== '#p=' + id) history.pushState(null, '', '#p=' + id);
    sel = id;
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
    if (!desktop()) $('strip').classList.add('away');
    const it = byId[id];
    const padding = desktop()
      ? { top: 140, bottom: 160, left: 40, right: 460 }
      : { top: 120, bottom: sheet.offsetHeight + 20, left: 30, right: 30 };
    const opts = { center: it.ll, zoom: Math.max(map.getZoom(), 12.5), padding };
    reduceMotion ? map.jumpTo(opts) : map.easeTo({ ...opts, duration: 900 });
    queueLayout();
  }

  function closeSheet(fromHash) {
    if (fromHash !== true && location.hash) history.pushState(null, '', location.pathname);
    sel = null;
    $('sheet').hidden = true;
    document.body.classList.remove('has-sheet');
    $('strip').classList.remove('away');
    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    queueLayout();
    renderStrip();
  }

  map.on('click', () => {
    if (sel) closeSheet();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && sel) closeSheet();
  });

  // 地址：#p=<地点id> 打开该地点；后退键关闭
  function fromHash() {
    const m = location.hash.match(/^#p=([\w-]+)/);
    if (m && byId[m[1]]) select(m[1], true);
    else if (sel) closeSheet(true);
  }
  window.addEventListener('popstate', fromHash);

  // ---------- 筛选 ----------
  function renderFilters() {
    $('filters').innerHTML = FILTERS.map(([v, t, fn]) => {
      const n = ITEMS.filter(it => eventState(it).state !== 'over' && fn(it)).length;
      return `<button type="button" data-f="${v}" aria-pressed="${filter === v}">${t}<small>${n}</small></button>`;
    }).join('');
  }
  $('filters').addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    renderFilters();
    layout();
    renderStrip();
  });

  // ---------- 原型设置 ----------
  const segHTML = (opts, cur, key) => opts.map(([v, t]) => `<button type="button" data-${key}="${v}" aria-pressed="${v === cur}">${t}</button>`).join('');
  function renderProto() {
    $('style-seg').innerHTML = segHTML([['photo', '照片卡'], ['postcard', '明信片'], ['stamp', '圆章']], cardStyle, 'style');
    $('theme-seg').innerHTML = segHTML([['auto', '跟随'], ['light', '浅色'], ['dark', '深色']], theme, 'theme');
  }
  $('proto-btn').addEventListener('click', () => {
    const panel = $('proto-panel');
    panel.hidden = !panel.hidden;
    $('proto-btn').setAttribute('aria-expanded', String(!panel.hidden));
  });
  $('proto-panel').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.style) {
      cardStyle = b.dataset.style;
      document.body.dataset.style = cardStyle;
      layout();
    }
    if (b.dataset.theme) {
      theme = b.dataset.theme;
      try {
        localStorage.setItem('walk-map-theme', theme);
      } catch {
        // 记不住主题也无妨
      }
      applyMode();
    }
    renderProto();
  });

  function applyMode() {
    const next = modeOf();
    if (next === mode) return;
    mode = next;
    document.documentElement.dataset.mode = mode;
    map.setStyle(STYLE_URL[mode]);
  }
  schemeMedia.addEventListener('change', applyMode);

  const qs = new URLSearchParams(location.search);
  if (['photo', 'postcard', 'stamp'].includes(qs.get('style'))) {
    cardStyle = qs.get('style');
    document.body.dataset.style = cardStyle;
  }

  $('today').textContent = `${+today.slice(5, 7)}月${+today.slice(8, 10)}日 · ${sekki()}`;
  renderFilters();
  renderProto();
  // 不等瓦片全部加载：卡片和地址先就位
  layout();
  renderStrip();
  fromHash();
})();
