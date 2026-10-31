// 四个方向共用的合成数据。活动取自现有页面（已公开），地点、时长、花费、最佳期均为样例，未逐条核实。
// 出发地固定为新長田；mins 为单程分钟，bearing 为从新長田看的大致方位（0=北，顺时针）。
window.WALK_DATA = {
  home: '新長田',
  places: [
    {
      id: 'tofukuji', name: '东福寺', area: '京都', kind: '寺社', tags: ['红叶', '庭园'],
      mins: 85, bearing: 64, hours: 2, fee: 1000, rain: false, crowd: 3,
      seasons: [{ from: '11-15', to: '12-05', label: '红叶', tone: 'koyo' }],
      why: '通天桥下是一整条红叶溪谷。',
      tip: '红叶季开门前到，9点后通天桥要排队。'
    },
    {
      id: 'fushimi', name: '伏见稻荷大社', area: '京都', kind: '寺社', tags: ['寺社', '徒步'],
      mins: 80, bearing: 71, hours: 2, fee: 0, rain: false, crowd: 3, seasons: [],
      why: '千本鸟居一路上山，全年都能去。',
      tip: '傍晚上山人少，到四之辻能看京都夜景。'
    },
    {
      id: 'kiyomizu', name: '清水寺・东山', area: '京都', kind: '寺社', tags: ['红叶', '樱', '街区'],
      mins: 100, bearing: 58, hours: 3, fee: 500, rain: false, crowd: 3,
      seasons: [
        { from: '03-28', to: '04-08', label: '樱', tone: 'sakura' },
        { from: '11-18', to: '12-05', label: '红叶', tone: 'koyo' }
      ],
      why: '清水坂到二年坂一路老街，适合慢慢走。',
      tip: '旺季下午人最多，上午先上清水寺。'
    },
    {
      id: 'arashiyama', name: '岚山', area: '京都', kind: '自然', tags: ['红叶', '樱', '徒步'],
      mins: 100, bearing: 50, hours: 4, fee: 0, rain: false, crowd: 3,
      seasons: [
        { from: '03-28', to: '04-10', label: '樱', tone: 'sakura' },
        { from: '11-18', to: '12-05', label: '红叶', tone: 'koyo' }
      ],
      why: '竹林、渡月桥和保津川，一天的分量。',
      tip: '去程坐阪急到岚山站，回程走JR嵯峨岚山。'
    },
    {
      id: 'minoh', name: '箕面大瀑布', area: '大阪', kind: '自然', tags: ['红叶', '徒步'],
      mins: 80, bearing: 44, hours: 3, fee: 0, rain: false, crowd: 2,
      seasons: [{ from: '11-12', to: '11-30', label: '红叶', tone: 'koyo' }],
      why: '沿溪谷步道走到瀑布，比京都清静。',
      tip: '往返步行约1.5小时，路边有红叶天妇罗。'
    },
    {
      id: 'nakanoshima', name: '中之岛美术馆群', area: '大阪', kind: '美术馆', tags: ['展览', '建筑'],
      mins: 55, bearing: 85, hours: 3, fee: 1400, rain: true, crowd: 1, seasons: [],
      why: '几座美术馆和图书馆走路就到，下雨也不怕。',
      tip: '先查各馆展期，再顺路去东洋陶瓷美术馆。'
    },
    {
      id: 'osakajo', name: '大阪城公园', area: '大阪', kind: '历史', tags: ['樱', '梅'],
      mins: 60, bearing: 92, hours: 2, fee: 600, rain: false, crowd: 2,
      seasons: [
        { from: '02-15', to: '03-10', label: '梅', tone: 'ume' },
        { from: '03-25', to: '04-07', label: '樱', tone: 'sakura' }
      ],
      why: '梅林和樱花季最好，平时适合散步。',
      tip: '梅林在公园东侧，从森之宫站进最近。'
    },
    {
      id: 'shinsekai', name: '新世界・天王寺', area: '大阪', kind: '街区', tags: ['美食', '街区'],
      mins: 55, bearing: 98, hours: 3, fee: 0, rain: true, crowd: 2, seasons: [],
      why: '串炸和通天阁，最有大阪味的一片。',
      tip: '串炸不要二次蘸酱。'
    },
    {
      id: 'nara', name: '奈良公园・东大寺', area: '奈良', kind: '寺社', tags: ['红叶', '寺社', '徒步'],
      mins: 95, bearing: 104, hours: 5, fee: 800, rain: false, crowd: 2,
      seasons: [{ from: '11-12', to: '12-03', label: '红叶', tone: 'koyo' }],
      why: '鹿、大佛殿和若草山，节奏很慢。',
      tip: '早到，避开修学旅行团的高峰。'
    },
    {
      id: 'arima', name: '有马温泉', area: '神户', kind: '温泉', tags: ['温泉', '美食'],
      mins: 50, bearing: 18, hours: 4, fee: 800, rain: true, crowd: 2,
      seasons: [{ from: '11-01', to: '03-15', label: '泡汤', tone: 'onsen' }],
      why: '金汤和银汤，半天往返的温泉。',
      tip: '平日下午人少；外汤可以单独去。'
    },
    {
      id: 'maya', name: '摩耶山掬星台', area: '神户', kind: '夜景', tags: ['夜景'],
      mins: 45, bearing: 34, hours: 2, fee: 1560, rain: false, crowd: 1, seasons: [],
      why: '神户到大阪湾的夜景一眼看全。',
      tip: '傍晚上山，先查索道末班时间。'
    },
    {
      id: 'rokko', name: '六甲山', area: '神户', kind: '自然', tags: ['红叶', '徒步', '夜景'],
      mins: 55, bearing: 26, hours: 4, fee: 0, rain: false, crowd: 1,
      seasons: [
        { from: '05-10', to: '06-10', label: '新绿', tone: 'green' },
        { from: '10-25', to: '11-15', label: '红叶', tone: 'koyo' }
      ],
      why: '山上比市区早两周变色。',
      tip: '山上气温低5度左右，带外套。'
    },
    {
      id: 'kitano', name: '北野异人馆', area: '神户', kind: '街区', tags: ['建筑', '咖啡'],
      mins: 25, bearing: 66, hours: 2, fee: 0, rain: false, crowd: 1, seasons: [],
      why: '坡道上的洋馆和咖啡店，临时起意就能去。',
      tip: '坡很陡，穿好走的鞋。'
    },
    {
      id: 'suma', name: '须磨浦山上游园', area: '神户', kind: '自然', tags: ['海景', '樱'],
      mins: 12, bearing: 245, hours: 2, fee: 900, rain: false, crowd: 1,
      seasons: [{ from: '03-28', to: '04-08', label: '樱', tone: 'sakura' }],
      why: '离家最近的海景，缆车加观光扶梯。',
      tip: '傍晚海色最好。'
    },
    {
      id: 'akashi', name: '明石鱼之棚', area: '近郊', kind: '美食', tags: ['美食', '市场'],
      mins: 22, bearing: 262, hours: 2, fee: 0, rain: true, crowd: 1, seasons: [],
      why: '鱼市和明石烧，一顿午饭的行程。',
      tip: '上午去，很多店下午早早收摊。'
    },
    {
      id: 'himeji', name: '姬路城・好古园', area: '近郊', kind: '历史', tags: ['樱', '红叶', '建筑'],
      mins: 50, bearing: 276, hours: 4, fee: 1050, rain: false, crowd: 2,
      seasons: [
        { from: '03-28', to: '04-08', label: '樱', tone: 'sakura' },
        { from: '11-10', to: '11-30', label: '红叶', tone: 'koyo' }
      ],
      why: '白鹭城加旁边的日式庭园。',
      tip: '旺季登天守要排队，上午先去。'
    }
  ],
  events: [
    {
      id: 'e-genji', name: '特別展 源氏物語', area: '京都', kind: '展览', tags: ['展览'],
      venue: '京都国立博物馆', from: '2026-10-06', to: '2026-11-29',
      mins: 90, bearing: 61, hours: 2, fee: 1200, rain: true, crowd: 2,
      why: '定家本全5帖首次同场，同展只有约两周。', tip: '周五开到20:00，傍晚人少。'
    },
    {
      id: 'e-british', name: '大英博物館 百花繚乱', area: '大阪', kind: '展览', tags: ['展览'],
      venue: '大阪中之岛美术馆', from: '2026-10-31', to: '2027-01-31',
      mins: 50, bearing: 79, hours: 2, fee: 1400, rain: true, crowd: 2,
      why: '大英博物馆藏日本美术回到日本展出。', tip: '开幕头两周人多。'
    },
    {
      id: 'e-hosoda', name: '细田守 原点展', area: '大阪', kind: '展览', tags: ['展览'],
      venue: '大阪', from: '2026-10-28', to: '2027-01-04',
      mins: 45, bearing: 74, hours: 2, fee: 2100, rain: true, crowd: 2,
      why: '《穿越时空的少女》20周年。', tip: '前售票便宜一些。'
    },
    {
      id: 'e-midosuji', name: '御堂筋灯饰', area: '大阪', kind: '灯光', tags: ['夜景'],
      venue: '御堂筋', from: '2026-11-03', to: '2026-12-31',
      mins: 45, bearing: 90, hours: 1.5, fee: 0, rain: false, crowd: 2,
      why: '整条御堂筋的银杏树挂灯。', tip: '从淀屋桥往难波方向走。'
    },
    {
      id: 'e-marathon', name: '神户马拉松（去加油）', area: '神户', kind: '运动', tags: [],
      venue: '神户市内', from: '2026-11-15', to: '2026-11-15',
      mins: 15, bearing: 76, hours: 2, fee: 0, rain: false, crowd: 2,
      why: '离家很近的大型赛事。', tip: '查交通管制时段。'
    },
    {
      id: 'e-kyodai', name: '京都大学11月祭', area: '京都', kind: '校园', tags: ['美食'],
      venue: '京都大学', from: '2026-11-20', to: '2026-11-23',
      mins: 90, bearing: 55, hours: 3, fee: 0, rain: false, crowd: 2,
      why: '摊位、演出和展示，四天。', tip: '周末人最多。'
    },
    {
      id: 'e-sangoku', name: '三国志祭', area: '神户', kind: '祭典', tags: ['美食'],
      venue: '新長田', from: '2026-11-07', to: '2026-11-07',
      mins: 5, bearing: 200, hours: 2, fee: 0, rain: false, crowd: 1,
      why: '家门口的祭典。', tip: '步行就到。'
    }
  ],
  footprints: [
    { id: 'f1', place: '须磨浦山上游园', area: '神户', date: '2026-09-14', rating: 4, note: '傍晚坐缆车上去，海是金色的；观光扶梯很旧，很好玩。' },
    { id: 'f2', place: '北野异人馆', area: '神户', date: '2026-08-03', rating: 3, note: '坡太陡，夏天别去；有家二楼咖啡馆窗景好。' },
    { id: 'f3', place: '有马温泉', area: '神户', date: '2026-02-11', rating: 5, note: '金汤很烫，泡十分钟就够；下次平日去。' },
    { id: 'f4', place: '伏见稻荷大社', area: '京都', date: '2026-05-03', rating: 4, note: '只走到四之辻，往上人就少了。' }
  ],
  routes: {
    '京都': {
      title: '东山红叶一日', span: '一天',
      stops: [
        ['08:00', '新長田出发', '地铁转JR，约85分'],
        ['09:25', '东福寺', '先看通天桥，约2小时'],
        ['11:40', '京都国立博物馆', '源氏物语展，约2小时'],
        ['13:40', '七条附近午饭', ''],
        ['14:40', '清水寺・二年坂', '下坡走到祇园'],
        ['17:30', '回程', '京阪转阪急或JR']
      ]
    },
    '大阪': {
      title: '雨天美术馆半日', span: '半天',
      stops: [
        ['10:00', '新長田出发', '约55分'],
        ['11:00', '大阪中之岛美术馆', '大英博物馆展'],
        ['13:00', '中之岛午饭', ''],
        ['14:00', '东洋陶瓷美术馆', '步行10分'],
        ['16:00', '回程', '']
      ]
    },
    '神户': {
      title: '山上看夜景', span: '半天',
      stops: [
        ['15:30', '新長田出发', '约45分'],
        ['16:20', '摩耶山掬星台', '看日落，等天黑'],
        ['18:30', '下山', '先查索道末班'],
        ['19:15', '三宫晚饭', '']
      ]
    },
    '奈良': {
      title: '鹿与大佛一日', span: '一天',
      stops: [
        ['08:30', '新長田出发', '约95分'],
        ['10:10', '东大寺大佛殿', ''],
        ['12:00', '奈良町午饭', ''],
        ['13:30', '春日大社・若草山脚', '红叶季沿路走'],
        ['16:30', '回程', '']
      ]
    },
    '近郊': {
      title: '明石午饭＋姬路城', span: '一天',
      stops: [
        ['09:30', '新長田出发', 'JR往西'],
        ['10:00', '明石鱼之棚', '早午饭吃明石烧'],
        ['11:30', '姬路城', '登天守约2小时'],
        ['14:00', '好古园', '红叶季庭园'],
        ['16:00', '回程', '约50分']
      ]
    }
  },
  areas: {
    '神户': { line: '海和山都很近，半天就能来回，适合临时起意。', range: '5–55分' },
    '大阪': { line: '美术馆和街区密集，下雨天的首选。', range: '45–80分' },
    '京都': { line: '寺社与庭园。单程约一个半小时，一天只排一片区域。', range: '80–100分' },
    '奈良': { line: '鹿与大佛，节奏慢，宜早出发。', range: '约95分' },
    '近郊': { line: '明石的鱼、姬路的城，往西坐JR很快。', range: '20–50分' }
  }
};
