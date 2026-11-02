#!/usr/bin/env python3
"""生成绿苹果专区的调查提示词（docs/prompts/绿苹果动态.prompt.md），填入今天日期和站内已有的活动、动态。只使用 Python 标准库。

用法：python3 scripts/greenapple_prompt.py > /tmp/ga-prompt.md
结果交给能上网搜索的模型，返回的 JSON 用 scripts/merge_greenapple.py 合并。
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    data = json.loads((ROOT / 'data/greenapple.json').read_text(encoding='utf-8'))
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
    events = [e for e in data.get('events') or [] if not e.get('to') or e['to'] >= today]
    news = sorted(data.get('news') or [], key=lambda n: n['date'], reverse=True)[:30]
    values = {
        'today': today,
        'checkedAt': data.get('checkedAt') or '无',
        'events': '\n'.join(f'- {e["id"]}：{e["name"]}，{e.get("from") or e.get("dateNote")}–{e.get("to") or ""}，{e["venue"]}' for e in events) or '（无）',
        'news': '\n'.join(f'- {n["id"]}：{n["date"]} {n["title"]}' for n in news) or '（无）',
    }
    text = (ROOT / 'docs/prompts/绿苹果动态.prompt.md').read_text(encoding='utf-8')
    for k, v in values.items():
        text = text.replace('{{' + k + '}}', v)
    print(text)


if __name__ == '__main__':
    main()
