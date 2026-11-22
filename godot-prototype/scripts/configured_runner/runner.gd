extends Control
## Native configured-v1 player. Configure with catalog metadata before _ready.

signal finished(won: bool, elapsed_seconds: float)
signal exited

const Rules = preload("res://scripts/configured_runner/rules.gd")
const World = preload("res://scripts/configured_runner/world.gd")
const RunAudio = preload("res://scripts/configured_runner/audio.gd")
const Painted = preload("res://scripts/painted_chrome.gd")
const FONT = preload("res://assets/ui/flower-ui.woff2")
const DESIGN := Vector2(576, 1024)
const STAGE := Rect2(10, 77, 556, 820)
const CREAM := Color("fff1d2")
const MUTED_INK := Color("d5c9aa")
const GOLD := Color("f6ce84")
const INK := Color("27342d")

var _entry: Dictionary
var _model: Rules
var _world: World
var _audio: RunAudio
var _paused := false
var _hidden := false
var _sent := false
var _leaving := false
var _inventory_open := false
var _help_open := false
var _action_sheet := false
var _show_goals := false
var _selection := ""
var _drag: Dictionary = {}
var _conversation_text := ""
var _conversation_id := ""
var _blocked_text := ""
var _result_hold := -1.0
var _failure_shown := false
var _footer_key := ""
var _overlay_key := ""

var _heading: Label
var _subtitle: Label
var _time: Label
var _bar: ProgressBar
var _hint_button: Button
var _pause_button: Button
var _text: Label
var _footer_buttons: HBoxContainer
var _overlay: Control
var _draw_caption: Panel
var _inventory_notice: Label
var _choice_notice: Label

func configure(entry: Dictionary) -> void:
	if is_inside_tree():
		push_error("ConfiguredRunner.configure must precede add_child")
		return
	_entry = entry.duplicate(true)

func _ready() -> void:
	_set_theme()
	_make_frame()
	var id: String = _entry.get("id", "")
	var package := Rules.load_pack(id) if _entry.get("engine", "configured-v1") == "configured-v1" else {}
	if package.is_empty():
		_blocked_text = "找不到该关的本地内容。"
		_sync_ui()
		return
	_model = Rules.new(package)
	_heading.text = _entry.get("title", _model.rules["title"])
	var missing := _world.build(_model)
	if not missing.is_empty():
		_blocked_text = "关卡素材不完整：" + "、".join(missing)
		_sync_ui()
		return
	_audio = RunAudio.new()
	_audio.name = "ConfiguredAudio"
	add_child(_audio)
	_audio.build(_model)
	_update()

func _process(delta: float) -> void:
	if _leaving or _model == null or not _blocked_text.is_empty() or _paused or _hidden:
		return
	if _sent:
		return
	_model.tick(delta * 1000.0)
	_update()
	if _result_hold >= 0.0 and _model.run["phase"] == "complete" and not _model.run["escaped"]:
		_result_hold -= delta
		if _result_hold <= 0.0:
			_emit_finished(true)

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		_hidden = true
		if is_instance_valid(_world):
			_clear_selection()
			_world.refresh()
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN or what == NOTIFICATION_APPLICATION_RESUMED:
		_hidden = false
	else:
		return
	if is_instance_valid(_audio):
		_audio.set_suspended(_hidden or _paused)

func result_detail() -> Dictionary:
	if _model == null:
		return {}
	var rules := _model.rules
	var run := _model.run
	var title := str(rules["completion"].get("title", "练习完成"))
	var reason := ""
	var kind := ""
	if run["phase"] == "failed":
		title = "练习未完成"
		reason = _model.notice_text()
		if rules["risk"].get("timeout") == "fail" and reason == rules["risk"].get("peakFeedback", ""):
			kind = "timeout"
		else:
			kind = "wrong-inventory" if rules.has("inventory") else "unsafe-action"
	elif run["escaped"]:
		title = "已先行到达高处"
		reason = _model.interactions[run["escapeRule"]].get("feedback", "已先行转移至安全高处，继续等待救援指引。")
	return {"title": title, "reason": reason, "kind": kind, "summary": rules["completion"]["summary"],
		"progress": _progress(true), "escaped": run["escaped"], "stars": run["stars"]}

