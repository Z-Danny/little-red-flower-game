# 九岛新增关卡：北京公共安全科普复核

复核日期：2026-11-15。以[北京市应急管理局科普宣教的「公共安全知识」][emergency]为主入口，按主题补查北京各主管部门公开资料；共用终端退出账号的细节补参公安部网安局科普。表中的场景、线索和交互是游戏改编，不是官方题库或官方审核。以下仅修订上一轮 28 张草稿的玩法设计，不增加关卡、不重新分岛、不改变原有 ID、解锁或存档。

## 通用玩法与边界

- **场景找险**：用原游戏的「观察 → 圈出有证据的目标 → 对照安全结果」机制。等母版、像素蒙版和试玩验收齐备后，才沿用共用视口、提示与挑战 HUD。图中要同时看得见目标和判断条件，例如过街人行信号、挡在门口的物品、正在封闭的路段。画外缺少成人、看不到水瓶、看不清日期，都不能单独算错。
- **卡片练习**：网络消息、标签、保存记录等以大字卡片呈现，读完再选「暂不操作」「向谁核实」等做法。建议不限时，选错解释原因后可重试；不承诺当前找隐患模板已支持这类交互。模拟链接、二维码、账号、付款和举报均不接真实服务，不收集个人信息。
- **安全反馈**：只在示意图或模拟界面操作。儿童从安全处告知老师、家长、救生员或工作人员，不把圈选做成接触裸线、处理试剂、涉水清障或下水救人的演出。食品仅识别证据，不以试吃鉴别；餐食查验和异常处理由成人或学校工作人员负责。
- **判定与结局**：正例旁放可辨认的安全对照；颜色、亮度、价格、外貌或缺少画外信息不作为唯一证据。表现「停下、绕行、告知、核实」及之后由负责人处理的结果，不把行为练习包装成真实处置完成。

## 校园、居家与交通

| 草稿 ID | 关卡名称 | 修订后玩法与反馈 | 依据 |
| --- | --- | --- | --- |
| `campus-classroom-check-v1` | 教室放学巡查 | 场景找险：圈出堵住教室出口的纸箱，以及有明显破损、露出线芯的电源线。学生不碰设备，离开危险位置后报告老师；结局由校方清障、停用损坏设备。 | [校园][school]、[消防][fire]、[用电][power] |
| `campus-lab-check-v1` | 实验室课前巡查 | 场景找险：在中学化学实验室找出装有试剂却没有名称标注的分装瓶、已裂的试剂瓶，以及在明确要求戴护目镜的实验台上未戴护目镜就准备操作的人。结局是老师叫停并复核；不让学生打开、闻、混合或清理试剂。 | [学校实验室][lab] |
| `campus-playground-check-v1` | 操场活动找险 | 场景找险：圈出已经损坏并标示停用、仍被使用的器材，找出跑道内的障碍；对照热身后按老师指引使用完好场地。不能凭站姿认定没热身。 | [校园设施][school-facilities]、[开学风险][school-risk] |
| `campus-stairs-check-v1` | 教学楼梯巡查 | 场景找险：圈出楼梯追逐、推搡和攀爬扶手。对照画面为靠右、有序通行；不以人数多少直接判定拥挤危险。 | [校园][school]、[开学风险][school-risk] |
| `campus-rain-check-v1` | 雨天校园找险 | 场景找险：从教学楼内观察，圈出有积水的入口台阶、路面已没入水中的低洼通道和被翻开的井盖。结局遵从校方指引；需要移动时走校方确认可用的路线，不派学生探水或靠近井口确认。 | [暴雨][rain]、[积水内涝][ponding] |
| `campus-canteen-check-v1` | 校园餐前卫生巡查 | 短情境配对：把「刚倒完垃圾」「摸完脏抹布准备吃饭」等连贯画面配到「先用流动水和肥皂洗手」；已洗手的对照不重复判错。专练餐前手卫生，不查验盒饭。 | [开学健康][school-health]、[家庭食安][food-home] |
| `home-kitchen-hygiene-v1` | 家中备餐卫生巡查 | 场景找险：圈出带明显生肉残留、却正在切即食水果的砧板，装过生肉又直接装熟食的盘子，以及溅到即食菜上的生肉汁。结局由成人把生熟工具分开，清洁台面并处理受污染食品。 | [家庭食安][food-home] |
| `home-food-storage-v1` | 家庭食材储存巡查 | 标签配对：先看「需冷藏」「需冷冻」「阴凉干燥处保存」等大字标签，再选择图中的对应存放区。专练按说明存放，不用食品外观猜保存条件。 | [家庭食安][food-home]、[市场监管][food-market] |
| `home-commute-visibility-v1` | 夜路出行找险 | 场景找险：在夜间路口找出人行红灯时正踏上斑马线、翻越道路护栏、过街时低头看手机等行为。结局对照「走过街设施、看人行信号、观察来车再走」；衣服深色不是判错条件。 | [北京交管][traffic]、[校园][school] |

