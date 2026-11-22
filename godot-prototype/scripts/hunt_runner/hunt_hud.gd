extends Control
## Floating view only. Countdown, silhouettes and captions never change the clock.

const Pack = preload("res://scripts/hunt_runner/hunt_pack.gd")
const Rules = preload("res://scripts/hunt_runner/hunt_rules.gd")
const BACK = preload("res://assets/hunt_runner/shared/ui/back.webp")
const HINT = preload("res://assets/hunt_runner/shared/ui/hint.webp")
const PAUSE = preload("res://assets/hunt_runner/shared/ui/pause.webp")
const RAIL = preload("res://assets/hunt_runner/shared/ui/timer-empty.webp")
const GOLD = preload("res://assets/hunt_runner/shared/ui/timer-full.webp")
const PETAL = preload("res://assets/hunt_runner/shared/ui/petal.webp")

signal back_requested
signal pause_requested
signal keyboard_target(id: String)

var _header: Label
var _eyebrow: Label
var _back: Button
var _hint: Button
var _pause: Button
var _clues: HBoxContainer
var _icons: Array[TextureRect] = []
var _tiles: Array[Panel] = []
var _ticks: Array[Label] = []
var _tile_ids: Array[String] = []
var _key_buttons: Array[Button] = []
var _tile_found: Array[bool] = []
var _close_timer: Timer
var _caption_panel: Panel
var _caption: Label
var _pinned := false
var _hovered := false
var _focused := false
var _enabled := true
var _remaining := 1.0
var _resolved := false
var _normal_tile: StyleBoxFlat
var _found_tile: StyleBoxFlat

func build(pack: Pack, title: String) -> void:
	name = "HUD"
	mouse_filter = MOUSE_FILTER_IGNORE
	_normal_tile = box_style(Color("fff1d6ed"), Color("fff8e9"), 14)
	_found_tile = box_style(Color("f9ddd3"), Color("e7796b"), 14)
	_eyebrow = _header_text("找隐患", 15, Color("f7da9a"))
	_header = _header_text(title, 28, Color("fff5df"))
	_header.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_back = _icon_button("Back", BACK, "返回地图")
	_hint = _icon_button("Hint", HINT, "线索剪影（H）")
	_pause = _icon_button("Pause", PAUSE, "暂停（Esc）")
	_back.pressed.connect(func() -> void: back_requested.emit())
	_pause.pressed.connect(func() -> void: pause_requested.emit())
	_hint.pressed.connect(toggle_hints)
	_hint.mouse_entered.connect(_hover_open)
	_hint.mouse_exited.connect(_hover_close)
	_hint.focus_entered.connect(func() -> void:
		if Input.is_action_pressed(&"ui_focus_next") or Input.is_action_pressed(&"ui_focus_prev"):
			_focused = true
			_sync_hints()
	)
	_hint.focus_exited.connect(func() -> void:
		_focused = false
		_sync_hints()
	)
	_close_timer = Timer.new()
	_close_timer.one_shot = true
	_close_timer.wait_time = 0.22
	_close_timer.timeout.connect(func() -> void:
		_hovered = false
		_sync_hints()
	)
	add_child(_close_timer)
	_clues = HBoxContainer.new()
	_clues.name = "Clues"
	_clues.alignment = BoxContainer.ALIGNMENT_CENTER
	_clues.mouse_filter = MOUSE_FILTER_STOP
	_clues.add_theme_constant_override("separation", 8)
	_clues.mouse_entered.connect(_hover_open)
	_clues.mouse_exited.connect(_hover_close)
	_clues.hide()
	add_child(_clues)
	for target: Dictionary in pack.rules["targets"]:
		_add_clue(pack, target)
	_caption_panel = Panel.new()
	_caption_panel.name = "Caption"
	_caption_panel.mouse_filter = MOUSE_FILTER_IGNORE
	_caption_panel.add_theme_stylebox_override("panel", box_style(Color("20342df4"), Color("f0dca36a"), 16))
	_caption = Label.new()
	_caption.mouse_filter = MOUSE_FILTER_IGNORE
	_caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_caption.add_theme_color_override("font_color", Color("fff1d4"))
	_caption.add_theme_font_size_override("font_size", 22)
	_caption_panel.add_child(_caption)
	add_child(_caption_panel)
	_caption_panel.hide()
	for target: Dictionary in pack.rules["targets"]:
		_add_key_button(target)
	resized.connect(_layout)
	_layout()

