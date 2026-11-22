extends RefCounted
## Configured-v1 state machine. Rules and skins are read-only; the run is the only mutable state.
## All clocks are active gameplay milliseconds. Display, input geometry and audio never grant goals.

const DATA := "res://assets/configured_runner/levels/"
const MISS_PENALTY_MS := 5000.0

var rules: Dictionary
var skin: Dictionary
var pack: Dictionary
var run: Dictionary
var objects: Dictionary = {}
var interactions: Dictionary = {}
var goals: Dictionary = {}

static func load_pack(level_id: String) -> Dictionary:
	if level_id.is_empty() or level_id.validate_node_name() != level_id or "/" in level_id or "\\" in level_id or "." in level_id:
		return {}
	var path := DATA + level_id + ".json"
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed is Dictionary and parsed.get("schemaVersion") == 1 and parsed.get("id") == level_id:
		return parsed
	return {}

func _init(package: Dictionary) -> void:
	pack = package
	rules = pack["rules"]
	skin = pack["skin"]
	for object: Dictionary in rules["objects"]:
		objects[object["id"]] = object
	for action: Dictionary in rules["interactions"]:
		interactions[action["id"]] = action
	for goal: Dictionary in rules["goals"]:
		goals[goal["id"]] = goal
	reset()

static func has_all(values: Array, expected: Array) -> bool:
	for key: Variant in expected:
		if not values.has(key):
			return false
	return true

static func has_some(values: Array, expected: Array) -> bool:
	for key: Variant in expected:
		if values.has(key):
			return true
	return false

func reset(scenario_id: String = "") -> bool:
	var scenarios: Array = rules.get("scenarios", [])
	var scenario: Dictionary = {}
	if not scenario_id.is_empty():
		for candidate: Dictionary in scenarios:
			if candidate["id"] == scenario_id:
				scenario = candidate
				break
		if scenario.is_empty():
			return false
	elif not scenarios.is_empty():
		scenario = scenarios.pick_random()
	run = {
		"scenarioId": scenario.get("id", ""), "phase": "playing",
		"resolved": scenario.get("initialGoals", []).duplicate(), "resolvedAt": {},
		"stages": [], "stageAges": {}, "action": {}, "failure": {},
		"inventory": [], "departed": false, "inventoryRejected": false,
		"escaped": false, "escapeRule": "", "elapsed": 0.0, "risk": float(rules["risk"]["initial"]),
		"mistakes": 0, "peakSeen": false, "settleAge": 0.0, "stars": 0,
		"reaction": "", "reactionMs": 0.0, "boost": 0.0, "notice": {}, "serial": 0,
	}
	if rules.has("briefing"):
		_notice(rules["briefing"], 5500)
	return true

func object_label(id: String) -> String:
	return objects.get(id, {}).get("label", id)

func completed_goals() -> bool:
	return has_all(run["resolved"], rules["completion"]["requires"]) and (not rules.has("inventory") or run["departed"])

func completion_elapsed_ms() -> float:
	return maxf(0.0, float(run["elapsed"]) - float(run["settleAge"]))

func emotion() -> String:
	if completed_goals():
		return "relieved"
	if not run["reaction"].is_empty():
		return run["reaction"]
	return "panicked" if run["risk"] >= rules["risk"]["warningAt"] else "worried"

func matches(condition: Dictionary) -> bool:
	var any_goals: Array = condition.get("any", [])
	return (has_all(run["resolved"], condition.get("all", []))
		and (any_goals.is_empty() or has_some(run["resolved"], any_goals))
		and not has_some(run["resolved"], condition.get("not", []))
		and has_all(run["stages"], condition.get("stages", []))
		and not has_some(run["stages"], condition.get("notStages", []))
		and (not condition.has("emotion") or condition["emotion"] == emotion())
		and (not condition.has("riskAtLeast") or run["risk"] >= condition["riskAtLeast"]))

func enabled(id: String) -> bool:
	var spec: Dictionary = objects.get(id, {})
	return (not spec.is_empty() and spec["input"] != "none"
		and has_all(run["resolved"], spec.get("requires", []))
		and has_all(run["stages"], spec.get("stages", [])) and not run["inventory"].has(id)
		and not has_some(run["resolved"], spec.get("disabledWhen", [])))

func active_conversation() -> Dictionary:
	if run["phase"] != "playing":
		return {}
	for card: Dictionary in rules.get("coaching", {}).get("conversations", []):
		if has_all(run["resolved"], card["requires"]) and not has_some(run["resolved"], card["unless"]):
			return card
	return {}