## 防溺水与社区安全

| 草稿 ID | 关卡名称 | 修订后玩法与反馈 | 依据 |
| --- | --- | --- | --- |
| `water-riverside-check-v1` | 河岸游玩找险 | 场景找险：从有护栏的步道观察，在画面中找到翻栏、在陡滑岸沿打闹、越过禁入标识下水的行为。结算复盘：看到有人落水，立即从安全处大声求助、请成人报警；没有成人在场也不等待，立即求助报警，不下水或手拉手施救。 | [滨水风险][water]、[学生防溺水][drowning]、[儿童意外防护][child-safety] |
| `water-pool-check-v1` | 泳池边找险 | 场景找险：找出湿滑池边奔跑、在「禁止跳水」标识旁从池边跳入，以及忽视「暂不开放」标识进入水区。对照在开放时由家长或老师带领，选择有救生员的正规场馆；找不到画外救生员不扣分。 | [正规场所][water-venue]、[学生防溺水][drowning] |
| `water-rainy-crossing-v1` | 雨后水边找险 | 简图选路：从安全处标记漫过桥面的流水、封闭的近河通道和正在泄洪的禁入区，再选题面已明确可通行且远离河道的高处绕行路线。雨停或水面看似平静都不等于可以试走，不做探深、跨水操作。 | [暴雨][rain]、[防汛值守][flood] |
| `social-neighborhood-check-v1` | 社区公共空间巡查 | 场景找险：标记接着充电线的楼内电动自行车、由窗户拉到楼下并接入车身的「飞线」、占住标示消防车通道的车辆。结局从安全处向物业报告；不让儿童拔线、搬车或碰电池。 | [消防][fire]、[社区夜查][community] |

## 网络安全

| 草稿 ID | 关卡名称 | 修订后玩法与反馈 | 依据 |
| --- | --- | --- | --- |
| `network-chat-privacy-v1` | 聊天信息找险 | 标记模拟聊天中索要住址、学校、手机号或实时位置的消息；选择不提供，必要时找老师或家长。目标是具体的信息请求，不凭头像或昵称判断对方。 | [学生网安][net-youth] |
| `network-link-check-v1` | 陌生链接找险 | 给出一条未经核实、要求打开链接重新登录的「通知」；指出需要核实的来源和账号请求，选择从已知官方入口独立核实，不点消息里的链接、按钮或二维码。 | [网安提示][net-police]、[北京警方反诈][fraud] |
| `network-account-check-v1` | 账号保护巡查 | 对比虚构设置卡片，找出容易被猜中的密码、公开展示的账号口令和暴露的验证码；从预设选项识别较强的保护方式。密码全用剧情占位符，不请玩家输入或展示自己的密码。 | [网安提示][net-police]、[北京警方反诈][fraud] |
| `network-device-share-v1` | 共用设备找险 | 在图书角模拟终端上检查「账号仍登录」和「下次自动登录」状态；选择退出自己的账号、不保存登录信息，发现别人忘退则告知工作人员，不翻看或修改他人账号。 | [网安提示][net-police]、[公安部网安局科普（区政府转载）][net-shared] |
| `network-purchase-check-v1` | 游戏充值找险 | 模拟「充值退款」私聊：标记要求绕开平台、交出账号或验证码、先付款才能退款的消息；选择停止操作，告诉家长并从原平台核实。不会因尝试点击、付款或提交验证码获分。 | [学生网安][net-youth]、[北京警方反诈][fraud] |
| `network-message-check-v1` | 群聊传言找险 | 对照群聊截图与模拟学校公告，核对发布方、日期和原文。出处不明或仅有催转截图，选「未核实，先不转」；给出证据冲突才判为错误信息，不把所有群消息判为谣言。 | [学生网安][net-youth]、[北京警方辟谣][rumor] |

