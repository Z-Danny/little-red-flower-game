# 素材来源与本轮编辑请求

既有源素材：
- patient-source.png：上轮内置 image_gen 生成的写实仰卧人物，复制保存，不重新绘制。
- rescuer-source.png：项目 public/levels/first-aid-cpr/helper.png，复用项目已有角色。原生成提示词此处不可追溯，不编造。

本轮工具：image_gen.imagegen；结果：503 model_not_found，未获得新输出，没有调用 CLI 或其他付费后备。

实际请求提示词：

Edit this exact isolated realistic watercolor rescuer into the AED ANALYSIS / ALL CLEAR pose. Preserve the same man's face, short dark hair, teal short-sleeved T-shirt, navy trousers, shoes, human proportions, rendering style, camera, canvas aspect, transparent background, position of BOTH knees and feet, and overall scale. Change ONLY upper torso and arms: straighten his upper torso slightly while still kneeling; withdraw BOTH hands completely from the bottom-left contact point and raise both hands near his chest, palms openly visible, elbows comfortably bent, clearly NOT TOUCHING the patient. Serious attentive expression, not smiling or cheering. The bottom-left area where stacked hands touched the chest must now be entirely empty/transparent. No patient, no floor, no equipment, no text, no added props. This is a same-anchor alternate animation frame, so DO NOT shift or crop the knees/feet or resize the person. Genuine transparent alpha background.

当前落地不是上述未成功生成的抬手帧，而是既有人物按接触锚点做姿态微动和清场后退。源图只做等比例编码和透明边距处理。
