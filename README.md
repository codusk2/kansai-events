# 遛弯 · 活动图鉴

继续维护先读[PROJECT](PROJECT.md)和[AGENTS](AGENTS.md)。完整源码、已审阅活动和发布海报在本仓库；index.html由template.html生成。

```sh
python3 -m unittest discover -s tests
node --test tests/storage.test.cjs
python3 build_v2.py --events events.json --template template.html --output index.html
```

新活动先分配稳定id，修改名称/日期时沿用。海报用assets/posters的相对路径。禁止仅手改index.html。发布与恢复见PROJECT；既有浏览器记录不随内容更新删除。
