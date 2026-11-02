#!/usr/bin/env python3
"""逐条请求来源链接，找出打不开、跳回首页或只写到首页的来源。只使用 Python 标准库和系统 curl。

2026-11-02 远望试跑发现：模型会编出格式像样、实际不存在的文章地址，或把网站首页当出处。
collect_details.py 和 merge_greenapple.py 合并前调用这里的 check_links()。

- 错误：打不开（4xx/5xx、超时）、跳到了别的地址的首页、落到 404 页面、页面写着“找不到”；
  X 帖子和 YouTube 视频的页面永远返回 200，改用它们的 oEmbed 接口确认存在。
- 提醒：来源本身只写到网站首页（不算错，但说明不了具体事实出在哪）。

单独使用：python3 scripts/check_links.py URL [URL ...]
"""
from __future__ import annotations

import re
import subprocess
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'
NOT_FOUND = re.compile(r'404 Not Found|ページが見つかりません|ページがみつかりません|お探しのページは(見つかりません|みつかりません|存在しません)|Page not found|页面不存在|找不到页面', re.I)
X_POST = re.compile(r'^https?://(www\.)?(x|twitter)\.com/[^/]+/status/\d+')
YT_VIDEO = re.compile(r'^https?://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)')


def is_home(url: str) -> bool:
    p = urllib.parse.urlsplit(url)
    return p.path in ('', '/') and not p.query


def fetch(url: str) -> tuple[int, str, str]:
    """返回 (状态码, 最终地址, 页面前 40KB)；失败时状态码为 0。"""
    out = subprocess.run(
        ['curl', '-sL', '-m', '25', '-A', UA, '-w', '\n__END__%{http_code} %{url_effective}', url],
        capture_output=True)
    text = out.stdout.decode('utf-8', 'ignore')
    body, _, tail = text.rpartition('\n__END__')
    code, _, final = tail.partition(' ')
    return (int(code) if code.isdigit() else 0), final.strip(), body[:40000]


def check_one(url: str) -> tuple[str | None, str | None]:
    """返回 (错误, 提醒)。"""
    if X_POST.match(url):
        api = 'https://publish.twitter.com/oembed?url=' + urllib.parse.quote(re.sub(r'//(www\.)?x\.com', '//twitter.com', url), safe='')
        code, _, _ = fetch(api)
        return (None if code == 200 else f'X 帖子不存在或不公开（oEmbed {code}）'), None
    if YT_VIDEO.match(url):
        code, _, _ = fetch('https://www.youtube.com/oembed?format=json&url=' + urllib.parse.quote(url, safe=''))
        return (None if code == 200 else f'YouTube 视频不存在（oEmbed {code}）'), None
    code, final, body = fetch(url)
    if code == 0:
        return '打不开（超时或连接失败）', None
    if code >= 400:
        return f'打不开（HTTP {code}）', None
    if '404' in urllib.parse.urlsplit(final).path:
        return f'跳到了 404 页面（{final}）', None
    if not is_home(url) and is_home(final):
        return f'文章不存在，跳回了首页（{final}）', None
    if NOT_FOUND.search(body):
        return '页面写着“找不到”', None
    return None, ('只写到网站首页，看不出具体事实在哪一页' if is_home(url) else None)


def check_links(items: list[tuple[str, str]]) -> tuple[list[str], list[str]]:
    """items：[(标签, url)]。返回 (错误, 提醒)，每条带标签和地址。同一地址只请求一次。"""
    urls = sorted({u for _, u in items})
    with ThreadPoolExecutor(8) as pool:
        result = dict(zip(urls, pool.map(check_one, urls)))
    errors, warnings = [], []
    for label, u in items:
        err, warn = result[u]
        if err:
            errors.append(f'{label}：来源 {u} {err}')
        elif warn:
            warnings.append(f'{label}：来源 {u} {warn}')
    return errors, warnings


if __name__ == '__main__':
    errs, warns = check_links([('链接', u) for u in sys.argv[1:]])
    for w in warns:
        print('提醒', w)
    for e in errs:
        print('错误', e)
    print(f'{len(set(sys.argv[1:]))} 个地址，{len(errs)} 个错误，{len(warns)} 个提醒')
    sys.exit(1 if errs else 0)
