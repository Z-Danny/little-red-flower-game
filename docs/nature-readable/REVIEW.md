# 第三、四关可读性修改验收记录

日期：2026-10-07。

## 交付范围与未完成项
- 第三关 `quake-bedroom-v2`：候选皮肤 readable-v3；新构图将五目标移入公共相机可视范围，明确展示蓝柜连接脱开与木柜固定连接；新母版编译同源目标蒙版、人物、剪影、补空图和结局图。结算加入可展开的准备前/后对照。
- 第四关 `storm-street-check-v2`：本次只交付五种风险文字标签、对应说明、末项目说明保留和不计分结算判断题。继续使用原正式皮肤 skin.json。
- **第四关新构图未启用。** readable-v3 的静态 HUD 门禁失败；readable-v4 虽通过静态门禁，但在实际 320×568 浏览器中广告牌连接件仍侵入展开剪影（目标顶136.44px，剪影底151px）。该失败记录保留在 verification/storm-preview/report.json。不能将静态通过当成实际通过。
- 再次请求下移广告牌时，图像工具两次返回 HTTP503/model_not_found/No available channel，没有产生可用的新图。未换用另一付费服务、未手工缩小热区掩盖问题。

## 第三关审核
审核者：Codex agent（机器辅助审查，不是专家背书或真机试玩）。
- 知识：保留原 rules.json 的五目标、知识含义、50秒与800ms描圈；原规则 SHA 见 rules-preserved.json。结局仍限定为成人在平时固定、移低、移走与清空，未描述孩子在震动时处理家具。
- 画面：已查看母版、结局、mask-overlay、reconstructed、人物提取和真实手机截图；新图目标与脸部重新标定，非沿用旧坐标。木柜固定/蓝柜脱开的视觉差别明确；人物边缘在软件合成检查中可接受，不声称逐像素美术完美。
- 像素：prepare-hazard-batch.py 和 check-hazard-batch-art.py 使用隔离本地 Python 3.12、Pillow11.2.1/numpy2.2.6/scipy1.15.3/opencv4.11.0。验证精确ID色、同源提取、目标保护、补空许可及无天气误用。
- 浏览器：verification/quake-preview-current/report.json，6种视口320×568/375×667/390×844/430×932/540×960/1440×900；真实触摸依次点中5目标，390视口逆序；暂停冻结、重试清空、末项目知识保留、准备前后切换、奖励不重复、回地图通过。
- 离线：实际导出 HTML 浏览器打开，阻断网络、记录脚本错误，隔离存档、静音，finally关闭。无注入成功事件或奖励回调。浏览器时钟受控，因此不评价真人手速。
- physicalDevice: not_run；humanListening: not_run。

## 公共代码边界
- 仅通过可选 presentation 字段 targetFeedback/retainLastLesson/compareEnding 接入；未改关卡专用相机/CSS，未扩命中区。
- LearningReview 不写存档、不改通关/奖励、不阻止退出；旧关不配置则不出现。
- 保留同工作区其他任务的计时评分、应急包、油锅等修改，未回退、提交、推送或发布。

## 构建限制
- 专用单测与 TypeScript 检查已通过，完整 npm test 结果保存在 full-tests.txt。
- npm run build 在载入 rolldown 本机绑定时被 Windows Application Control 阻止（ERR_DLOPEN_FAILED）；不是 TS 源码诊断。未关闭或绕过系统防护。
- 独立离线导出采用已有 esbuild 脚本并成功执行，不能将此说成 vinext 网站生产构建已通过。保留限制，不发布线上版。

最终用户原路径 HTML 的实测 SHA 和结果在 verification/final/report.json（最终验证完成后写入）；未生成该报告前不视为最终交付。

## 最终离线交付核对
- 状态：partial_delivery，第三关完成、第四关交互完成而构图修复未完成。
- 最终HTML SHA256：`9e9fdbf5333f893be4f56f9badcc3d43a125ab38a31f8a5cd7ce2d0043e1a876`。实际文件、导出校验、浏览器报告三者一致。
- 120条实际浏览器检查通过，第四关旧画面遮挡/裁切另列 knownLayoutIssues，不计作已修复。
- 专用6项单测、完整npm test、TypeScript及第三关像素校验退出码0。
- 原文件备份：`备份-三四关更新前-20261007-151329.html`。
