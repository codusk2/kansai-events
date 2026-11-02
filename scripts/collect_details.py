#!/usr/bin/env python3
"""检查 data/details/<id>.json，生成 data/details/index.json（格式见 docs/地点详情调查.md）。只使用 Python 标准库。

用法：python3 scripts/collect_details.py [--dir data/details] [--check]
--check 只检查格式、不联网、不写清单；有错误时退出码为 1。--dir 可指向 lab/details-sample 检查合成样例。

多图：详情里的 images 只写 Wikimedia Commons 文件名和说明；本脚本向 Commons 查缩略图地址、作者和许可，
文件不存在或不是自由许可的报错，通过的写进清单 index.json 的 images（页面的图集和瀑布流读这里）。

来源：不带 --check 时还会逐条请求 sources 和 links（scripts/check_links.py），打不开、跳回首页、
落到 404 的报错；只写到首页的给提醒。--skip-links 可以跳过这一步（只在网络不通时用）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_links import check_links  # noqa: E402
from collect_places import COMMONS, chunks, get_json, strip_html  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')
FIELDS = {
    'id', 'schema', 'revision', 'checkedAt', 'researchedBy', 'summary', 'highlights', 'visit', 'access',
    'food', 'nearby', 'seasonal', 'tips', 'cautions', 'search', 'links', 'sources', 'images', 'sample',
}
SUB = {
    'highlights': ({'title', 'text', 'where'}, {'title', 'text'}, 6),
    'food': ({'name', 'what', 'price', 'note'}, {'name'}, 5),
    'nearby': ({'name', 'placeId', 'how', 'note'}, {'name'}, 5),
    'seasonal': ({'when', 'text'}, {'when', 'text'}, 4),
    'links': ({'label', 'url'}, {'label', 'url'}, 4),
    'sources': ({'url', 'note', 'accessed'}, {'url', 'note'}, 20),
    'images': ({'file', 'caption'}, {'file'}, 8),
}
OBJ = {'visit': {'hours', 'fee', 'stay', 'bestTime', 'crowd'}, 'access': {'transit', 'car', 'local'}, 'search': {'zh', 'ja'}}
LISTS = {'tips': 6, 'cautions': 4}


def check(d: dict, stem: str, place_ids: set[str], allow_sample: bool) -> list[str]:
    errors: list[str] = []
    err = lambda msg: errors.append(f'{stem}：{msg}')
    extra = set(d) - FIELDS
    if extra:
        err('多出字段：' + '、'.join(sorted(extra)))
    if d.get('id') != stem:
        err('id 要和文件名一致')
    if d.get('id') not in place_ids:
        err('id 不在 data/places.json 里')
    if d.get('schema') != 1:
        err('schema 应为 1')
    if not isinstance(d.get('revision'), int) or d['revision'] < 1:
        err('revision 应为正整数')
    if not ISO.match(str(d.get('checkedAt', ''))):
        err('checkedAt 应为 YYYY-MM-DD')
    if not str(d.get('researchedBy', '')).strip():
        err('缺少 researchedBy')
    if not 20 <= len(str(d.get('summary') or '')) <= 200:
        err('summary 应为20–200字')
    if d.get('sample') and not allow_sample:
        err('合成样例（sample: true）不能放进正式目录')
    for key, (allowed, required, limit) in SUB.items():
        items = d.get(key)
        if items is None:
            continue
        if not isinstance(items, list):
            err(f'{key} 应为列表')
            continue
        if len(items) > limit:
            err(f'{key} 最多 {limit} 条')
        for i, it in enumerate(items):
            if not isinstance(it, dict):
                err(f'{key}[{i}] 应为对象')
                continue
            if set(it) - allowed:
                err(f'{key}[{i}] 多出字段：' + '、'.join(sorted(set(it) - allowed)))
            missing = [k for k in required if not str(it.get(k) or '').strip()]
            if missing:
                err(f'{key}[{i}] 缺少 ' + '、'.join(missing))
            if 'url' in it and not str(it['url']).startswith('http'):
                err(f'{key}[{i}] 的 url 无效')
            if key == 'images' and (str(it.get('file', '')).startswith(('http', 'File:')) or '/' in str(it.get('file', ''))):
                err(f'images[{i}] 的 file 只写 Commons 文件名，例如 Osaka_Castle_02.jpg')
            if key == 'nearby' and it.get('placeId') and it['placeId'] not in place_ids:
                err(f'nearby[{i}] 的 placeId「{it["placeId"]}」不是站内地点')
    if len(d.get('sources') or []) < 2:
        err('sources 至少2条')
    for key, allowed in OBJ.items():
        v = d.get(key)
        if v is None:
            continue
        if not isinstance(v, dict) or set(v) - allowed:
            err(f'{key} 只能有这些字段：' + '、'.join(sorted(allowed)))
        elif any(x is not None and not isinstance(x, str) for x in v.values()):
            err(f'{key} 的值应为文字或 null')
    for key, limit in LISTS.items():
        v = d.get(key)
        if v is None:
            continue
        if not isinstance(v, list) or not all(isinstance(x, str) and x.strip() for x in v):
            err(f'{key} 应为文字列表')
        elif len(v) > limit:
            err(f'{key} 最多 {limit} 条')
    return errors


FREE = re.compile(r'^(CC0|CC BY(-SA)? [\d.]+.*|Public domain|PD.*|GFDL.*)$', re.I)


def commons_images(files: list[str]) -> dict[str, dict]:
    """Commons 文件名 → {thumb, page, artist, license}；查不到的文件不在结果里。"""
    out: dict[str, dict] = {}
    for group in chunks(sorted(set(files)), 40):
        data = get_json(COMMONS, {
            'action': 'query', 'format': 'json', 'titles': '|'.join('File:' + f for f in group),
            'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 640,
            'iiextmetadatafilter': 'Artist|LicenseShortName',
        })
        q = data.get('query', {})
        names = {m['to']: m['from'] for m in q.get('normalized', [])}
        for page in q.get('pages', {}).values():
            info = (page.get('imageinfo') or [None])[0]
            if not info:
                continue
            meta = info.get('extmetadata', {})
            name = names.get(page['title'], page['title']).removeprefix('File:')
            out[name] = {
                'thumb': info.get('thumburl', '').split('?')[0], 'page': info.get('descriptionurl', ''),
                'artist': strip_html(meta.get('Artist', {}).get('value', ''))[:120] or '佚名',
                'license': meta.get('LicenseShortName', {}).get('value', ''),
            }
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dir', default='data/details')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--skip-links', action='store_true', help='不请求来源链接')
    ap.add_argument('--only', help='只请求这些地点的来源链接（逗号分隔 id），格式和图片仍全部检查')
    args = ap.parse_args()
    folder = ROOT / args.dir
    sample_dir = folder.resolve() != (ROOT / 'data/details').resolve()
    place_ids = {p['id'] for p in json.loads((ROOT / 'data/places.json').read_text(encoding='utf-8'))['places']}
    errors: list[str] = []
    index: dict[str, dict] = {}
    docs: dict[str, dict] = {}
    for f in sorted(folder.glob('*.json')):
        if f.stem == 'index':
            continue
        try:
            d = json.loads(f.read_text(encoding='utf-8'))
        except json.JSONDecodeError as e:
            errors.append(f'{f.stem}：不是有效的 JSON（{e}）')
            continue
        errs = check(d, f.stem, place_ids, sample_dir)
        errors += errs
        if not errs:
            index[f.stem] = {'revision': d['revision'], 'checkedAt': d['checkedAt']}
            docs[f.stem] = d
    link_warnings: list[str] = []
    if not args.check and not args.skip_links and not errors:
        # 新增或修改了几处时用 --only 只查自己的，别人遗留的失效链接不会挡住；发布前 owner 仍跑一次完整检查
        only = set(args.only.split(',')) if args.only else None
        link_errors, link_warnings = check_links([
            (stem, x['url']) for stem, d in docs.items() if only is None or stem in only
            for x in (d.get('sources') or []) + (d.get('links') or [])])
        errors += link_errors
    if not args.check and not errors:
        wanted = {stem: d.get('images') or [] for stem, d in docs.items()}
        found = commons_images([im['file'] for ims in wanted.values() for im in ims])
        for stem, ims in wanted.items():
            out = []
            for im in ims:
                meta = found.get(im['file'].replace('_', ' ')) or found.get(im['file'])
                if not meta:
                    errors.append(f'{stem}：Commons 上找不到图片 {im["file"]}')
                elif not FREE.match(meta['license']):
                    errors.append(f'{stem}：图片 {im["file"]} 的许可「{meta["license"]}」不是自由许可')
                else:
                    out.append({**meta, 'caption': im.get('caption') or ''})
            if out:
                index[stem]['images'] = out
    for w in link_warnings:
        print('提醒', w)
    for e in errors:
        print('错误', e)
    print(f'{len(index)} 份详情通过格式检查，{len(errors)} 个错误，{len(link_warnings)} 个提醒')
    if errors:
        sys.exit(1)
    if not args.check:
        out = {'about': '蟹鱼游地点详情清单，由 scripts/collect_details.py 生成，不要手改', 'schema': 1, 'details': index}
        (folder / 'index.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        print('已写', (folder / 'index.json').relative_to(ROOT))


if __name__ == '__main__':
    main()
