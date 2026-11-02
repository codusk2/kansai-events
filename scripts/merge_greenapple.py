#!/usr/bin/env python3
"""把调查模型返回的绿苹果 JSON 合并进 data/greenapple.json。只使用 Python 标准库。

用法：python3 scripts/merge_greenapple.py result.json [--dry-run]
- news、events 按 id 合并：同 id 整条替换，新 id 追加；结束超过60天的活动和最多40条以外的旧动态移除；
- events 里的 imgFile 向 Wikimedia Commons 查缩略图、作者和许可，转成 img（找不到或非自由许可时去掉并提示）；
- 合并后用 validate_places.check_greenapple 检查，有错误时不写文件、退出码为 1。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_details import FREE, commons_images  # noqa: E402
from validate_places import check_greenapple  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / 'data/greenapple.json'
KEEP_NEWS = 40
EVENT_KEYS = {'id', 'name', 'kind', 'venue', 'll', 'from', 'to', 'dateNote', 'note', 'sources', 'img'}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('result')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    data = json.loads(TARGET.read_text(encoding='utf-8'))
    res = json.loads(Path(args.result).read_text(encoding='utf-8'))
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    notes: list[str] = []

    files = [e['imgFile'] for e in res.get('events') or [] if e.get('imgFile')]
    found = commons_images(files) if files else {}
    events = {e['id']: e for e in data.get('events') or []}
    for e in res.get('events') or []:
        f = e.pop('imgFile', None)
        if f:
            meta = found.get(f.replace('_', ' ')) or found.get(f)
            if meta and FREE.match(meta['license']):
                e['img'] = {k: meta[k] for k in ('thumb', 'page', 'artist', 'license')} | {'note': '会场照片'}
            else:
                notes.append(f'{e["id"]}：图片 {f} 找不到或不是自由许可，已去掉')
        elif e['id'] in events and events[e['id']].get('img'):
            e['img'] = events[e['id']]['img']
        notes.append(('更新' if e['id'] in events else '新增') + f'活动 {e["id"]}')
        events[e['id']] = {k: v for k, v in e.items() if k in EVENT_KEYS}
    cutoff = (today - dt.timedelta(days=60)).isoformat()
    data['events'] = sorted((e for e in events.values() if not e.get('to') or e['to'] >= cutoff),
                            key=lambda e: e.get('from') or e.get('to') or '9999')

    news = {n['id']: n for n in data.get('news') or []}
    for n in res.get('news') or []:
        notes.append(('更新' if n['id'] in news else '新增') + f'动态 {n["id"]}')
        news[n['id']] = n
    data['news'] = sorted(news.values(), key=lambda n: n['date'], reverse=True)[:KEEP_NEWS]
    if res.get('checkedAt'):
        data['checkedAt'] = res['checkedAt']
    if res.get('placesNote'):
        data['placesNote'] = res['placesNote']

    errors = check_greenapple(data)
    for n in notes:
        print(n)
    for e in errors:
        print('错误', e)
    if errors:
        sys.exit(1)
    if args.dry_run:
        print('（试运行，没有写文件）')
        return
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'已写 {TARGET.relative_to(ROOT)}：活动 {len(data["events"])} 个，动态 {len(data["news"])} 条')


if __name__ == '__main__':
    main()
