/** Narrow, paraphrased lessons checked against official sources on 2026-09-15.
 * This is a source check, not an endorsement/certification of the game. */
type BaseLesson = {
  summary: string;
  publisher: string;
  url: string;
  result?: string;
};
export type Lesson = BaseLesson & {
  message: string;
  points: Array<{ title: string; body: string }>;
  sources: Array<{ publisher: string; url: string }>;
};
const fire: BaseLesson = {
  summary: '灶台附近不堆可燃物；用火时有人照看，用完及时关闭火源。',
  publisher: '浙江省消防救援总队',
  url: 'https://zj.119.gov.cn/col/col1229454601/art/2026/art_171c09d5ab674263aadfe3e808f3f6b3.html',
};
const corridor: BaseLesson = {
  summary: '楼道和安全出口不堆杂物，始终为自己和邻居留出逃生通道。',
  publisher: '国家消防救援局',
  url: 'https://www.119.gov.cn/kp/hzyf/jt/2023/37378.shtml',
};
const rain: BaseLesson = {
  summary: '暴雨中避开低洼积水路段，远离电线杆，不冒险涉水。',
  publisher: '国家消防救援局',
  url: 'https://www.119.gov.cn/site1/kp/zjts/hlzh/2022/30542.shtml',
};
const lessons: Record<string, BaseLesson> = {
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

// Completion copy is presentation data, independent of goals, scoring and IDs.
// Sources and scenario limits are documented in docs/painted-settlement/SOURCES.md.
const source = {
  typhoon: { publisher: '应急管理部', url: 'https://www.mem.gov.cn/kp/zrzh/202208/t20220809_419856.shtml' },
  kit: { publisher: '应急管理部', url: 'https://www.mem.gov.cn/kp/shaq/202011/t20201129_372149.shtml' },
  quakeDuring: { publisher: '美国疾控中心（CDC）', url: 'https://www.cdc.gov/earthquakes/safety/stay-safe-during-an-earthquake.html' },
  quakeAfter: { publisher: '美国疾控中心（CDC）', url: 'https://www.cdc.gov/earthquakes/safety/stay-safe-after-an-earthquake.html' },
  quakePrepare: { publisher: '美国疾控中心（CDC）', url: 'https://www.cdc.gov/earthquakes/safety/index.html' },
  flood: { publisher: '美国国家气象局（NWS）', url: 'https://www.weather.gov/safety/flood-during' },
  floodCall: { publisher: '江苏省消防救援总队', url: 'https://js.119.gov.cn/202608/fcad183dfc5444a7b16647be70f37090_c_749d4af1d50340a09667.html' },
  street: { publisher: '深圳市龙岗区人民政府', url: 'https://www.lg.gov.cn/bmzz/btjdb/xxgk/yjgl/content/post_7750659.html' },
  lightning: { publisher: '美国国家气象局（NWS）', url: 'https://www.weather.gov/safety/lightning-tips' },
  lightningShelter: { publisher: '美国国家气象局（NWS）', url: 'https://www.weather.gov/safety/lightning-outdoors' },
  forest: { publisher: '应急管理部', url: 'https://www.mem.gov.cn/xw/mtxx/202004/t20200409_349694.shtml' },
  forestEscape: { publisher: '淮南市人民政府', url: 'https://www.huainan.gov.cn/zwgk/jrhn/1260914663.html' },
  escape: { publisher: '伦敦消防局', url: 'https://www.london-fire.gov.uk/safety/the-home/escape-plan/escape-plan-blocks-of-flats/' },
  lift: { publisher: '国家消防救援局', url: 'https://www.119.gov.cn/site1/kp/zjts/2022/420.shtml' },
  liftLocation: { publisher: '北京市市场监督管理局、北京市消防救援局', url: 'https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568251.html' },
  well: { publisher: '应急管理部', url: 'https://www.mem.gov.cn/xw/bndt/201806/t20180608_229498.shtml' },
  wellCall: { publisher: '泰安市畜牧兽医事业服务中心', url: 'https://xmzx.taian.gov.cn/art/2026/4/22/art_50919_10288852.html' },
  car: { publisher: '国家消防救援局', url: 'https://www.119.gov.cn/kp/zjts/qtzh/2023/38098.shtml' },
  oil: { publisher: '台北市政府消防局', url: 'https://www.119.gov.taipei/News_Content.aspx?n=0EDB9C505FE8B199&s=1756F0CA3C948F0C&sms=18AF49168D1E8B97' },
  pan: { publisher: '伦敦消防局', url: 'https://www.london-fire.gov.uk/safety/the-home/cooking/pan-fires/' },
  battery: { publisher: '伦敦消防局', url: 'https://www.london-fire.gov.uk/safety/the-home/electrical-items/batteries-and-chargers/' },
  cables: { publisher: '伦敦消防局', url: 'https://www.london-fire.gov.uk/safety/the-home/electrical-items/cables-fuses-and-leads/' },
  heaters: { publisher: '江苏省消防救援总队', url: 'https://js.119.gov.cn/202012/jsxfww-menu-gzdt_c_7e56d84cf82447f387aa.html' },
  bedtime: { publisher: '伦敦消防局', url: 'https://www.london-fire.gov.uk/safety/the-home/bedtime-checks/' },
  gas: { publisher: '国家消防救援局', url: 'https://www.119.gov.cn/xw/xfyw/2022/14384.shtml' },
};

const completion: Record<string, Pick<Lesson, 'message' | 'points' | 'sources'>> = {
  'typhoon-home': {
    message: '这片儿的风雨防备，有你一份。',
    points: [
      { title: '收物要趁风雨前', body: '花盆和晾晒物被大风吹落会伤人，应提前收妥；风雨猛烈时不要再冒险探身阳台。' },
      { title: '关窗也要留距离', body: '提前关好并检查门窗，台风期间远离玻璃；危险房屋应按指引及时转移，不能硬守。' },
      { title: '用电先看是否安全', body: '不必要的电源应在手和环境干燥时提前断开；电器周围已进水，就别再靠近操作。' },
    ],
    sources: [source.typhoon, source.flood],
  },
  'flood-kit': {
    message: '这片儿的应急底气，有你一份。',
    points: [
      { title: '准备不止这五件', body: '饮水、即食食品、照明和联络工具要提前备好；还应按家庭人数和实际需要补足物资。' },
      { title: '能找到，也要能用', body: '应急包放在方便取用处，定期查看食品期限和设备电量；收音机、手电应保持可用。' },
      { title: '转移比收齐更要紧', body: '收到转移通知就及时行动，不为收齐物品耽误离开；本关完成不代表储备已经齐全。' },
    ],
    sources: [source.kit, source.flood],
  },
  'quake-bedroom-v2': {
    message: '这片儿的家，多了一份稳妥。',
    points: [
      { title: '把重物留在低处', body: '高柜要可靠固定，重物放低处，床上方避免悬挂厚重物件，减少震动时倾倒和坠落。' },
      { title: '给避险留出空间', body: '平时清出门口通道和坚固桌下空间，并避开玻璃与坠物；不是任何一张桌子都能掩护。' },
      { title: '调整布置要在平时', body: '家具固定和重物搬移请成人或专业人员完成；震动发生时先护头避险，不临时搬家具。' },
    ],
    sources: [source.quakePrepare, source.quakeDuring],
  },
  'storm-street-check-v2': {
    message: '这片儿的危险路口，你看清了。',
    points: [
      { title: '积水下面看不清', body: '浑水可能盖住缺失井盖和受损路面，不要试探深浅；避开地下通道等低洼积水区域。' },
      { title: '危险设施绕远些', body: '受淹电箱、断线可能带电，松动广告牌和围挡可能倒落；不要靠近检查或自行修理。' },
      { title: '看清危险仍须避险', body: '暴雨大风中优先进入地势较高的坚固建筑，远离窗玻璃；圈出危险不代表街道已安全。' },
    ],
    sources: [source.street, source.flood],
  },
  'thunder-park-v2': {
    message: '这片儿的避雷误区，你分清了。',
    points: [
      { title: '挡雨不等于避雷', body: '孤立大树、开敞凉亭、普通帐篷和开放式球车都不是安全避雷处，水边也应立即远离。' },
      { title: '听到雷声就进屋', body: '雷声说明雷电已足够接近，应进入具备水电设施的坚固建筑；室内也要远离窗户和管线。' },
      { title: '别急着重返户外', body: '最后一次雷声后至少等三十分钟再考虑外出，并留意预警；本关结束不代表雷雨结束。' },
    ],
    sources: [source.lightning, source.lightningShelter],
  },
  'forest-fire-sources-v2': {
    message: '这片儿的火源隐患，瞒不过你。',
    points: [
      { title: '小火种也别带进山', body: '林区禁火要求要遵守，不吸烟、不烧烤、不烧纸或燃放烟花；一粒火星也可能引燃枯草。' },
      { title: '发现火情先远离', body: '遇到烟火应迅速撤到安全区域并报警，说明位置和所见情况，不留下围观或凑近拍照。' },
      { title: '扑救交给专业人员', body: '林火受风向和地形影响，不能盲目扑救或让儿童捡火种；画面无烟不等于余火已熄灭。' },
    ],
    sources: [source.forest, source.forestEscape],
  },
  'rain-street-preparation-v1': {
    message: '这片儿的雨天出行，多了你的提醒。',
    points: [
      { title: '低洼入口先避开', body: '地下车库和下沉通道容易积水倒灌；提前关注预警，已进水时不要返回取车或抢拿财物。' },
      { title: '水里和头顶都有险', body: '井口、落地电线可能藏在积水里，广告牌和树枝也可能坠落；不涉水、不在它们下方停留。' },
      { title: '准备做在风雨之前', body: '移车和检查设施应在天气恶化前安全进行；暴雨时减少出行，服从封控和转移指引。' },
    ],
    sources: [source.street, source.flood, source.typhoon],
  },
  'flood-house-response-v1': {
    message: '这片儿的守望，有你一份。',
    points: [
      { title: '转移优先，不等物齐', body: '洪水围困时沿可用的干燥路线去可靠高处；饮水和照明只取近处现成的，不折返低处。' },
      { title: '断电不能冒险涉水', body: '只有电闸干燥、完好且可安全到达时才操作；受淹电器和落水电线要远离，交专业人员。' },
      { title: '到高处仍要保持联系', body: '报告位置、人数和被困情况，听从转移指引；备用浮材不保证安全，不能靠它盲目下水。' },
    ],
    sources: [source.flood, source.floodCall],
  },
  'quake-cover-practice': {
    message: '这片儿的避震本领，你记牢了。',
    points: [
      { title: '先稳住，再护头颈', body: '震动时就近降低姿态，保护头颈；身边有坚固桌子时进入桌下抓牢，减少跌倒和坠物伤害。' },
      { title: '别冲向门窗和楼梯', body: '强震中奔跑容易摔倒，也可能被玻璃和掉落物击中；留在就近掩护处，不乘普通电梯。' },
      { title: '晃动停了仍防余震', body: '震后查看自身状况、收听官方指引，再报告位置；未见伤口不等于医学确认没有受伤。' },
    ],
    sources: [source.quakeDuring, source.quakeAfter],
  },
  'quake-exit-practice': {
    message: '这片儿的集合处，有你报来的平安。',
    points: [
      { title: '停震后按指引撤离', body: '需要撤离时先留意楼梯和周围是否受损，使用当前可用路线；有裂损或掉落风险就别硬闯。' },
      { title: '护好脚，也别折返', body: '碎玻璃和瓦砾会伤脚，穿好手边结实鞋；不为找鞋或财物返回危险房间，不乘停用电梯。' },
      { title: '离开楼门再报告', body: '到远离外墙、玻璃和电线的集合处，报告位置并关注余震；未经确认不要重新进入受损建筑。' },
    ],
    sources: [source.quakeAfter, source.quakePrepare, source.quakeDuring],
  },
  'flood-highground-practice': {
    message: '这片儿的求助信号，你传出去了。',
    points: [
      { title: '选可靠高处避险', body: '外部洪水围困且退路不可用时，沿可达的完整干燥楼梯转移；不涉水试路，也不回低处取物。' },
      { title: '把位置说清楚', body: '求助时说明建筑、楼层、人数和当前险情，保留回拨联络；发送信息后仍需等待专业救援。' },
      { title: '示警不探身冒险', body: '在室内安全位置发出可见信号，远离无防护边缘和受淹电器；继续收听预警与转移指引。' },
    ],
    sources: [source.flood, source.floodCall],
  },
  'clear-corridor': {
    message: '这片儿回家的路，被你理顺了。',
    points: [
      { title: '杂物会挡路也助燃', body: '纸箱和家具会缩窄逃生路线，还可能成为燃料；楼道、楼梯和安全出口都应保持畅通。' },
      { title: '收纳不能换处堵', body: '平日只安全整理轻便的自家物品，放进合法储物空间；别堵住另一条通道或消防设备。' },
      { title: '起火时先顾人', body: '整理应在没有火烟时完成；发生火灾不要留在楼道搬东西，及时按现场可用路线避险。' },
    ],
    sources: [source.escape],
  },
  'lift-wait': {
    message: '这片儿的求助，有了你的冷静。',
    points: [
      { title: '先用紧急通话求助', body: '普通故障困梯时按报警或对讲按钮；无人回应可用手机联系张贴的救援电话，说明所在位置。' },
      { title: '门缝不是逃生口', body: '轿厢可能停在两层之间，扒门或钻缝会有坠落风险；也不要攀爬检修口或在轿厢内跳跃。' },
      { title: '联络后继续待援', body: '远离门口、保持可联系状态并如实报告不适；本关只完成求助，训练计时不是救援到达时间。' },
    ],
    sources: [source.lift, source.liftLocation],
  },
  'well-call': {
    message: '这片儿的热心，被你用对了地方。',
    points: [
      { title: '井内危险未必看得见', body: '污水井等有限空间可能缺氧或含有毒气体，贸然进入会让救人者也遇险；没有防护切勿下井。' },
      { title: '把专业救援叫来', body: '在外围安全处联系119、120，说明准确位置、遇险人数和所见情况；不要盲目下井拉人。' },
      { title: '提醒旁人别靠近', body: '保持安全距离并劝阻围观者下井，等专业人员处置；电话打通后，井口和井内仍然危险。' },
    ],
    sources: [source.well, source.wellCall],
  },
  'clear-corridor-check-v2': {
    message: '这片儿的生命通道，你替大家惦记着。',
    points: [
      { title: '门要能关，也要能逃', body: '常闭防火门不能被顶住，安全出口不能锁死；关门可减缓烟火蔓延，出口则要保持可通行。' },
      { title: '通道不堆物不充电', body: '纸箱、电动自行车都不应占用楼道，消火栓前也要留空；充电起火会威胁整条逃生路线。' },
      { title: '发现后交由管理方', body: '遇到锁闭出口或被挡消防设施，应及时告知物业等管理人员；不私拆设备，更不在火中清理。' },
    ],
    sources: [source.escape, source.battery],
  },
  'car-window-practice': {
    message: '这片儿的离车本领，你多懂了一分。',
    points: [
      { title: '抓住当前可用出口', body: '本情境侧窗仍能打开，应解开安全带后尽快利用开口离车；不要主动留在车内等水灌满。' },
      { title: '不为财物耽误离车', body: '手机和包都不值得折返取回；车窗结构因车型而异，本关不能当作所有车辆的破窗教程。' },
      { title: '离车后仍需援助', body: '本情境有近处救生圈，可抓牢支持并保持口鼻出水；仍须继续求助，离车不等于已经获救。' },
    ],
    sources: [source.car, source.flood],
  },
  'lift-contact-practice': {
    message: '这片儿的救援定位，有你说清的一步。',
    points: [
      { title: '位置要报到电梯', body: '用紧急通话说明小区、楼栋和轿厢内的电梯编号，帮助救援人员定位；别只报显示的楼层。' },
      { title: '人员情况如实说', body: '说明被困人数和有无受伤、不适，保持回拨联络；情况变化及时补充，不猜测未知信息。' },
      { title: '稳定等待，不钻门缝', body: '普通故障困梯时留在轿厢，远离门口，不扒门或攀爬检修口；联系成功后仍须等专业救援。' },
    ],
    sources: [source.liftLocation, source.lift],
  },
  'collapse-signal-practice': {
    message: '这片儿的等待，有了你发出的信号。',
    points: [
      { title: '护住头脸，少扬尘', body: '在可活动范围内护住头脸，用衣料松适遮挡口鼻以减少粉尘；衣料不能过滤有毒气体。' },
      { title: '用信号帮助定位', body: '通信可用时报告位置和身体受困情况，也可间歇轻敲坚实部位；避免持续大喊消耗体力。' },
      { title: '别强拉或乱挖', body: '身体受压、无法自行脱身时，不强拉肢体或扰动周围土石；减少无谓活动，原位等待救援。' },
    ],
    sources: [source.quakeAfter, source.quakeDuring],
  },
  'oil-fire': {
    message: '这片儿的平安，有你一份。',
    points: [
      { title: '盖严锅盖，隔绝空气', body: '仅在火势小且能安全靠近时，盖严合适锅盖并关闭热源；等油锅冷却后再开盖，防止复燃。' },
      { title: '不泼水，也不搬锅', body: '水遇高温油会迅速汽化，裹挟热油喷溅；搬动燃烧的油锅也可能烫伤自己、把火带到别处。' },
      { title: '控制不了，撤离报警', body: '火势变大、难以靠近或无法控制时，立即撤离并提醒他人，到安全处拨打119，交给消防员。' },
    ],
    sources: [source.oil, source.pan],
  },
  'charging-bedroom': {
    message: '这片儿的充电角落，多了你的细心。',
    points: [
      { title: '充电也需要散热', body: '手机和充电器不要被枕头、被褥覆盖，避免热量积聚；按说明使用匹配合格的充电设备。' },
      { title: '破损线别凑合用', body: '破损的充电线和插头应停用更换，不用胶布随意修补；不要用手触碰裸露导线试探。' },
      { title: '鼓胀电池交专业处理', body: '发现电池鼓胀应停止使用，不拆壳、不挤压，联系厂家或专业人员；出现烟火先远离求助。' },
    ],
    sources: [source.battery, source.cables],
  },
  'bedroom-night-check-v2': {
    message: '这片儿的安稳一夜，有你的细心。',
    points: [
      { title: '睡前看看充电处', body: '被褥别盖住充电设备，破损线和鼓胀电池应停用；睡前停止不必要的充电，异常交专业处理。' },
      { title: '电热毯不要折叠通电', body: '电热毯卷曲、折叠使用容易损伤内部线路并积热；按说明平铺使用，发现破损就停用。' },
      { title: '取暖器不兼作烘衣架', body: '衣物覆盖取暖器或离得太近可能被引燃，保持与床品、窗帘的距离；入睡或离开前关闭。' },
    ],
    sources: [source.battery, source.heaters, source.bedtime],
  },
  'kitchen-before-cooking-v2': {
    message: '这片儿的烟火气，有你照看着。',
    points: [
      { title: '炉边少一份可燃物', body: '开火前移开纸巾等杂物，定期清理油烟机积油；这些东西遇火易燃，做饭时也要有人照看。' },
      { title: '燃气异常先停用', body: '软管老化开裂应停用并联系专业人员，不能自行改装；液化气钢瓶需直立，不能卧放使用。' },
      { title: '破损电器别再试', body: '水壶等电器的电源线破损就停用报修或更换，不缠胶布继续用；手湿时不要插拔电源。' },
    ],
    sources: [source.oil, source.gas, source.cables],
  },
  'fire-shelter-practice': {
    message: '这片儿的求助声，你替一家人传到了。',
    points: [
      { title: '浓烟封路，别硬闯', body: '逃生路线被浓烟阻断时，选择远离烟火、可暂时隔烟的房间并关门；别开门探查或冲过浓烟。' },
      { title: '堵缝只能减少进烟', body: '用手边材料封堵门缝，不能为找毛巾或胶带延误求助；封堵不能隔绝全部毒气，仍须留意变化。' },
      { title: '报清位置，安全示警', body: '拨打119说明楼栋、楼层、房间和人数，按接警员指引行动；不翻窗，保持联系继续待援。' },
    ],
    sources: [source.escape],
  },
  'fire-stairs-practice': {
    message: '这片儿的平安路，你和家人一起走到了。',
    points: [
      { title: '先看路线是否可用', body: '需要撤离且楼梯路线可用时，按指引有序离开；浓烟封堵时不能硬闯，也不乘普通电梯。' },
      { title: '随手关门，不折返', body: '撤离时随手关上身后的门，减少烟火蔓延；不长期顶开防火门，不为财物返回屋内。' },
      { title: '到安全处再报告', body: '远离楼门、外墙和坠物区域，到安全处拨打119说明地址和所知火情；不要假定已有别人报警。' },
    ],
    sources: [source.escape],
  },
};

export function lessonFor(id: string): Lesson {
  const base = lessons[id];
  const detail = completion[id];
  if (!base || !detail) throw new Error(`缺少已核对的关卡知识：${id}`);
  const primary = detail.sources[0];
  return { ...base, ...detail, publisher: primary.publisher, url: primary.url };
}
