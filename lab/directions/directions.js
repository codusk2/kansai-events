// 遛弯改版对比页：四个方向共用 WALK_DATA，各自一个 render 函数。只在本机预览，不部署。
(() => {
  'use strict';

  const D = window.WALK_DATA;
  const screen = document.getElementById('screen');
  const notesEl = document.getElementById('notes');

  // ---------- 工具 ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const doyMD = s => CUM[+s.slice(0, 2) - 1] + +s.slice(3, 5);
  const doyISO = iso => doyMD(iso.slice(5));
  const isoAdd = (iso, n) => {
    const t = new Date(iso + 'T12:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
  const fmtISO = iso => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;
  const fmtMD = s => `${+s.slice(0, 2)}/${+s.slice(3, 5)}`;
  const WEEK = '日一二三四五六';
  const dow = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const fare = mins => Math.round((mins * 14 + 160) / 10) * 10;
  const yen = n => '¥' + n.toLocaleString('ja-JP');
  const hrs = m => (Math.round(m / 6) / 10).toString().replace(/\.0$/, '') + 'h';

  const inWin = (d, w) => {
    const s = doyMD(w.from);
    const e = doyMD(w.to);
    return s <= e ? d >= s && d <= e : d >= s || d <= e;
  };

  function seasonState(p, iso) {
    if (!p.seasons.length) return { state: 'always' };
    const d = doyISO(iso);
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

  function eventState(e, iso) {
    if (iso < e.from) {
      const days = daysBetween(iso, e.from);
      return { state: days <= 14 ? 'soon' : 'later', days };
    }
    if (iso > e.to) return { state: 'over' };
    return { state: 'now', days: daysBetween(iso, e.to) };
  }

  const ITEMS = [
    ...D.places.map(p => ({ ...p, isEvent: false })),
    ...D.events.map(e => ({ ...e, isEvent: true, seasons: [] }))
  ];
  const byId = Object.fromEntries(ITEMS.map(x => [x.id, x]));
  const stateOf = (it, iso) => (it.isEvent ? eventState(it, iso) : seasonState(it, iso));

  function statusText(it, iso) {
    const s = stateOf(it, iso);
    if (it.isEvent) {
      if (s.state === 'now') return s.days <= 30 ? `${fmtISO(it.to)}结束` : '展期中';
      if (s.state === 'over') return '已结束';
      return `${fmtISO(it.from)}开始`;
    }
    if (s.state === 'now') return `${s.w.label}正当时`;
    if (s.state === 'soon') return `${s.w.label}${s.days === 1 ? '明天' : s.days + '天后'}开始`;
    if (s.state === 'later') return `${s.w.label} ${fmtMD(s.w.from)}起`;
    return '全年';
  }

  // 四个方向共用的「想去」
  const wish = new Set(['tofukuji', 'e-genji']);
  const wishBtn = id => `<button type="button" class="wish" data-wish="${id}" aria-pressed="${wish.has(id)}">${wish.has(id) ? '已想去' : '想去'}</button>`;

  const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" style="fill:var(--accent)"/><path d="M7 22c4.5 0 4.5-7 9-7s4.5 7 9 7" fill="none" stroke-width="2.6" stroke-linecap="round" style="stroke:var(--accent-ink)"/><circle cx="23.5" cy="10.5" r="2.8" style="fill:var(--accent-ink)"/></svg>`;
  const top = () => `<div class="p-top"><div class="p-brand">${LOGO}遛弯</div><span class="p-from">从 ${esc(D.home)} 出发</span></div>`;
  const seg = (name, opts, cur) => `<div class="seg" role="group">${opts.map(([v, t]) => `<button type="button" data-${name}="${v}" aria-pressed="${String(v) === String(cur)}">${t}</button>`).join('')}</div>`;

  // ---------- A 决策台 ----------
  const A = { span: 'day', when: 'today', rain: false, prefs: new Set(['红叶']), open: new Set(), tab: 'plans' };
  const PREFS = ['红叶', '展览', '美食', '温泉', '夜景', '少走路'];

  function whenISO(w) {
    if (w === 'today') return today;
    if (w === 'tomorrow') return isoAdd(today, 1);
    let off = (6 - dow(today) + 7) % 7 || 7;
    if (off === 1) off += 7;
    return isoAdd(today, off);
  }

  function itemScore(it, ctx) {
    let s = 1;
    const why = [];
    const st = stateOf(it, ctx.date);
    if (it.isEvent) {
      if (st.state !== 'now') return null;
      s += 2;
      if (st.days <= 30) {
        s += 1;
        why.push(`展期至${fmtISO(it.to)}`);
      }
    } else if (st.state === 'now') {
      s += 3;
      why.push(`${st.w.label}正当时`);
    } else if (st.state === 'soon') {
      s += 1;
      why.push(statusText(it, ctx.date));
    }
    const tags = [...it.tags, it.kind];
    const hit = [...ctx.prefs].filter(p => tags.includes(p)).length;
    if (hit) {
      s += hit * 2;
      why.push('合你的偏好');
    }
    if (ctx.rain) {
      if (it.rain) {
        s += 1;
        why.push('雨天可去');
      } else {
        s -= 4;
      }
    }
    if (ctx.prefs.has('少走路') && it.tags.includes('徒步')) s -= 2;
    s -= (it.crowd - 1) * 0.5;
    return { s, why };
  }

  function makePlans(ctx) {
    const budget = ctx.span === 'half' ? 330 : 600;
    const scored = ITEMS.map(it => ({ it, r: itemScore(it, ctx) })).filter(x => x.r);
    const cands = [];
    for (const a of scored) {
      const total = 2 * a.it.mins + a.it.hours * 60;
      if (total <= budget) cands.push({ parts: [a], total });
    }
    if (ctx.span === 'day') {
      for (let i = 0; i < scored.length; i++) {
        for (let j = i + 1; j < scored.length; j++) {
          const a = scored[i];
          const b = scored[j];
          if (a.it.area !== b.it.area) continue;
          const total = 2 * Math.max(a.it.mins, b.it.mins) + (a.it.hours + b.it.hours) * 60 + 30;
          // 夜景放在后面，其余按分数先后
          const parts = [a, b].sort((x, y) => (x.it.kind === '夜景') - (y.it.kind === '夜景') || y.r.s - x.r.s);
          if (total <= budget) cands.push({ parts, total });
        }
      }
    }
    for (const c of cands) {
      const road = 2 * Math.max(...c.parts.map(p => p.it.mins));
      c.road = road;
      c.cost = fare(road / 2) * 2 + c.parts.reduce((n, p) => n + p.it.fee, 0);
      c.crowd = Math.max(...c.parts.map(p => p.it.crowd));
      c.score = c.parts.reduce((n, p) => n + p.r.s, 0) - (road / budget) * 3;
      if (ctx.span === 'day' && c.total < 360) c.score -= 1.5;
    }
    cands.sort((a, b) => b.score - a.score);
    const out = [];
    const used = new Set();
    for (const c of cands) {
      if (c.parts.some(p => used.has(p.it.id))) continue;
      c.parts.forEach(p => used.add(p.it.id));
      out.push(c);
      if (out.length === 3) break;
    }
    return out;
  }

  function renderA() {
    const date = whenISO(A.when);
    const ctx = { span: A.span, date, rain: A.rain, prefs: A.prefs };
    const plans = makePlans(ctx);
    const max = k => Math.max(1, ...plans.map(p => p[k]));
    const whenLabel = { today: '今天', tomorrow: '明天', sat: '下周六' }[A.when];
    let body = '';
    if (A.tab === 'wish') {
      body = wishList(date);
    } else {
      body = `
        <h1 class="a-h1">${whenLabel}${A.span === 'half' ? '半天' : '一天'}，去哪？<small class="num">${fmtISO(date)} 周${WEEK[dow(date)]} · ${A.rain ? '雨' : '晴'}（示意，正式版接预报）</small></h1>
        <div class="a-cond">
          <div class="a-row"><span>时间</span>${seg('span', [['half', '半天'], ['day', '一天']], A.span)}</div>
          <div class="a-row"><span>哪天</span>${seg('when', [['today', '今天'], ['tomorrow', '明天'], ['sat', '下周六']], A.when)}</div>
          <div class="a-row"><span>天气</span>${seg('rain', [['0', '晴'], ['1', '雨']], A.rain ? '1' : '0')}</div>
          <div class="a-row"><span>偏好</span><div class="chips">${PREFS.map(p => `<button type="button" class="chip" data-pref="${p}" aria-pressed="${A.prefs.has(p)}">${p}</button>`).join('')}</div></div>
        </div>
        <h2 class="sec-title">${plans.length} 个方案<small>按季节、展期、路程排序</small></h2>
        <div class="a-plans">
          ${plans.length ? plans.map((p, i) => planCard(p, i, max, date)).join('') : '<p class="a-empty">这些条件下没有合适的地方。可以放宽时间或偏好。</p>'}
        </div>`;
    }
    screen.innerHTML = `<div class="proto">${top()}${body}
      <nav class="tabbar">${[['plans', '方案'], ['wish', `想去 ${wish.size}`]].map(([v, t]) => `<button type="button" data-atab="${v}" aria-pressed="${A.tab === v}">${t}</button>`).join('')}</nav></div>`;
  }

  function planCard(p, i, max, date) {
    const names = p.parts.map(x => x.it.isEvent ? x.it.name : x.it.name);
    const id = p.parts.map(x => x.it.id).join('+');
    const why = [...new Set(p.parts.flatMap(x => x.r.why))].slice(0, 4);
    const mins = p.parts[0].it.mins;
    const line = [`<span>去 ${mins}分</span>`]
      .concat(p.parts.map(x => `<span class="arrow">→</span><b>${esc(x.it.isEvent ? x.it.venue : x.it.name)}</b><span>${hrs(x.it.hours * 60)}</span>`))
      .concat([`<span class="arrow">→</span><span>回</span>`]).join(' ');
    const metric = (label, v, m, text) => `<div class="a-metric"><span>${label}</span><span class="bar"><i style="width:${Math.round(v / m * 100)}%"></i></span><span class="val">${text}</span></div>`;
    const open = A.open.has(id);
    return `<article class="a-plan${i === 0 ? ' first' : ''}">
      <div class="a-plan-head"><div><div class="a-rank">${i === 0 ? '最推荐' : '方案 ' + (i + 1)} · ${esc(p.parts[0].it.area)}</div><h3>${names.map(esc).join(' ＋ ')}</h3></div>${wishBtn(p.parts[0].it.id)}</div>
      <div class="a-line num">${line}</div>
      <div class="a-metrics">
        ${metric('总时长', p.total, max('total'), hrs(p.total))}
        ${metric('路上', p.road, max('road'), p.road + '分')}
        ${metric('花费', p.cost, max('cost'), '约' + yen(p.cost))}
        ${metric('拥挤', p.crowd, 3, ['少', '中', '多'][p.crowd - 1])}
      </div>
      <ul class="a-why">${why.map(w => `<li>${esc(w)}</li>`).join('')}${p.crowd === 3 ? '<li class="warn">人多，早到</li>' : ''}</ul>
      ${open ? `<div class="a-more">${p.parts.map(x => `<p><b>${esc(x.it.name)}</b>：${esc(x.it.why)}${esc(x.it.tip)}</p>`).join('')}</div>` : ''}
      <button type="button" class="a-toggle" data-open="${id}">${open ? '收起' : '怎么玩'}</button>
    </article>`;
  }

  function wishList(date) {
    const items = [...wish].map(id => byId[id]).filter(Boolean);
    if (!items.length) return '<p class="a-empty">还没有想去的地方。</p>';
    return `<h2 class="sec-title">想去<small>${items.length} 处</small></h2><div class="a-plans">${items.map(it => `
      <article class="a-plan"><div class="a-plan-head"><div><div class="a-rank">${esc(it.area)} · ${esc(statusText(it, date))}</div><h3>${esc(it.name)}</h3></div>${wishBtn(it.id)}</div>
      <div class="a-line num"><span>单程 ${it.mins}分 · 约${hrs(it.hours * 60)}</span></div></article>`).join('')}</div>`;
  }

  screen.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.wish) {
      const id = t.dataset.wish;
      wish.has(id) ? wish.delete(id) : wish.add(id);
      RENDER[dir]();
      return;
    }
    if (dir === 'a') clickA(t);
    if (dir === 'b') clickB(t);
    if (dir === 'c') clickC(t, e);
    if (dir === 'd') clickD(t);
  });

  function clickA(t) {
    const d = t.dataset;
    if (d.span) A.span = d.span;
    else if (d.when) A.when = d.when;
    else if (d.rain) A.rain = d.rain === '1';
    else if (d.pref) A.prefs.has(d.pref) ? A.prefs.delete(d.pref) : A.prefs.add(d.pref);
    else if (d.open) A.open.has(d.open) ? A.open.delete(d.open) : A.open.add(d.open);
    else if (d.atab) {
      A.tab = d.atab;
      screen.scrollTop = 0;
    } else return;
    renderA();
  }

  // ---------- B 时令 ----------
  // month 为空时看今天；选了月份就按整月判断（窗口与该月有重叠即算这个月）
  const B = { month: null, filter: 'soon', open: null };
  const MONTH_TONE = {
    light: ['#E3E5E7', '#E6C7D2', '#F1CCD3', '#F3D6DB', '#CFE3C4', '#B8D2BE', '#BDD8E5', '#A8CCDF', '#E8D5A6', '#E6B68A', '#D88B69', '#D8D3CB'],
    dark: ['#9EA3A8', '#B48C9B', '#C79AA3', '#C8A2A9', '#94AE8B', '#82A08B', '#86A6B5', '#7499AD', '#B6A273', '#B6865D', '#B0644A', '#A39E96']
  };
  const SEKKI = [
    ['01-05', '小寒'], ['01-20', '大寒'], ['02-04', '立春'], ['02-19', '雨水'], ['03-05', '惊蛰'], ['03-20', '春分'],
    ['04-04', '清明'], ['04-20', '谷雨'], ['05-05', '立夏'], ['05-21', '小满'], ['06-05', '芒种'], ['06-21', '夏至'],
    ['07-07', '小暑'], ['07-22', '大暑'], ['08-07', '立秋'], ['08-23', '处暑'], ['09-07', '白露'], ['09-23', '秋分'],
    ['10-08', '寒露'], ['10-23', '霜降'], ['11-07', '立冬'], ['11-22', '小雪'], ['12-07', '大雪'], ['12-21', '冬至']
  ];
  const SEASON_NAME = ['隆冬', '冬末', '早春', '春', '初夏', '梅雨', '盛夏', '盛夏', '初秋', '秋', '晚秋', '初冬'];

  function sekki(iso) {
    const d = doyISO(iso);
    let cur = SEKKI[SEKKI.length - 1];
    let next = SEKKI[0];
    for (let i = 0; i < SEKKI.length; i++) {
      if (doyMD(SEKKI[i][0]) <= d) {
        cur = SEKKI[i];
        next = SEKKI[(i + 1) % SEKKI.length];
      }
    }
    return { cur: cur[1], next: next[1], nextDate: fmtMD(next[0]) };
  }

  function segments(it, year) {
    if (it.isEvent) {
      const y0 = `${year}-01-01`;
      const y1 = `${year}-12-31`;
      if (it.to < y0 || it.from > y1) return [];
      const a = it.from < y0 ? 1 : doyISO(it.from);
      const cut = it.to > y1;
      const b = cut ? 365 : doyISO(it.to);
      return [{ a, b, cls: 'ev', cut }];
    }
    if (!it.seasons.length) return [{ all: true }];
    const out = [];
    for (const w of it.seasons) {
      const a = doyMD(w.from);
      const b = doyMD(w.to);
      if (a <= b) out.push({ a, b, cls: 'tone-' + w.tone, label: w.label });
      else {
        out.push({ a, b: 365, cls: 'tone-' + w.tone, label: w.label });
        out.push({ a: 1, b, cls: 'tone-' + w.tone, label: w.label });
      }
    }
    return out;
  }

  const pct = d => ((d - 1) / 365 * 100).toFixed(2) + '%';

  const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function monthState(it, y, m) {
    const mm = String(m).padStart(2, '0');
    const a = `${y}-${mm}-01`;
    const b = `${y}-${mm}-${MDAYS[m - 1]}`;
    if (it.isEvent) {
      if (it.to < a || it.from > b) return { state: it.to < a ? 'over' : 'later', days: 999 };
      return { state: 'now', days: daysBetween(a, it.to) };
    }
    if (!it.seasons.length) return { state: 'always' };
    const s0 = doyISO(a);
    const s1 = doyISO(b);
    for (const w of it.seasons) {
      for (let d = s0; d <= s1; d++) {
        if (inWin(d, w)) return { state: 'now', w, days: 0 };
      }
    }
    return { state: 'later', days: 999, w: it.seasons[0] };
  }

  function bMonthText(it, st) {
    if (st.state !== 'now') return it.seasons.length ? statusText(it, today) : '全年';
    if (it.isEvent) return `展期 ${fmtISO(it.from)}–${fmtISO(it.to)}`;
    return `${st.w.label} ${fmtMD(st.w.from)}–${fmtMD(st.w.to)}`;
  }

  function renderB() {
    const tm = +today.slice(5, 7);
    const byMonth = B.month !== null;
    const month = byMonth ? B.month : tm;
    const year = month < tm ? +today.slice(0, 4) + 1 : +today.slice(0, 4);
    const iso = byMonth ? `${year}-${String(month).padStart(2, '0')}-01` : today;
    const d = byMonth ? doyISO(`${year}-${String(month).padStart(2, '0')}-15`) : doyISO(today);
    const sk = sekki(byMonth ? `${year}-${String(month).padStart(2, '0')}-15` : today);
    const mode = document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
    const st0 = it => (byMonth ? monthState(it, year, month) : stateOf(it, today));
    const label = (it, st) => (byMonth ? bMonthText(it, st) : statusText(it, today));
    const ranked = ITEMS.map(it => ({ it, st: st0(it) })).filter(x => x.st.state !== 'over');
    const order = { now: 0, soon: 1, later: 2, always: 3 };
    ranked.sort((a, b) => order[a.st.state] - order[b.st.state] || (a.st.days ?? 999) - (b.st.days ?? 999));
    const filter = byMonth && B.filter === 'soon' ? 'now' : B.filter;
    const shown = ranked.filter(x => filter === 'all' || x.st.state === 'now' || (filter === 'soon' && x.st.state === 'soon'));
    const nowItems = ranked.filter(x => x.st.state === 'now');
    const counts = {};
    nowItems.forEach(x => {
      const k = x.it.isEvent ? '展览活动' : x.st.w.label;
      counts[k] = (counts[k] || 0) + 1;
    });
    const band = MONTH_TONE[mode].map((c, i) => `<button type="button" data-month="${i + 1}" style="background:${c}" aria-pressed="${i + 1 === month}" aria-label="看${i + 1}月">${i + 1}</button>`).join('');
    const rows = shown.map(({ it, st }) => {
      const segs = segments(it, year).map(s => s.all
        ? '<span class="w all"></span>'
        : `<span class="w ${s.cls}" style="left:${pct(s.a)};width:calc(${pct(s.b + 1)} - ${pct(s.a)})"></span>${s.cut ? '<span class="cut">→</span>' : ''}`).join('');
      const open = B.open === it.id;
      return `<button type="button" class="b-row" data-row="${it.id}" aria-expanded="${open}">
        <span class="b-name${st.state === 'now' ? ' now' : ''}">${esc(it.name)}<small>${esc(it.area)} · ${esc(label(it, st))}</small></span>
        <span class="b-track">${segs}<span class="now" style="left:${pct(d + 0.5)}"></span></span>
        ${open ? `<span class="b-detail"><span class="b-meta num"><span>单程 ${it.mins}分</span><span>约${hrs(it.hours * 60)}</span><span>${it.fee ? yen(it.fee) : '免费'}</span></span><span>${esc(it.why)}${esc(it.tip)}</span><span>${wishBtn(it.id)}</span></span>` : ''}
      </button>`;
    }).join('');
    screen.innerHTML = `<div class="proto">${top()}
      <div class="b-hero">
        <div class="b-date num">${byMonth ? `${year}年${month}月` : `${month}月${+today.slice(8, 10)}日`}</div>
        <div class="b-season"><b>${SEASON_NAME[month - 1]}</b><span>${sk.cur} · 下一个节气${sk.next} ${sk.nextDate}</span></div>
      </div>
      <div class="b-year"><div class="b-band">${band}</div><span class="b-now" style="left:${pct(d + 0.5)}"></span></div>
      <div class="b-tools">${byMonth ? seg('bf', [['now', '这个月'], ['all', '全部']], filter) : seg('bf', [['now', '正当时'], ['soon', '两周内'], ['all', '全部']], filter)}${byMonth ? '<button type="button" class="b-reset" data-reset="1">回到今天</button>' : ''}</div>
      <p class="b-summary">${Object.keys(counts).length ? (byMonth ? '这个月：' : '正当时：') + Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(' · ') : '没有正当时的地点'}</p>
      <div class="b-list">
        <div class="b-axis"><span>${year}</span><span class="ticks">${Array.from({ length: 12 }, (_, i) => `<span>${i + 1}</span>`).join('')}</span></div>
        ${rows || '<p class="a-empty">没有符合的地点。</p>'}
      </div>
      <div class="b-legend"><span><i class="tone-koyo"></i>红叶</span><span><i class="tone-sakura"></i>樱</span><span><i class="tone-ume"></i>梅</span><span><i class="tone-green"></i>新绿</span><span><i class="tone-onsen"></i>泡汤</span><span><i style="background:var(--event);height:4px"></i>展期</span></div>
    </div>`;
  }

  function clickB(t) {
    const d = t.dataset;
    if (d.month) {
      const m = +d.month;
      B.month = m === +today.slice(5, 7) && B.month === null ? null : m;
      B.open = null;
    } else if (d.bf) B.filter = d.bf;
    else if (d.reset) {
      B.month = null;
      B.filter = 'soon';
    }
    else if (d.row) B.open = B.open === d.row ? null : d.row;
    else return;
    renderB();
  }

  // ---------- C 时间圈 ----------
  const C = { limit: 120, group: 'all', sel: null };
  const GROUPS = [['all', '全部'], ['nature', '自然'], ['temple', '寺社历史'], ['art', '展览'], ['town', '街区美食'], ['relax', '温泉夜景']];
  const groupOf = it => ({ 自然: 'nature', 寺社: 'temple', 历史: 'temple', 美术馆: 'art', 展览: 'art', 灯光: 'relax', 街区: 'town', 美食: 'town', 温泉: 'relax', 夜景: 'relax' }[it.kind] || 'town');
  const SIZE = 360;
  const CEN = 180;
  const R120 = 160;
  const rad = m => Math.max(14, m / 120 * R120);
  const pos = (deg, r) => [CEN + r * Math.sin(deg * Math.PI / 180), CEN - r * Math.cos(deg * Math.PI / 180)];
  const CITIES = [['京都', 56, 152], ['大阪', 90, 98], ['奈良', 108, 142], ['姬路', 278, 84], ['明石', 258, 44], ['有马', 12, 82], ['神户', 52, 40]];

  function renderC() {
    const iso = today;
    const visible = it => it.mins <= C.limit && (C.group === 'all' || groupOf(it) === C.group) && stateOf(it, iso).state !== 'over';
    const rings = [15, 30, 60, 90, 120].map(m => {
      const r = rad(m);
      const [lx, ly] = pos(214, r);
      return `<circle class="ring${m > C.limit ? ' out' : ''}" cx="${CEN}" cy="${CEN}" r="${r}"/><text class="ring-label" x="${lx}" y="${ly}" text-anchor="middle" dy="3">${m}′</text>`;
    }).join('');
    const cities = CITIES.map(([n, deg, r]) => {
      const [x, y] = pos(deg, r);
      return `<text class="city" x="${x}" y="${y}" text-anchor="middle">${n}</text>`;
    }).join('');
    const items = ITEMS.filter(it => stateOf(it, iso).state !== 'over');
    const dots = items.map(it => {
      const [x, y] = pos(it.bearing, rad(it.mins));
      const hot = stateOf(it, iso).state === 'now' && (it.isEvent || it.seasons.length);
      const cls = ['dot', hot ? 'hot' : '', visible(it) ? '' : 'dim', C.sel === it.id ? 'sel' : ''].join(' ');
      const shape = it.isEvent
        ? `<rect class="mark" x="${x - 4.5}" y="${y - 4.5}" width="9" height="9" rx="1.5" transform="rotate(45 ${x} ${y})"/>`
        : `<circle class="mark" cx="${x}" cy="${y}" r="5.5"/>`;
      const halo = hot && visible(it) ? `<circle class="halo" cx="${x}" cy="${y}" r="11"/>` : '';
      return `<g class="${cls}" data-dot="${it.id}" role="button" tabindex="0" aria-label="${esc(it.name)}，单程${it.mins}分">${halo}${shape}<circle class="hit" cx="${x}" cy="${y}" r="13"/></g>`;
    }).join('');
    const sea = `<path d="M0 ${CEN + 12} C 90 ${CEN + 16} 150 ${CEN + 9} ${CEN} ${CEN + 7} C 232 ${CEN + 4} 268 ${CEN + 2} 292 ${CEN + 28} C 314 ${CEN + 62} 326 ${CEN + 120} 336 ${SIZE} L 0 ${SIZE} Z" style="fill:var(--sea)"/>`;
    const home = `<circle cx="${CEN}" cy="${CEN}" r="9" style="fill:var(--ink)"/><text x="${CEN}" y="${CEN + 3.5}" text-anchor="middle" style="fill:var(--bg);font-size:9px;font-weight:700">家</text>`;
    const list = items.filter(visible).sort((a, b) => a.mins - b.mins);
    const sel = C.sel && byId[C.sel];
    const sheet = sel ? `<div class="c-sheet" role="dialog" aria-label="${esc(sel.name)}">
        <div class="row" style="margin-top:0"><div><h3>${esc(sel.name)}</h3><div class="meta">${esc(sel.area)} · ${esc(sel.kind)} · 约${hrs(sel.hours * 60)} · ${sel.fee ? yen(sel.fee) : '免费'}</div></div><button type="button" class="c-close" data-close="1" aria-label="关闭">×</button></div>
        <p>${esc(sel.why)}</p><p style="color:var(--muted)">${esc(sel.tip)}</p>
        <div class="row"><div class="big">${sel.mins}<small>分 单程</small></div><span style="font-size:.8rem;color:var(--accent)">${esc(statusText(sel, iso))}</span>${wishBtn(sel.id)}</div>
      </div>` : '';
    screen.innerHTML = `<div class="proto">${top()}
      <div class="c-map"><svg viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="以新長田为圆心的单程时间图">
        <defs><clipPath id="c-clip"><circle cx="${CEN}" cy="${CEN}" r="${R120 + 14}"/></clipPath></defs>
        <g clip-path="url(#c-clip)">${sea}</g><text class="city" x="96" y="${CEN + 70}" text-anchor="middle">海</text>
        <text x="${CEN}" y="10" text-anchor="middle" class="ring-label">北</text>
        ${rings}${cities}${home}${dots}
      </svg></div>
      <div class="c-key"><span><i class="hot"></i>当季 / 展期中</span><span><i></i>地点</span><span><i class="ev"></i>活动</span></div>
      <div class="c-controls">
        <div><div class="lbl">单程不超过</div>${seg('limit', [[30, '30分'], [60, '1小时'], [90, '1.5小时'], [120, '2小时']], C.limit)}</div>
        <div class="chips">${GROUPS.map(([v, t]) => `<button type="button" class="chip" data-group="${v}" aria-pressed="${C.group === v}">${t}</button>`).join('')}</div>
      </div>
      <h2 class="sec-title">由近到远<small>${list.length} 处</small></h2>
      <div class="c-list">${list.map(it => `<button type="button" class="c-item" data-dot="${it.id}"><span class="m">${it.mins}<small>分</small></span><span class="n">${esc(it.name)}<small>${esc(it.area)} · ${esc(it.kind)}</small></span><span class="st">${stateOf(it, iso).state === 'now' && (it.isEvent || it.seasons.length) ? esc(statusText(it, iso)) : ''}</span></button>`).join('') || '<p class="a-empty">这个范围里没有地点。</p>'}</div>
      ${sheet}
    </div>`;
  }

  function clickC(t) {
    const d = t.dataset;
    if (d.limit) C.limit = +d.limit;
    else if (d.group) C.group = d.group;
    else if (d.close) C.sel = null;
    else if (d.dot) C.sel = d.dot;
    else return;
    renderC();
  }

  // SVG 里的点不是 button，单独处理
  screen.addEventListener('click', e => {
    if (dir !== 'c') return;
    const g = e.target.closest('g[data-dot]');
    if (!g) return;
    C.sel = g.dataset.dot;
    renderC();
  });
  screen.addEventListener('keydown', e => {
    if (dir !== 'c' || (e.key !== 'Enter' && e.key !== ' ')) return;
    const g = e.target.closest('g[data-dot]');
    if (!g) return;
    e.preventDefault();
    C.sel = g.dataset.dot;
    renderC();
  });

  // ---------- D 攻略册 ----------
  const AREAS = ['京都', '大阪', '神户', '奈良', '近郊'];
  const Dd = { area: '京都', tab: 'guide', dialog: null, foot: D.footprints.map(f => ({ ...f })) };
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  function dCard(it, iso, badge) {
    return `<article class="d-card"><div class="d-card-head"><div>${badge ? `<span class="d-badge">${esc(statusText(it, iso))}</span>` : ''}<h3>${esc(it.isEvent ? it.name : it.name)}</h3><div class="meta num">${it.isEvent ? esc(it.venue) + ' · ' : ''}单程 ${it.mins}分 · 约${hrs(it.hours * 60)} · ${it.fee ? yen(it.fee) : '免费'}</div></div>${wishBtn(it.id)}</div><p>${esc(it.why)}</p><p class="tip">${esc(it.tip)}</p></article>`;
  }

  function footEntry(f) {
    return `<div class="d-foot"><div class="head"><b>${esc(f.place)}</b><span class="stars" aria-label="喜欢程度${f.rating}">${stars(f.rating)}</span></div><div class="when num">${esc(f.area)} · ${esc(f.date)}</div><p>${esc(f.note)}</p></div>`;
  }

  function renderD() {
    const iso = today;
    let body = '';
    if (Dd.tab === 'guide') {
      const area = Dd.area;
      const info = D.areas[area];
      const route = D.routes[area];
      const inArea = ITEMS.filter(it => it.area === area && stateOf(it, iso).state !== 'over');
      // 本月推荐：正当时，或30天内开始
      const hot = inArea.filter(it => {
        const st = stateOf(it, iso);
        return (it.isEvent || it.seasons.length) && (st.state === 'now' || st.days <= 30);
      });
      const rest = inArea.filter(it => !hot.includes(it));
      const feet = Dd.foot.filter(f => f.area === area);
      const nowLabels = [...new Set(hot.map(it => it.isEvent ? '展览' : stateOf(it, iso).w.label))];
      body = `
        <nav class="d-areas">${AREAS.map(a => `<button type="button" data-area="${a}" aria-pressed="${a === area}">${a}</button>`).join('')}</nav>
        <div class="d-hero"><h1>${area}</h1><p>${esc(info.line)}</p></div>
        <div class="d-facts"><div><small>单程</small><b>${info.range}</b></div><div><small>建议</small><b>${route.span}</b></div><div><small>近一个月</small><b>${nowLabels.join('・') || '—'}</b></div></div>
        ${hot.length ? `<h2 class="d-h2">近一个月<small>${hot.length} 处</small></h2><div class="d-cards">${hot.map(it => dCard(it, iso, true)).join('')}</div>` : ''}
        <h2 class="d-h2">${esc(route.title)}<small>示范路线 · ${route.span}</small></h2>
        <ol class="d-route">${route.stops.map(([t, n, s]) => `<li><time>${t}</time><span class="pin"></span><span><b>${esc(n)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span></li>`).join('')}</ol>
        ${rest.length ? `<h2 class="d-h2">其他地点<small>${rest.length} 处</small></h2><div class="d-cards">${rest.map(it => dCard(it, iso, false)).join('')}</div>` : ''}
        <h2 class="d-h2">我在${area}的足迹<small>${feet.length} 条</small></h2>
        ${feet.map(footEntry).join('') || '<p class="d-empty">还没有记录。</p>'}
        <button type="button" class="d-add" data-add="${area}">＋ 记一个地方</button>`;
    } else if (Dd.tab === 'foot') {
      const list = [...Dd.foot].sort((a, b) => b.date.localeCompare(a.date));
      body = `<h2 class="d-h2" style="padding-top:12px">足迹<small>${list.length} 条</small></h2>${list.map(footEntry).join('')}<button type="button" class="d-add" data-add="神户">＋ 记一个地方</button>`;
    } else {
      const items = [...wish].map(id => byId[id]).filter(Boolean);
      body = `<h2 class="d-h2" style="padding-top:12px">想去<small>${items.length} 处</small></h2>${items.length ? `<div class="d-cards">${items.map(it => dCard(it, iso, true)).join('')}</div>` : '<p class="d-empty">还没有想去的地方。</p>'}`;
    }
    const dialog = Dd.dialog ? dialogHTML() : '';
    screen.innerHTML = `<div class="proto">${top()}${body}
      <p class="d-note">原型里的新记录只存在本页，刷新即消失。</p>
      <nav class="tabbar">${[['guide', '攻略'], ['foot', '足迹'], ['wish', `想去 ${wish.size}`]].map(([v, t]) => `<button type="button" data-dtab="${v}" aria-pressed="${Dd.tab === v}">${t}</button>`).join('')}</nav>
      ${dialog}</div>`;
    if (Dd.dialog) placeDialog();
  }

  function dialogHTML() {
    const f = Dd.dialog;
    return `<div class="dialog" id="d-dialog"><form id="d-form" novalidate>
      <h3>记一个地方</h3>
      <label>地点<input name="place" value="${esc(f.place)}" autocomplete="off"></label>
      <label>地区<select name="area">${AREAS.map(a => `<option${a === f.area ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
      <label>喜欢程度<span class="rate">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-rate="${n}" aria-pressed="${f.rating === n}">${n}</button>`).join('')}</span></label>
      <label>日期<input name="date" type="date" value="${f.date}" max="${today}"></label>
      <label>细节<textarea name="note">${esc(f.note)}</textarea></label>
      <div class="err" id="d-err">${esc(f.err || '')}</div>
      <div class="acts"><button type="button" data-cancel="1">取消</button><button type="submit" class="primary">保存</button></div>
    </form></div>`;
  }

  function placeDialog() {
    const dlg = document.getElementById('d-dialog');
    if (matchMedia('(max-width: 760px)').matches) return;
    dlg.style.inset = 'auto 0 auto 0';
    dlg.style.top = screen.scrollTop + 'px';
    dlg.style.height = screen.clientHeight + 'px';
    screen.style.overflowY = 'hidden';
  }

  function readForm() {
    const form = document.getElementById('d-form');
    if (!form) return;
    const fd = new FormData(form);
    Object.assign(Dd.dialog, { place: fd.get('place').trim(), area: fd.get('area'), date: fd.get('date'), note: fd.get('note').trim() });
  }

  function closeDialog() {
    Dd.dialog = null;
    screen.style.overflowY = '';
    renderD();
  }

  function clickD(t) {
    const d = t.dataset;
    if (d.area) {
      Dd.area = d.area;
      screen.scrollTop = 0;
    } else if (d.dtab) {
      Dd.tab = d.dtab;
      screen.scrollTop = 0;
    } else if (d.add) {
      Dd.dialog = { place: '', area: d.add, rating: 0, date: today, note: '' };
    } else if (d.rate) {
      readForm();
      Dd.dialog.rating = +d.rate;
    } else if (d.cancel) {
      closeDialog();
      return;
    } else return;
    renderD();
  }

  screen.addEventListener('submit', e => {
    if (e.target.id !== 'd-form') return;
    e.preventDefault();
    readForm();
    const f = Dd.dialog;
    if (!f.place) f.err = '请填写地点';
    else if (!f.rating) f.err = '请选喜欢程度';
    else if (!f.date || f.date > today) f.err = '日期不能晚于今天';
    else {
      Dd.foot.unshift({ id: 'n' + Date.now(), place: f.place, area: f.area, date: f.date, rating: f.rating, note: f.note || '—' });
      if (Dd.tab === 'guide') Dd.area = f.area;
      closeDialog();
      return;
    }
    renderD();
  });

  screen.addEventListener('keydown', e => {
    if (dir === 'd' && Dd.dialog && e.key === 'Escape') closeDialog();
  });

  // ---------- 说明 ----------
  const NOTES = {
    a: {
      title: 'A 决策台', q: '回答：这次有半天或一天，去哪最值？',
      sections: [
        ['首屏', '条件（时间、哪天、天气、偏好）在上，下面是三个排好序的方案。每个方案是一条小行程，带总时长、路上时间、花费、拥挤四条对比条和推荐理由。'],
        ['好处', '<ul><li>打开就能做决定，活动和景点放在一起比较。</li><li>雨天、只有半天这类限制会直接改变结果。</li><li>展期快结束、红叶正当时会自动提前。</li></ul>'],
        ['代价', '<ul><li>每个地点都要有时长、花费、最佳期，数据缺一项排序就不准。</li><li>排序规则要调，排错几次就会失去信任。</li><li>天气要接预报才完整。</li></ul>'],
        ['可拆出的部件', '条件栏、方案卡、对比条、理由标签。']
      ]
    },
    b: {
      title: 'B 时令', q: '回答：现在什么正当时，什么快结束了？',
      sections: [
        ['首屏', '日期与节气，一条可以点的全年色带。下面每个地点或活动一行，最佳期和展期画在同一条时间轴上，竖线是选中的那天。'],
        ['好处', '<ul><li>关西出行最大的变量是季节和展期，这里一眼看出正当时、两周内和已经错过。</li><li>点月份可以提前看樱花季、红叶季的安排。</li></ul>'],
        ['代价', '<ul><li>每个地点要维护最佳期，每年核对一次（红叶、樱花每年早晚不同）。</li><li>对“今天具体怎么去”帮助不大，需要配详情页。</li></ul>'],
        ['可拆出的部件', '全年色带与日期选择、季节时间轴行、节气标题。']
      ]
    },
    c: {
      title: 'C 时间圈', q: '回答：从家出发，我能去多远？',
      sections: [
        ['首屏', '以新長田为圆心的时间图：离圆心的距离就是单程分钟，方向是大致方位，海在南边。当季和展期中的点亮色并缓慢呼吸（约9秒一次）。点任一点，底部弹出地点卡。'],
        ['好处', '<ul><li>路程成本一眼看清，适合临时起意。</li><li>半天能往返的范围就是内两圈。</li></ul>'],
        ['代价', '<ul><li>方位是示意，不是真实地图，不能用来导航。</li><li>点多了要靠筛选；看不出季节的先后。</li></ul>'],
        ['可拆出的部件', '时间圈、单程上限筛选、底部地点卡、由近到远列表。']
      ]
    },
    d: {
      title: 'D 攻略册', q: '回答：这个地方怎么玩？我上次觉得怎样？',
      sections: [
        ['首屏', '按地区分页：一句话定位、单程、本月推荐、一条示范路线，最后是你在这个地区的足迹，可以直接新增一条。'],
        ['好处', '<ul><li>最接近精致的旅行杂志。</li><li>你独创的「旅行点」有了正式位置：去过、喜欢程度、细节。</li><li>路线可以直接照着走。</li></ul>'],
        ['代价', '<ul><li>首屏不直接给决定。</li><li>正文要写、要核实，维护量最大。</li><li>足迹是私人数据，不能放进现在的公开站，需要先定存储方式（见方案文档第4节）。</li></ul>'],
        ['可拆出的部件', '地区页、路线时间线、足迹记录与新增表单。']
      ]
    }
  };

  function renderNotes() {
    const n = NOTES[dir];
    notesEl.innerHTML = `<h2>${n.title}</h2><p class="q">${n.q}</p>${n.sections.map(([h, c]) => `<section><h3>${h}</h3>${c.startsWith('<') ? c : `<p>${c}</p>`}</section>`).join('')}
      <section><h3>Claude 的建议</h3><p>A 做首页骨架；B 的季节判断驱动 A 的排序和“正当时”标签；D 做地点详情和足迹；C 作为可选的“地图”视图。</p></section>
      <p class="common">四个方向共用一份数据：16个地点（样例，时长、花费、最佳期未核实）、7个活动（取自现有页面）、4条足迹（合成）。出发地新長田。「想去」在四个方向之间共用。</p>`;
  }

  // ---------- 切换与主题 ----------
  const RENDER = { a: renderA, b: renderB, c: renderC, d: renderD };
  let dir = 'a';

  function show(d) {
    dir = d;
    document.querySelectorAll('.lab-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dir === d)));
    screen.className = 'screen dir-' + d;
    screen.style.overflowY = '';
    screen.scrollTop = 0;
    RENDER[d]();
    renderNotes();
    history.replaceState(null, '', '#' + d);
  }

  document.querySelector('.lab-tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-dir]');
    if (b) show(b.dataset.dir);
  });

  const themeBtn = document.getElementById('lab-theme');
  const media = matchMedia('(prefers-color-scheme: dark)');
  let theme = 'auto';
  try {
    theme = localStorage.getItem('walk-lab-theme') || 'auto';
  } catch {
    theme = 'auto';
  }

  function applyTheme() {
    const mode = theme === 'auto' ? (media.matches ? 'dark' : 'light') : theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    themeBtn.textContent = '主题：' + { auto: '跟随系统', light: '浅色', dark: '深色' }[theme];
    if (dir === 'b') renderB();
  }

  themeBtn.addEventListener('click', () => {
    theme = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto';
    try {
      localStorage.setItem('walk-lab-theme', theme);
    } catch {
      // 预览页主题记不住也无妨
    }
    applyTheme();
  });
  media.addEventListener('change', applyTheme);

  applyTheme();
  show(['a', 'b', 'c', 'd'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'a');
})();
