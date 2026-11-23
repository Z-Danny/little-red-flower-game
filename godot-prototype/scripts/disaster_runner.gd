extends Control

signal finished(won: bool, elapsed_seconds: float)
signal exited
signal cue_requested(cue: String)

const ACTION_CUES := {
	"move": "flood-high-step", "switch": "flood-power-off", "call": "flood-message-sent",
	"pack": "flood-pack-zip", "assemble": "put-together", "exit": "flood-high-step",
}

const Catalog = preload("res://scripts/level_catalog.gd")
const Layout = preload("res://scripts/scene_layout.gd")
const Rules = preload("res://scripts/disaster_rules.gd")
const Painted = preload("res://scripts/painted_chrome.gd")

@export var editor_default_id := "rain-street-preparation-v1"
var _entry: Dictionary = {}
var _skin: Dictionary
var _sim: Rules
var _tx := Transform2D.IDENTITY
var _frame: Rect2
var _world: Rect2
var _images: Dictionary = {}
var _raster: Dictionary = {}
var _mask: Image
var _street := false
var _paused := false
var _terminal := false
var _drag := ""
var _pressed := ""
var _down := false
var _start := Vector2.ZERO
var _offset := Vector2.ZERO
var _pointer := Vector2.ZERO
var _hint_time := 0.0
var _last_notice := ""
var _armed_time := 0.0
var audio_muted := false

func configure(entry: Dictionary) -> void:
	_entry = entry

func _ready() -> void:
	Painted.hud(%Back, Painted.BACK, "返回地图")
	Painted.hud(%Pause, Painted.PAUSE, "暂停练习")
	Painted.hud(%Hint, Painted.HINT, "关卡提示")
	Painted.paper($Modal/Paper, %ModalTitle)
	Painted.action(%Resume)
	Painted.action(%ExitMap)
	%Back.pressed.connect(func() -> void: exited.emit())
	%Pause.pressed.connect(_show_pause)
	%Hint.pressed.connect(_hint)
	%Resume.pressed.connect(_resume)
	%ExitMap.pressed.connect(func() -> void: exited.emit())
	var id: String = _entry.get("id", editor_default_id)
	var pack := Catalog.read_json("res://assets/disaster_runner/" + id + "/pack.json")
	if pack.is_empty():
		%Notice.text = "场景素材暂时无法读取。"
		return
	_skin = pack.skin
	_sim = Rules.new(pack.rules, float(pack.safe_hold_ms))
	_street = pack.rules.kind == "prevention"
	%LevelTitle.text = _entry.get("title", pack.rules.title)
	_world = Rect2(0, 0, float(_skin.width), float(_skin.height))
	_frame = Layout.rect(_skin.framing.sceneBounds) if _skin.has("framing") else _world
	var area: Rect2 = Layout.rect(_skin.framing.critical) if _skin.get("framing", {}).has("critical") else Rect2()
	_tx = Layout.cover(_frame, Vector2(576, 1024), area)
	_asset(_skin.scene)
	_asset(_skin.ending)
	if _street:
		_mask = _asset(_skin.mask).get_image()
	else:
		for item: Dictionary in _skin.sprites.values():
			_raster[item.src] = _asset(item.src).get_image()
	for goal: Dictionary in pack.rules.goals:
		var art: Dictionary = _skin.sprites.get(goal.id, {})
		if not art.has("icon"): continue
		var tile := TextureRect.new()
		tile.name = str(goal.id).validate_node_name()
		tile.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tile.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tile.custom_minimum_size = Vector2(54, 44)
		tile.texture = _asset(art.icon)
		tile.tooltip_text = str(goal.label)
		tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
		%Clues.add_child(tile)
	_refresh()

func _asset(path: String) -> Texture2D:
	if not _images.has(path): _images[path] = Layout.texture(path)
	return _images[path]

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and is_node_ready() and _sim != null and not _terminal:
		_show_pause()

