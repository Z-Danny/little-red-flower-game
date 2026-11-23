extends Control

signal finished(won: bool, elapsed_seconds: float)
signal exited
signal cue_requested(cue: String)

const Rules = preload("res://scripts/find_three_rules.gd")
const Chrome = preload("res://scripts/painted_chrome.gd")
const Data = preload("res://scripts/level_catalog.gd")
const RULES_PATH := "res://data/find_three.json"
const SKIN_PATH := "res://data/find_three_skin.json"
const ART_PATH := "res://assets/find_three/"
const DESIGN := Vector2(576, 1024)
const PARCHMENT := Color("fff8e9")
const CHROME_KEYS := ["header", "tray", "recipe", "slot", "dialog", "button"]

# Every object fits on the visible tabletop at 320 CSS px. Offset the rows
# slightly so the pieces read like a tabletop scatter instead of cards.
const POSITIONS := [
	Vector2(76, 358), Vector2(189, 366), Vector2(294, 352), Vector2(390, 365), Vector2(496, 358),
	Vector2(94, 463), Vector2(194, 478), Vector2(290, 455), Vector2(397, 475), Vector2(496, 467),
	Vector2(76, 570), Vector2(186, 587), Vector2(284, 557), Vector2(391, 602), Vector2(493, 575),
	Vector2(94, 705), Vector2(193, 715), Vector2(289, 688), Vector2(384, 723), Vector2(489, 711),
]
const CONTENT_RECT := Rect2(32, 261, 512, 503)

var _entry: Dictionary
var _level: Dictionary
var _skin: Dictionary
var _prop_names: Dictionary
var _ink: Color
var _run: Rules
var _background: TextureRect
var _design: Control
var _board: Control
var _title: Label
var _clue: Label
var _counter: Label
var _notice: Label
var _sequence_notice: Label
var _instruction: Label
var _slots: HBoxContainer
var _tray_area: Panel
var _pause: Control
var _pause_button: Button
var _resume_button: Button
var _focus_before_pause: Control
var _sequence_panel: Panel
var _finish_panel: Panel
var _completion_flash: Panel
var _sequence_buttons: Dictionary = {}
var _sequence_index := 0
var _pieces: Dictionary = {}
var _textures: Dictionary = {}
var _chrome_art: Dictionary = {}
var _elapsed := 0.0
var _last_notice := ""
var _terminal := false
var _paused := false
var _focused := true

func configure(entry: Dictionary) -> void:
	_entry = entry.duplicate(true)

func _ready() -> void:
	var id := str(_entry.get("id", ""))
	var skin_data := Data.read_json(SKIN_PATH)
	_level = Data.read_json(RULES_PATH).get("levels", {}).get(id, {})
	_skin = skin_data.get("levels", {}).get(id, {})
	_prop_names = skin_data.get("props", {})
	if not _valid_content():
		_show_load_error()
		return
	_ink = Color(_skin.ink)
	for key: String in CHROME_KEYS:
		_chrome_art[key] = load(_art_path(key))
	_background = Chrome.image(self, load(ART_PATH + _skin.background + ".webp"), Rect2(), TextureRect.STRETCH_KEEP_ASPECT_COVERED)
	_background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_design = Control.new()
	_design.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(_design)
	_design.size = DESIGN
	_build_hud()
	_build_board()
	_build_tray()
	_build_pause()
	resized.connect(_layout)
	_layout()
	_restart()

func _valid_content() -> bool:
	if _level.is_empty() or _skin.is_empty() or _skin.objects.size() != POSITIONS.size():
		return false
	if not ResourceLoader.exists(ART_PATH + _skin.background + ".webp", "Texture2D") or _level.recipes.is_empty():
		return false
	for key: String in CHROME_KEYS:
		if not ResourceLoader.exists(_art_path(key), "Texture2D"):
			return false
	var objects: Dictionary = {}
	for id: String in _skin.objects:
		if not _prop_names.has(id) or objects.has(id) or not ResourceLoader.exists(_prop_path(id), "Texture2D"):
			return false
		objects[id] = true
	for recipe: Dictionary in _level.recipes:
		if recipe.items.size() != 3:
			return false
		for id: String in recipe.items:
			if not objects.erase(id):
				return false
	return true

