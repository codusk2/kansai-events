#!/usr/bin/env python3
"""从 data/places.seed.json 生成 data/places.json。只使用 Python 标准库。

人工维护的字段（名称、类型、公共交通估算、季节、理由、提示）原样保留；本脚本补齐：
- 坐标：日文维基百科条目的主坐标；种子里写了 ll 就用种子的。
- 配图：条目的代表图（维基只返回自由授权图片），以及 Commons 上的作者和许可。
- 自驾：OSRM 公共路线服务按 OpenStreetMap 道路计算的时间和距离，不含拥堵和停车。

用法：python3 scripts/collect_places.py [--seed data/places.seed.json] [--output data/places.json]
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_places import check  # noqa: E402

UA = 'kaniyu-places/0.1 (personal travel guide; contact via GitHub codusk2)'
WIKI = 'https://ja.wikipedia.org/w/api.php'
COMMONS = 'https://commons.wikimedia.org/w/api.php'
OSRM = 'https://router.project-osrm.org/table/v1/driving/'


def get_json(url: str, params: dict | None = None) -> dict:
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.URLError as exc:
        # macOS 自带的旧版 Python 与部分服务握手失败时，改用系统 curl
        if 'SSL' not in str(exc):
            raise
        out = subprocess.run(['curl', '-sSf', '-m', '60', '-A', UA, url], check=True, capture_output=True)
        return json.loads(out.stdout)


def chunks(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def wiki_pages(titles: list[str]) -> dict[str, dict]:
    """标题 → {lat, lon, file, thumb}，标题按种子里的写法返回（处理重定向和规范化）。"""
    out: dict[str, dict] = {}
    for group in chunks(sorted(set(titles)), 40):
        data = get_json(WIKI, {
            'action': 'query', 'format': 'json', 'redirects': 1, 'titles': '|'.join(group),
            'prop': 'coordinates|pageimages', 'piprop': 'name|thumbnail', 'pithumbsize': 500,
            'colimit': 'max', 'pilimit': 'max',
        })
        q = data.get('query', {})
        alias = {t: t for t in group}
        for step in ('normalized', 'redirects'):
            for m in q.get(step, []):
                for src, dst in list(alias.items()):
                    if dst == m['from']:
                        alias[src] = m['to']
        by_title = {p['title']: p for p in q.get('pages', {}).values()}
        for src, dst in alias.items():
            page = by_title.get(dst)
            if not page or 'missing' in page:
                continue
            coord = (page.get('coordinates') or [{}])[0]
            out[src] = {
                'lat': coord.get('lat'), 'lon': coord.get('lon'),
                'file': page.get('pageimage'),
                'thumb': (page.get('thumbnail') or {}).get('source', '').split('?')[0] or None,
                'page': 'https://ja.wikipedia.org/wiki/' + urllib.parse.quote(dst.replace(' ', '_')),
            }
    return out


def strip_html(text: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', text or ''))).strip()


def commons_credits(files: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for group in chunks(sorted(set(files)), 40):
        data = get_json(COMMONS, {
            'action': 'query', 'format': 'json', 'titles': '|'.join('File:' + f for f in group),
            'prop': 'imageinfo', 'iiprop': 'extmetadata',
            'iiextmetadatafilter': 'Artist|LicenseShortName|LicenseUrl',
        })
        q = data.get('query', {})
        names = {m['to']: m['from'] for m in q.get('normalized', [])}
        for page in q.get('pages', {}).values():
            title = names.get(page['title'], page['title'])
            meta = ((page.get('imageinfo') or [{}])[0]).get('extmetadata', {})
            out[title.removeprefix('File:')] = {
                'artist': strip_html(meta.get('Artist', {}).get('value', ''))[:120],
                'license': meta.get('LicenseShortName', {}).get('value', ''),
                'licenseUrl': meta.get('LicenseUrl', {}).get('value', ''),
            }
    return out


def car_times(origin: list[float], points: list[list[float]]) -> list[tuple[int | None, float | None]]:
    coords = ';'.join(f'{lon},{lat}' for lon, lat in [origin] + points)
    data = get_json(OSRM + coords, {'sources': 0, 'annotations': 'duration,distance'})
    if data.get('code') != 'Ok':
        raise RuntimeError('OSRM 返回 ' + str(data.get('code')))
    dur = data['durations'][0][1:]
    dist = data['distances'][0][1:]
    return [(round(d / 60) if d is not None else None, round(k / 1000, 1) if k is not None else None)
            for d, k in zip(dur, dist)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', default='data/places.seed.json')
    ap.add_argument('--output', default='data/places.json')
    args = ap.parse_args()
    seed = json.loads(Path(args.seed).read_text(encoding='utf-8'))
    places = seed['places']
    errors, _ = check(seed)
    if errors:
        raise SystemExit('种子没通过检查，先运行 scripts/validate_places.py 修正：\n' + '\n'.join(errors))

    origin_title = seed['origin']['wiki']
    pages = wiki_pages([origin_title] + [p['wiki'] for p in places])
    o = pages.get(origin_title) or {}
    origin_ll = seed['origin'].get('ll') or [o.get('lon'), o.get('lat')]

    missing = []
    for p in places:
        w = pages.get(p['wiki'], {})
        p['ll'] = p.get('ll') or ([round(w['lon'], 5), round(w['lat'], 5)] if w.get('lat') is not None else None)
        if not p['ll']:
            missing.append(p['id'])
    if missing:
        raise SystemExit('缺坐标，请在种子里补 ll：' + '、'.join(missing))

    credits = commons_credits([w['file'] for w in pages.values() if w.get('file')])
    cars = car_times(origin_ll, [p['ll'] for p in places])

    out = []
    for p, (mins, km) in zip(places, cars):
        w = pages.get(p['wiki'], {})
        img = None
        if w.get('thumb') and w.get('file'):
            c = credits.get(w['file'], {})
            img = {
                'thumb': w['thumb'], 'file': w['file'],
                'page': 'https://commons.wikimedia.org/wiki/File:' + urllib.parse.quote(w['file']),
                'artist': c.get('artist', ''), 'license': c.get('license', ''),
            }
        record = {k: v for k, v in p.items() if k != 'wiki'}
        record['transit'] = {**p['transit'], 'checked': False}
        record['car'] = {'mins': mins, 'km': km}
        record['img'] = img
        record['wiki'] = w.get('page')
        out.append(record)

    result = {
        'about': '由 scripts/collect_places.py 从 places.seed.json 生成，不要手改。',
        'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'tags': seed.get('tags', []),
        'origin': {'name': seed['origin']['name'], 'll': [round(origin_ll[0], 5), round(origin_ll[1], 5)]},
        'sources': {
            'transit': '按常用路线估算（含换乘和步行），未逐条核实',
            'car': 'OSRM 公共路线服务，OpenStreetMap 道路数据；不含拥堵和停车',
            'coords': '日文维基百科条目坐标',
            'img': 'Wikimedia Commons，作者与许可见各条 img',
        },
        'places': out,
    }
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    no_img = [p['id'] for p in out if not p['img']]
    print(f'{len(out)} 处；无配图 {len(no_img)}：{"、".join(no_img) or "无"}')


if __name__ == '__main__':
    main()