func rule_for(source: String, mode: String, target: String = "", choice: String = "") -> Dictionary:
	if not _valid_input(source, mode):
		return {}
	var card := active_conversation()
	if (choice.is_empty() and not card.is_empty()) or (not choice.is_empty() and not card.get("choices", []).has(choice)):
		return {}
	for action: Dictionary in rules["interactions"]:
		if action["source"] != source or action["mode"] != mode:
			continue
		if (action.has("choice") and action["id"] != choice) or (not action.has("choice") and not choice.is_empty()):
			continue
		if mode == "drop" and (action["target"] != target or not zone_enabled(target)):
			continue
		if not has_all(run["resolved"], action.get("requires", [])) or not has_all(run["stages"], action.get("stages", [])):
			continue
		if has_some(run["resolved"], action.get("unless", [])):
			continue
		if not action["grants"].is_empty() and has_all(run["resolved"], action["grants"]):
			continue
		return action
	return {}

func zone_enabled(id: String) -> bool:
	return skin["zones"].has(id) and matches(skin.get("zoneConditions", {}).get(id, {}))

func relevant_zones(source: String) -> Array[String]:
	var result: Array[String] = []
	for id: String in pack["zoneOrder"]:
		if not rule_for(source, "drop", id).is_empty():
			result.append(id)
	return result

func failure_revealing() -> bool:
	var failure: Dictionary = run["failure"]
	return run["phase"] == "failed" and not failure.is_empty() and failure["age"] < failure["duration"]

func input_free() -> bool:
	return run["phase"] == "playing" and run["action"].is_empty()

func _valid_input(source: String, mode: String) -> bool:
	if not enabled(source) or mode not in ["tap", "drop"]:
		return false
	var input: String = objects[source]["input"]
	return input == "both" or (input == "tap" and mode == "tap") or (input == "drag" and mode == "drop")

func _deadline() -> float:
	return float(rules["risk"]["seconds"]) * 1000.0

func _timed_out(elapsed: float) -> bool:
	return rules["risk"].get("timeout") == "fail" and elapsed >= _deadline()

func _fail_timeout() -> void:
	run["phase"] = "failed"
	run["elapsed"] = _deadline()
	run["action"] = {}
	run["stars"] = 0
	_notice(rules["risk"]["peakFeedback"], 5000)

func _final_action(action: Dictionary) -> bool:
	if rules.has("inventory") or action.is_empty():
		return false
	var rule: Dictionary = interactions.get(action["rule"], {})
	return rule.get("outcome") == "correct" and has_all(run["resolved"] + rule["grants"], rules["completion"]["requires"])

func _notice(text: String, ms: float) -> void:
	run["notice"] = {"text": text, "remaining": ms}

func notice_text() -> String:
	return run["notice"].get("text", "")

func hint_text() -> String:
	if not input_free():
		return ""
	var card := active_conversation()
	if not card.is_empty():
		return card["reference"] + " " + card["prompt"]
	for rule: Dictionary in rules["interactions"]:
		if rule["outcome"] == "correct" and not has_all(run["resolved"], rule["grants"]):
			if rule_for(rule["source"], rule["mode"], rule.get("target", "")).get("id") == rule["id"]:
				return rule.get("hint", "观察%s，试着%s。" % [object_label(rule["source"]), "点击它" if rule["mode"] == "tap" else "把它移到合适的位置"])
	return ""

func pause_hint() -> String:
	if run["phase"] != "playing":
		return ""
	if not run["action"].is_empty():
		return "正在操作%s，回到场景后等待完成。" % object_label(run["action"]["source"])
	var text := hint_text()
	if not text.is_empty():
		return text
	for stage: Dictionary in rules.get("stages", []):
		if stage["id"] not in run["stages"] and has_all(run["resolved"], stage["requires"]):
			var all_actions: Array = rules["interactions"].duplicate()
			all_actions.reverse()
			for rule: Dictionary in all_actions:
				if (rule["outcome"] == "correct" and rule.has("feedback") and has_some(rule["grants"], stage["requires"])
					and has_all(run["resolved"], rule["grants"])):
					return rule["feedback"] + "回到场景后继续等待。"
			return "保持当前状态。回到场景后继续等待。"
	return ""

func dispatch(event: Dictionary) -> void:
	match event.get("type", ""):
		"reset": reset()
		"tick": tick(float(event.get("ms", 0)), event.get("paused", false))
		"interact":
			var input: Dictionary = event["input"]
			interact(input["source"], input["mode"], input.get("target", ""), input.get("choice", ""), input.get("point"))
		"unpack": inventory_event(false, event["source"])
		"depart": inventory_event(true)
		"miss":
			if rules["kind"] == "prevention" and rules["risk"].get("timeout") == "fail" and input_free():
				run["elapsed"] = minf(_deadline(), float(run["elapsed"]) + MISS_PENALTY_MS)
				_notice("点错了，剩余时间 −5 秒。", 1800)
				if _timed_out(run["elapsed"]):
					_fail_timeout()
		"hint":
			var text := hint_text()
			if not text.is_empty():
				_notice(text, 2800 if active_conversation().is_empty() else 5000)

