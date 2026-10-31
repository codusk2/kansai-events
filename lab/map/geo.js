// 地图原型用的坐标（大致）与配图（Wikimedia Commons 缩略图，自由授权；正式版需逐张保存并署名）。
// e-british 挂在中之岛地点上，不单独成点。
window.WALK_GEO = {
  home: { name: '新長田', ll: [135.14512, 34.65757] },
  attach: { 'e-british': 'nakanoshima' },
  items: {
    'tofukuji': { ll: [135.77409, 34.97705], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/76/TofukujiHondo.jpg/500px-TofukujiHondo.jpg" },
    'fushimi': { ll: [135.77267, 34.96714], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Fushimiinari-taisha%2C_gehaiden-1.jpg/500px-Fushimiinari-taisha%2C_gehaiden-1.jpg" },
    'kiyomizu': { ll: [135.78504, 34.99485], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto%2C_November_2016_-02.jpg/500px-Kiyomizu-dera%2C_Kyoto%2C_November_2016_-02.jpg" },
    'arashiyama': { ll: [135.6778, 35.0129], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/df/Togetsukyo_in_Kyoto_Arashiyama.jpg/500px-Togetsukyo_in_Kyoto_Arashiyama.jpg" },
    'minoh': { ll: [135.4722, 34.8534], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Minoh_Falls_Minoh_Osaka_pref_Japan01s5.jpg/500px-Minoh_Falls_Minoh_Osaka_pref_Japan01s5.jpg" },
    'nakanoshima': { ll: [135.4918, 34.6916], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/NAKKA.jpg/500px-NAKKA.jpg" },
    'osakajo': { ll: [135.52583, 34.68722], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ca/Osaka_Castle_03bs3200.jpg/500px-Osaka_Castle_03bs3200.jpg" },
    'shinsekai': { ll: [135.5063, 34.6525], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/64/Tsutenkaku_108m.jpg/500px-Tsutenkaku_108m.jpg" },
    'nara': { ll: [135.8398, 34.689], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/%E6%9D%B1%E5%A4%A7%E5%AF%BA_%E5%A4%A7%E4%BB%8F%E6%AE%BF%EF%BC%882024%E5%B9%B4%EF%BC%89.jpg/500px-%E6%9D%B1%E5%A4%A7%E5%AF%BA_%E5%A4%A7%E4%BB%8F%E6%AE%BF%EF%BC%882024%E5%B9%B4%EF%BC%89.jpg" },
    'arima': { ll: [135.2475, 34.79806], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e7/Kin-no-yu_Arima_Onsen_2013.jpg/500px-Kin-no-yu_Arima_Onsen_2013.jpg" },
    'maya': { ll: [135.2068, 34.731], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/View_of_Kikuseidai_from_Mount_Maya_Kobe.jpg/500px-View_of_Kikuseidai_from_Mount_Maya_Kobe.jpg" },
    'rokko': { ll: [135.26374, 34.778], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c3/Mt_rokko01s2816.jpg/500px-Mt_rokko01s2816.jpg" },
    'kitano': { ll: [135.1903, 34.7005], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/Kitano_Street_Kobe02s3s4272.jpg/500px-Kitano_Street_Kobe02s3s4272.jpg" },
    'suma': { ll: [135.1001, 34.6383], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/Sumaura_park02_2816.jpg/500px-Sumaura_park02_2816.jpg" },
    'akashi': { ll: [134.9925, 34.6475], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/97/Akashi-uontana%2C2010%E5%B9%B4%E6%9C%AB-%E9%AD%9A%E3%81%AE%E6%A3%9A%E5%95%86%E5%BA%97%E8%A1%97_DSCF0215.JPG/500px-Akashi-uontana%2C2010%E5%B9%B4%E6%9C%AB-%E9%AD%9A%E3%81%AE%E6%A3%9A%E5%95%86%E5%BA%97%E8%A1%97_DSCF0215.JPG" },
    'himeji': { ll: [134.6941, 34.83938], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c1/Himeji_castle_in_may_2015.jpg/500px-Himeji_castle_in_may_2015.jpg" },
    'e-genji': { ll: [135.77311, 34.98994], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/ca/260214_Kyoto_National_Museum_Kyoto_Japan04bs4.jpg/500px-260214_Kyoto_National_Museum_Kyoto_Japan04bs4.jpg" },
    'e-hosoda': { ll: [135.495, 34.705], img: null },
    'e-midosuji': { ll: [135.501, 34.684], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d5/Autumn_in_Mido-suji_Osaka02n.jpg/500px-Autumn_in_Mido-suji_Osaka02n.jpg" },
    'e-marathon': { ll: [135.1955, 34.6913], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fe/2012_Kobe_Marathon_02n.jpg/500px-2012_Kobe_Marathon_02n.jpg" },
    'e-kyodai': { ll: [135.78083, 35.02611], img: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/05/Kyoto_University_Clock_Tower.jpg/500px-Kyoto_University_Clock_Tower.jpg" },
    'e-sangoku': { ll: [135.142, 34.6605], img: null },
  }
};
