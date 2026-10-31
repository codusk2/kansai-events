# 开发与协作入口

先读README.md和PROJECT.md，检查Git状态与本次owner。保留公开URL、稳定活动id、现有localStorage名称和用户状态，不因更名/改期/下架删除旧id。

events.json、template.html、build_v2.py及assets/posters是源码；index.html是构建输出，不能独立手改。无明确需求不增加数据库、Bot定时任务或新功能。脚本发布需要预期远端基线与排他锁，普通push拒绝冲突；Pages完成后读回摘要。

内容更新须有真实官方来源；未知字段留空，不能编造海报、时长或票价。用户私人追踪不回写内容JSON。源码与公开海报继承当前GitHub受众，私人笔记、密码和浏览器档案不得进库。

遵循用户Webs/TEAM.md；docs/siteops是注明日期的恢复快照，不另建规则权威。一个任务一个owner；多AI拆文件或使用协调后的分支，未经明确指派不同时发布。

蟹鱼游改版（2026-10-31起）：旅行点数据在 `data/`，增删改按 [旅行点维护](docs/旅行点维护.md) 执行，只改 `places.seed.json`，用 `scripts/validate_places.py` 和 `scripts/collect_places.py` 检查和生成。