func prepare_result_backdrop() -> void:
	# Keep the completed configuration, including original outside, upstairs,
	# or rescue poses where supplied in this level's authored art.
	var stage := _world.get_parent()
	for control: Control in get_children().filter(func(child: Node) -> bool: return child is Control):
		if control != stage:
			control.hide()

func _emit_finished(won: bool) -> void:
	if _sent or _leaving:
		return
	_sent = true
	finished.emit(won, _model.completion_elapsed_ms() / 1000.0)

func _exit_level() -> void:
	if _leaving or _sent:
		return
	_leaving = true
	_clear_selection()
	if _audio != null:
		_audio.set_suspended(true)
	exited.emit()

func _set_theme() -> void:
	theme = Theme.new()
	theme.default_font = FONT
	theme.default_font_size = 21
	for button_state: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		var style := _style(Color("f0dfb9"), Color("c69f64"), 12, 1)
		if button_state == "hover":
			style.bg_color = Color("fff2ce")
		elif button_state == "pressed":
			style.bg_color = Color("e6bf7b")
		elif button_state == "disabled":
			style.bg_color = Color("b3a88a")
			style.border_color = Color("877c64")
		elif button_state == "focus":
			style.draw_center = false
			style.border_color = Color("fff4bd")
			style.set_border_width_all(3)
		theme.set_stylebox(button_state, "Button", style)
	for property: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]:
		theme.set_color(property, "Button", INK)
	theme.set_color("font_disabled_color", "Button", Color("554e42"))
	theme.set_color("font_color", "Label", CREAM)

func _style(fill: Color, edge: Color, radius: int, width: int = 1) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_corner_radius_all(radius)
	style.set_border_width_all(width)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 4
	style.content_margin_bottom = 4
	return style

func _place(node: Control, rect: Rect2) -> void:
	node.position = rect.position
	node.size = rect.size

func _label(text: String, font_size: int = 21, color: Color = CREAM, wrap: bool = true) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if wrap:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label

func _button(text: String, callback: Callable, height: float = 44, font_size: int = 20) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = height
	button.add_theme_font_size_override("font_size", font_size)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.pressed.connect(callback)
	return button

func _make_frame() -> void:
	var paper := ColorRect.new()
	paper.color = Color("27372e")
	paper.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(paper)
	paper.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var stage_border := Panel.new()
	stage_border.add_theme_stylebox_override("panel", _style(Color("20332d"), Color("8a7e5e"), 6, 2))
	stage_border.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(stage_border)
	_place(stage_border, STAGE.grow(2))
	var stage := Control.new()
	stage.name = "SceneClip"
	stage.clip_contents = true
	stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(stage)
	_place(stage, STAGE)
	_world = World.new()
	_world.name = "SceneWorld"
	_world.mouse_filter = Control.MOUSE_FILTER_STOP
	_world.gui_input.connect(_world_input)
	stage.add_child(_world)
	_world.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var back := _button("返回", _exit_level, 45, 19)
	back.name = "Back"
	add_child(back)
	_place(back, Rect2(10, 12, 66, 45))
	Painted.hud(back, Painted.BACK, "返回地图")
	_heading = _label("处置练习", 24, CREAM, false)
	_heading.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	add_child(_heading)
	_place(_heading, Rect2(86, 8, 278, 33))
	_subtitle = _label("", 16, MUTED_INK, false)
	add_child(_subtitle)
	_place(_subtitle, Rect2(87, 43, 280, 22))
	_time = _label("", 22, GOLD, false)
	_time.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(_time)
	_place(_time, Rect2(347, 12, 77, 45))
	_hint_button = _button("提示", _hint, 44, 18)
	_hint_button.name = "Hint"
	add_child(_hint_button)
	_place(_hint_button, Rect2(425, 12, 66, 45))
	_pause_button = _button("暂停", _toggle_pause, 44, 18)
	_pause_button.name = "Pause"
	add_child(_pause_button)
	_place(_pause_button, Rect2(499, 12, 67, 45))
	Painted.hud(_hint_button, Painted.HINT, "关卡提示")
	Painted.hud(_pause_button, Painted.PAUSE, "暂停练习")
	_bar = ProgressBar.new()
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.show_percentage = false
	_bar.add_theme_stylebox_override("background", _style(Color("1d2e2b"), Color("1d2e2b"), 4, 0))
	_bar.add_theme_stylebox_override("fill", _style(GOLD, GOLD, 4, 0))
	add_child(_bar)
	_place(_bar, Rect2(11, 68, 554, 5))

	_draw_caption = Panel.new()
	_draw_caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_draw_caption.add_theme_stylebox_override("panel", _style(Color("3a4133"), Color("7d7357"), 12, 1))
	add_child(_draw_caption)
	_place(_draw_caption, Rect2(10, 903, 556, 63))
	_text = _label("", 19)
	_text.max_lines_visible = 2
	_text.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	add_child(_text)
	_place(_text, Rect2(23, 906, 530, 57))
	_footer_buttons = HBoxContainer.new()
	_footer_buttons.name = "Actions"
	_footer_buttons.add_theme_constant_override("separation", 7)
	add_child(_footer_buttons)
	_place(_footer_buttons, Rect2(10, 971, 556, 44))

	_overlay = Control.new()
	_overlay.name = "Modal"
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_overlay)
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _input(event: InputEvent) -> void:
	if _model == null or _sent or _leaving:
		return
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		if _paused:
			_toggle_pause()
		elif _inventory_open or _help_open or _action_sheet or _show_goals:
			_close_sheets()
			_update()
		elif not _selection.is_empty():
			_clear_selection()
			_update()
		else:
			_toggle_pause()
		get_viewport().set_input_as_handled()
		return
	if _drag.is_empty():
		return
	if event is InputEventMouseMotion:
		_update_drag(_world.viewport_to_world(event.position))
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		_release(_world.viewport_to_world(event.position))
		get_viewport().set_input_as_handled()

