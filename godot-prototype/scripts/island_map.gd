extends Control

signal play_requested(level_id: String)
signal back_requested
signal home_requested
signal progress_requested
signal intro_layout_changed(level_id: String)

const IslandInfo = preload("res://scripts/island_info.gd")
const Save = preload("res://scripts/journey_save.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
const CornerTools = preload("res://scripts/map_corner_tools.gd")
const MapStop = preload("res://scripts/map_level_stop.gd")
const MapPositions = preload("res://scripts/map_positions.gd")
const PositionEditor = preload("res://scripts/map_position_editor.gd")
const HeaderLayout = preload("res://scripts/map_header_layout.gd")
const HeaderEditor = preload("res://scripts/map_header_editor.gd")
const MAP_STOP_SCENE = preload("res://scenes/map_level_stop.tscn")
const DESIGN_WIDTH := 576.0
const HEADER_MIN_HEIGHT := 72.0
const HEADER_ROW_HEIGHT := 48.0
const HEADER_STATUS_OVERLAP := 28.0
const PROGRESS_DRAG_DEPTH := 180.0
const TOOLBAR_BOOK_SIZE := Vector2(82.0, 54.0)
const TOOLBAR_TITLE_SIZE := Vector2(262.0, 54.0)
const TOOLBAR_HOME_SIZE := Vector2(48.0, 48.0)
const TOOLBAR_FLOWER_SIZE := 46.0

var _catalog: Catalog
var _save: Save
var _test_unlock := false
var _selected: Dictionary = {}
var _buttons: Dictionary = {}
var _first_playable: MapStop
var _map_motion: Tween
var _position_editor: PositionEditor
var _header_editor: HeaderEditor
var _header_storage := HeaderLayout.new()
var _header_layout := _header_storage.value
var _header_icon_offsets := _header_storage.icons.duplicate()
var _header_icon_defaults := {}
var _safe_top := 0.0
var _capsule := Vector2.ZERO
var _source_size := Vector2i.ZERO
var _source_points: Dictionary = {}
var _source_scale := Vector2.ONE

@onready var _map: ScrollContainer = %Map
@onready var _painting: Control = %Painting
@onready var _header: Control = $Header
@onready var _corner_tools: CornerTools = %MapTools
@onready var _intro := %Intro as ColorRect
@onready var _back_button: TextureButton = %Back
@onready var _home_button: TextureButton = _corner_tools.get_node("HomeButton")
@onready var _progress_button: TextureButton = _corner_tools.get_node("ProgressButton")
@onready var _header_icons := {"back": _back_button, "home": _home_button, "progress": _progress_button}

func _ready() -> void:
	%Back.pressed.connect(_back)
	%Back.button_down.connect(func() -> void: %Back.modulate = Color(0.90, 0.88, 0.82))
	%Back.button_up.connect(func() -> void: %Back.modulate = Color.WHITE)
	_intro.closed.connect(_dismiss_intro)
	_intro.started.connect(_start_selected)
	_corner_tools.home_pressed.connect(_request_tool.bind(home_requested))
	_corner_tools.progress_pressed.connect(_request_tool.bind(progress_requested))
	_map.get_v_scroll_bar().value_changed.connect(func(_scroll: float) -> void: _keep_plaques_clear())
	_map.item_rect_changed.connect(_keep_plaques_clear)
	_map.resized.connect(func() -> void: _reflow_map.call_deferred())
	_progress_button.item_rect_changed.connect(_keep_plaques_clear)
	_map.scroll_started.connect(_stop_map_motion)
	resized.connect(_layout_header)
	_layout_header()

func set_header_safe_area(safe_top: float, capsule: Vector2) -> void:
	_safe_top = safe_top
	_capsule = capsule
	_layout_header()

func _layout_header() -> void:
	var default_row := maxf(8.0, _safe_top - minf(_safe_top * 0.35, HEADER_STATUS_OVERLAP))
	var default_height := maxf(HEADER_MIN_HEIGHT, default_row + HEADER_ROW_HEIGHT + 6.0)
	var header_height := default_height + _header_layout.y
	_header.offset_top = _header_layout.x
	_header.offset_bottom = _header_layout.x + header_height

	var row_center := header_height * 0.5
	var row_height := minf(TOOLBAR_BOOK_SIZE.y, header_height - 10.0)
	var row_width := size.x
	var center_y := _header.position.y + row_center
	if _intersects_capsule(center_y - row_height * 0.5, center_y + row_height * 0.5):
		row_width = minf(row_width, _capsule.x - 6.0)
	var horizontal := row_width / DESIGN_WIDTH
	var fit := minf(1.0, minf(horizontal, row_height / TOOLBAR_BOOK_SIZE.y))
	_back_button.size = TOOLBAR_BOOK_SIZE * fit
	_home_button.size = TOOLBAR_HOME_SIZE * fit
	_progress_button.scale = Vector2.ONE * (TOOLBAR_FLOWER_SIZE * fit / _progress_button.size.x)
	_header_icon_defaults = {
		"back": Vector2(94.0 * horizontal, row_center) - _back_button.size * 0.5,
		"home": Vector2(487.0 * horizontal, row_center) - _home_button.size * 0.5,
		"progress": Vector2(545.0 * horizontal, row_center) - _icon_size(_progress_button) * 0.5,
	}
	$Header/TitlePlate.size = TOOLBAR_TITLE_SIZE * fit
	$Header/TitlePlate.position = Vector2(290.0 * horizontal, row_center) - $Header/TitlePlate.size * 0.5
	%Title.add_theme_font_size_override("font_size", maxi(18, roundi(29.0 * fit)))
	_layout_header_icons()

func _icon_size(icon: Control) -> Vector2:
	return icon.size * icon.scale

func _intersects_capsule(top: float, bottom: float) -> bool:
	return _capsule.x > 6.0 and _capsule.y > top and bottom > _safe_top

func _layout_header_icons() -> void:
	for id: String in _header_icons:
		var icon: Control = _header_icons[id]
		var base: Vector2 = _header_icon_defaults[id]
		icon.position = _bounded_icon_position(id, base + Vector2(_header_icon_offsets.get(id, Vector2i.ZERO)))
	_keep_plaques_clear()
	if is_instance_valid(_header_editor):
		_header_editor.update_header_rect(_header.get_rect())
		for id: String in _header_icons:
			var icon: Control = _header_icons[id]
			var rect := icon.get_global_transform() * Rect2(Vector2.ZERO, icon.size)
			rect.position -= global_position
			_header_editor.update_icon_rect(id, rect)

func header_icon_position(id: String) -> Vector2:
	return _header_icons[id].position

func header_icon_offset_at(id: String, proposed: Vector2) -> Vector2i:
	var icon: Control = _header_icons[id]
	var candidate := _bounded_icon_position(id, proposed)
	var base: Vector2 = _header_icon_defaults[id]
	var limit := Vector2i.ONE * HeaderLayout.ICON_OFFSET_LIMIT
	var offset := Vector2i((candidate - base).round()).clamp(-limit, limit)
	var rect := Rect2(_bounded_icon_position(id, base + Vector2(offset)), _icon_size(icon))
	for other: String in _header_icons:
		var other_icon: Control = _header_icons[other]
		if other != id and rect.intersects(Rect2(other_icon.position, _icon_size(other_icon))):
			return _header_icon_offsets.get(id, Vector2i.ZERO)
	return offset

func _bounded_icon_position(id: String, proposed: Vector2) -> Vector2:
	var icon: Control = _header_icons[id]
	var bottom := _header.size.y
	if id == "progress":
		bottom = minf(size.y - _header.position.y, bottom + PROGRESS_DRAG_DEPTH)
	var dimensions := _icon_size(icon)
	var point := proposed.clamp(Vector2.ZERO, (Vector2(size.x, bottom) - dimensions).max(Vector2.ZERO))
	var top := point.y + _header.position.y
	if _intersects_capsule(top, top + dimensions.y):
		point.x = minf(point.x, maxf(0.0, _capsule.x - 6.0 - dimensions.x))
	return point

func _preview_header(layout: Vector2i, icons: Dictionary) -> void:
	_header_icon_offsets = icons.duplicate()
	if layout == _header_layout:
		_layout_header_icons()
		return
	var scrollbar := _map.get_v_scroll_bar()
	var at_bottom := scrollbar.value >= scrollbar.max_value - scrollbar.page - 1.0
	_header_layout = layout
	_layout_header()
	if at_bottom:
		_scroll_to_bottom.call_deferred()

func _scroll_to_bottom() -> void:
	var scrollbar := _map.get_v_scroll_bar()
	_map.scroll_vertical = roundi(scrollbar.max_value - scrollbar.page)

func setup(info: IslandInfo, _index: int, catalogue: Catalog, progress: Save, test_unlock: bool = false, focus_level: String = "", next_level: String = "", planting := false, enable_legacy_editor := true) -> void:
	_catalog = catalogue
	_save = progress
	_test_unlock = test_unlock
	%Title.text = info.title
	var island_id := String(info.island_id)
	var layout := _catalog.map_for(island_id)
	if layout.is_empty():
		_map.hide()
		refresh_progress()
		return
	_source_size = Vector2i(int(layout.width), int(layout.height))
	var map_size := _map_canvas_size()
	_source_scale = map_size / Vector2(_source_size)
	var positions := MapPositions.new()
	_painting.custom_minimum_size = map_size
	%Art.texture = load(layout.image) as Texture2D
	for entry: Dictionary in layout.stops:
		var fallback := Vector2i(int(entry.x), int(entry.y))
		var point := positions.position_for(entry.id, fallback)
		if not Rect2i(Vector2i.ZERO, _source_size).has_point(point):
			point = fallback
		_source_points[entry.id] = point
		_add_stop(entry, island_id, Vector2(point) * _source_scale, map_size)
	if OS.has_feature("editor") and enable_legacy_editor:
		_position_editor = PositionEditor.new()
		_position_editor.name = "PositionEditor"
		add_child(_position_editor)
		_position_editor.setup(_map, _painting, _buttons, _source_points, positions, _source_size, _source_scale)
		_position_editor.point_moved.connect(_keep_plaques_clear)
		_position_editor.editing_started.connect(_stop_map_motion)
		_header_editor = HeaderEditor.new()
		_header_editor.name = "HeaderEditor"
		add_child(_header_editor)
		_header_editor.setup(self, _header_storage)
		_header_editor.layout_changed.connect(_preview_header)
		_header_editor.editing_started.connect(_stop_map_motion)
		_header_editor.editing_started.connect(_position_editor.set_entry_visible.bind(false))
		_header_editor.editing_finished.connect(_position_editor.set_entry_visible.bind(true))
		_position_editor.editing_started.connect(_header_editor.set_entry_visible.bind(false))
		_position_editor.editing_finished.connect(_header_editor.set_entry_visible.bind(true))
		_layout_header_icons()
	refresh_progress()
	var focus := _buttons.get(focus_level) as MapStop
	var next := _buttons.get(next_level) as MapStop
	_arrive.call_deferred(focus if is_instance_valid(focus) else _first_playable, next, planting)

func _map_canvas_size() -> Vector2:
	var width := _map.size.x if _map.size.x > 0.0 else DESIGN_WIDTH
	var natural_height := width * _source_size.y / _source_size.x
	return Vector2(width, maxf(natural_height, _map.size.y))

func _reflow_map() -> void:
	if _source_size.x <= 0 or _source_size.y <= 0:
		return
	var map_size := _map_canvas_size()
	if _painting.custom_minimum_size.is_equal_approx(map_size):
		return
	var scroll := _map.get_v_scroll_bar()
	var at_bottom := scroll.value >= scroll.max_value - scroll.page - 1.0
	var source_top := scroll.value / _source_scale.y
	_source_scale = map_size / Vector2(_source_size)
	_painting.custom_minimum_size = map_size
	if is_instance_valid(_position_editor):
		_position_editor.set_source_scale(_source_scale)
	for id: String in _buttons:
		var stop: MapStop = _buttons[id]
		stop.move_to_ground(Vector2(_source_points[id]) * _source_scale, map_size)
	_restore_map_view.call_deferred(source_top, at_bottom)

func _restore_map_view(source_top: float, at_bottom: bool) -> void:
	if at_bottom:
		_scroll_to_bottom()
	else:
		_map.scroll_vertical = roundi(source_top * _source_scale.y)
	_keep_plaques_clear()

func _add_stop(entry: Dictionary, island_id: String, ground: Vector2, map_size: Vector2) -> void:
	var stop := MAP_STOP_SCENE.instantiate() as MapStop
	var id := String(entry.id)
	stop.name = "Stop_" + id.replace("-", "_")
	stop.set_meta(&"page_layout_selectable", true)
	%Painting.add_child(stop)
	stop.place(entry, island_id, ground, map_size)
	stop.selected.connect(inspect.bind(id))
	_buttons[id] = stop

func refresh_progress(progress: Save = null) -> void:
	if progress != null:
		_save = progress
	_corner_tools.set_wallet(_save.total(_catalog.playable_ids()))
	_first_playable = null
	var first_complete: MapStop
	for id: String in _buttons:
		var status := _catalog.status_for(id, _save, _test_unlock)
		var stop: MapStop = _buttons[id]
		stop.set_status(status, _status_text(status, id))
		if status == "complete" and not is_instance_valid(first_complete):
			first_complete = stop
		if status == "available" and not is_instance_valid(_first_playable):
			_first_playable = stop
	if not is_instance_valid(_first_playable):
		_first_playable = first_complete

func inspect(id: String) -> void:
	if %Intro.visible or _editing_layout():
		return
	_selected = _catalog.entry_for(id)
	if _selected.is_empty() or not _buttons.has(id):
		return
	var status := _catalog.status_for(id, _save, _test_unlock)
	var requirement := _status_text(status, id)
	if status == "locked":
		var previous := _catalog.entry_for(_catalog.prerequisite_for(id))
		requirement = "先完成「%s」" % previous.get("title", "前置关卡")
	_lock_map_input(true)
	_intro.display(_selected, status, requirement, _catalog.can_play(id, _save, _test_unlock))
	intro_layout_changed.emit(id)

func _lock_map_input(value: bool) -> void:
	for control: Control in [_map, $Header]:
		control.process_mode = Node.PROCESS_MODE_DISABLED if value else Node.PROCESS_MODE_INHERIT
	if is_instance_valid(_position_editor):
		_position_editor.set_entry_visible(not value)
		_header_editor.set_entry_visible(not value)

func _start_selected() -> void:
	var id: String = _selected.get("id", "")
	if _buttons.has(id) and _catalog.can_play(id, _save, _test_unlock):
		play_requested.emit(id)

func _request_tool(request: Signal) -> void:
	if not %Intro.visible and not _editing_layout():
		request.emit()

func _scroll_to(stop: MapStop) -> void:
	_stop_map_motion()
	_map.scroll_vertical = _scroll_destination(stop)
	_keep_plaques_clear()

func _scroll_destination(stop: MapStop) -> int:
	var scrollbar := _map.get_v_scroll_bar()
	var limit := maxi(0, roundi(scrollbar.max_value - scrollbar.page))
	if is_instance_valid(stop):
		var along_map := clampf(stop.plaque_top() / maxf(scrollbar.max_value, 1.0), 0.0, 1.0)
		var anchor := lerpf(0.22, 0.89, along_map)
		var covered := clampf(_map_rect(_header).end.y, 0.0, _map.size.y)
		var visible_height := _map.size.y - covered
		return clampi(roundi(stop.plaque_top() - covered - visible_height * anchor), 0, limit)
	return limit

func _arrive(current: MapStop, next: MapStop, planting: bool) -> void:
	_scroll_to(current)
	if is_instance_valid(current):
		current.focus_plaque()
	if planting and is_instance_valid(current):
		current.animate_plant()
	if not is_instance_valid(next):
		return
	_map_motion = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	_map_motion.tween_interval(0.7 if planting else 0.22)
	_map_motion.tween_property(_map, "scroll_vertical", _scroll_destination(next), 0.50 if planting else 0.64)
	if not _test_unlock:
		_map_motion.tween_callback(next.highlight_unlock)

func _stop_map_motion() -> void:
	if is_instance_valid(_map_motion):
		_map_motion.kill()

func _keep_plaques_clear() -> void:
	if _buttons.is_empty():
		return
	# ScrollContainer repositions its child on the next layout pass. Use the
	# live scrollbar value to calculate the world-space toolbar for this frame.
	var hud := _map_rect(_progress_button)
	hud.position.y += _map.get_v_scroll_bar().value
	for stop: MapStop in _buttons.values():
		stop.avoid_hud(hud)

func _map_rect(control: Control) -> Rect2:
	var to_map := _map.get_global_transform_with_canvas().affine_inverse() * control.get_global_transform_with_canvas()
	return to_map * Rect2(Vector2.ZERO, control.size)

func _status_text(status: String, id: String) -> String:
	match status:
		"complete": return "%d 朵小红花" % _save.flowers_for(id)
		"available": return "可以开始"
		"locked": return "尚未解锁"
		"unported": return "旧关 / 待迁移"
		_: return "筹备中 / 暂未开放"

func _back() -> void:
	if _intro.visible:
		_dismiss_intro()
	elif is_instance_valid(_header_editor) and _header_editor.is_editing():
		_header_editor.request_close()
	elif is_instance_valid(_position_editor) and _position_editor.is_editing():
		_position_editor.request_close()
	else:
		back_requested.emit()

func _dismiss_intro() -> void:
	if not _intro.visible:
		return
	_intro.hide()
	intro_layout_changed.emit("")
	_lock_map_input(false)
	if _buttons.has(_selected.get("id", "")):
		_buttons[_selected.id].focus_plaque()

func _editing_layout() -> bool:
	return is_instance_valid(_position_editor) and (_position_editor.is_editing() or _header_editor.is_editing())

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		_back()
