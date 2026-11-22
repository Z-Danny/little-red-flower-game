extends Control

signal play_requested(level_id: String)
signal back_requested
signal home_requested
signal progress_requested
signal settings_requested

const IslandInfo = preload("res://scripts/island_info.gd")
const Save = preload("res://scripts/journey_save.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
const CornerTools = preload("res://scripts/map_corner_tools.gd")
const MapStop = preload("res://scripts/map_level_stop.gd")
const MAP_STOP_SCENE = preload("res://scenes/map_level_stop.tscn")
const DESIGN_WIDTH := 576.0

var _catalog: Catalog
var _save: Save
var _test_unlock := false
var _selected: Dictionary = {}
var _buttons: Dictionary = {}
var _first_playable: MapStop

@onready var _map: ScrollContainer = %Map
@onready var _corner_tools: CornerTools = %MapTools
@onready var _intro := %Intro as ColorRect

func _ready() -> void:
	%Back.pressed.connect(_back)
	_intro.closed.connect(_back)
	_intro.started.connect(_start_selected)
	%FirstPlayable.pressed.connect(func() -> void:
		if is_instance_valid(_first_playable):
			_scroll_to(_first_playable)
			_first_playable.focus_plaque()
	)
	_corner_tools.home_pressed.connect(_request_tool.bind(home_requested))
	_corner_tools.progress_pressed.connect(_request_tool.bind(progress_requested))
	_corner_tools.settings_pressed.connect(_request_tool.bind(settings_requested))
	_map.get_v_scroll_bar().value_changed.connect(func(_scroll: float) -> void: _keep_plaques_clear())
	_corner_tools.item_rect_changed.connect(_keep_plaques_clear)

func setup(info: IslandInfo, index: int, catalogue: Catalog, progress: Save, test_unlock: bool = false, focus_level: String = "") -> void:
	_catalog = catalogue
	_save = progress
	_test_unlock = test_unlock
	%Title.text = "%02d　%s" % [index + 1, info.title]
	var island_id := String(info.island_id)
	var layout := _catalog.map_for(island_id)
	if layout.is_empty():
		_map.hide()
		refresh_progress()
		return
	var pixels: float = DESIGN_WIDTH / float(layout.width)
	var map_size := Vector2(DESIGN_WIDTH, roundf(float(layout.height) * pixels))
	%Painting.custom_minimum_size = map_size
	%Art.texture = load(layout.image) as Texture2D
	for entry: Dictionary in layout.stops:
		_add_stop(entry, island_id, pixels, map_size)
	refresh_progress()
	var focus := _buttons.get(focus_level) as MapStop
	_scroll_to.call_deferred(focus)

func _add_stop(entry: Dictionary, island_id: String, pixels: float, map_size: Vector2) -> void:
	var stop := MAP_STOP_SCENE.instantiate() as MapStop
	var id := String(entry.id)
	stop.name = "Stop_" + id.replace("-", "_")
	%Painting.add_child(stop)
	stop.place(entry, island_id, Vector2(float(entry.x), float(entry.y)) * pixels, map_size)
	stop.selected.connect(inspect.bind(id))
	_buttons[id] = stop

func refresh_progress(progress: Save = null) -> void:
	if progress != null:
		_save = progress
	_corner_tools.set_wallet(_save.total(_catalog.original_playable_ids()))
	_first_playable = null
	for id: String in _buttons:
		var status := _catalog.status_for(id, _save, _test_unlock)
		var stop: MapStop = _buttons[id]
		stop.set_status(status, _status_text(status, id))
		if not is_instance_valid(_first_playable) and status in ["available", "complete"]:
			_first_playable = stop
	%FirstPlayable.visible = is_instance_valid(_first_playable)

func inspect(id: String) -> void:
	if %Intro.visible:
		return
	_selected = _catalog.entry_for(id)
	if _selected.is_empty() or not _buttons.has(id):
		return
	var status := _catalog.status_for(id, _save, _test_unlock)
	var requirement := _status_text(status, id)
	if status == "locked":
		var previous := _catalog.entry_for(str(_selected.unlock_after))
		requirement = "先完成「%s」" % previous.get("title", "前置关卡")
	_lock_map_input(true)
	_intro.display(_selected, status, requirement, _catalog.can_play(id, _save, _test_unlock))

func _lock_map_input(value: bool) -> void:
	for control: Control in [_map, $Header, _corner_tools]:
		control.process_mode = Node.PROCESS_MODE_DISABLED if value else Node.PROCESS_MODE_INHERIT

func _start_selected() -> void:
	var id: String = _selected.get("id", "")
	if _buttons.has(id) and _catalog.can_play(id, _save, _test_unlock):
		play_requested.emit(id)

func _request_tool(request: Signal) -> void:
	if not %Intro.visible:
		request.emit()

func _scroll_to(stop: MapStop) -> void:
	var scrollbar := _map.get_v_scroll_bar()
	if is_instance_valid(stop):
		_map.scroll_vertical = roundi(stop.plaque_top() - _map.size.y * 0.48)
	else:
		_map.scroll_vertical = roundi(maxf(0.0, scrollbar.max_value - scrollbar.page))
	_keep_plaques_clear()

func _keep_plaques_clear() -> void:
	if _buttons.is_empty():
		return
	# ScrollContainer repositions its child on the next layout pass. Use the
	# live scrollbar value to calculate the world-space toolbar for this frame.
	var hud := _corner_tools.get_global_rect()
	hud.position -= _map.global_position
	hud.position.y += _map.get_v_scroll_bar().value
	for stop: MapStop in _buttons.values():
		stop.avoid_hud(hud)

func _status_text(status: String, id: String) -> String:
	match status:
		"complete": return "%d 朵小红花" % _save.flowers_for(id)
		"available": return "可以开始"
		"locked": return "尚未解锁"
		"unported": return "旧关 / 待迁移"
		_: return "筹备中 / 暂未开放"

func _back() -> void:
	if %Intro.visible:
		_intro.hide()
		_lock_map_input(false)
		if _buttons.has(_selected.get("id", "")):
			_buttons[_selected.id].focus_plaque()
	else:
		back_requested.emit()

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		_back()