func _world_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_accept_world_press(_world.to_world(event.position))
		_world.accept_event()

func _accept_world_press(point: Vector2) -> void:
	if not _scene_input_free():
		return
	var spec: Dictionary = _model.skin["world"]
	if not Rect2(0, 0, spec["width"], spec["height"]).has_point(point):
		return
	var is_challenge := _deadline_challenge()
	var id := _world.pick(point, is_challenge, 9.0 / _world.stage_scale)
	if not id.is_empty() and not _model.enabled(id):
		return
	var zone := _world.pick_zone(_selection, point) if not _selection.is_empty() else ""
	if _model.skin.has("presentation") and not zone.is_empty() and id != _selection:
		_interact(_selection, "drop", zone, "", point)
		return
	if not id.is_empty() and _model.objects[id]["input"] == "tap":
		_interact(id, "tap")
		return
	if id.is_empty():
		if not _selection.is_empty():
			_interact(_selection, "drop", zone, "", point)
		elif is_challenge and not _has_collection_hud():
			_close_sheets()
			_audio.wrong()
			_model.dispatch({"type": "miss"})
			_update()
		return
	_begin_selection(id)
	var p := _world.pose(id)
	_drag = {"id": id, "point": point, "start": point, "offset": point - World.box(p).position, "moved": false}
	_update()

func _begin_selection(id: String) -> void:
	if _selection != id:
		_audio.pickup()
	_selection = id

func _update_drag(point: Vector2) -> void:
	_drag["point"] = point
	var start: Vector2 = _drag["start"]
	_drag["moved"] = _drag["moved"] or point.distance_to(start) > 8.0
	_update()

func _release(point: Vector2) -> void:
	var d := _drag
	_drag = {}
	if not _scene_input_free():
		_clear_selection()
		_update()
		return
	var source: String = d["id"]
	var start: Vector2 = d["start"]
	if d["moved"] or point.distance_to(start) > 8.0:
		var placement := _world.placement(source, point, d["offset"])
		if not placement.is_empty():
			_interact(source, "drop", placement["target"], "", placement["point"])
			return
	elif _model.skin.has("presentation") and _model.objects[source]["input"] == "both" and not _model.rule_for(source, "tap").is_empty():
		_interact(source, "tap")
		return
	_update()

func _input_allowed() -> bool:
	return _model != null and _blocked_text.is_empty() and not _sent and not _leaving and not _paused and not _hidden and _model.input_free()

func _scene_input_free() -> bool:
	return _input_allowed() and _model.active_conversation().is_empty() and not (_inventory_open or _help_open or _action_sheet or _show_goals)

func _clear_selection() -> void:
	_selection = ""
	_drag = {}
	_world.selected = ""
	_world.target = ""
	_world.drag = {}

