#!/usr/bin/env python3
"""将 events.json 和本地海报打包成一个完全离线的 HTML。只使用 Python 标准库。"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlsplit

REQUIRED = ('活动名', '日期', '地点', '地区', '类型', '推荐指数', '简介',
            '门票', '预计时长', '交通', '官网链接', '海报路径', '规模/重要度')
SUPPORTED = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
             '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml'}


def normalize(record: dict, index: int, base: Path) -> dict:
    if not isinstance(record, dict):
        raise ValueError(f'第 {index} 条活动不是 JSON 对象')
    missing = [key for key in REQUIRED if key not in record]
    if missing:
        raise ValueError(f'第 {index} 条活动缺少字段：{", ".join(missing)}')
    e = dict(record)
    name = str(e['活动名']).strip()
    if not name:
        raise ValueError(f'第 {index} 条活动缺少有效活动名')
    e['活动名'] = name
    typ = e['类型']
    e['类型'] = [str(t).strip() for t in (typ if isinstance(typ, list) else [typ]) if str(t).strip()]
    for key, out in (('推荐指数', '推荐指数'), ('规模/重要度', '规模重要度')):
        v = e.get(key)
        if v in ('', None):
            e[out] = None  # 未知则留空，不编造
            continue
        try:
            v = int(v)
        except (ValueError, TypeError) as exc:
            raise ValueError(f'{name}：{key} 必须是 1–5 的整数或留空') from exc
        if not 1 <= v <= 5:
            raise ValueError(f'{name}：{key} 必须在 1–5 之间')
        e[out] = v
    # IDs were recovered from the published page; edits must retain them.
    if not isinstance(e.get('id'), str) or not __import__('re').fullmatch(r'[A-Za-z0-9_-]{8,80}', e['id']):
        raise ValueError(f'{name}：必须提供稳定 id；新活动用 uuid.uuid4().hex 分配一次，改名/改期沿用')
    url = str(e.get('官网链接') or '').strip()
    if url and urlsplit(url).scheme not in ('https', 'http'):
        raise ValueError(f'{name}：官网链接只允许 http/https')
    e['官网链接'] = url
    poster = str(e.get('海报路径') or '').strip()
    if poster:
        poster_path = Path(poster)
        if not poster_path.is_absolute():
            poster_path = base / poster_path
        if not poster_path.is_file():
            raise FileNotFoundError(f'{name}：找不到海报：{poster_path}')
        suffix = poster_path.suffix.lower()
        if suffix == '' or suffix not in SUPPORTED:
            # 无扩展名或大图：用 Pillow 统一转成宽 900 的 JPEG，控制体积
            from PIL import Image
            import io
            im = Image.open(poster_path).convert('RGB'); im.thumbnail((900, 4000))
            buf = io.BytesIO(); im.save(buf, 'JPEG', quality=82)
            e['海报数据'] = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
            return e
        if suffix not in SUPPORTED:
            raise ValueError(f'{name}：不支持的海报格式 {suffix}')
        raw = poster_path.read_bytes()
        # SVG 可能包含脚本或外部引用；为确保单文件和安全，禁止 SVG。
        if suffix == '.svg':
            raise ValueError(f'{name}：SVG 海报可能携带外部依赖或脚本，请先转为 PNG/WebP')
        e['海报数据'] = f'data:{SUPPORTED[suffix]};base64,{base64.b64encode(raw).decode("ascii")}'
    else:
        e['海报数据'] = ''
    return e


def build(source: Path, template: Path, output: Path) -> int:
    records = json.loads(source.read_text(encoding='utf-8-sig'))
    if isinstance(records, dict) and isinstance(records.get('events'), list):
        records = records['events']
    if not isinstance(records, list):
        raise ValueError('events.json 顶层必须是数组，或包含 events 数组的对象')
    events = [normalize(event, i, source.parent) for i, event in enumerate(records, 1)]
    ids = [event['id'] for event in events]
    if len(ids) != len(set(ids)):
        raise ValueError('存在重复活动 id；请核对身份，不通过改日期绕过')
    template_html = template.read_text(encoding='utf-8')
    marker = '__EVENTS_JSON__'
    if template_html.count(marker) != 1:
        raise ValueError(f'template.html 必须包含且仅包含一个 {marker} 标记')
    payload = json.dumps(events, ensure_ascii=False, separators=(',', ':'))
    # 避免用户活动简介中的 </script> 提前关闭 JSON 数据块。
    payload = payload.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(template_html.replace(marker, payload), encoding='utf-8')
    return len(events)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--events', type=Path, default=Path('events.json'))
    parser.add_argument('--template', type=Path, default=Path(__file__).with_name('template.html'))
    parser.add_argument('--output', type=Path, default=Path('events.html'))
    args = parser.parse_args()
    count = build(args.events.resolve(), args.template.resolve(), args.output.resolve())
    print(f'完成：{count} 项活动 → {args.output.resolve()}')


if __name__ == '__main__':
    main()
