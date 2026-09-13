/** Narrow, paraphrased lessons checked against official sources on 2026-09-11.
 * This is a source check, not an endorsement/certification of the game. */
type Lesson = {
  summary: string;
  publisher: string;
  url: string;
  result?: string;
};
const fire: Lesson = {
  summary: '灶台附近不堆可燃物；用火时有人照看，用完及时关闭火源。',
  publisher: '浙江省消防救援总队',
  url: 'https://zj.119.gov.cn/col/col1229454601/art/2026/art_171c09d5ab674263aadfe3e808f3f6b3.html',
};
const corridor: Lesson = {
  summary: '楼道和安全出口不堆杂物，始终为自己和邻居留出逃生通道。',
  publisher: '国家消防救援局',
  url: 'https://www.119.gov.cn/kp/hzyf/jt/2023/37378.shtml',
};
const rain: Lesson = {
  summary: '暴雨中避开低洼积水路段，远离电线杆，不冒险涉水。',
  publisher: '国家消防救援局',
  url: 'https://www.119.gov.cn/site1/kp/zjts/hlzh/2022/30542.shtml',
};
const lessons: Record<string, Lesson> = {
  // Eight reviewed practices integrated 2026-09-12. Keep scenario-specific
  // conclusions: completing a simulation never means real rescuers arrived.
  'quake-cover-practice': {
    summary: '震动时就近降低姿态、保护头颈并抓牢掩护；震动停止后再关注指引、检查自身和联系家人。',
    result: '本情境防护与震后联络练习完成', publisher: '美国疾控中心（CDC）',
    url: 'https://www.cdc.gov/earthquakes/safety/stay-safe-during-an-earthquake.html',
  },
  'quake-exit-practice': {
    summary: '震动停止且需要撤离时，保护双脚，留意受损环境，按指引走可用路线到集合处，不返回取物。',
    result: '已在模拟集合处完成位置报告', publisher: '美国疾控中心（CDC）',
    url: 'https://www.cdc.gov/earthquakes/safety/stay-safe-after-an-earthquake.html',
  },
  'collapse-signal-practice': {
    summary: '被困时防护头部和口鼻，利用通信或适度敲击帮助定位，减少无谓活动，等待专业救援。',
    result: '已发出求救信号，继续保持待援', publisher: '美国疾控中心（CDC）',
    url: 'https://www.cdc.gov/earthquakes/safety/stay-safe-after-an-earthquake.html',
  },
  'car-window-practice': {
    summary: '本情境侧窗仍可打开，应尽早利用可用出口离车；不能把本关操作泛化为所有车型的破窗方法。',
    result: '本情境离车与水面求助练习完成', publisher: '湖南省应急管理厅',
    url: 'https://yjt.hunan.gov.cn/tszt/aqzs/202007/t20200709_12672408.html',
  },
  'flood-highground-practice': {
    summary: '洪水围困且退路不可用时，向当前可达的可靠高处转移并求助；不要为取物涉水或接近受淹电器。',
    result: '已转移并求助，继续在高处待援', publisher: '美国国家气象局（NWS）',
    url: 'https://www.weather.gov/safety/flood-during',
  },
  'lift-contact-practice': {
    summary: '普通故障困梯时，使用紧急通话说明位置和人员情况，远离门缝等待专业处置，不自行扒门钻出。',
    result: '已建立联系，继续在轿厢内待援', publisher: '日本消防厅',
    url: 'https://www.fdma.go.jp/relocation/bousai_manual/occ/occurrence180.html',
  },
  'fire-shelter-practice': {
    summary: '路线已被浓烟封堵时，在可暂时隔烟处关闭门、减少进烟并报告被困位置；继续关注现场变化与专业指引。',
    result: '已隔烟并报告位置，继续待援', publisher: '伦敦消防局',
    url: 'https://www.london-fire.gov.uk/safety/the-home/escape-plan/escape-plan-blocks-of-flats/',
  },
  'fire-stairs-practice': {
    summary: '需要撤离且路线明确可用时，按指引走楼梯，不乘普通电梯、不返回取物，到安全处报告情况。',
    result: '本情境楼梯撤离与安全处报告完成', publisher: '伦敦消防局',
    url: 'https://www.london-fire.gov.uk/safety/the-home/escape-plan/escape-plan-blocks-of-flats/',
  },
  'typhoon-home': {
    summary: '台风影响期间尽量留在防风安全处；危险房屋内的人员应及时转移。',
    publisher: '应急管理部',
    url: 'https://www.mem.gov.cn/kp/zrzh/201909/t20190917_366094.shtml',
  },
  'flood-kit': {
    summary: '提前备好饮用水、应急食品与照明工具，把应急物资放在方便取用处。',
    publisher: '应急管理部',
    url: 'https://www.mem.gov.cn/kp/shaq/202011/t20201129_372149.shtml',
    result: '备灾准备已完成',
  },
  'quake-bedroom-v2': {
    summary: '平时固定高大家具，重物不要放在高处，保持家中通道畅通。',
    publisher: '宝鸡市地震局',
    url: 'https://www.baoji.gov.cn/bmpd/bjsdzj/ztzl/dzkp/202506/t20250623_1160539.html',
  },
  'storm-street-check-v2': rain,
  'rain-street-preparation-v1': rain,
  'thunder-park-v2': {
    summary: '雷雨时不要在水边游玩、垂钓，也不要在户外继续骑行。',
    publisher: '应急管理部',
    url: 'https://www.mem.gov.cn/kp/zrzh/201904/t20190401_366090.shtml',
  },
  'forest-fire-sources-v2': {
    summary: '不带火种进山入林，不烧枯枝落叶，不乱丢烟头。',
    publisher: '应急管理部',
    url: 'https://www.mem.gov.cn/xw/xwfbh/2025n03y21xwfbh/wzsl_4260/202503/t20250321_516998.shtml',
  },
  'flood-house-response-v1': {
    summary:
      '听从预警和转移指引，及时到安全地带；远离断裂电线和可能被洪水冲毁的地方。',
    publisher: '应急管理部',
    url: 'https://www.mem.gov.cn/xw/xwfbh/2025n08y05xwfbh/',
    result: '已到高处，安全待援',
  },
  'clear-corridor': corridor,
  'clear-corridor-check-v2': corridor,
  'lift-wait': {
    summary:
      '被困时用报警装置联系外界，留在轿厢内等待专业人员，不撬门、不扒门。',
    publisher: '河北省市场监督管理局',
    url: 'https://scjg.hebei.gov.cn/info/66396',
    result: '已联络，安心等待',
  },
  'well-call': {
    summary:
      '发现井内有人遇险，不盲目下井；及时联系 119、120，交由专业人员救援。',
    publisher: '应急管理部',
    url: 'https://www.mem.gov.cn/gk/tzgg/tz/202010/W020201102332725428956.pdf',
    result: '已求助，安全待援',
  },
  'oil-fire': {
    summary:
      '在能够安全靠近的小油锅火情中，关闭热源并盖严锅盖，切勿泼水；无法控制时立即撤离求助。',
    publisher: '台北市政府消防局',
    url: 'https://www.119.gov.taipei/News_Content.aspx?n=0EDB9C505FE8B199&s=1756F0CA3C948F0C&sms=18AF49168D1E8B97',
  },
  'charging-bedroom': {
    summary:
      '充电设备不要被织物覆盖；发现电池鼓胀，应停止使用并联系厂家或专业人员。',
    publisher: '伦敦消防局',
    url: 'https://www.london-fire.gov.uk/safety/the-home/electrical-items/batteries-and-chargers/',
  },
  'bedroom-night-check-v2': {
    ...fire,
    summary: '睡前关闭非必要电源、熄灭明火，让可燃杂物远离火源。',
  },
  'kitchen-before-cooking-v2': fire,
};
export function lessonFor(id: string): Lesson {
  if (!lessons[id]) throw new Error(`缺少已核对的关卡知识：${id}`);
  return lessons[id];
}