func _interact(source: String, mode: String, target: String = "", choice: String = "", point: Variant = null) -> void:
	if not _input_allowed():
		return
	if source == _model.rules.get("inventory", {}).get("container"):
		_toggle_inventory()
		return
	_help_open = false
	_action_sheet = false
	_show_goals = false
	_clear_selection()
	_model.interact(source, mode, target, choice, point)
	_update()

func _toggle_inventory() -> void:
	if not _input_allowed():
		return
	var was_open := _inventory_open
	_close_sheets()
	_inventory_open = not was_open
	_update()

func _inventory_event(depart: bool, source: String = "") -> void:
	if not _input_allowed():
		return
	_model.inventory_event(depart, source)
	if _model.run["phase"] != "playing":
		_inventory_open = false
	_update()

func _hint() -> void:
	if not _input_allowed():
		return
	if _deadline_challenge():
		var reopen := not _show_goals
		_close_sheets()
		_show_goals = reopen
	else:
		_model.dispatch({"type": "hint"})
	_update()

func _toggle_pause() -> void:
	if _model == null or _sent or _model.run["phase"] != "playing":
		return
	_paused = not _paused
	_clear_selection()
	_audio.set_suspended(_paused or _hidden)
	_update()

func _restart() -> void:
	if _sent or _leaving:
		return
	_model.reset()
	_audio.reset()
	_paused = false
	_close_sheets()
	_conversation_id = ""
	_conversation_text = ""
	_result_hold = -1.0
	_failure_shown = false
	_audio.set_suspended(_hidden)
	_update()

func _close_sheets() -> void:
	_inventory_open = false
	_help_open = false
	_action_sheet = false
	_show_goals = false
	_clear_selection()

func _open_help() -> void:
	if not _input_allowed():
		return
	_close_sheets()
	_help_open = true
	_update()

func _open_actions() -> void:
	if not _input_allowed():
		return
	_close_sheets()
	_action_sheet = true
	_update()

func _sheet_source(id: String) -> void:
	if not _input_allowed():
		return
	_action_sheet = false
	var input: String = _model.objects[id]["input"]
	if input == "tap" or (input == "both" and not _model.rule_for(id, "tap").is_empty()):
		_interact(id, "tap")
	else:
		_begin_selection(id)
		_update()

func _deadline_challenge() -> bool:
	return _model.rules["kind"] == "prevention" and _model.rules["risk"].get("timeout") == "fail"

func _has_collection_hud() -> bool:
	for object: Dictionary in _model.rules["objects"]:
		if object.get("hudAction", false):
			return true
	return false

func _visible_goals() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for goal: Dictionary in _model.rules["goals"]:
		if goal.get("showTarget", true):
			result.append(goal)
	return result

func _progress(for_result: bool = false) -> String:
	if _model.rules.has("inventory"):
		return "背包 %d/%d" % [_model.run["inventory"].size(), int(_model.rules["inventory"]["capacity"])]
	var ids: Array = _model.rules.get("coaching", {}).get("tasks", []).duplicate()
	if ids.is_empty():
		for goal: Dictionary in _visible_goals():
			ids.append(goal["id"])
	if ids.is_empty():
		if not for_result:
			return ""
		ids = _model.rules["completion"]["requires"]
	var done := 0
	for goal: String in ids:
		if goal in _model.run["resolved"]:
			done += 1
	return "%d/%d 项" % [done, ids.size()]

func _inspection() -> String:
	var action: Dictionary = _model.run["action"]
	if action.is_empty():
		return ""
	var rule: Dictionary = _model.interactions.get(action["rule"], {})
	if rule.is_empty():
		return ""
	var labels := PackedStringArray()
	for check: Dictionary in _model.skin["animations"][rule["animation"]].get("checks", []):
		labels.append(("✓ " if float(action["age"]) / float(action["duration"]) >= float(check["at"]) else "○ ") + check["label"])
	return "   ".join(labels)

func _update() -> void:
	if _model == null:
		return
	var card := _model.active_conversation()
	if card.get("id", "") != _conversation_id:
		_conversation_id = card.get("id", "")
		_conversation_text = ""
		_clear_selection()
	if not card.is_empty() and not _model.notice_text().is_empty():
		_conversation_text = _model.notice_text()
	_world.refresh()
	if not _selection.is_empty() and (not _model.input_free() or not _model.enabled(_selection) or not _world.in_scene(_selection)):
		_clear_selection()
	_world.selected = _selection
	_world.drag = _drag
	_world.target = _world.placement(_selection, _drag["point"], _drag["offset"]).get("target", "") if _drag.get("moved", false) else ""
	_audio.advance()
	if _model.run["phase"] == "failed" and not _model.failure_revealing() and not _failure_shown:
		_failure_shown = true
		_audio.result(false)
	elif _model.run["phase"] == "complete" and not _model.run["escaped"] and _result_hold < 0.0:
		_result_hold = maxf(0.0, _audio.result(true))
	_sync_ui()

