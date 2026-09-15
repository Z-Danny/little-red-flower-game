# 手绘完成弹窗：24 关科普与来源

核对日期：2026-09-15。此记录是科普依据与场景边界核对，不代表官方对游戏的认证或专业救援审定。

## 数据与范围

- 正式范围来自 `content/journey-map.json`：自然灾害 11 关、公共安全 7 关、居家校园办公 6 关，共 24 关。
- `app/game/journey/knowledge.ts` 保持 `lessonFor(id)`、`summary`、`publisher`、`url`、可选 `result` 兼容，新增场景短句 `message`、三条 `points[{title,body}]`、完整 `sources[{publisher,url}]`。返回的主来源为 `sources[0]`。
- 保留既有安全边界；新增科普不改变 ID、玩法目标、奖励、解锁或完成判定。三点内容是并列知识要点，不是适用于所有真实险情的操作顺序。
- 短句是游戏原创文案，不属于官方引语。每条科普结合当前规则与官方来源简述，不复制网页整段。来源保留在数据和本文，不要求在主按钮下增加文字。
- 更新前 `knowledge.ts` SHA-256：`7ba6c92323cff6b0871c0c421bac2a29722433b410a7f9a25fb1f4d31a9b050c`。更新前本文件不存在。写前已复核，未覆盖其他任务修改。

## 规则与官方依据逐关对照

对照材料：`content/levels/<id>/level.json`、`content/scenes/<id>/rules.json` 与 `presentation.json`、`content/disaster/<id>/rules.json`，以及厨房专用规则和既有知识摘要。官方核对使用原站正文或检索返回的官方网页正文；不把仅有视频标题当作内容依据。