## 食品安全

| 草稿 ID | 关卡名称 | 修订后玩法与反馈 | 依据 |
| --- | --- | --- | --- |
| `food-table-check-v1` | 餐桌卫生巡查 | 场景对照：在多人合餐图中识别用过的个人筷子夹公盘里的菜、喝过汤的勺子伸回公汤盆；对照分餐或使用公筷公勺。重点是共享餐桌，不重复考餐前洗手或厨房生熟分隔。 | [市场监管][food-market]、[分餐与公筷公勺][serving] |
| `food-fridge-check-v1` | 冰箱存放找险 | 场景找险：圈出上层渗漏生肉对下层熟食造成的污染，以及同盒直接接触的生肉、即食食品。对照生肉单独密封放下层、熟食分开覆盖。没有温度或存放记录就不判超期或断冷链。 | [家庭食安][food-home] |
| `food-market-check-v1` | 市集采购找险 | 给出当天日期及大字包装卡：比对明确过期的商品、破损封口和本不应鼓胀却明显胀袋的食品；对照包装完好且标签清楚、在保质期内并按标示条件陈列的商品。便宜、散装本身不是判错条件。 | [市场监管][food-market]、[北京市场监管汛期提示][food-rain] |
| `food-picnic-check-v1` | 野餐食品找险 | 看野餐物资卡与保存记录：标记明确需要冷藏却长时间常温放置的食品、现场采来的野生菌、取自河道的未经处理水；选择按要求保存的食物和安全饮用水。 | [家庭食安][food-home]、[北京市场监管汛期提示][food-rain] |
| `food-leftovers-check-v1` | 剩菜处理找险 | 按「离桌 → 冷藏 → 再吃」读同种熟菜的两条记录：一份及时冷藏、下一餐彻底复热；另一份室温放了一整夜，应丢弃，不能靠复热补救。没有记录的不让玩家靠闻或尝来判定。 | [北京疾控][food-home]、[市场监管剩菜提示][food-leftovers] |
| `food-school-lunch-check-v1` | 校园午餐找险 | 看模拟校外供餐的封装，对照容器封装标识上的食用时限和题面时间，指出封装破损或已过食用时限，选择先不吃、告知老师。学校指定人员负责收餐和查验配送清单；儿童不拆未知餐盒、不试吃。 | [北京中小学供餐][school-meal] |

## 文旅户外安全

| 草稿 ID | 关卡名称 | 修订后玩法与反馈 | 依据 |
| --- | --- | --- | --- |
| `outdoor-trail-check-v1` | 徒步山径找险 | 在开放步道图与路线牌上找出越过封闭栏杆、靠近崖边拍照、脱队走未开放捷径的行为；结局沿开放步道结伴，不为打卡闯入。 | [文旅提示][trail]、[顺义警方][trail-police] |
| `outdoor-camp-check-v1` | 营地夜间找险 | 场景找险：圈出禁火标识旁的明火、剖面示意中帐篷内的炭火取暖，以及跨过已标疏散通道的帐篷拉绳。结局从安全处告知营地工作人员；不要求小孩进入帐篷灭火，也不把开一条帐篷缝画成可以继续用炭火。 | [露营地管理办法][camp]、[防一氧化碳中毒][carbon-monoxide]、[消防][fire] |
| `outdoor-sun-check-v1` | 晴日出游找险 | 高温出行计划选择：给出明确高温提示、活动时段和可用饮水，把午间暴晒运动改为避开高温、择阴休息或改期；同伴出现不适就停止活动、告知成人。不从晴天或汗水单独诊断中暑。 | [北京应急高温][heat]、[北京卫健委][heat-health] |

## 交付说明