func interact(source: String, mode: String, target: String = "", choice: String = "", point: Variant = null) -> void:
	if not input_free():
		return
	if _timed_out(run["elapsed"]):
		_fail_timeout()
		return
	if not _valid_input(source, mode):
		return
	var spec: Dictionary = rules.get("inventory", {})
	if spec.get("items", []).has(source) and run["inventory"].size() >= spec["capacity"]:
		_notice("背包已满，最多放 %d 件。点背包取出物品后再装。" % int(spec["capacity"]), 2800)
		return
	var rule := rule_for(source, mode, target, choice)
	if rule.is_empty() and (not choice.is_empty() or not active_conversation().is_empty()):
		return
	run["serial"] += 1
	var action := {"rule": rule.get("id", ""), "source": source, "age": 0.0, "duration": 450.0, "point": point, "serial": run["serial"]}
	if not rule.is_empty():
		action["duration"] = float(skin["animations"][rule["animation"]]["durationMs"])
	if rule.get("failure", false):
		run["phase"] = "failed"
		run["stars"] = 0
		run["mistakes"] += 1
		run["reaction"] = "panicked"
		if skin.get("presentation", {}).get("failureReveal", false):
			run["failure"] = action
		_notice(rule["feedback"], 5000)
		return
	run["action"] = action
	if rule.is_empty():
		_notice(objects[source].get("missFeedback", "未放入可用目标区域，物品已回原位。请重新选中，再移到目标框内。") if mode == "drop" else "这里暂时不能操作。", 2800)
		return
	var danger: bool = rule["outcome"] == "danger"
	if danger:
		run["mistakes"] += 1
		run["reaction"] = "panicked"
		run["reactionMs"] = 2500.0
		run["boost"] = minf(1, float(run["boost"]) + .7)
	if rules["risk"].get("mode") == "elapsed":
		run["risk"] = 0.0
	elif danger:
		run["risk"] = clampf(run["risk"] + float(rule.get("riskDelta", 15)), 0, 100)
	run["notice"] = {}
	if rule["outcome"] != "correct" and rule.has("feedback"):
		_notice(rule["feedback"], 2300)
	elif rule["outcome"] == "correct" and rules["kind"] == "prevention" and rules["risk"].get("timeout") == "fail":
		_notice("已选中%s，正在收纳…" % object_label(source), action["duration"])

func inventory_event(depart: bool, source: String = "") -> void:
	var spec: Dictionary = rules.get("inventory", {})
	if spec.is_empty() or not input_free():
		return
	if _timed_out(run["elapsed"]):
		_fail_timeout()
		return
	var inventory: Array = run["inventory"]
	if not depart:
		if source not in inventory:
			return
		inventory.erase(source)
		for rule: Dictionary in rules["interactions"]:
			if rule["source"] == source:
				for goal: String in rule["grants"]:
					run["resolved"].erase(goal)
					run["resolvedAt"].erase(goal)
		_notice("已取出，放回原处，可以重新选择。", 2400)
		return
	if inventory.size() != int(spec["capacity"]):
		_notice("请先装满 %d 件物品，再检查出发。" % int(spec["capacity"]), 2600)
		return
	var unwanted: PackedStringArray = []
	var missing: PackedStringArray = []
	var reasons := ""
	for item: String in inventory:
		if item not in spec["required"]:
			unwanted.append(object_label(item))
			reasons += spec["failureReasons"].get(item, "")
	for item: String in spec["required"]:
		if item not in inventory:
			missing.append(object_label(item))
	if not unwanted.is_empty() or not missing.is_empty():
		run["phase"] = "failed"
		run["inventoryRejected"] = true
		run["stars"] = 0
		run["reaction"] = "panicked"
		_notice("背包里装了不需要的物品：" + "、".join(unwanted) + "。" + reasons + ("还缺：" + "、".join(missing) + "。" if not missing.is_empty() else ""), 5000)
		return
	run["departed"] = true
	run["reaction"] = "relieved"
	_settle(int(rules["completion"].get("fixedStars", 3)))

func _settle(stars: int) -> void:
	run["phase"] = "settling"
	run["settleAge"] = 0.0
	run["stars"] = stars
	run["notice"] = {}