| 正式关卡 ID | 完成短句 | 必须保留的场景边界 | 官方依据 |
| --- | --- | --- | --- |
| typhoon-home | 这片儿的风雨防备，有你一份。 | 事前准备与识别；猛烈风雨和潮湿环境中不冒险操作。 | [应急管理部](https://www.mem.gov.cn/kp/zrzh/202208/t20220809_419856.shtml)；[美国国家气象局（NWS）](https://www.weather.gov/safety/flood-during) |
| flood-kit | 这片儿的应急底气，有你一份。 | 五类收纳练习不是完整家庭储备；转移不得等待物品收齐。 | [应急管理部](https://www.mem.gov.cn/kp/shaq/202011/t20201129_372149.shtml)；[美国国家气象局（NWS）](https://www.weather.gov/safety/flood-during) |
| quake-bedroom-v2 | 这片儿的家，多了一份稳妥。 | 平时布置检查；不是房屋抗震鉴定，也不是地震倒计时。 | [美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/index.html)；[美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/stay-safe-during-an-earthquake.html) |
| storm-street-check-v2 | 这片儿的危险路口，你看清了。 | 人已在坚固建筑内观察；识别完成不代表积水和设施已修复。 | [深圳市龙岗区人民政府](https://www.lg.gov.cn/bmzz/btjdb/xxgk/yjgl/content/post_7750659.html)；[美国国家气象局（NWS）](https://www.weather.gov/safety/flood-during) |
| thunder-park-v2 | 这片儿的避雷误区，你分清了。 | 识别不能避雷的位置；雷雨不因完成目标而停止。 | [美国国家气象局（NWS）](https://www.weather.gov/safety/lightning-tips)；[美国国家气象局（NWS）](https://www.weather.gov/safety/lightning-outdoors) |
| forest-fire-sources-v2 | 这片儿的火源隐患，瞒不过你。 | 禁火林缘教学观察；不组织玩家或儿童扑火，不凭无烟判断熄灭。 | [应急管理部](https://www.mem.gov.cn/xw/mtxx/202004/t20200409_349694.shtml)；[淮南市人民政府](https://www.huainan.gov.cn/zwgk/jrhn/1260914663.html) |
| rain-street-preparation-v1 | 这片儿的雨天出行，多了你的提醒。 | 七目标灾害专用规则；现实非必要不外出，不进积水车库取车。 | [深圳市龙岗区人民政府](https://www.lg.gov.cn/bmzz/btjdb/xxgk/yjgl/content/post_7750659.html)；[美国国家气象局（NWS）](https://www.weather.gov/safety/flood-during)；[应急管理部](https://www.mem.gov.cn/kp/zrzh/202208/t20220809_419856.shtml) |
| flood-house-response-v1 | 这片儿的守望，有你一份。 | 仅可在干燥安全处准备；高处转移、求助后仍在待援。 | [美国国家气象局（NWS）](https://www.weather.gov/safety/flood-during)；[江苏省消防救援总队](https://js.119.gov.cn/202608/fcad183dfc5444a7b16647be70f37090_c_749d4af1d50340a09667.html) |
| quake-cover-practice | 这片儿的避震本领，你记牢了。 | 身边有坚固桌子；震中防护与震后联络分时发生。 | [美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/stay-safe-during-an-earthquake.html)；[美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/stay-safe-after-an-earthquake.html) |
| quake-exit-practice | 这片儿的集合处，有你报来的平安。 | 震动已停、收到撤离指引、楼梯可用；到模拟集合处不等于建筑安全。 | [美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/stay-safe-after-an-earthquake.html)；[美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/index.html)；[美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/stay-safe-during-an-earthquake.html) |
| flood-highground-practice | 这片儿的求助信号，你传出去了。 | 干燥完整楼梯可达可靠高处；电力在场外专业处置，仍在高处待援。 | [美国国家气象局（NWS）](https://www.weather.gov/safety/flood-during)；[江苏省消防救援总队](https://js.119.gov.cn/202608/fcad183dfc5444a7b16647be70f37090_c_749d4af1d50340a09667.html) |
| clear-corridor | 这片儿回家的路，被你理顺了。 | 平日无火烟时整理轻便自家物品；不能火中清障。 | [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/escape-plan/escape-plan-blocks-of-flats/) |
| lift-wait | 这片儿的求助，有了你的冷静。 | 普通故障，无烟火、进水和伤者，紧急联络可用；联系成功仍在轿厢待援。 | [国家消防救援局](https://www.119.gov.cn/site1/kp/zjts/2022/420.shtml)；[北京市市场监督管理局、北京市消防救援局](https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568251.html) |
| well-call | 这片儿的热心，被你用对了地方。 | 无救援能力的旁观者在外围报警；井口仍危险，报警不等于已救出井内人员。 | [应急管理部](https://www.mem.gov.cn/xw/bndt/201806/t20180608_229498.shtml)；[泰安市畜牧兽医事业服务中心](https://xmzx.taian.gov.cn/art/2026/4/22/art_50919_10288852.html) |
| clear-corridor-check-v2 | 这片儿的生命通道，你替大家惦记着。 | 识别堵路、充电、防火门、锁闭出口及消火栓问题；修复交由管理方。 | [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/escape-plan/escape-plan-blocks-of-flats/)；[伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/electrical-items/batteries-and-chargers/) |
| car-window-practice | 这片儿的离车本领，你多懂了一分。 | 近侧电动车窗仍可下降、开口可通过，近处有救生圈；水面支持不是获救。 | [国家消防救援局](https://www.119.gov.cn/kp/zjts/qtzh/2023/38098.shtml)；[美国国家气象局（NWS）](https://www.weather.gov/safety/flood-during) |
| lift-contact-practice | 这片儿的救援定位，有你说清的一步。 | 普通层间故障且紧急通话可用；说明编号、人数后稳定等待专业人员。 | [北京市市场监督管理局、北京市消防救援局](https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568251.html)；[国家消防救援局](https://www.119.gov.cn/site1/kp/zjts/2022/420.shtml) |
| collapse-signal-practice | 这片儿的等待，有了你发出的信号。 | 下肢被困，上身仅小幅可动；轻敲不凿挖，仍在原位待援。 | [美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/stay-safe-after-an-earthquake.html)；[美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/stay-safe-during-an-earthquake.html) |
| oil-fire | 这片儿的平安，有你一份。 | 只适用于小火且能安全靠近；盖严适配锅盖并关热源、冷却后再开，失控即撤离报警。 | [台北市政府消防局](https://www.119.gov.taipei/News_Content.aspx?n=0EDB9C505FE8B199&s=1756F0CA3C948F0C&sms=18AF49168D1E8B97)；[伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/cooking/pan-fires/) |
| charging-bedroom | 这片儿的充电角落，多了你的细心。 | 儿童识别并告诉成人；异常设备由成人或专业人员处理，出现烟火先远离。 | [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/electrical-items/batteries-and-chargers/)；[伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/electrical-items/cables-fuses-and-leads/) |
| bedroom-night-check-v2 | 这片儿的安稳一夜，有你的细心。 | 五目标为充电、破损组件、鼓胀电池、电热毯和取暖器，不能套用只讲蜡烛的总结。 | [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/electrical-items/batteries-and-chargers/)；[江苏省消防救援总队](https://js.119.gov.cn/202012/jsxfww-menu-gzdt_c_7e56d84cf82447f387aa.html)；[伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/bedtime-checks/) |
| kitchen-before-cooking-v2 | 这片儿的烟火气，有你照看着。 | 五目标为燃气软管、纸巾、积油、液化气瓶与破损水壶电线；不自行改装燃气。 | [台北市政府消防局](https://www.119.gov.taipei/News_Content.aspx?n=0EDB9C505FE8B199&s=1756F0CA3C948F0C&sms=18AF49168D1E8B97)；[国家消防救援局](https://www.119.gov.cn/xw/xfyw/2022/14384.shtml)；[伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/electrical-items/cables-fuses-and-leads/) |
| fire-shelter-practice | 这片儿的求助声，你替一家人传到了。 | 浓烟封堵路线，室内可暂时隔烟；堵缝不能隔绝全部毒气，报警后仍待援。 | [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/escape-plan/escape-plan-blocks-of-flats/) |
| fire-stairs-practice | 这片儿的平安路，你和家人一起走到了。 | 需要撤离且当前楼梯明确可用；不把无烟路线当成所有火场的前提。 | [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/escape-plan/escape-plan-blocks-of-flats/) |

## 来源采用范围与审慎处理

- 台北市消防局的油锅文章支持小火可控制时盖锅、关热源、待冷却及无法靠近时撤离；伦敦消防局页面只补充不搬锅、不泼水和安全撤离，不将其解读为建议公众自行扑救。
- 汽车来源仅采用“当前车窗可用时尽早离车”的窄范围依据。未采用部分旧网页的头枕撬窗、所有玻璃均可击碎或主动等水灌满等说法。近处救生圈来自本关明确情境，不假定所有车辆落水现场都有浮具。
- 伦敦消防局的楼宇疏散建议取决于建筑和现场方案。本游戏分别保留“路线可用撤离”和“浓烟封路隔烟待援”，不把某地建筑的留守策略、耐火时长或电话号码直接泛化。火警电话使用本游戏情境的119。
- 地震与塌陷来源中的护头、信号和关注余震可支持基础知识，但不能据此宣称被压肢体可自行拉出、任何桌子都可靠，或没有可见伤口就没有伤情。
- 洪水来源支持及时转移、远离带电积水和报告位置。干燥楼梯、安全可达电闸、现成物资及窗内示警是本关前提，不诱导玩家为取物或断电涉水。
- 电梯仍保留普通故障前提；已联络与已获救严格区分。有限空间报警也不代表井内人员已脱险。

## 官方来源索引

1. [应急管理部](https://www.mem.gov.cn/kp/zrzh/202208/t20220809_419856.shtml)
2. [美国国家气象局（NWS）](https://www.weather.gov/safety/flood-during)
3. [应急管理部](https://www.mem.gov.cn/kp/shaq/202011/t20201129_372149.shtml)
4. [美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/index.html)
5. [美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/stay-safe-during-an-earthquake.html)
6. [深圳市龙岗区人民政府](https://www.lg.gov.cn/bmzz/btjdb/xxgk/yjgl/content/post_7750659.html)
7. [美国国家气象局（NWS）](https://www.weather.gov/safety/lightning-tips)
8. [美国国家气象局（NWS）](https://www.weather.gov/safety/lightning-outdoors)
9. [应急管理部](https://www.mem.gov.cn/xw/mtxx/202004/t20200409_349694.shtml)
10. [淮南市人民政府](https://www.huainan.gov.cn/zwgk/jrhn/1260914663.html)
11. [江苏省消防救援总队](https://js.119.gov.cn/202608/fcad183dfc5444a7b16647be70f37090_c_749d4af1d50340a09667.html)
12. [美国疾控中心（CDC）](https://www.cdc.gov/earthquakes/safety/stay-safe-after-an-earthquake.html)
13. [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/escape-plan/escape-plan-blocks-of-flats/)
14. [国家消防救援局](https://www.119.gov.cn/site1/kp/zjts/2022/420.shtml)
15. [北京市市场监督管理局、北京市消防救援局](https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568251.html)
16. [应急管理部](https://www.mem.gov.cn/xw/bndt/201806/t20180608_229498.shtml)
17. [泰安市畜牧兽医事业服务中心](https://xmzx.taian.gov.cn/art/2026/4/22/art_50919_10288852.html)
18. [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/electrical-items/batteries-and-chargers/)
19. [国家消防救援局](https://www.119.gov.cn/kp/zjts/qtzh/2023/38098.shtml)
20. [台北市政府消防局](https://www.119.gov.taipei/News_Content.aspx?n=0EDB9C505FE8B199&s=1756F0CA3C948F0C&sms=18AF49168D1E8B97)
21. [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/cooking/pan-fires/)
22. [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/electrical-items/cables-fuses-and-leads/)
23. [江苏省消防救援总队](https://js.119.gov.cn/202012/jsxfww-menu-gzdt_c_7e56d84cf82447f387aa.html)
24. [伦敦消防局](https://www.london-fire.gov.uk/safety/the-home/bedtime-checks/)
25. [国家消防救援局](https://www.119.gov.cn/xw/xfyw/2022/14384.shtml)

## 内容验证

- 已以 Node 直接调用 `lessonFor`，逐一核对正式地图的 24 个 ID 均可取到完整数据；每关恰好三条，共 72 条。
- 首次检查正文长度为 36–43 个 Unicode 字符（含标点），标题与短句另计；没有空正文或空来源。
- 画面、排版、最终离线 HTML 和交互由本次 UI 接入的主任务统一验证；本内容记录不声称已完成浏览器或真机验收。