func _process(delta: float) -> void:
	if _sim == null or _paused or _terminal: return
	var dt := minf(delta, 0.1)
	if _hint_time > 0.0:
		_hint_time = maxf(0.0, _hint_time - dt)
		if _hint_time == 0.0: %Clues.hide()
	_take(_sim.advance(dt * 1000.0))
	_refresh()
	queue_redraw()

func _refresh() -> void:
	if _sim == null: return
	%Clock.value = _sim.remaining() / (float(_sim.rules.seconds) * 1000.0)
	if _last_notice != _sim.notice:
		_last_notice = _sim.notice
		%Notice.text = _sim.notice
		_armed_time = _sim.elapsed
	if _sim.phase == "playing" and _sim.elapsed - _armed_time > 7200.0 and _hint_time <= 0.0:
		%Notice.text = ""
	for tile in %Clues.get_children():
		tile.modulate.a = 0.42 if _sim.goals.has(String(tile.name)) else 1.0

func _gui_input(event: InputEvent) -> void:
	if _sim == null or _paused or _terminal or _sim.phase != "playing" or not _sim.pending.is_empty(): return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		var pos: Vector2 = _tx.affine_inverse() * event.position
		if event.pressed:
			_down = true
			_start = pos
			_pointer = pos
			_pressed = _hit(pos)
			if not _pressed.is_empty(): _offset = pos - _pose(_pressed).box.position
		elif _down:
			_down = false
			if not _drag.is_empty():
				var id := _drag
				_drag = ""
				_take(_sim.act(id, _target(pos, id), "drop"))
			elif _start.distance_to(pos) < 26.0:
				var hit := _hit(pos)
				_take(_sim.act(hit, hit, "tap"))
			_pressed = ""
			after_input()
		accept_event()
	elif event is InputEventMouseMotion and _down:
		_pointer = _tx.affine_inverse() * event.position
		if not _street and _drag.is_empty() and not _pressed.is_empty() and _skin.sprites[_pressed].input == "drag" and _pointer.distance_to(_start) >= 14.0:
			_drag = _pressed
			_action_cue("pickup")
		queue_redraw()

func after_input() -> void:
	_refresh()
	queue_redraw()

func _take(cue: String) -> void:
	match cue:
		"start": _action_cue("mark" if _street else ACTION_CUES.get(_sim.pending.get("motion"), "confirm"))
		"notice": _action_cue("putback")
		"found": _play("goal-confirm")
		"wrong": _play("wrong-warning")
		"failed":
			_terminal = true
			_drag = ""
			_play("failure")
			_modal("本次练习未完成", _sim.notice, "查看结果")
		"escaped":
			_terminal = true
			_drag = ""
			_action_cue("flood-high-step")
			_modal("已先行转移", _sim.notice, "返回地图")
		"complete":
			_terminal = true
			finished.emit(true, (_sim.elapsed + _sim.penalty) / 1000.0)

func _action_cue(cue: String) -> void:
	if not audio_muted:
		cue_requested.emit(cue)

func _play(cue: String) -> void:
	if audio_muted: return
	var path := "res://assets/shared_cues/" + cue + ".wav"
	if ResourceLoader.exists(path, "AudioStream"):
		$Cue.stream = load(path)
		$Cue.play()

func _hint() -> void:
	if _terminal or _paused or _sim == null: return
	_hint_time = 4.0
	if _street:
		%Clues.visible = not %Clues.visible
	else:
		var action: Dictionary = _sim.next_action()
		if not action.is_empty():
			var target: Dictionary = _skin.zones.get(action.target, _skin.sprites.get(action.target, {}))
			var source: String = _skin.sprites[action.source].label
			%Notice.text = "点击%s。" % source if action.input == "tap" else "把%s拖到%s。" % [source, target.get("label", "相应位置")]
	queue_redraw()

func _show_pause() -> void:
	if _terminal or _paused or _sim == null: return
	_paused = true
	_down = false
	_drag = ""
	_pressed = ""
	$Cue.stop()
	_modal("练习已暂停", "继续后计时恢复。", "继续练习")

