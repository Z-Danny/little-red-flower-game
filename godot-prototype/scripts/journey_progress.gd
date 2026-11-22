extends ColorRect

signal closed

const Catalog = preload("res://scripts/level_catalog.gd")
const Save = preload("res://scripts/journey_save.gd")
const Painted = preload("res://scripts/painted_chrome.gd")
const SIGN = preload("res://assets/restored_ui/journal-island-sign.webp")
const HOME = preload("res://assets/restored_ui/journal-island-home.webp")
const PUBLIC = preload("res://assets/restored_ui/journal-island-public.webp")
const NATURE = preload("res://assets/restored_ui/journal-island-nature.webp")

func _ready() -> void:
	Painted.action(%Back)
	%Close.pressed.connect(func() -> void: closed.emit())
	%Back.pressed.connect(func() -> void: closed.emit())

func display(catalogue: Catalog, save: Save) -> void:
	var ids := catalogue.original_playable_ids()
	var cleared := 0
	for id in ids:
		if save.flowers_for(id) > 0: cleared += 1
	%Count.text = "%d 朵小红花" % save.total(ids)
	%Totals.text = "已完成 %d / %d 关" % [cleared, ids.size()]
	var source := Catalog.read_json(Catalog.MANIFEST)
	for map: Dictionary in source.get("maps", []):
		var total := 0
		var completed := 0
		for stop: Dictionary in map.stops:
			if stop.was_playable:
				total += 1
				if save.flowers_for(stop.id) > 0: completed += 1
		_build_row(map, completed, total)
	%Back.grab_focus()

func _build_row(map: Dictionary, completed: int, total: int) -> void:
	var row := Control.new()
	row.custom_minimum_size = Vector2(0, 62)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	%Islands.add_child(row)
	var picture := PUBLIC
	match map.id:
		"home", "food", "emergency": picture = HOME
		"outdoor", "water": picture = NATURE
	Painted.image(row, picture, Rect2(6, 2, 69, 61), TextureRect.STRETCH_KEEP_ASPECT_CENTERED)
	Painted.image(row, SIGN, Rect2(76, 2, 335, 58))
	var key := Label.new()
	key.text = map.name
	key.add_theme_font_size_override("font_size", 19)
	key.add_theme_color_override("font_color", Color("fff1c2"))
	key.add_theme_color_override("font_outline_color", Color("1d3023"))
	key.add_theme_constant_override("outline_size", 3)
	key.position = Vector2(95, 17)
	key.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(key)
	var state := Label.new()
	state.text = "%d / %d" % [completed, total] if total > 0 else "待开放"
	state.add_theme_font_size_override("font_size", 18)
	state.add_theme_color_override("font_color", Color("ffe2a0"))
	state.add_theme_color_override("font_outline_color", Color("1d3023"))
	state.add_theme_constant_override("outline_size", 3)
	state.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	state.position = Vector2(306, 17)
	state.size = Vector2(78, 26)
	state.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(state)

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		closed.emit()