func _sync_ui() -> void:
	_hint_button.disabled = not _input_allowed()
	_pause_button.disabled = _model == null or _model.run["phase"] != "playing"
	if _model == null or not _blocked_text.is_empty():
		_text.text = _blocked_text
		_sync_overlay()
		return
	var run := _model.run
	var seconds := 0
	var countdown: bool = _deadline_challenge() or _model.skin.get("presentation", {}).get("timer") == "countdown"
	var reference: float = _model.rules["risk"]["seconds"]
	_bar.visible = countdown
	if countdown:
		var remainder := maxf(0.0, reference - _model.completion_elapsed_ms() / 1000.0)
		seconds = ceili(remainder)
		_bar.value = remainder / reference * 100.0
	elif _model.rules["risk"].get("mode") == "elapsed":
		seconds = floori(_model.completion_elapsed_ms() / 1000.0)
	else:
		seconds = ceili(maxf(0.0, (100.0 - float(run["risk"])) * reference / 100.0))
	_time.text = "%02d:%02d" % [floori(seconds / 60.0), seconds % 60]
	var progress := _progress()
	_subtitle.text = ("训练倒计时" if countdown else "练习用时") + (" · " + progress if not progress.is_empty() else "")
	_draw_caption.visible = _model.skin.get("presentation", {}).get("noticeAppearance") != "scene"
	var feedback := _inspection()
	if feedback.is_empty():
		feedback = _model.notice_text()
	if not _selection.is_empty():
		var zone := _world.target
		if not zone.is_empty():
			var rule := _model.rule_for(_selection, "drop", zone)
			feedback = "禁止放置：" + rule["feedback"] if rule.get("outcome") == "danger" else "松手放到：" + _zone_name(zone)
		elif _drag.get("moved", false):
			feedback = "尚未对准目标区域，移动到框内再松手。"
		else:
			feedback = "已选中%s：拖到目标框，或点选目标区域。" % _model.object_label(_selection)
	elif run["phase"] in ["settling", "complete"]:
		feedback = result_detail()["title"] + " · " + str(_model.rules["completion"].get("status", "已完成"))
	elif feedback.is_empty():
		feedback = _model.rules["description"]
	_text.text = feedback
	_sync_footer()
	_sync_overlay()

func _zone_name(id: String) -> String:
	return _model.skin.get("zoneLabels", {}).get(id, id)

func _sync_footer() -> void:
	var key := "%s:%s:%s:%s:%s" % [_model.input_free(), _selection, _model.run["resolved"], _model.run["inventory"], _model.run["stages"]]
	if _footer_key == key:
		return
	_footer_key = key
	_clear_children(_footer_buttons)
	if _model.run["phase"] != "playing":
		return
	if not _selection.is_empty():
		for zone: String in _model.relevant_zones(_selection):
			_footer_button(_zone_name(zone), _interact.bind(_selection, "drop", zone), "Zone_" + zone)
		_footer_button("取消", func() -> void:
			_clear_selection()
			_update(), "CancelSelection")
		return
	if _model.rules.has("inventory"):
		_footer_button(_progress() + " · 查看", _toggle_inventory, "Inventory")
	for object: Dictionary in _model.rules["objects"]:
		if object.get("hudAction", false) and _model.enabled(object["id"]):
			_footer_button(object["label"], _interact.bind(object["id"], "tap"), "Object_" + str(object["id"]))
	if _model.rules.has("coaching"):
		_footer_button("练习提示", _open_help, "Coaching")
	_footer_button("文字操作", _open_actions, "ActionSheet")

func _footer_button(text: String, callback: Callable, key: String) -> void:
	var button := _button(text, callback, 43, 18)
	button.name = key
	button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	button.clip_text = true
	button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	button.tooltip_text = text
	button.disabled = not _model.input_free()
	_footer_buttons.add_child(button)

func _clear_children(parent: Node) -> void:
	for node: Node in parent.get_children():
		parent.remove_child(node)
		node.queue_free()

