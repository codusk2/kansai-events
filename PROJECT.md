# 遛弯 PROJECT

Lite持续内容站 · 2026-10-28 Asia/Tokyo · 本轮owner：Codex。

## 源码和运行

- 公开站：https://codusk2.github.io/kansai-events/；GitHub codusk2/kansai-events，main根目录为Pages发布来源（锦鲤取证，需结合本次部署状态读回）。保持既有公开受众与路径。
- 完整源码权威：此仓库main。Webs/projects/kansai-events为工作副本；box的旧副本不能继续独立改HTML。模板template.html、build_v2.py、events.json和assets/posters为构建输入；index.html为生成物，legacy/events-2026-10-26.html仅历史产物。
- Python3标准库即可构建当前归档的PNG/JPEG海报；处理无扩展名新图时旧兼容路径需要Pillow，优先预先转换为受支持格式。`python3 build_v2.py --events events.json --template template.html --output index.html`；`python3 -m unittest discover -s tests`、`node --test tests/*.test.cjs`验证。

## 数据与身份

events.json是已审阅发布内容的唯一输入。海报已从原公开HTML解出原字节并改相对路径；23条活动、21张图，不凭空补另外两张。原始采集资料另归内容负责人保管；本轮不抓新活动。

每项id沿用当前发布值，改活动名、日期、顺序均不重分配。新活动用UUID一次分配写入JSON；缺少或重复id构建失败。格式/内容修订与稳定身份分开。

日期显示用“日期”；排序起始日以“开始日期”的ISO值为权威，构建时同步旧“开始日”别名，结束日显式维护为ISO值。未知日期留空，不能从无年份文案推算；改期同时核对显示字段和ISO字段。

Bot的追踪字段只是首次本机默认值；用户选择/星标/筛选以本浏览器localStorage为权威，不能被内容更新覆写。保留原pumpkin-events-v2:+pathname命名和站点URL；不存在于当前列表的id继续保留，以便内容暂时移除后恢复。此站没有云同步，不把Git备份称为用户星标备份。

## 协作、发布与恢复

Codex负责本轮工程；下一轮工程owner须明确。锦鲤报告遛弯瓜已改管日程，当前活动采集没有已确认接任者；在用户指定之前按需更新，不假设有自动刷新。未新增Routine或后台服务。

按 `python3 scripts/publish.py --owner <任务owner> --expected-head <已核实远端完整SHA> --push` 执行基线检查（省略--push仅校验）、排他锁、测试、重建和普通Git推送。先协调owner再发布，检查远端main预期commit；不force push。不手工只更新index，不把生成源码留在Bot私有记忆。Pages终态与线上HTML摘要分别读回。

恢复源码：新目录clone同仓库，运行上述测试/构建，比较index.html字节摘要；代码回退保留业务ID和浏览器存档。用户本机记录恢复：先通过浏览器开发工具把本站pumpkin-events-v2:<原pathname>:selected/:stars/:settings/:theme四个key的原始字符串独立保存；用隔离同路径测试存储恢复，确认JSON与id后，再对原浏览器导入。不要清空整个站点存储，不扫描或替换其他应用key。尚无界面备份/云端恢复，新增这类功能另立任务。

已验证/限制与确切commit见docs/architecture-acceptance.md；本任务状态在Webs/docs/五站架构对齐-2026-10-28.md。