func _header_text(value: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = value
	label.mouse_filter = MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", Color("162a22"))
	label.add_theme_constant_override("outline_size", 4)
	add_child(label)
	return label

func _icon_button(id: String, image: Texture2D, tip: String) -> Button:
	var button := Button.new()
	button.name = id
	button.icon = image
	button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.expand_icon = true
	button.tooltip_text = tip
	button.accessibility_name = tip
	for state in ["normal", "hover", "pressed", "disabled"]:
		var fill := Color(1.0, 0.91, 0.65, 0.0)
		if state == "hover" or state == "pressed":
			fill.a = 0.16 if state == "hover" else 0.28
		var style := box_style(fill, Color.TRANSPARENT, 12)
		style.set_content_margin_all(5.0)
		button.add_theme_stylebox_override(state, style)
	var focus := box_style(Color.TRANSPARENT, Color("fff2bf"), 12)
	focus.draw_center = false
	button.add_theme_stylebox_override("focus", focus)
	add_child(button)
	return button

func _add_clue(pack: Pack, target: Dictionary) -> void:
	var id: String = target["id"]
	var tile := Panel.new()
	tile.custom_minimum_size = Vector2(67.0, 70.0)
	tile.mouse_filter = MOUSE_FILTER_IGNORE
	tile.accessibility_name = str(target["name"])
	tile.add_theme_stylebox_override("panel", _normal_tile)
	var icon := TextureRect.new()
	icon.texture = pack.texture("icon:" + id)
	icon.mouse_filter = MOUSE_FILTER_IGNORE
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.modulate = Color(0.0, 0.0, 0.0, 0.8)
	tile.add_child(icon)
	icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	icon.offset_left = 7.0
	icon.offset_top = 7.0
	icon.offset_right = -7.0
	icon.offset_bottom = -7.0
	var check_mark := Label.new()
	check_mark.text = "✓"
	check_mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	check_mark.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	check_mark.mouse_filter = MOUSE_FILTER_IGNORE
	check_mark.add_theme_font_size_override("font_size", 36)
	check_mark.add_theme_color_override("font_color", Color("dc4f43"))
	tile.add_child(check_mark)
	check_mark.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	check_mark.hide()
	_clues.add_child(tile)
	_tile_ids.append(id)
	_tiles.append(tile)
	_icons.append(icon)
	_ticks.append(check_mark)
	_tile_found.append(false)

func _add_key_button(target: Dictionary) -> void:
	var button := Button.new()
	var id: String = target["id"]
	button.name = "Keyboard_" + id
	button.text = "圈出" + str(target["name"])
	button.mouse_filter = MOUSE_FILTER_IGNORE
	button.modulate.a = 0.0
	button.focus_entered.connect(func() -> void: button.modulate.a = 1.0)
	button.focus_exited.connect(func() -> void: button.modulate.a = 0.0)
	button.pressed.connect(func() -> void: keyboard_target.emit(id))
	add_child(button)
	_key_buttons.append(button)

func set_interactive(value: bool) -> void:
	_enabled = value
	_back.disabled = not value
	_hint.disabled = not value
	_pause.disabled = not value
	if not value:
		close_hints()
		for button in _key_buttons:
			button.disabled = true

func set_caption(value: String) -> void:
	_caption.text = value
	_caption_panel.visible = not value.is_empty()
	if _caption_panel.visible:
		_layout_caption()
		_layout_caption.call_deferred() # Label recomputes minimum height after its width is assigned.

func update_run(run: Rules) -> void:
	_remaining = run.remaining_ratio()
	_resolved = run.phase == Rules.Phase.REVEAL or run.phase == Rules.Phase.COMPLETE
	var is_playing := _enabled and run.phase == Rules.Phase.PLAYING
	_hint.disabled = not is_playing
	for i in range(_tile_ids.size()):
		var found := run.found.has(_tile_ids[i])
		if _tile_found[i] != found:
			_tile_found[i] = found
			_tiles[i].add_theme_stylebox_override("panel", _found_tile if found else _normal_tile)
			_icons[i].modulate.a = 0.2 if found else 0.8
			_ticks[i].visible = found
		_key_buttons[i].disabled = not is_playing or found or not run.marking_id.is_empty()
	queue_redraw()

func toggle_hints() -> void:
	if not _enabled or _hint.disabled:
		return
	_close_timer.stop()
	_pinned = not _pinned
	_hovered = false
	_focused = false
	_sync_hints()

func close_hints() -> void:
	_close_timer.stop()
	_pinned = false
	_hovered = false
	_focused = false
	_sync_hints()

func hints_visible() -> bool:
	return _clues.visible

func _hover_open() -> void:
	if _enabled and not _hint.disabled:
		_close_timer.stop()
		_hovered = true
		_sync_hints()

func _hover_close() -> void:
	if _hovered:
		_close_timer.start()

func _sync_hints() -> void:
	_clues.visible = _enabled and (_pinned or _hovered or _focused)

func _layout() -> void:
	_place(_eyebrow, 78.0, 43.0, maxf(0.0, size.x - 215.0), 20.0)
	_place(_header, 78.0, 61.0, maxf(0.0, size.x - 215.0), 36.0)
	_place(_back, 14.0, 43.0, 54.0, 54.0)
	_place(_hint, size.x - 127.0, 43.0, 54.0, 54.0)
	_place(_pause, size.x - 68.0, 43.0, 54.0, 54.0)
	var clue_width := float(_tiles.size() * 67 + maxi(0, _tiles.size() - 1) * 8)
	_place(_clues, (size.x - clue_width) * 0.5, 106.0, clue_width, 70.0)
	for button in _key_buttons:
		_place(button, maxf(0.0, (size.x - 400.0) * 0.5), size.y - 82.0, minf(400.0, size.x), 52.0)
	_layout_caption()
	queue_redraw()

func _layout_caption() -> void:
	if _caption.text.is_empty() or size.x <= 62.0:
		return
	var font := _caption.get_theme_font("font")
	var text_width := ceilf(font.get_string_size(_caption.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 22).x)
	var width := minf(516.0, minf(size.x - 26.0, maxf(190.0, text_width + 39.0)))
	var ink_width := width - 36.0
	var ink_height := ceilf(font.get_multiline_string_size(_caption.text, HORIZONTAL_ALIGNMENT_CENTER, ink_width, 22, -1, TextServer.BREAK_MANDATORY | TextServer.BREAK_WORD_BOUND | TextServer.BREAK_ADAPTIVE).y)
	var height := maxf(30.0, ink_height) + 22.0
	_place(_caption_panel, (size.x - width) * 0.5, size.y - height - 23.0, width, height)
	_place(_caption, 18.0, 11.0, ink_width, height - 22.0)

func _draw() -> void:
	if _header == null or size.x <= 28.0:
		return
	var pts := PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0.0), Vector2(size.x, 123.0), Vector2(0.0, 123.0)])
	var shade := Color(0.08, 0.14, 0.13, 0.9)
	var clear := Color(0.08, 0.14, 0.13, 0.0)
	draw_polygon(pts, PackedColorArray([shade, shade, clear, clear]))
	var rail := Rect2(14.0, 9.0, size.x - 28.0, (size.x - 28.0) * RAIL.get_height() / RAIL.get_width())
	draw_texture_rect(RAIL, rail, false)
	if _remaining > 0.0:
		var tint := Color("f3a68b") if _remaining <= 0.20 else Color.WHITE
		var src := Rect2(GOLD.get_width() * 0.039, GOLD.get_height() * (0.34 + 0.045), GOLD.get_width() * 0.922 * _remaining, GOLD.get_height() * 0.42)
		var dest := Rect2(rail.position + rail.size * Vector2(0.039, 0.34), rail.size * Vector2(0.922 * _remaining, 0.42))
		draw_texture_rect_region(GOLD, dest, src, tint)
	if not _resolved:
		var boundary := rail.position + rail.size * Vector2(0.039 + 0.922 * _remaining, 0.55)
		draw_texture_rect(PETAL, Rect2(boundary - Vector2(13.0, 25.5), Vector2(26.0, 27.0)), false)

static func _place(control: Control, x: float, y: float, w: float, h: float) -> void:
	control.position = Vector2(x, y)
	control.size = Vector2(w, h)

static func box_style(fill: Color, edge: Color, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_border_width_all(2)
	style.set_corner_radius_all(radius)
	return style