func _sync_overlay() -> void:
	var key := ""
	var card: Dictionary = {}
	if not _blocked_text.is_empty():
		key = "blocked"
	elif _paused:
		key = "pause:%s:%s" % [_audio.muted, _world.reduced_motion]
	elif _model != null:
		card = _model.active_conversation()
		if _model.run["phase"] == "failed" and not _model.failure_revealing():
			key = "failed"
		elif _model.run["phase"] == "complete" and _model.run["escaped"]:
			key = "escaped"
		elif not card.is_empty():
			key = "choice:%s:%s" % [card["id"], _model.input_free()]
		elif _inventory_open:
			key = "inventory:%s:%s" % [_model.run["inventory"], _model.input_free()]
		elif _help_open:
			key = "coaching"
		elif _action_sheet:
			key = "actions:%s:%s" % [_model.run["resolved"], _model.run["stages"]]
		elif _show_goals:
			key = "goals"
	if key != _overlay_key:
		_overlay_key = key
		_clear_children(_overlay)
		_inventory_notice = null
		_choice_notice = null
		if key == "blocked":
			var shell := _modal("关卡未加载")
			shell.add_child(_label(_blocked_text))
			shell.add_child(_button("返回关卡", _exit_level))
		elif key.begins_with("pause:"):
			_make_pause()
		elif key in ["failed", "escaped"]:
			_make_result(key == "escaped")
		elif key.begins_with("choice:"):
			_make_choice(card)
		elif key.begins_with("inventory:"):
			_make_inventory()
		elif key == "coaching":
			_make_coaching()
		elif key.begins_with("actions:"):
			_make_action_sheet()
		elif key == "goals":
			_make_goals()
	if is_instance_valid(_inventory_notice):
		_inventory_notice.text = _model.notice_text() if not _model.notice_text().is_empty() else "背包检查期间，倒计时继续。"
	if is_instance_valid(_choice_notice):
		_choice_notice.text = "正在确认…" if not _model.input_free() else (_conversation_text if not _conversation_text.is_empty() else "请根据场景中的信息回应。选错后可以重新判断。")

func _modal(title: String) -> VBoxContainer:
	var veil := ColorRect.new()
	veil.color = Color("18241fbf")
	veil.mouse_filter = Control.MOUSE_FILTER_STOP
	_overlay.add_child(veil)
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var center := CenterContainer.new()
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var panel := PanelContainer.new()
	panel.custom_minimum_size.x = 502
	var style := _style(Color("334439"), Color("b9a377"), 21, 2)
	style.content_margin_left = 21
	style.content_margin_right = 21
	style.content_margin_top = 17
	style.content_margin_bottom = 17
	panel.add_theme_stylebox_override("panel", style)
	center.add_child(panel)
	var content := VBoxContainer.new()
	content.custom_minimum_size.x = 460
	content.add_theme_constant_override("separation", 11)
	panel.add_child(content)
	content.add_child(_label(title, 28, GOLD))
	return content

func _close_button() -> Button:
	return _button("关闭", func() -> void:
		_close_sheets()
		_update())

func _make_pause() -> void:
	var shell := _modal("练习暂停")
	var prompt := "可继续当前练习。" if _deadline_challenge() else _model.pause_hint()
	if not prompt.is_empty():
		shell.add_child(_label(prompt, 21))
	var resume := _button("继续练习", _toggle_pause)
	Painted.action(resume)
	shell.add_child(resume)
	shell.add_child(_button("开启声音" if _audio.muted else "关闭声音", func() -> void:
		_audio.set_muted_state(not _audio.muted)
		_update()))
	shell.add_child(_button("恢复动态效果" if _world.reduced_motion else "减少动态效果", func() -> void:
		_world.reduced_motion = not _world.reduced_motion
		_update()))
	shell.add_child(_button("重新开始", _restart))
	shell.add_child(_button("返回关卡", _exit_level))

func _make_result(escaped: bool) -> void:
	var detail := result_detail()
	var shell := _modal(detail["title"])
	shell.add_child(_label(detail["reason"], 22))
	shell.add_child(_label(detail["progress"], 19, MUTED_INK))
	if escaped:
		shell.add_child(_label("安全优先，不为收集物资停留或折返。本次未完成全部训练项目，不发放小红花。", 20))
		shell.add_child(_button("返回关卡", _exit_level))
		shell.add_child(_button("重新练习", _restart))
	else:
		var action := _button("查看结算", _emit_finished.bind(false))
		action.name = "AcknowledgeFailure"
		shell.add_child(action)
		action.grab_focus.call_deferred()

