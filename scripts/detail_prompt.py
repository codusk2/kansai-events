#!/usr/bin/env python3
"""按地点 id 生成给调查模型的提示词（见 docs/地点详情调查.md）。只使用 Python 标准库。

用法：
  python3 scripts/detail_prompt.py osakajo minoo   # 打印填好的提示词，多个 id 用分隔线隔开
  python3 scripts/detail_prompt.py --missing       # 列出还没有详情文件的地点 id
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / 'docs/prompts/地点详情调查.prompt.md'
NEAR_KM = 15
IMG_RADIUS_M = 1500

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_places import COMMONS, get_json  # noqa: E402


def image_candidates(ll: list[float]) -> str:
    """Commons 上坐标在地点附近的图片，给调查模型挑选；联网失败时返回提示。"""
    try:
        data = get_json(COMMONS, {
            'action': 'query', 'format': 'json', 'list': 'geosearch', 'gsnamespace': 6,
            'gscoord': f'{ll[1]}|{ll[0]}', 'gsradius': IMG_RADIUS_M, 'gslimit': 40,
        })
    except Exception:  # noqa: BLE001 候选只是辅助，取不到不影响生成提示词
        return '   （没有取到候选，请直接在 Commons 搜索）'
    names = [g['title'].removeprefix('File:') for g in data.get('query', {}).get('geosearch', [])]
    names = [n for n in names if n.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
    return '\n'.join(f'   - {n}' for n in names) or '   （附近没有带坐标的图片，请直接在 Commons 搜索）'


def km(a: list[float], b: list[float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def ja_name(p: dict) -> str:
    """日文名：取维基百科条目名，去掉括号消歧义。"""
    wiki = p.get('wiki') or ''
    title = unquote(wiki.rsplit('/', 1)[-1]).replace('_', ' ') if wiki else ''
    return title.split(' (')[0] or p['name']


def fill(p: dict, places: list[dict], today: str) -> str:
    near = sorted((km(p['ll'], q['ll']), q) for q in places if q['id'] != p['id'])
    near = [f'   - {q["id"]}：{q["name"]}（约{d:.0f}公里）' for d, q in near if d <= NEAR_KM][:12]
    values = {
        'id': p['id'], 'name': p['name'], 'ja': ja_name(p), 'area': p['area'], 'kind': p['kind'],
        'lat': f'{p["ll"][1]:.5f}', 'lon': f'{p["ll"][0]:.5f}', 'why': p['why'], 'tip': p.get('tip') or '无',
        'transit_mins': str(p['transit']['mins']), 'transit_route': p['transit']['route'],
        'sources': '、'.join(s['url'] for s in p.get('sources') or []) or (p.get('wiki') or '无'),
        'today': today, 'image_candidates': image_candidates(p['ll']), 'nearby_known': '\n'.join(near) or '   （附近没有站内地点）',
    }
    text = TEMPLATE.read_text(encoding='utf-8')
    for k, v in values.items():
        text = text.replace('{{' + k + '}}', v)
    return text


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--missing', action='store_true', help='列出还没有详情文件的地点')
    args = ap.parse_args()
    places = json.loads((ROOT / 'data/places.json').read_text(encoding='utf-8'))['places']
    by_id = {p['id']: p for p in places}
    if args.missing:
        done = {f.stem for f in (ROOT / 'data/details').glob('*.json') if f.stem != 'index'}
        todo = [p for p in places if p['id'] not in done]
        print(f'{len(todo)} 处还没有详情（共 {len(places)} 处）：')
        for p in todo:
            print(f'{p["id"]}\t{p["name"]}')
        return
    if not args.ids:
        ap.error('请给出地点 id，或用 --missing')
    bad = [i for i in args.ids if i not in by_id]
    if bad:
        sys.exit('没有这些地点：' + '、'.join(bad))
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
    print('\n\n---\n\n'.join(fill(by_id[i], places, today) for i in args.ids))


if __name__ == '__main__':
    main()