func _modal(title: String, body: String, button: String) -> void:
	%ModalTitle.text = title
	%ModalBody.text = body
	%Resume.text = button
	%ExitMap.visible = _sim.phase != "evacuated"
	%Modal.show()
	%Resume.grab_focus()
	queue_redraw()

func _resume() -> void:
	if _sim.phase == "failed":
		finished.emit(false, (_sim.elapsed + _sim.penalty) / 1000.0)
	elif _sim.phase == "evacuated":
		exited.emit()
	else:
		_paused = false
		%Modal.hide()

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		if _paused: _resume()
		elif not _terminal: _show_pause()

func result_detail() -> Dictionary:
	var kind := ""
	if _sim.phase == "failed": kind = "timeout" if _sim.notice == _sim.rules.timeout else "unsafe-action"
	return {"summary": _sim.rules.summary, "reason": _sim.notice, "kind": kind,
		"missed": {"count": _sim.rules.goals.size() - _sim.goals.size(), "unit": "处"} if _street else {},
		"safe_art": _asset(_skin.ending) if _sim.phase == "complete" else null}

func prepare_result_backdrop() -> void:
	$Hud.hide()
	%Clues.hide()
	%Notice.hide()
	%Modal.hide()

func _pose(id: String) -> Dictionary:
	var src: Dictionary = _skin.sprites[id]
	var base := Layout.rect(src.box)
	var box := base
	var alpha := 1.0
	if _street: return {"box": box, "alpha": alpha}
	if id == "person":
		if _sim.goals.has("stairs"): box = Layout.rect(_skin.poses.personStairs)
		if _sim.goals.has("roof") or _sim.phase == "evacuated": box = Layout.rect(_skin.poses.personRoof)
	if (id == "water" and "drinking" in _sim.goals) or (id == "flashlight" and "lighting" in _sim.goals) or (id == "phone" and "rescue" in _sim.goals) or (id == "bag" and "roof" in _sim.goals): alpha = 0.0
	if id in ["panel", "foam", "rope"] and "aid" in _sim.goals:
		box = Layout.rect(_skin.poses.get(id + "Stored", src.box))
	if not _sim.pending.is_empty():
		var action := _sim.pending
		var t := minf(1.0, _sim.pending_age / float(action.duration))
		var ease_t := 1.0 - pow(1.0 - t, 3.0)
		if id == action.source:
			if action.motion == "move": box = _lerp_box(box, Layout.rect(_skin.poses.personStairs), ease_t)
			if action.motion == "exit": box = _lerp_box(box, Layout.rect(_skin.poses.personRoof), ease_t)
			if action.motion in ["pack", "call"]:
				var dest := Layout.rect(_skin.sprites.bag.box if action.motion == "pack" else _skin.poses.personStairs if "stairs" in _sim.goals else _skin.sprites.person.box)
				box = _lerp_box(base, Rect2(dest.get_center() - base.size * 0.1, base.size * 0.2), ease_t)
				alpha = 1.0 - t
		if action.motion == "assemble" and id in ["panel", "foam", "rope"]:
			box = _lerp_box(base, Layout.rect(_skin.poses.get(id + "Stored", src.box)), ease_t)
		if action.motion == "exit" and id == "bag":
			var roof := Layout.rect(_skin.poses.personRoof)
			box = _lerp_box(base, Rect2(roof.position + Vector2(8, roof.size.y * 0.4), base.size * 0.25), ease_t)
			alpha = 1.0 - t
	return {"box": box, "alpha": alpha}

func _lerp_box(a: Rect2, b: Rect2, t: float) -> Rect2:
	return Rect2(a.position.lerp(b.position, t), a.size.lerp(b.size, t))