func _make_choice(card: Dictionary) -> void:
	var shell := _modal(card["title"])
	shell.add_child(_label(card.get("caption", "应急演练 · 文字对讲"), 16, MUTED_INK))
	shell.add_child(_label(card["reference"], 20, GOLD))
	shell.add_child(_label(card["prompt"], 22))
	for id: String in card["choices"]:
		var rule: Dictionary = _model.interactions[id]
		var button := _button(rule["choice"], _interact.bind(rule["source"], "tap", "", id), 49, 18)
		button.name = "Choice_" + id
		button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		button.disabled = not _model.input_free()
		shell.add_child(button)
	_choice_notice = _label("", 19, MUTED_INK)
	_choice_notice.custom_minimum_size.y = 60
	shell.add_child(_choice_notice)

func _make_inventory() -> void:
	var inventory: Array = _model.run["inventory"]
	var capacity := int(_model.rules["inventory"]["capacity"])
	var shell := _modal("我的背包 · %d/%d" % [inventory.size(), capacity])
	shell.add_child(_label("点击「取出」可重新选择；装满后确认，再出发。", 19, MUTED_INK))
	for index: int in range(capacity):
		var row := HBoxContainer.new()
		row.name = "Slot%d" % (index + 1)
		row.add_theme_constant_override("separation", 12)
		shell.add_child(row)
		var id: String = inventory[index] if index < inventory.size() else ""
		var icon := TextureRect.new()
		icon.custom_minimum_size = Vector2(54, 51)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		if not id.is_empty():
			icon.texture = _world.icon(id)
		row.add_child(icon)
		var label := _label(_model.object_label(id) if not id.is_empty() else "空位", 21)
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(label)
		if not id.is_empty():
			var remove := _button("取出", _inventory_event.bind(false, id), 41, 18)
			remove.name = "Unpack_" + id
			remove.disabled = not _model.input_free()
			row.add_child(remove)
	_inventory_notice = _label("", 19, GOLD)
	shell.add_child(_inventory_notice)
	var depart := _button("确认出发", _inventory_event.bind(true))
	depart.name = "Depart"
	depart.disabled = inventory.size() != capacity or not _model.input_free()
	shell.add_child(depart)
	shell.add_child(_close_button())

func _make_coaching() -> void:
	var coaching: Dictionary = _model.rules["coaching"]
	var shell := _modal("练习进度与现场提示")
	var lines := PackedStringArray()
	for id: String in coaching["tasks"]:
		lines.append(("✓ " if id in _model.run["resolved"] else "○ ") + str(_model.goals[id]["label"]))
	shell.add_child(_label("   ".join(lines), 19, GOLD))
	if coaching.has("context"):
		shell.add_child(_label(coaching["context"], 20))
	for reminder: String in coaching["reminders"]:
		shell.add_child(_label(reminder, 19))
	shell.add_child(_close_button())

func _make_goals() -> void:
	var shell := _modal("练习提示")
	for goal: Dictionary in _visible_goals():
		var row := HBoxContainer.new()
		var icon := TextureRect.new()
		icon.custom_minimum_size = Vector2(56, 52)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture = _world.icon(goal["object"])
		row.add_child(icon)
		row.add_child(_label(("✓ " if goal["id"] in _model.run["resolved"] else "○ ") + goal["label"]))
		shell.add_child(row)
	if _has_collection_hud():
		shell.add_child(_label("日常无火烟时整理 · 有火烟时不为收拾物品耽误避险", 18, MUTED_INK))
	shell.add_child(_close_button())

func _make_action_sheet() -> void:
	var shell := _modal("文字操作")
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(460, 377)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	shell.add_child(scroll)
	var columns := VBoxContainer.new()
	columns.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_theme_constant_override("separation", 8)
	scroll.add_child(columns)
	for object: Dictionary in _model.rules["objects"]:
		var id: String = object["id"]
		if _model.enabled(id) and (_world.in_scene(id) or object.get("hudAction", false)):
			var button := _button(object["label"], _sheet_source.bind(id))
			button.name = "Action_" + id
			columns.add_child(button)
	shell.add_child(_close_button())
