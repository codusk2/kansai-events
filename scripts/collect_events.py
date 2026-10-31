#!/usr/bin/env python3
"""从 events.json 取出还没结束的活动，补上会场坐标，生成 data/events.current.json 给蟹鱼游页面用。只使用 Python 标准库。

会场坐标缓存在 data/venues.json（地点名 → [经度, 纬度]），缺的用 OpenStreetMap Nominatim 查（每秒一次）；
查不到的会列出来，在缓存里手填即可。
用法：python3 scripts/collect_events.py [--today YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

UA = 'kaniyu-events/0.1 (personal travel guide; contact via GitHub codusk2)'
ROOT = Path(__file__).resolve().parent.parent
# 关西大致范围，避免同名地点查到别处
VIEWBOX = '134.2,35.8,136.4,33.4'


def geocode(name: str) -> list[float] | None:
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(
        {'q': name, 'format': 'json', 'limit': 1, 'viewbox': VIEWBOX, 'bounded': 1, 'accept-language': 'ja'})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as resp:
            hits = json.load(resp)
    except urllib.error.URLError:
        out = subprocess.run(['curl', '-sSf', '-m', '30', '-A', UA, url], check=True, capture_output=True)
        hits = json.loads(out.stdout)
    if not hits:
        return None
    return [round(float(hits[0]['lon']), 5), round(float(hits[0]['lat']), 5)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--today', default=date.today().isoformat())
    args = ap.parse_args()
    events = json.loads((ROOT / 'events.json').read_text(encoding='utf-8'))
    cache_path = ROOT / 'data' / 'venues.json'
    cache = json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}

    current = [e for e in events if (e.get('结束日') or e.get('开始日期') or '') >= args.today]
    missing = []
    for e in current:
        venue = e['地点']
        if venue not in cache:
            time.sleep(1.1)
            cache[venue] = geocode(venue)
        if not cache[venue]:
            missing.append(venue)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    out = []
    for e in current:
        ll = cache.get(e['地点'])
        if not ll:
            continue
        out.append({
            'id': e['id'], 'name': e['活动名'], 'venue': e['地点'], 'area': e.get('地区', ''),
            'kind': '、'.join(e.get('类型') or []), 'date': e.get('日期', ''),
            'from': e.get('开始日期') or None, 'to': e.get('结束日') or e.get('开始日期'),
            'll': ll, 'fee': e.get('门票', ''), 'note': e.get('亮点') or e.get('简介', '')[:60],
            'link': e.get('官网链接', ''), 'poster': e.get('海报路径') or None,
        })
    # 蟹鱼游自己收集的活动（带来源）
    seed_path = ROOT / 'data' / 'events.seed.json'
    if seed_path.exists():
        for e in json.loads(seed_path.read_text(encoding='utf-8'))['events']:
            if (e.get('to') or '') < args.today:
                continue
            out.append({
                'id': e['id'], 'name': e['name'], 'venue': e['venue'], 'area': e.get('area', ''),
                'kind': e.get('kind', ''), 'date': '', 'from': e.get('from'), 'to': e.get('to'),
                'll': e.get('ll'), 'fee': e.get('fee', ''), 'note': e.get('note', ''),
                'link': e.get('link', ''), 'poster': None, 'sources': e.get('sources', []),
            })
    result = {'about': '由 scripts/collect_events.py 从 events.json 和 data/events.seed.json 生成，不要手改。', 'today': args.today, 'events': out}
    (ROOT / 'data' / 'events.current.json').write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'events.json 未结束 {len(current)} 个；合计输出 {len(out)} 个；缺坐标：{"、".join(missing) or "无"}')


if __name__ == '__main__':
    main()
