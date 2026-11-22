extends RefCounted
## Port of the disaster-v1 reducer only. The seven-target street stays separate
## from generic hunts, and the flood level retains its authored safe early exit.

var rules: Dictionary
var safe_hold_ms: float
var phase := "playing"
var elapsed := 0.0
var penalty := 0.0
var goals: Array[String] = []
var pending: Dictionary = {}
var pending_age := 0.0
var reveal_age := 0.0
var notice := ""
var tone := "neutral"
var last_action := ""

func _init(data: Dictionary, hold: float) -> void:
	rules = data
	safe_hold_ms = hold
	notice = str(rules.opening).replace("90 秒", "%d 秒" % int(rules.seconds)) if data.kind == "prevention" else str(rules.opening)

func remaining() -> float:
	return maxf(0.0, float(rules.seconds) * 1000.0 - elapsed - penalty)

func action_available(action_data: Dictionary) -> bool:
	if goals.has(action_data.get("goal", "")):
		return false
	for prerequisite: String in action_data.get("requires", []):
		if not goals.has(prerequisite): return false
	return true

func next_action() -> Dictionary:
	if not pending.is_empty(): return pending
	for action_data: Dictionary in rules.actions:
		if action_data.outcome == "correct" and action_available(action_data): return action_data
	return {}

func advance(ms: float) -> String:
	var dt := clampf(ms if is_finite(ms) else 0.0, 0.0, 100.0)
	if phase == "reveal":
		reveal_age += dt
		if reveal_age >= safe_hold_ms:
			phase = "complete"
			return "complete"
		return ""
	if phase != "playing": return ""
	elapsed += dt
	if remaining() <= 0.0:
		var final_accepted: bool = rules.kind == "prevention" and not pending.is_empty() and pending.has("goal") and not goals.has(pending.goal) and goals.size() == rules.goals.size() - 1
		elapsed = maxf(0.0, float(rules.seconds) * 1000.0 - penalty)
		if not final_accepted: return _fail(rules.timeout)
	if pending.is_empty(): return ""
	pending_age += dt
	if pending_age < float(pending.duration): return ""
	last_action = pending.id
	if pending.has("goal"): goals.append(pending.goal)
	_say(pending.feedback, "good")
	pending = {}
	pending_age = 0.0
	if goals.size() >= rules.goals.size():
		phase = "reveal"
		reveal_age = 0.0
	return "found"

func act(source: String, target: String, input: String) -> String:
	if phase != "playing" or not pending.is_empty(): return ""
	if rules.kind == "prevention" and remaining() <= 0.0: return _fail(rules.timeout)
	var matches: Array[Dictionary] = []
	for action_data: Dictionary in rules.actions:
		if action_data.source == source and action_data.target == target and action_data.input == input:
			if action_data.outcome == "danger":
				last_action = action_data.id
				return _fail(action_data.feedback)
			matches.append(action_data)
	for action_data in matches:
		if action_available(action_data):
			last_action = action_data.id
			if action_data.outcome == "escape":
				phase = "evacuated"
				_say(action_data.feedback, "good")
				return "escaped"
			pending = action_data
			pending_age = 0.0
			return "start"
	for action_data in matches:
		if goals.has(action_data.get("goal", "")): return ""
	if not matches.is_empty():
		_say("先沿干燥路线靠近楼梯，并在可安全到达时断电；来不及准备可直接上楼。")
		return "notice"
	if rules.kind == "prevention":
		penalty += float(rules.missPenalty) * 1000.0
		if remaining() <= 0.0: return _fail(rules.timeout)
		_say("这里不是本关隐患，剩余时间少 %d 秒。" % int(rules.missPenalty), "bad")
		return "wrong"
	_say("这次放置没有改变局势，物品已放回。")
	return "notice"

func _say(text: String, next_tone: String = "neutral") -> void:
	notice = text
	tone = next_tone

func _fail(text: String) -> String:
	phase = "failed"
	pending = {}
	_say(text, "bad")
	return "failed"