本轮是策划表与公开资料比对。各表列的是代表性目标而非已定的判定蒙版；不为凑数加入看不见或有歧义的目标。场景关进入制作时再按原流水线确认 3～6 个独立目标、同源美术、手机可辨性和离线通关；卡片、配对、选路关先确认是否需要独立玩法。未修改现有游戏规则、关卡目录、地图和导出 HTML，没有签发知识或启用门禁的通过记录。玩法、最终 HTML、真机和人耳验收均为 `not_run`。

[emergency]: https://yjglj.beijing.gov.cn/col/col2468/
[school]: https://kfqgw.beijing.gov.cn/zmhdkfq/cjwt/202202/t20220221_4430427.html
[school-health]: https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/tzxx/202603/t20260305_4550254.html
[school-risk]: https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202603/t20260304_4549600.html
[school-facilities]: https://www.beijing.gov.cn/zhengce/dfxfg/202103/t20210313_2306746.html
[fire]: https://yjglj.beijing.gov.cn/art/2012/9/11/art_6160_457284.html
[power]: https://yjglj.beijing.gov.cn/art/2024/5/23/art_3940_243660.html
[lab]: https://www.beijing.gov.cn/zhengce/gfxwj/sj/201911/t20191125_535957.html
[rain]: https://yjglj.beijing.gov.cn/art/2022/11/19/art_3950_244120.html
[ponding]: https://www.beijing.gov.cn/ywdt/zwzt/2024aqdx/fxjz/202608/t20260812_4819293.html
[traffic]: https://jtgl.beijing.gov.cn/jgj/jgxx/94246/95332/166233/index.html
[water]: https://swj.beijing.gov.cn/swdt/ztzl/fnsbaqztxc/fnszlxx/202607/t20260722_4778064.html
[drowning]: https://jw.beijing.gov.cn/xxgk/2024zcwj/2024qtwj/202407/t20240722_3756487.html
[child-safety]: https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202603/t20260330_4569820.html
[water-venue]: https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202608/t20260806_4811512.html
[flood]: https://yjglj.beijing.gov.cn/art/2025/7/29/art_4574_744660.html
[community]: https://kfqgw.beijing.gov.cn/ywdt/gzdt/202603/t20260325_4565790.html
[net-youth]: https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202609/t20260914_4863398.html
[net-police]: https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202603/t20260311_4554370.html
[net-shared]: https://www.baiyinqu.gov.cn/XZJDBMDW/bmdw/byqwhtyhlyj/fdzdgknr/zczxwdk/art/2026/art_8cd50d52ccf141ddb442ff5187a01fe4.html
[fraud]: https://gaj.beijing.gov.cn/xxfb/jwbd/202507/t20250704_4142141.html
[rumor]: https://gaj.beijing.gov.cn/xxfb/jfts/201912/t20191220_1367431.html
[food-home]: https://www.beijing.gov.cn/fuwu/bmfw/sy/jrts/202402/t20240210_3561570.html
[food-market]: https://scjgj.beijing.gov.cn/zwxx/scjgdt/202604/t20260430_4628434.html
[food-rain]: https://scjgj.beijing.gov.cn/zwxx/scjgdt/202607/t20260706_4749522.html
[food-leftovers]: https://scjgj.beijing.gov.cn/zwxx/scjgdt/202602/t20260218_4525227.html
[serving]: https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jksh/202304/t20230423_3063821.html
[school-meal]: https://www.beijing.gov.cn/zhengce/zhengcefagui/202501/t20250103_3980410.html
[trail]: https://whlyj.beijing.gov.cn/zwgk/tzgg/202407/t20240709_3741340.html
[trail-police]: https://gaj.beijing.gov.cn/xxfb/fjjx/202611/t20261111_4942390.html
[camp]: https://whlyj.beijing.gov.cn/zwgk/2024zcwj/202605/t20260515_4653045.html
[carbon-monoxide]: https://wjw.beijing.gov.cn/bmfw_20143/jkzs/jksh/202511/t20251128_4309074.html
[heat]: https://yjglj.beijing.gov.cn/art/2024/3/18/art_3950_244102.html
[heat-health]: https://wjw.beijing.gov.cn/xwzx_20031/xwfb/202606/t20260603_4683944.html
