extends RefCounted
## Direct port of the original untimed training reducer; UI and sounds observe state.

var rules: Dictionary
var phase := "scene"
var elapsed := 0.0
var called := false
var requested_at := -1.0
var aed_ready := false
var handed_over := false
var samples := 0
var near := 0
var last_tap := -1.0
var pulse_at := -1.0
var feedback := "教学练习逐步进行：先请女士拨打120。真实急救中呼救与帮助应并行。"
var review := ""
var review_ms := 0.0

func _init(data: Dictionary) -> void:
	rules = data

func step_id() -> String:
	if not called: return "call"
	if requested_at < 0.0: return "aed"
	if phase == "scene": return "start"
	if phase not in ["rhythm", "complete"]: return phase
	if samples < int(rules.sampleIntervals): return "rhythm"
	return "finish" if handed_over else "handover"

func can_finish() -> bool:
	return review.is_empty() and phase == "rhythm" and called and aed_ready and handed_over and samples >= int(rules.sampleIntervals)

func advance(ms: float) -> void:
	if not is_finite(ms) or ms < 0.0 or ms > 250.0 or phase == "complete": return
	elapsed += ms
	if requested_at >= 0.0 and elapsed - requested_at >= float(rules.aedTravelMs):
		aed_ready = true
	review_ms = maxf(0.0, review_ms - ms)

func suspend() -> void:
	last_tap = -1.0
	pulse_at = -1.0

func action(id: String, correct: bool = true) -> String:
	if phase == "complete": return ""
	if id == "continue":
		if review.is_empty() or review_ms > 0.0: return ""
		review = ""
		feedback = ""
		suspend()
		return "goal-confirm"
	if not review.is_empty() or ("rhythm" if id == "tap" else id) != step_id(): return ""
	match id:
		"call":
			called = true
			return _learn(id, "已指派旁人拨打120。", "medical-connect")
		"aed":
			requested_at = elapsed
			return _learn(id, "已指派另一人尽快取AED。", "medical-connect")
		"start":
			phase = "position"
			return _learn(id, "选择患者胸部一侧的施救位置。")
		"position":
			if not correct: return _wrong("脚边离胸部太远。请移到胸部一侧，不搬动患者去找道具。")
			phase = "hands"
			return _learn(id, "已到胸部一侧。")
		"hands":
			if not correct: return _wrong("掌根应在胸部中央、胸骨下半部，双手重叠。")
			phase = "posture"
			return _learn(id, "手位示意正确。")
		"posture":
			if not correct: return _wrong("双臂伸直，肩在双手正上方，注意充分回弹。")
			phase = "rhythm"
			return _learn(id, "姿势示意正确。")
		"tap": return _tap()
		"handover":
			if not aed_ready: return ""
			handed_over = true
			return _learn(id, "接替者已就位并继续模拟按压。")
		"finish":
			if not can_finish(): return ""
			phase = "complete"
			feedback = "练习完成，协助者继续模拟救助。本关不演示AED分析或电击。"
			return "finish"
	return ""

func _wrong(text: String) -> String:
	feedback = text
	return "wrong-warning"

func _learn(id: String, text: String, cue: String = "goal-confirm") -> String:
	feedback = text
	suspend()
	review = id
	review_ms = float(rules.reviewMs)
	return cue

func _tap() -> String:
	var interval := elapsed - last_tap if last_tap >= 0.0 else -1.0
	if interval >= 0.0 and interval < float(rules.minInputMs):
		feedback = "点得太急了，跟随光点，避免连点。"
		return ""
	last_tap = elapsed
	pulse_at = elapsed
	if interval < 0.0 or interval > float(rules.maxIntervalMs):
		feedback = "已记录起拍。停顿后重新采样，不扣除已有练习。"
		return "soft-tap"
	var rate := 60000.0 / interval
	var close := rate >= float(rules.rateMin) and rate <= float(rules.rateMax)
	samples = mini(int(rules.sampleIntervals), samples + 1)
	near += int(close)
	feedback = "输入节奏接近提示，继续保持。" if close else "输入偏快，稍微放慢。" if rate > float(rules.rateMax) else "输入偏慢，跟随光点稍微加快。"
	return _learn("rhythm", feedback, "soft-tap") if samples >= int(rules.sampleIntervals) else "soft-tap"