func _show_load_error() -> void:
	push_error("Find-three level is missing its rules or art: " + str(_entry.get("id", "")))
	var back := Button.new()
	back.text = "素材未加载 · 返回地图"
	add_child(back)
	Chrome.action(back)
	back.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	back.pressed.connect(func() -> void: exited.emit())
	set_process(false)

func _build_hud() -> void:
	var header := _panel(_design, Rect2(16, 14, 544, 72), "header")
	var back := _button(header, Rect2(3, 0, 76, 72), "")
	back.name = "Back"
	Chrome.hud(back, Chrome.BACK, "返回地图")
	back.accessibility_name = "返回地图"
	back.pressed.connect(_leave)
	_title = _label(header, Rect2(76, 2, 401, 68), str(_entry.get("title", "")), 28, PARCHMENT)
	_title.add_theme_color_override("font_outline_color", Color("23372d"))
	_title.add_theme_constant_override("outline_size", 5)
	_pause_button = _button(header, Rect2(465, 0, 76, 72), "")
	_pause_button.name = "Pause"
	Chrome.hud(_pause_button, Chrome.PAUSE, "暂停")
	_pause_button.accessibility_name = "暂停"
	_pause_button.pressed.connect(func() -> void: _set_pause(true))
	var recipe := _panel(_design, Rect2(28, 98, 520, 145), "recipe")
	_counter = _label(recipe, Rect2(18, 7, 484, 30), "", 21, _ink)
	_clue = _label(recipe, Rect2(14, 42, 492, 48), "", 27, _ink)
	_instruction = _label(recipe, Rect2(16, 97, 488, 32), "", 21, _ink)

