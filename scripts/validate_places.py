#!/usr/bin/env python3
"""检查 data/places.seed.json 是否符合旅行点数据规则（见 docs/旅行点维护.md）。只使用 Python 标准库。

用法：python3 scripts/validate_places.py [--seed data/places.seed.json]
有错误时退出码为 1；scripts/collect_places.py 在生成前也会调用这里的 check()。
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

AREAS = {'大阪', '京都', '奈良', '兵库', '滋贺', '和歌山', '三重', '鸟取'}
TONES = {'koyo', 'sakura', 'ume', 'green', 'onsen', 'plain'}
MD = re.compile(r'^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$')
ID = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')


def check(seed: dict) -> tuple[list[str], list[str]]:
    """返回 (错误, 提醒)。"""
    errors: list[str] = []
    warnings: list[str] = []
    vocab = set(seed.get('tags') or [])
    if not vocab:
        errors.append('缺少顶层 tags 词表')
    excluded = seed.get('excluded') or []
    ex_ids = {x['id'] for x in excluded}
    ex_names = {x['name'] for x in excluded}
    seen: set[str] = set()
    for i, p in enumerate(seed.get('places') or []):
        pid = p.get('id', f'#{i}')
        err = lambda msg: errors.append(f'{pid}：{msg}')
        if not ID.match(str(p.get('id', ''))):
            err('id 只能用小写字母、数字和连字符')
        if pid in seen:
            err('id 重复')
        seen.add(pid)
        if pid in ex_ids or p.get('name') in ex_names:
            err('在不收录名单 excluded 里')
        for key in ('name', 'area', 'kind', 'why', 'blurb'):
            if not str(p.get(key, '')).strip():
                err(f'缺少 {key}')
        if p.get('area') and p['area'] not in AREAS:
            err(f'地区“{p["area"]}”不在列表里：{"、".join(sorted(AREAS))}')
        if not p.get('wiki') and not p.get('ll'):
            err('wiki 和 ll 至少要有一个，用来取坐标')
        if p.get('ll') and not (isinstance(p['ll'], list) and len(p['ll']) == 2 and 130 < p['ll'][0] < 140 and 32 < p['ll'][1] < 37):
            err('ll 应为 [经度, 纬度]，且在关西附近')
        t = p.get('transit') or {}
        if not isinstance(t.get('mins'), int) or not 1 <= t['mins'] <= 300:
            err('transit.mins 应为1–300的整数（分钟，含换乘和步行）')
        if not str(t.get('route', '')).strip():
            err('缺少 transit.route（怎么去）')
        for s in p.get('seasons') or []:
            if not (MD.match(str(s.get('from', ''))) and MD.match(str(s.get('to', '')))):
                err(f'季节“{s.get("label")}”的 from/to 应为 MM-DD')
            if s.get('tone') not in TONES:
                err(f'季节色调应为 {"、".join(sorted(TONES))} 之一')
            if not s.get('label'):
                err('季节缺少 label')
        tags = p.get('tags') or []
        if not tags:
            err('至少要有一个主题标签')
        bad = [x for x in tags if x not in vocab]
        if bad:
            err('标签不在词表里：' + '、'.join(bad))
        if '最近热门' in tags:
            err('「最近热门」由季节自动判断，不要写进 tags')
        blurb = str(p.get('blurb', ''))
        if blurb and not 25 <= len(blurb) <= 90:
            err(f'blurb 应为25–90字（现在{len(blurb)}字）')
        if p.get('addedAt'):
            if not p.get('sources'):
                err('新收录的地点必须有 sources（来源链接）')
            if not p.get('addedBy'):
                err('新收录的地点要写 addedBy')
        elif not p.get('sources'):
            warnings.append(f'{pid}：没有 sources（早期条目，补上更好）')
        for s in p.get('sources') or []:
            if not str(s.get('url', '')).startswith('http'):
                err('sources 里的 url 无效')
    return errors, warnings


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', default='data/places.seed.json')
    ap.add_argument('--quiet', action='store_true', help='不列出提醒')
    args = ap.parse_args()
    seed = json.loads(Path(args.seed).read_text(encoding='utf-8'))
    errors, warnings = check(seed)
    if warnings and not args.quiet:
        print(f'提醒 {len(warnings)} 条（不阻止生成），例如：{warnings[0]}')
    for e in errors:
        print('错误：' + e)
    print(f'{len(seed.get("places") or [])} 处，错误 {len(errors)} 条')
    raise SystemExit(1 if errors else 0)


if __name__ == '__main__':
    main()