func tick(delta_ms: float, paused: bool = false) -> void:
	if paused or not is_finite(delta_ms) or delta_ms <= 0.0 or run["phase"] == "complete":
		return
	var ms := minf(delta_ms, 100.0)
	if run["phase"] == "failed":
		if failure_revealing():
			var failure: Dictionary = run["failure"]
			failure["age"] = minf(failure["duration"], failure["age"] + ms)
		return
	run["elapsed"] += ms
	run["reactionMs"] = maxf(0, float(run["reactionMs"]) - ms)
	if run["reactionMs"] <= 0:
		run["reaction"] = ""
	run["boost"] = maxf(0, float(run["boost"]) - ms / 5000.0)
	if not run["notice"].is_empty():
		run["notice"]["remaining"] -= ms
		if run["notice"]["remaining"] <= 0:
			run["notice"] = {}
	if run["phase"] == "settling":
		run["settleAge"] += ms
		run["risk"] = maxf(0, float(run["risk"]) - ms / 20.0)
		if run["settleAge"] >= float(rules["completion"]["settleMs"]) + float(rules["completion"].get("observeMs", 0)):
			run["phase"] = "complete"
		return
	var action: Dictionary = run["action"]
	if _timed_out(run["elapsed"]):
		if not _final_action(action):
			_fail_timeout()
			return
		run["elapsed"] = _deadline()
	var elapsed_mode: bool = rules["risk"].get("mode") == "elapsed"
	run["risk"] = 0.0 if elapsed_mode else minf(100, float(run["risk"]) + ms / (float(rules["risk"]["seconds"]) * 10.0))
	var before: Array = run["resolved"].duplicate()
	if not action.is_empty():
		action["age"] += ms
		if action["age"] >= action["duration"]:
			run["action"] = {}
			if _commit_action(action, elapsed_mode):
				return
	for stage: Dictionary in rules.get("stages", []):
		var id: String = stage["id"]
		if id in run["stages"] or not has_all(run["resolved"], stage["requires"]):
			continue
		var after: float = stage["afterMs"]
		var age := minf(after, float(run["stageAges"].get(id, 0)) + (ms if has_all(before, stage["requires"]) else 0.0))
		run["stageAges"][id] = age
		if age >= after:
			run["stages"].append(id)
			if stage.has("feedback"):
				_notice(stage["feedback"], 4000)
	if completed_goals():
		_settle(int(rules["completion"].get("fixedStars", 3 if run["mistakes"] == 0 and not run["peakSeen"] else 2)))
	elif run["risk"] >= 100 and not run["peakSeen"]:
		run["peakSeen"] = true
		run["boost"] = maxf(.4, float(run["boost"]))
		if run["notice"].is_empty():
			_notice(rules["risk"]["peakFeedback"], 2500)

## Returns true for the safe early-exit terminal, which never commits unmet goals.
func _commit_action(action: Dictionary, elapsed_mode: bool) -> bool:
	var rule: Dictionary = interactions.get(action["rule"], {})
	var spec: Dictionary = rules.get("inventory", {})
	var item: bool = spec.get("items", []).has(action["source"])
	if not rule.is_empty() and item and action["source"] not in run["inventory"]:
		run["inventory"].append(action["source"])
	if rule.get("escape", false):
		run["escaped"] = true
		run["escapeRule"] = rule["id"]
		run["reaction"] = "relieved"
		run["reactionMs"] = 0.0
		run["boost"] = 0.0
		_settle(0)
		if rule.has("feedback"):
			_notice(rule["feedback"], 5000)
		return true
	if rule.get("outcome") == "correct":
		for goal: String in rule["grants"]:
			if goal not in run["resolved"]:
				run["resolved"].append(goal)
			if not run["resolvedAt"].has(goal):
				run["resolvedAt"][goal] = run["elapsed"]
		run["reaction"] = "focused"
		run["reactionMs"] = 1800.0
		run["risk"] = 0.0 if elapsed_mode else clampf(run["risk"] + float(rule.get("riskDelta", -8)), 0, 100)
		if rule.has("feedback"):
			_notice(rule["feedback"], 4000)
		elif rules["kind"] == "prevention" and rules["risk"].get("timeout") == "fail":
			_notice("已收好：" + object_label(rule["source"]), 2000)
		elif rule["mode"] == "drop":
			_notice("已放置：" + object_label(rule["source"]), 2000)
	if item:
		var count: int = run["inventory"].size()
		_notice("已装入%s（%d/%d）。%s" % [object_label(action["source"]), count, int(spec["capacity"]),
			"点背包检查，再决定出发。" if count == int(spec["capacity"]) else "点背包可查看或取出。"], 3000)
	return false