func _build_board() -> void:
	_board = Control.new()
	_board.name = "Tabletop"
	_board.mouse_filter = MOUSE_FILTER_IGNORE
	_design.add_child(_board)
	var labels: Dictionary = _skin.labels
	for i in _skin.objects.size():
		var id: String = _skin.objects[i]
		var prop_label := str(_prop_names[id])
		var tag := str(labels.get(id, ""))
		var piece := _button(_board, Rect2(POSITIONS[i] - Vector2(45, 48), Vector2(90, 98)), "", true)
		piece.name = "Item_" + id
		piece.tooltip_text = prop_label if tag.is_empty() or tag == prop_label else prop_label + " · " + tag
		piece.accessibility_name = piece.tooltip_text
		piece.pressed.connect(_pick.bind(id))
		Chrome.image(piece, _texture(id), Rect2(2, 2, 86, 82), TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
		if not tag.is_empty():
			var tab := _panel(piece, Rect2(0, 74, 90, 24), "recipe")
			_label(tab, Rect2(0, 0, 90, 24), tag, 22, _ink)
		_pieces[id] = piece

func _build_tray() -> void:
	_tray_area = _panel(_design, Rect2(20, 814, 536, 186), "tray")
	_notice = _label(_tray_area, Rect2(18, 4, 500, 50), "", 22, PARCHMENT, true)
	_notice.add_theme_color_override("font_outline_color", Color("23372d"))
	_notice.add_theme_constant_override("outline_size", 4)
	_slots = HBoxContainer.new()
	_slots.name = "Tray"
	_slots.position = Vector2(18, 54)
	_slots.add_theme_constant_override("separation", 10)
	_tray_area.add_child(_slots)
	var instructions := _label(_tray_area, Rect2(5, 148, 526, 28), "点暂存格里的物件可放回桌上", 22, PARCHMENT)
	instructions.add_theme_color_override("font_outline_color", Color("23372d"))
	instructions.add_theme_constant_override("outline_size", 4)

func _build_pause() -> void:
	var overlay := Control.new()
	overlay.mouse_filter = MOUSE_FILTER_STOP
	add_child(overlay)
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_pause = overlay
	var dialog := _panel(overlay, Rect2(), "dialog")
	dialog.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	dialog.position -= Vector2(202, 150)
	dialog.size = Vector2(404, 300)
	_label(dialog, Rect2(16, 12, 372, 62), "暂停", 34, _ink)
	_resume_button = _button(dialog, Rect2(32, 78, 340, 59), "继续")
	_resume_button.name = "Resume"
	_resume_button.pressed.connect(func() -> void: _set_pause(false))
	var restart := _button(dialog, Rect2(32, 148, 340, 59), "重来")
	restart.name = "Restart"
	restart.pressed.connect(func() -> void:
		_set_pause(false)
		_restart()
	)
	var exit := _button(dialog, Rect2(32, 218, 340, 59), "返回地图")
	exit.name = "ExitMap"
	exit.pressed.connect(_leave)
	_pause.hide()

func _layout() -> void:
	var zoom := minf(size.x / DESIGN.x, size.y / DESIGN.y)
	_design.position = (size - DESIGN * zoom) / 2.0
	_design.scale = Vector2(zoom, zoom)

func _restart() -> void:
	_elapsed = 0
	_run = Rules.new(_level.recipes)
	_last_notice = "凑齐本组的三件物品，就会自动合成。"
	_sequence_index = 0
	_sequence_buttons.clear()
	if is_instance_valid(_sequence_panel):
		_sequence_panel.hide()
		_sequence_panel.queue_free()
	if is_instance_valid(_finish_panel):
		_finish_panel.hide()
		_finish_panel.queue_free()
	if is_instance_valid(_completion_flash):
		_completion_flash.hide()
		_completion_flash.queue_free()
	_board.show()
	_tray_area.show()
	_refresh()

func _process(delta: float) -> void:
	if _run != null and not _paused and _focused and not _terminal:
		_elapsed += delta

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		_focused = false
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN or what == NOTIFICATION_APPLICATION_RESUMED:
		_focused = true

func _unhandled_input(event: InputEvent) -> void:
	if _run != null and not _terminal and event.is_action_pressed(&"ui_cancel"):
		_set_pause(not _paused)
		get_viewport().set_input_as_handled()

func _set_pause(value: bool) -> void:
	if _terminal:
		return
	_paused = value
	if value:
		_focus_before_pause = get_viewport().gui_get_focus_owner()
		_design.process_mode = Node.PROCESS_MODE_DISABLED
		_design.modulate = Color("73807a")
		_background.modulate = Color("63706a")
		_pause.show()
		_resume_button.grab_focus()
	else:
		_pause.hide()
		_design.process_mode = Node.PROCESS_MODE_INHERIT
		_design.modulate = Color.WHITE
		_background.modulate = Color.WHITE
		if is_instance_valid(_focus_before_pause) and _focus_before_pause.is_visible_in_tree():
			_focus_before_pause.grab_focus()
		else:
			_pause_button.grab_focus()

func _pick(id: String) -> void:
	if _paused or _terminal or not _focused:
		return
	var has_focus: bool = _pieces[id].has_focus()
	var recipe := _run.current()
	match _run.pick(id):
		"picked":
			cue_requested.emit("pickup")
			_last_notice = "已放入「%s」。" % _prop_names[id]
			_refresh()
			if has_focus:
				_focus_next_piece()
		"full":
			cue_requested.emit("wrong")
			_last_notice = "暂存格满了。点格子放回一件，再继续找。"
			_notice.text = _last_notice
		"combined":
			cue_requested.emit("confirm")
			_last_notice = recipe.feedback
			_refresh()
			var on_board: bool = not _run.done()
			if on_board:
				_show_combination(recipe)
				_focus_next_piece()
			elif _level.has("sequence"):
				_start_sequence()
			else:
				_show_finish_button()

func _put_back(id: String) -> void:
	if _paused or _terminal or not _run.put_back(id):
		return
	_last_notice = "「%s」已放回桌上。" % _prop_names[id]
	cue_requested.emit("putback")
	_refresh()
	_pieces[id].grab_focus()

func _focus_next_piece() -> void:
	for piece: Control in _pieces.values():
		if piece.visible:
			piece.grab_focus()
			break

func _refresh() -> void:
	for id: String in _pieces:
		_pieces[id].visible = _run.can_pick(id)
	for child: Node in _slots.get_children():
		_slots.remove_child(child)
		child.queue_free()
	for i in Rules.SLOT_COUNT:
		var slot := _button(_slots, Rect2(0, 0, 92, 89), "", false, "slot")
		slot.custom_minimum_size = Vector2(92, 89)
		slot.name = "Slot%d" % (i + 1)
		if i < _run.tray.size():
			var id: String = _run.tray[i]
			Chrome.image(slot, _texture(id), Rect2(14, 3, 64, 56), TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
			_label(slot, Rect2(3, 54, 86, 30), str(_prop_names[id]), 20, _ink)
			slot.tooltip_text = "放回" + str(_prop_names[id])
			slot.accessibility_name = slot.tooltip_text
			slot.pressed.connect(_put_back.bind(id))
		else:
			slot.disabled = true
			slot.focus_mode = FOCUS_NONE
	_counter.text = "已合成 %d / %d 组" % [_run.recipe_index, _run.recipes.size()]
	_clue.text = str(_run.current().get("clue", _level.result))
	_instruction.text = "本组 " + str(_run.current().get("name", "")) if not _run.done() else ""
	_notice.text = _last_notice

func _start_sequence() -> void:
	_board.hide()
	_tray_area.hide()
	_counter.text = "餐前洗手"
	_clue.text = "按顺序点出洗手动作"
	_instruction.text = "已完成 0 / 3 步"
	_sequence_panel = _panel(_design, CONTENT_RECT, "dialog")
	_sequence_notice = _label(_sequence_panel, Rect2(24, 15, 464, 104), _last_notice, 23, _ink, true)
	for i in _level.sequence_order.size():
		var id: String = _level.sequence_order[i]
		var action := _action_for(id)
		var button := _button(_sequence_panel, Rect2(35, 131 + i * 102, 442, 80), action.name)
		button.name = "Action_" + id
		button.pressed.connect(_choose_action.bind(id))
		_sequence_buttons[id] = button
	_sequence_buttons[_level.sequence_order[0]].grab_focus()

func _action_for(id: String) -> Dictionary:
	for action: Dictionary in _level.sequence:
		if action.id == id:
			return action
	return {}

func _choose_action(id: String) -> void:
	if _paused or _terminal or _sequence_index >= _level.sequence.size():
		return
	var expected: Dictionary = _level.sequence[_sequence_index]
	if id != expected.id:
		cue_requested.emit("wrong")
		_sequence_notice.text = "这一步先留着。%s" % expected.detail
		return
	cue_requested.emit("correct")
	_sequence_buttons[id].disabled = true
	_sequence_notice.text = expected.detail
	_sequence_index += 1
	_instruction.text = "已完成 %d / %d 步" % [_sequence_index, _level.sequence.size()]
	if _sequence_index == _level.sequence.size():
		_sequence_panel.hide()
		_show_finish_button()
	else:
		for candidate: Button in _sequence_buttons.values():
			if not candidate.disabled:
				candidate.grab_focus()
				break

func _show_finish_button() -> void:
	_clue.text = _level.result
	_board.hide()
	_tray_area.hide()
	if is_instance_valid(_completion_flash):
		_completion_flash.hide()
	_finish_panel = _panel(_design, Rect2(38, 298, 500, 373), "dialog")
	if _run.recipes.size() == 1:
		_recipe_icons(_finish_panel, _run.recipes[0], 177.0, 20.0)
	else:
		for i in _run.recipes.size():
			var position_x := 250.0 - _run.recipes.size() * 75.0 + i * 150.0
			_recipe_icons(_finish_panel, _run.recipes[i], position_x, 20.0)
	_label(_finish_panel, Rect2(27, 137, 446, 122), _level.summary, 25, _ink, true)
	var button := _button(_finish_panel, Rect2(41, 272, 418, 73), "完成练习")
	button.name = "FinishPractice"
	button.pressed.connect(_finish)
	button.grab_focus()

func _show_combination(recipe: Dictionary) -> void:
	if is_instance_valid(_completion_flash):
		_completion_flash.hide()
		_completion_flash.queue_free()
	var flash := _panel(_design, Rect2(174, 777, 228, 34), "recipe")
	_completion_flash = flash
	for i in recipe.items.size():
		Chrome.image(flash, _texture(recipe.items[i]), Rect2(6 + i * 31, 2, 31, 30), TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
	_label(flash, Rect2(100, 0, 125, 34), recipe.name + "已合成", 16, _ink)
	var tween := flash.create_tween()
	tween.tween_interval(0.7)
	tween.tween_property(flash, "modulate:a", 0.0, 0.25)
	tween.tween_callback(flash.queue_free)

func _recipe_icons(parent: Control, recipe: Dictionary, x: float, y: float) -> void:
	var set_background := _panel(parent, Rect2(x, y, 146, 86), "recipe")
	for i in recipe.items.size():
		Chrome.image(set_background, _texture(recipe.items[i]), Rect2(4 + i * 47, 4, 44, 54), TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
	_label(set_background, Rect2(4, 55, 138, 29), recipe.name, 19, _ink)

func _finish() -> void:
	if _paused or _terminal:
		return
	_terminal = true
	finished.emit(true, _elapsed)

func _leave() -> void:
	if _terminal:
		return
	_terminal = true
	exited.emit()

func result_detail() -> Dictionary:
	return {"title": _level.result, "summary": _level.summary, "safe_art": _background.texture}

func _prop_path(id: String) -> String:
	return ART_PATH + "props/" + id + ".webp"

func _art_path(key: String) -> String:
	return ART_PATH + "ui/" + key + ".webp"

func _texture(id: String) -> Texture2D:
	if not _textures.has(id):
		_textures[id] = load(_prop_path(id))
	return _textures[id]

func _label(parent: Control, box: Rect2, value: String, px: int, ink: Color, wrap := false) -> Label:
	var item := Label.new()
	item.clip_text = true
	item.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	item.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	item.mouse_filter = MOUSE_FILTER_IGNORE
	item.add_theme_color_override("font_color", ink)
	item.add_theme_font_size_override("font_size", px)
	_place(parent, item, box)
	if wrap:
		item.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	item.text = value
	return item

func _panel(parent: Control, box: Rect2, art: String) -> Panel:
	var item := Panel.new()
	item.mouse_filter = MOUSE_FILTER_IGNORE
	item.add_theme_stylebox_override("panel", _style(_ui_texture(art)))
	_place(parent, item, box)
	return item

func _button(parent: Control, box: Rect2, value: String, transparent := false, art := "button") -> Button:
	var item := Button.new()
	item.text = value
	item.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	item.add_theme_font_size_override("font_size", 25)
	var texture := _ui_texture(art)
	var highlight := _ui_texture("slot") if transparent else texture
	var hover := _style(highlight, Color("fff5e83c") if transparent else Color("f9e5ad"))
	item.add_theme_stylebox_override("normal", StyleBoxEmpty.new() if transparent else _style(texture))
	item.add_theme_stylebox_override("hover", hover)
	item.add_theme_stylebox_override("pressed", _style(highlight, Color("f8d28d8c") if transparent else Color("ecc27d")))
	item.add_theme_stylebox_override("hover_pressed", hover)
	item.add_theme_stylebox_override("focus", _style(_ui_texture("slot"), Color("eaba5368")))
	item.add_theme_stylebox_override("disabled", _style(texture, Color("c6ba9e")))
	_place(parent, item, box)
	return item

func _place(parent: Control, item: Control, box: Rect2) -> void:
	parent.add_child(item)
	item.position = box.position
	item.size = box.size

func _ui_texture(art: String) -> Texture2D:
	return _chrome_art[art]

func _style(texture: Texture2D, tint := Color.WHITE) -> StyleBoxTexture:
	var style := StyleBoxTexture.new()
	style.texture = texture
	style.modulate_color = tint
	return style
