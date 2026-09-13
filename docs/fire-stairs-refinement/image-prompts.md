# 高楼撤离：人物取手机姿态

工具：内置 imagegen，模型版本未由工具返回，不标注未经核实的型号。
用途：仅修改本关人物演出，不改场景视口和其他关卡。
生成后棋盘格被绘入 RGB，沿用用户已授权的本地去背处理；详见 art-processing.json。

## 从口袋取出手机

Use case: identity-preserve. Asset type: transparent 2D picture-book game character sprite, taking a phone out of a pocket. Image 1 is the edit target. Preserve the exact mother and son identities, hair, warm paper-gouache texture, clothing colors, perspective, feet placement, body proportions, child pose, and original transparent canvas framing. Modify only mother's arm pose: she lowers her outstretched arm and reaches toward the black smartphone already protruding from her front trouser pocket; her fingers grip its upper edge and begin lifting it out, with the lower half still inside that SAME pocket. Mother looks concerned but controlled, looking down toward her hand. The boy stays next to her unchanged. Exactly ONE normal-sized black phone, not a second prop. Keep the full figures including shoes. Genuine transparent alpha background, no white halo, no floor or shadow plate, no text or speech bubbles, no background, no new objects. Keep blank alpha margins and same overall framing so this sprite can swap in place.

## 举到耳边通话

Use case: identity-preserve. Asset type: transparent game sprite of a mother calling emergency services with her son. Image 1 is the edit target (mother starting to take her phone out). Keep exact original canvas, full-body size, feet positions, boy pose and location, mother's face, hairstyle, red sweater, cream trousers, black shoes, warm paper-gouache picture-book art. Only change the mother's right arm (on image-left) from reaching into her pocket to holding that SAME small black smartphone naturally against her right ear. Her now empty trouser pocket must contain NO second phone. Her face is worried but composed, listening on phone, no exaggerated screaming. Her other arm remains by her side. Child stays unchanged. Phone firmly held by fingers at ear, NOT floating. Genuine transparent alpha background, no checkerboard painted into pixels, no backdrop, no ground, no white outlines, no speech balloon, no text. Preserve bottom and side framing so animation can swap sprites without feet drifting.

最终资源：public/levels/fire-stairs-refinement-v1/family-taking-phone.webp 与 family-calling.webp。
