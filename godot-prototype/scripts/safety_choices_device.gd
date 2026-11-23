extends Control

signal solved
signal cue_requested(cue: String)

const Painted = preload("res://scripts/painted_chrome.gd")
const CARD_ART = preload("res://assets/safety_choices/card.webp")
const BUTTON_ART = preload("res://assets/safety_choices/button.webp")
const DeviceItem = preload("res://scripts/safety_choices_device_item.gd")

var _stages: Array = []
var _stage := 0
var _state: Dictionary = {}
var _rows: Dictionary = {}
var _carried := ""
var _finished := false
var _transitioning := false
var _motion: Tween
@onready var _point_origin: Vector2 = %StudentPoint.position

static func is_valid(stages: Variant) -> bool:
	if not stages is Array or stages.is_empty(): return false
	for stage: Variant in stages:
		if not stage is Dictionary or not stage.get("title") is String or not stage.get("instruction") is String or not stage.get("controls") is Array:
			return false
		var ids := {}
		var endings := 0
		var attachments: Array[String] = []
		for item: Variant in stage.controls:
			if not item is Dictionary or not item.get("id") is String or not item.get("label") is String or not item.get("feedback") is String:
				return false
			if item.id.is_empty() or ids.has(item.id): return false
			var kind: String = item.get("kind", "")
			if kind not in ["mark", "switch", "advance", "reject", "carry", "drop"]: return false
			ids[item.id] = kind
			if kind == "switch" and (not item.get("initial") is bool or not item.get("goal") is bool): return false
			if kind == "drop":
				if not item.get("accept") is String: return false
				attachments.append(item.accept)
			endings += int(kind == "advance")
		for attach in attachments:
			if ids.get(attach) != "carry": return false
		if endings != 1: return false
	return true

func setup(stages: Array) -> void:
	_stages = stages

func _ready() -> void:
	_show_stage()

func focus_action() -> void:
	var first: Button = %DeviceRows.get_child(0)
	if first != null: first.grab_focus()

func _show_stage() -> void:
	var stage: Dictionary = _stages[_stage]
	%DeviceApp.text = stage.title
	%DeviceStep.text = "%d / %d" % [_stage + 1, _stages.size()]
	%DeviceInstruction.text = stage.instruction
	%DeviceNote.text = stage.get("note", "")
	%DeviceNote.visible = not %DeviceNote.text.is_empty()
	%DeviceFeedback.text = ""
	%DeviceFeedbackCard.hide()
	_state.clear()
	_rows.clear()
	_carried = ""
	for child in %DeviceRows.get_children():
		%DeviceRows.remove_child(child)
		child.queue_free()
	for item: Dictionary in stage.controls:
		_state[item.id] = item.get("initial", false)
		var button := DeviceItem.new()
		button.name = item.id
		button.kind = item.kind
		button.accepted_id = item.get("accept", "")
		button.dropped.connect(_drop.bind(item))
		button.pressed.connect(_press.bind(item))
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		button.custom_minimum_size.y = 80
		button.add_theme_font_size_override("font_size", 23)
		%DeviceRows.add_child(button)
		_rows[item.id] = button
	_sync()
	_animate(false, true)
	%DeviceScroll.set_deferred("scroll_vertical", 0)

func _goal_met(item: Dictionary) -> bool:
	return _state[item.id] == item.get("goal", true)

func _outstanding() -> int:
	var current: Dictionary = _stages[_stage]
	var count := 0
	for item: Dictionary in current.controls:
		if item.kind in ["mark", "switch", "drop"] and not _goal_met(item):
			count += 1
	return count

func _sync() -> void:
	var current: Dictionary = _stages[_stage]
	for item: Dictionary in current.controls:
		var button: Button = _rows[item.id]
		var marked := false
		var suffix := ""
		match item.kind:
			"switch":
				suffix = "　开启" if _state[item.id] else "　关闭"
				marked = _goal_met(item)
			"mark":
				marked = _goal_met(item)
				if marked: suffix = "　已标记"
			"carry":
				marked = _carried == item.id or _state[item.id]
				if marked: suffix = "　已选"
			"drop":
				marked = _goal_met(item)
				if marked: suffix = "　已归档"
		button.text = item.label + suffix
		var action: bool = item.kind in ["advance", "drop"]
		Painted.action(button, BUTTON_ART if action else CARD_ART, Color("273c28") if marked else Color("382615"))
		for style_name in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
			var style := button.get_theme_stylebox(style_name) as StyleBoxTexture
			style.content_margin_left = 21.0
			style.content_margin_right = 21.0
			if marked:
				style.modulate_color *= Color(0.78, 0.94, 0.78)

func _press(item: Dictionary) -> void:
	if _finished or _transitioning or not is_visible_in_tree(): return
	match item.kind:
		"mark":
			_state[item.id] = true
		"switch":
			_state[item.id] = not _state[item.id]
			_feedback(item.feedback if _goal_met(item) else item.get("undo", "设置已调回原状态。"), _goal_met(item))
			_sync()
			return
		"reject":
			_feedback(item.feedback, false)
			return
		"carry":
			if _state[item.id]: return
			_carried = item.id
		"drop":
			_drop(_carried, item)
			return
		"advance":
			if _outstanding() > 0:
				_feedback(item.get("blocked", "还有线索需要处理。"), false)
				return
			_transitioning = true
			cue_requested.emit("button")
			_advance_stage.call_deferred()
			return
	_feedback(item.feedback, true)
	_sync()

func _advance_stage() -> void:
	if not is_inside_tree(): return
	_stage += 1
	if _stage == _stages.size():
		_finished = true
		solved.emit()
		return
	_transitioning = false
	_show_stage()
	focus_action()

func _drop(id: String, item: Dictionary) -> void:
	if _finished or _transitioning or not is_visible_in_tree(): return
	if id != item.accept:
		_feedback("先选中或拖动截图，再放进这个文件夹。", false)
		return
	_state[id] = true
	_state[item.id] = true
	_carried = ""
	_feedback(item.feedback, true)
	_sync()

func _feedback(copy: String, positive: bool) -> void:
	cue_requested.emit("pickup" if positive and not _carried.is_empty() else "correct" if positive else "wrong")
	%DeviceFeedback.text = copy
	%DeviceFeedbackCard.show()
	_animate(positive, false)

func _animate(positive: bool, transition: bool) -> void:
	if _motion != null: _motion.kill()
	%StudentRest.show()
	%StudentRest.modulate.a = 1.0
	%StudentPoint.visible = positive
	%StudentPoint.position = _point_origin
	%StudentPoint.modulate.a = 1.0
	%DeviceContents.modulate.a = 1.0
	%DeviceFeedback.modulate.a = 1.0
	_motion = create_tween()
	if transition:
		%DeviceContents.modulate.a = 0.0
		_motion.tween_property(%DeviceContents, "modulate:a", 1.0, 0.28)
	elif positive:
		%StudentPoint.position.x += 8.0
		%StudentPoint.modulate.a = 0.0
		_motion.tween_property(%StudentPoint, "position:x", _point_origin.x, 0.27).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		_motion.parallel().tween_property(%StudentPoint, "modulate:a", 1.0, 0.22)
		_motion.parallel().tween_property(%StudentRest, "modulate:a", 0.0, 0.20)
	else:
		%DeviceFeedback.modulate.a = 0.45
		_motion.tween_property(%DeviceFeedback, "modulate:a", 1.0, 0.23)
