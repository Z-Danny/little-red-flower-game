extends ColorRect

signal closed
signal active_player_changed

const Catalog = preload("res://scripts/level_catalog.gd")
const Save = preload("res://scripts/journey_save.gd")
const Profiles = preload("res://scripts/journey_profiles.gd")
const Painted = preload("res://scripts/painted_chrome.gd")
const SIGN = preload("res://assets/restored_ui/journal-island-sign.webp")
const HOME = preload("res://assets/restored_ui/journal-island-home.webp")
const PUBLIC = preload("res://assets/restored_ui/journal-island-public.webp")
const NATURE = preload("res://assets/restored_ui/journal-island-nature.webp")

var _profiles: Profiles
var _ranking := false

func _ready() -> void:
	for button: Button in [%ProgressTab, %RankTab]:
		Painted.action(button)
	%ProgressTab.pressed.connect(_set_tab.bind(false))
	%RankTab.pressed.connect(_set_tab.bind(true))
	_set_tab(false)

func display(catalogue: Catalog, save: Save, profiles: Profiles) -> void:
	_profiles = profiles
	var ids := catalogue.playable_ids()
	var cleared := 0
	for id in ids:
		if save.flowers_for(id) > 0: cleared += 1
	%Count.text = "%d 朵小红花" % save.total(ids)
	%Totals.text = "已完成 %d / %d 关" % [cleared, ids.size()]
	$Card/Player.text = profiles.profile().name
	for list: Control in [%Islands, %RankRows]:
		for row in list.get_children():
			list.remove_child(row)
			row.queue_free()
	for row in profiles.rows(ids, save):
		_build_rank(row)
	var source := Catalog.read_json(Catalog.MANIFEST)
	for map: Dictionary in source.get("maps", []):
		var total := 0
		var completed := 0
		for stop: Dictionary in map.stops:
			if stop.id in ids:
				total += 1
				if save.flowers_for(stop.id) > 0: completed += 1
		_build_row(map, completed, total)
	if _ranking:
		%RankTab.grab_focus()
	else:
		%ProgressTab.grab_focus()

func show_ranking() -> void:
	_set_tab(true)
	%RankTab.grab_focus()

func _set_tab(ranking: bool) -> void:
	_ranking = ranking
	$Card/IslandScroll.visible = not ranking
	%Totals.visible = not ranking
	%RankBody.visible = ranking
	%RankTab.modulate = Color.WHITE if ranking else Color("c9b792")
	%ProgressTab.modulate = Color("c9b792") if ranking else Color.WHITE
	$Card/Note.text = "本机玩家按花数排名，同分并列。" if ranking else "重玩只补发超过原成绩的小红花。"

func _build_rank(row: Dictionary) -> void:
	var button := Button.new()
	var rank := "第 %d 名" % row.rank if row.rank > 0 else "未上榜"
	var current: bool = row.id == _profiles.active_id
	var region: String = row.region
	button.text = "%s　%s　%d 朵%s" % [rank, row.name, row.flowers, " · 我" if current else ""]
	if not region.is_empty():
		button.text += "\n" + region
	button.custom_minimum_size.y = 65
	button.add_theme_font_size_override("font_size", 19)
	button.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	Painted.action(button)
	button.disabled = current
	button.pressed.connect(_switch.bind(row.id))
	%RankRows.add_child(button)

func _switch(id: String) -> void:
	if _profiles.switch_to(id):
		active_player_changed.emit()
	else:
		$Card/Note.text = "暂时无法切换玩家。"

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

func _gui_input(event: InputEvent) -> void:
	var released := false
	if event is InputEventMouseButton:
		released = event.button_index == MOUSE_BUTTON_LEFT and not event.pressed
	elif event is InputEventScreenTouch:
		released = not event.pressed and not event.canceled
	if released and not $Card.get_rect().has_point(event.position):
		accept_event()
		closed.emit()

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		closed.emit()
