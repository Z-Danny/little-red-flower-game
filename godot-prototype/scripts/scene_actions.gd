extends Control

signal finished(won: bool, elapsed_seconds: float)
signal exited
signal cue_requested(cue: String)

const Model = preload("res://scripts/scene_actions_rules.gd")
const Chrome = preload("res://scripts/painted_chrome.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
const RULES_PATH := "res://data/scene_actions.json"
const SKIN_PATH := "res://data/scene_actions_skin.json"
const UI_PATH := "res://assets/find_three/ui/"
const DESIGN := Vector2(576, 1024)
const CREAM := Color("fff8e9")
const INK := Color("263f33")
const NO_POINTER := -2
const SKIP_RECT := Rect2(407, 780, 145, 66)

var _entry: Dictionary = {}
var _rules: Dictionary = {}
var _skin: Dictionary = {}
var _run: Model
var _background: TextureRect
var _design: Control
var _board: Control
var _item_layer: Control
var _header: Panel
var _brief: Panel
var _footer: Panel
var _progress: Label
var _notice: Label
var _finish_button: Button
var _pause: Control
var _pause_trigger: Button
var _resume: Button
var _intro_layer: Control
var _intro_tween: Tween
var _active_tween: Tween
var _subjects: Dictionary = {}
var _pictures: Dictionary = {}
var _targets: Dictionary = {}
var _textures: Dictionary = {}
var _elapsed := 0.0
var _terminal := false
var _paused := false
var _hidden := false
var _reduce_motion := false
var _pending := ""
var _selected := ""
var _dragged := ""
var _drag_origin := Vector2.ZERO
var _drag_start := Vector2.ZERO
var _moved := false
var _pointer := NO_POINTER

func configure(entry: Dictionary) -> void:
	_entry = entry.duplicate(true)

func _ready() -> void:
	var id := str(_entry.get("id", ""))
	var content_path := str(_entry.get("content_path", RULES_PATH))
	var skin_path := str(_entry.get("skin_path", SKIN_PATH))
	_rules = Catalog.read_json(content_path).get("levels", {}).get(id, {})
	_skin = Catalog.read_json(skin_path).get("levels", {}).get(id, {})
	_run = Model.new(_rules)
	if not _valid():
		push_error("Invalid scene-actions level data or resource: " + id)
		var back := Button.new()
		back.text = "关卡素材未加载，返回地图"
		add_child(back)
		back.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
		back.pressed.connect(_leave)
		Chrome.action(back)
		set_process(false)
		set_process_input(false)
		return
	_reduce_motion = bool(_entry.get("reduced_motion", false))
	_background = _image(self, _skin.background, Rect2(), TextureRect.STRETCH_KEEP_ASPECT_COVERED)
	_background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_design = _layer(self)
	_design.size = DESIGN
	_build_hud()
	_build_pause()
	_restart()
	resized.connect(_layout)
	_layout()

func _valid() -> bool:
	if _run.items.is_empty() or not _asset_exists(_skin.get("background")) or not _run.remaining_dependencies_valid():
		return false
	if _run.items.size() != _rules.items.size() or _run.zones.size() != _rules.zones.size():
		return false
	for name: String in ["header", "recipe", "dialog", "button", "tray"]:
		if not _asset_exists(UI_PATH + name + ".webp"):
			return false
	for zone: Dictionary in _run.zones.values():
		var visual: Dictionary = _skin.get("zones", {}).get(zone.id, {})
		if not _has_rect(visual, "rect") or (visual.has("art") and not _asset_exists(visual.art)):
			return false
	for item: Dictionary in _run.items.values():
		var visual: Dictionary = _skin.get("items", {}).get(item.id, {})
		var mode: String = item.get("mode", "drag")
		if mode not in ["drag", "tap"] or (mode == "drag" and not _run.zones.has(item.get("zone"))):
			return false
		if not _has_rect(visual, "rect") or not _asset_exists(visual.get("art")):
			return false
		if visual.has("state_art") and not _asset_exists(visual.state_art):
			return false
		if visual.has("effect") and (not _has_rect(visual.effect, "rect") or not _asset_exists(visual.effect.get("art"))):
			return false
	for decor: Dictionary in _skin.get("decor", []):
		if not _has_rect(decor, "rect") or not _asset_exists(decor.get("art")):
			return false
	if _skin.has("intro"):
		var intro: Dictionary = _skin.intro
		return _has_rect(intro, "from") and _has_rect(intro, "to") and _asset_exists(intro.get("art"))
	return true

func _asset_exists(path: Variant) -> bool:
	return path is String and path.begins_with("res://") and ResourceLoader.exists(path, "Texture2D")

func _has_rect(config: Dictionary, key: String) -> bool:
	var rect: Variant = config.get(key)
	return rect is Array and rect.size() == 4 and float(rect[2]) > 0 and float(rect[3]) > 0

func _layout() -> void:
	var ratio := minf(size.x / DESIGN.x, size.y / DESIGN.y)
	_design.position = (size - DESIGN * ratio) * 0.5
	_design.scale = Vector2(ratio, ratio)

func _build_hud() -> void:
	_header = _paper(_design, Rect2(16, 14, 544, 72), "header")
	var back := _button(_header, Rect2(5, 0, 75, 72), "")
	back.name = "Back"
	Chrome.hud(back, Chrome.BACK, "返回地图")
	back.accessibility_name = "返回地图"
	back.pressed.connect(_leave)
	_label(_header, Rect2(78, 0, 388, 72), str(_entry.get("title", "安全练习")), 28, CREAM)
	_pause_trigger = _button(_header, Rect2(465, 0, 74, 72), "")
	_pause_trigger.name = "Pause"
	Chrome.hud(_pause_trigger, Chrome.PAUSE, "暂停")
	_pause_trigger.accessibility_name = "暂停"
	_pause_trigger.pressed.connect(_set_pause.bind(true))
	_brief = _paper(_design, Rect2(25, 99, 526, 130), "recipe")
	_progress = _label(_brief, Rect2(20, 8, 486, 35), "", 21, INK)
	_label(_brief, Rect2(18, 40, 490, 79), _rules.opening, 23, INK, true)
	_footer = _paper(_design, Rect2(20, 866, 536, 137), "tray")
	_notice = _label(_footer, Rect2(28, 10, 480, 113), "", 23, CREAM, true)
	_finish_button = _button(_footer, Rect2(66, 71, 404, 61), "完成练习")
	_finish_button.name = "FinishPractice"
	_finish_button.pressed.connect(_finish)
	_finish_button.hide()

func _build_pause() -> void:
	_pause = _layer(self)
	_pause.mouse_filter = MOUSE_FILTER_STOP
	_pause.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dialog := _paper(_pause, Rect2(), "dialog")
	dialog.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	dialog.position -= Vector2(205, 151)
	dialog.size = Vector2(410, 302)
	_label(dialog, Rect2(15, 10, 380, 56), "暂停", 33, INK)
	_resume = _button(dialog, Rect2(30, 72, 350, 66), "继续")
	_resume.name = "Resume"
	_resume.pressed.connect(_set_pause.bind(false))
	var restart := _button(dialog, Rect2(30, 144, 350, 66), "重来")
	restart.name = "Restart"
	restart.pressed.connect(func() -> void:
		_set_pause(false)
		_restart()
	)
	var exit := _button(dialog, Rect2(30, 217, 350, 66), "返回地图")
	exit.name = "ExitMap"
	exit.pressed.connect(_leave)
	_pause.hide()

func _restart() -> void:
	_pending = ""
	if _active_tween != null and _active_tween.is_valid():
		_active_tween.kill()
	_end_intro()
	_cancel_drag()
	_selected = ""
	_elapsed = 0.0
	_run.completed.clear()
	if is_instance_valid(_board):
		_board.hide()
		_board.queue_free()
	_subjects.clear()
	_pictures.clear()
	_targets.clear()
	_board = _layer(_design)
	_design.move_child(_board, 0)
	for decor: Dictionary in _skin.get("decor", []):
		_image(_board, decor.art, _rect(decor.rect))
	for id: String in _run.zones:
		_make_zone(id)
	_item_layer = _layer(_board)
	for id: String in _run.items:
		_make_subject(id)
	_notice.position = Vector2(28, 10)
	_notice.size = Vector2(480, 113)
	_notice.text = "拖动物件到合适的位置，也可以先点物件，再点放置区。" if not _targets.is_empty() else "点场景里的物件开始练习。"
	_finish_button.hide()
	_update_progress()
	if _skin.has("intro") and not _reduce_motion:
		_begin_intro(_skin.intro)

func _make_zone(id: String) -> void:
	var visual: Dictionary = _skin.zones[id]
	var box := _rect(visual.rect)
	var target := _button(_board, box, "", true)
	target.name = "Zone_" + id
	target.accessibility_name = _run.zones[id].label
	target.pressed.connect(func() -> void: _attempt(_selected, id))
	if visual.has("art"):
		_image(target, visual.art, Rect2(Vector2.ZERO, box.size - Vector2(0, 31)))
	var caption := _zone_caption_rect(id, box)
	var chip := _paper(_board, caption, "recipe")
	_label(chip, Rect2(5, 2, caption.size.x - 10, caption.size.y - 4), _run.zones[id].label, 22, INK, true)
	_targets[id] = target

func _make_subject(id: String) -> void:
	var visual: Dictionary = _skin.items[id]
	var box := _rect(visual.rect)
	var item := _button(_item_layer, box, "", true)
	item.name = "Item_" + id
	item.accessibility_name = _run.items[id].label.replace("\n", "，")
	item.pressed.connect(_activate_subject.bind(id))
	_pictures[id] = _image(item, visual.art, Rect2(Vector2.ZERO, box.size))
	if visual.get("label", true):
		var caption_width := maxf(130, box.size.x)
		var caption := _caption_rect(visual, box, Vector2(caption_width, _caption_height(_run.items[id].label, caption_width)))
		caption.position -= box.position
		var chip := _paper(item, caption, "recipe")
		chip.name = "Evidence"
		_label(chip, Rect2(4, 1, caption.size.x - 8, caption.size.y - 2), _run.items[id].label, 22, INK, true)
	_subjects[id] = item

func _caption_rect(visual: Dictionary, box: Rect2, label_size: Vector2) -> Rect2:
	if visual.has("label_rect"):
		return _rect(visual.label_rect)
	var left := clampf(box.get_center().x - label_size.x * 0.5, 15, DESIGN.x - 15 - label_size.x)
	return Rect2(Vector2(left, minf(box.end.y - 20, 853 - label_size.y)), label_size)

func _zone_caption_rect(id: String, box: Rect2) -> Rect2:
	return _caption_rect(_skin.zones[id], box, Vector2(box.size.x, _caption_height(_run.zones[id].label, box.size.x)))

func _caption_height(value: String, width: float) -> float:
	var font := get_theme_font("font")
	return 76.0 if value.contains("\n") or font.get_string_size(value, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x > width - 10 else 49.0

func _begin_intro(intro: Dictionary) -> void:
	_intro_layer = _layer(_design)
	_board.hide()
	var art := _image(_intro_layer, intro.art, _rect(intro.from))
	var endpoint := _rect(intro.to)
	_notice.text = intro.get("text", _rules.opening)
	var skip := _button(_intro_layer, SKIP_RECT, "跳过")
	skip.name = "SkipIntro"
	skip.pressed.connect(_end_intro)
	var duration := clampf(float(intro.get("seconds", 1.35)), 0.4, 2.5)
	_intro_tween = _intro_layer.create_tween().set_parallel(true)
	_intro_tween.tween_property(art, "position", endpoint.position, duration).set_trans(Tween.TRANS_SINE)
	_intro_tween.tween_property(art, "size", endpoint.size, duration)
	if intro.has("angle"):
		art.pivot_offset = art.size * 0.5
		_intro_tween.tween_property(art, "rotation_degrees", float(intro.angle), duration)
	_intro_tween.chain().tween_callback(_end_intro)

func _end_intro() -> void:
	if not is_instance_valid(_intro_layer):
		return
	if _intro_tween != null and _intro_tween.is_valid():
		_intro_tween.kill()
	_intro_layer.hide()
	_intro_layer.queue_free()
	_intro_layer = null
	_board.show()
	_notice.text = "先点或拖动物件，再放到合适的位置。" if not _targets.is_empty() else "点场景里的物件开始练习。"

func _process(delta: float) -> void:
	if _pending.is_empty() and not _paused and not _hidden and not _terminal and not is_instance_valid(_intro_layer):
		_elapsed += delta

func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_APPLICATION_PAUSED:
			_hidden = true
			_cancel_drag()
		NOTIFICATION_APPLICATION_FOCUS_IN, NOTIFICATION_APPLICATION_RESUMED:
			_hidden = false
		_:
			return
	if is_instance_valid(_design):
		_sync_suspension()

func _unhandled_input(event: InputEvent) -> void:
	if _valid_for_pause() and event.is_action_pressed(&"ui_cancel"):
		_set_pause(not _paused)
		get_viewport().set_input_as_handled()

func _valid_for_pause() -> bool:
	return is_instance_valid(_pause) and not _terminal

func _set_pause(on: bool) -> void:
	_paused = on
	_pause.visible = on
	_background.modulate = Color("61736a") if on else Color.WHITE
	_design.modulate = Color("77847a") if on else Color.WHITE
	if on:
		_cancel_drag()
		_resume.grab_focus()
	else:
		_pause_trigger.grab_focus()
	_sync_suspension()

func _sync_suspension() -> void:
	_design.process_mode = Node.PROCESS_MODE_DISABLED if _paused or _hidden else Node.PROCESS_MODE_INHERIT

func _input(event: InputEvent) -> void:
	if is_instance_valid(_intro_layer) and not _paused and not _hidden:
		if event is InputEventScreenTouch and not event.pressed and not event.canceled and SKIP_RECT.has_point(_point(event.position)):
			_end_intro()
			get_viewport().set_input_as_handled()
		return
	if not _can_act():
		return
	var consumed := false
	if event is InputEventScreenTouch:
		consumed = _pointer_event(event.index, _point(event.position), event.pressed, event.canceled)
	elif event is InputEventScreenDrag and event.index == _pointer:
		consumed = _move_pointer(_point(event.position))
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		consumed = _pointer_event(-1, _point(event.position), event.pressed)
	elif event is InputEventMouseMotion and _pointer == -1:
		consumed = _move_pointer(_point(event.position))
	if consumed:
		get_viewport().set_input_as_handled()

func _pointer_event(pointer: int, point: Vector2, down: bool, canceled := false) -> bool:
	if down:
		if _pointer != NO_POINTER:
			return true
		var id := _hit_subject(point)
		if not id.is_empty():
			_pointer = pointer
			_dragged = id
			_drag_start = point
			_moved = false
			_drag_origin = _subjects[id].position
			return true
		if not _selected.is_empty():
			var zone := _hit_target(point)
			if not zone.is_empty():
				_attempt(_selected, zone)
				return true
		return false
	if _pointer != pointer:
		return false
	var held := _dragged
	var moved := _moved
	var mode: String = _run.items[held].get("mode", "drag")
	if canceled:
		_cancel_drag()
	else:
		_pointer = NO_POINTER
		_dragged = ""
		if moved and mode == "drag":
			_attempt(held, _hit_target(point))
		elif not moved:
			_activate_subject(held)
	return true

func _move_pointer(point: Vector2) -> bool:
	if _dragged.is_empty():
		return false
	if not _moved and point.distance_to(_drag_start) > 8:
		_moved = true
		if _run.items[_dragged].get("mode", "drag") == "drag":
			cue_requested.emit("pickup")
	if _moved and _run.items[_dragged].get("mode", "drag") == "drag":
		var subject: Control = _subjects[_dragged]
		subject.move_to_front()
		subject.position = _drag_origin + point - _drag_start
	return true

func _cancel_drag() -> void:
	if not _dragged.is_empty() and _subjects.has(_dragged):
		_subjects[_dragged].position = _drag_origin
	_dragged = ""
	_pointer = NO_POINTER
	_moved = false

func _point(input_point: Vector2) -> Vector2:
	return _design.get_global_transform_with_canvas().affine_inverse() * input_point

func _hit_subject(point: Vector2) -> String:
	for index in range(_item_layer.get_child_count() - 1, -1, -1):
		var subject := _item_layer.get_child(index)
		var id := String(subject.name).trim_prefix("Item_")
		if not _run.completed.has(id) and _subject_rect(id, point):
			return id
	return ""

func _subject_rect(id: String, point: Vector2) -> bool:
	var subject: Control = _subjects[id]
	return subject.get_rect().has_point(point) or (subject.has_node("Evidence") and subject.get_node("Evidence").get_rect().has_point(point - subject.position))

func _hit_target(point: Vector2) -> String:
	for id: String in _targets:
		var box: Rect2 = _targets[id].get_rect()
		if box.has_point(point) or _zone_caption_rect(id, box).has_point(point):
			return id
	return ""

func _can_act() -> bool:
	return not _terminal and not _paused and not _hidden and _pending.is_empty() and is_instance_valid(_board) and not is_instance_valid(_intro_layer) and not _run.done()

func _activate_subject(id: String) -> void:
	if not _can_act() or not _run.items.has(id) or _run.completed.has(id):
		return
	if _run.items[id].get("mode", "drag") == "tap":
		_attempt(id, "")
		return
	_selected = id
	cue_requested.emit("pickup")
	_notice.text = "已选「%s」。点场景中的放置区。" % str(_run.items[id].label).replace("\n", " ")

func _attempt(id: String, zone: String) -> void:
	if not _can_act() or not _run.items.has(id):
		return
	var request: Dictionary = _run.items[id]
	var visual: Dictionary = _skin.items[id]
	var subject: Button = _subjects[id]
	var decision := _run.decision(id, zone)
	match decision:
		"wrong", "blocked":
			cue_requested.emit("wrong")
			_notice.text = str(request.get("blocked", request.wrong)) if decision == "blocked" else request.wrong
			subject.position = _rect(visual.rect).position
			_selected = ""
		"placed":
			_pending = id
			_selected = ""
			subject.move_to_front()
			var destination := _destination(visual, zone, subject)
			var duration := 0.08 if _reduce_motion else 0.52
			if subject.has_node("Evidence"):
				subject.get_node("Evidence").hide()
			_active_tween = subject.create_tween().set_parallel(true)
			_active_tween.tween_property(subject, "position", destination.position, duration).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			_active_tween.tween_property(subject, "size", destination.size, duration)
			_active_tween.tween_property(_pictures[id], "size", destination.size, duration)
			_active_tween.chain().tween_callback(_arrived.bind(id))

func _destination(visual: Dictionary, zone_id: String, subject: Control) -> Rect2:
	if visual.has("arrive"):
		return _rect(visual.arrive)
	if zone_id.is_empty():
		return subject.get_rect()
	var zone: Rect2 = _targets[zone_id].get_rect()
	var fitted := subject.size * minf(0.76, minf(zone.size.x / subject.size.x, zone.size.y / subject.size.y) * 0.72)
	return Rect2(zone.get_center() - fitted * 0.5, fitted)

func _arrived(id: String) -> void:
	cue_requested.emit("correct")
	var visual: Dictionary = _skin.items[id]
	var subject: Button = _subjects[id]
	if visual.has("state_art"):
		_pictures[id].texture = _texture(visual.state_art)
	if visual.get("remove", false):
		subject.hide()
	subject.disabled = true
	subject.focus_mode = FOCUS_NONE
	if visual.has("effect") and not _reduce_motion:
		var effect: Dictionary = visual.effect
		var artwork := _image(_board, effect.art, _rect(effect.rect))
		var offset: Array = effect.get("offset", [0, -18])
		var duration := clampf(float(effect.get("seconds", 0.55)), 0.12, 1.2)
		_active_tween = artwork.create_tween().set_parallel(true)
		_active_tween.tween_property(artwork, "position", artwork.position + Vector2(float(offset[0]), float(offset[1])), duration)
		_active_tween.tween_property(artwork, "modulate:a", 0.0, duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		_active_tween.chain().tween_callback(artwork.queue_free)
		_active_tween.chain().tween_callback(_record.bind(id))
	else:
		_record(id)

func _record(id: String) -> void:
	_run.completed[id] = true
	_pending = ""
	_notice.text = _run.items[id].success
	_update_progress()
	if _run.done():
		_notice.position = Vector2(29, 1)
		_notice.size = Vector2(478, 72)
		_finish_button.show()
		_finish_button.grab_focus()

func _update_progress() -> void:
	_progress.text = "已完成 %d / %d 项" % [_run.completed.size(), _run.items.size()]

func _finish() -> void:
	if _terminal or _paused or not _run.done():
		return
	_terminal = true
	finished.emit(true, _elapsed)

func _leave() -> void:
	if _terminal:
		return
	_cancel_drag()
	_terminal = true
	exited.emit()

func result_detail() -> Dictionary:
	return {"title": _rules.get("result", "练习完成"), "summary": _rules.get("summary", "")}

func prepare_result_backdrop() -> void:
	_header.hide()
	_brief.hide()
	_footer.hide()

func _rect(data: Array) -> Rect2:
	return Rect2(float(data[0]), float(data[1]), float(data[2]), float(data[3]))

func _texture(path: String) -> Texture2D:
	if not _textures.has(path):
		_textures[path] = load(path)
	return _textures[path]

func _place(parent: Control, control: Control, box: Rect2) -> void:
	parent.add_child(control)
	control.position = box.position
	control.size = box.size

func _layer(parent: Control) -> Control:
	var control := Control.new()
	control.mouse_filter = MOUSE_FILTER_IGNORE
	parent.add_child(control)
	return control

func _image(parent: Control, path: String, box: Rect2, stretch := TextureRect.STRETCH_KEEP_ASPECT_CENTERED) -> TextureRect:
	return Chrome.image(parent, _texture(path), box, stretch)

func _label(parent: Control, box: Rect2, value: String, pixels: int, ink: Color, wrap := false) -> Label:
	var control := Label.new()
	control.clip_text = true
	control.mouse_filter = MOUSE_FILTER_IGNORE
	control.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	control.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	control.add_theme_color_override("font_color", ink)
	control.add_theme_font_size_override("font_size", pixels)
	control.add_theme_constant_override("line_spacing", 1)
	_place(parent, control, box)
	if wrap:
		control.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	control.text = value
	return control

func _paper(parent: Control, box: Rect2, art: String) -> Panel:
	var control := Panel.new()
	control.mouse_filter = MOUSE_FILTER_IGNORE
	control.add_theme_stylebox_override("panel", _style(art))
	_place(parent, control, box)
	return control

func _button(parent: Control, box: Rect2, value: String, transparent := false) -> Button:
	var control := Button.new()
	control.text = value
	control.mouse_default_cursor_shape = CURSOR_POINTING_HAND
	if transparent:
		for state: String in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
			control.add_theme_stylebox_override(state, StyleBoxEmpty.new())
		control.add_theme_stylebox_override("focus", _style("recipe", Color("c9a65260")))
	else:
		Chrome.action(control, _texture(UI_PATH + "button.webp"))
		control.add_theme_stylebox_override("focus", _style("button", Color("fff1b63b")))
	_place(parent, control, box)
	return control

func _style(art: String, tint := Color.WHITE) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = _texture(UI_PATH + art + ".webp")
	style.modulate_color = tint
	return style