func _hit(point: Vector2) -> String:
	if _street:
		if not _world.has_point(point): return ""
		var color := _mask.get_pixel(floori(point.x), floori(point.y))
		for id: String in _skin.sprites:
			var rgb: Array = _skin.sprites[id].color
			if color.r8 == int(rgb[0]) and color.g8 == int(rgb[1]) and color.b8 == int(rgb[2]): return id
	else:
		var ids: Array = _skin.sprites.keys()
		ids.reverse()
		for id: String in ids:
			var pose := _pose(id)
			var box: Rect2 = pose.box
			if pose.alpha < 0.2 or not box.has_point(point): continue
			var image: Image = _raster[_skin.sprites[id].src]
			var pixel := Vector2i((point - box.position) / box.size * Vector2(image.get_size()))
			if image.get_pixel(pixel.x, pixel.y).a8 >= 96: return id
	return ""

func _target(point: Vector2, source: String) -> String:
	var candidates: Array[String] = []
	for action: Dictionary in _sim.rules.actions:
		if action.source == source and not candidates.has(action.target): candidates.append(action.target)
	var order: Array[String] = []
	for id: String in ["roof", "wire", "car", "outside"]:
		if candidates.has(id): order.append(id)
	for id in candidates:
		if not order.has(id): order.append(id)
	for id: String in _skin.sprites:
		if id != source and not order.has(id): order.append(id)
	for id: String in _skin.zones:
		if not order.has(id): order.append(id)
	for id in order:
		var box: Rect2 = _pose(id).box if _skin.sprites.has(id) else Layout.rect(_skin.zones[id].box)
		if box.has_point(point): return id
	return ""

func _draw() -> void:
	if _sim == null: return
	draw_set_transform_matrix(_tx)
	if _skin.get("framing", {}).has("backdrop"):
		_draw_art(_skin.framing.backdrop, _frame)
	if _sim.phase in ["reveal", "complete"]:
		_draw_art(_skin.ending, _world)
		return
	_draw_art(_skin.scene, _world)
	if _street:
		for id: String in _sim.goals:
			_outline(_pose(id).box, Color("f4574a"))
		if not _sim.pending.is_empty():
			_outline(_pose(_sim.pending.source).box, Color("f4574a"), _sim.pending_age / float(_sim.pending.duration))
	else:
		_draw_flood()
		if _hint_time > 0.0:
			var action: Dictionary = _sim.next_action()
			if not action.is_empty(): _outline(_pose(action.source).box, Color("ffe497"))

func _draw_flood() -> void:
	var altered: Dictionary = {}
	for id: String in _skin.sprites:
		var data: Dictionary = _skin.sprites[id]
		if data.fixed: continue
		var pose := _pose(id)
		if pose.alpha < 1.0 or pose.box != Layout.rect(data.box) or _drag == id:
			altered[id] = pose
			if data.has("repair"): _draw_art(data.repair.src, Layout.rect(data.repair.box))
	for id: String in altered:
		var pose: Dictionary = altered[id]
		var box: Rect2 = pose.box
		if _drag == id: box.position = _pointer - _offset
		if pose.alpha > 0.0: _draw_art(_skin.sprites[id].src, box, 0.94 if id == _drag else pose.alpha)
	if "power" in _sim.goals:
		var point: Vector2 = _pose("breaker").box.get_center()
		draw_circle(point, 12.0, Color("35715d"))
		draw_polyline(PackedVector2Array([point + Vector2(-6, 0), point + Vector2(-1, 5), point + Vector2(7, -5)]), Color("fff0cb"), 3.0, true)

func _outline(box: Rect2, color: Color, fraction: float = 1.0) -> void:
	var points := PackedVector2Array()
	for i in range(37):
		var angle := -PI * 0.5 + TAU * fraction * (float(i) / 36.0)
		points.append(box.get_center() + Vector2(cos(angle), sin(angle)) * (box.size * 0.5 + Vector2(9, 8)))
	draw_polyline(points, Color("ffebd2"), 7.0, true)
	draw_polyline(points, color, 4.0, true)

func _draw_art(path: String, box: Rect2, alpha: float = 1.0) -> void:
	var art := _asset(path)
	if art != null:
		draw_texture_rect(art, box, false, Color(1.0, 1.0, 1.0, alpha))
