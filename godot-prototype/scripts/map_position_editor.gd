extends Node
## Available when running the source project with the Godot editor executable.

signal point_moved
signal editing_started
signal editing_finished

const MapPositions = preload("res://scripts/map_positions.gd")
const MapStop = preload("res://scripts/map_level_stop.gd")
const DOCK_HEIGHT := 102.0

var _map: ScrollContainer
var _overlay: Control
var _open: Button
var _dock: PanelContainer
var _caption: Label
var _undo_button: Button
var _save_button: Button
var _close_button: Button
var _stops: Dictionary
var _points: Dictionary
var _saved: Dictionary
var _expected: Dictionary = {}
var _positions: MapPositions
var _bounds: Vector2i
var _scale := Vector2.ONE
var _scroll_bottom: float
var _history: Array[Dictionary] = []
var _selected := ""
var _drag_id := ""
var _drag_from := Vector2i.ZERO
var _mouse_from := Vector2.ZERO

func setup(map: ScrollContainer, painting: Control, stops: Dictionary, points: Dictionary, positions: MapPositions, bounds: Vector2i, pixels: Vector2) -> void:
	_map = map
	_stops = stops
	_points = points
	_saved = points.duplicate()
	_positions = positions
	_bounds = bounds
	_scale = pixels
	_scroll_bottom = map.offset_bottom
	for id: String in points:
		_expected[id] = positions.override_for(id)

	_overlay = Control.new()
	_overlay.name = "PositionDragSurface"
	_overlay.mouse_filter = Control.MOUSE_FILTER_PASS
	_overlay.hide()
	painting.add_child(_overlay)
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.gui_input.connect(_on_surface_input)
	_overlay.draw.connect(_draw_selection)
	_create_controls(map.get_parent() as Control)
	set_process_input(false)

func set_source_scale(pixels: Vector2) -> void:
	_cancel_drag()
	_scale = pixels
	_overlay.queue_redraw()

func _create_controls(host: Control) -> void:
	_open = Button.new()
	_open.name = "EditMapPositions"
	_open.text = "位置编辑"
	host.add_child(_open)
	_open.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	_open.offset_left = 16.0
	_open.offset_top = -66.0
	_open.offset_right = 154.0
	_open.offset_bottom = -16.0
	_open.pressed.connect(_begin_editing)

	_dock = PanelContainer.new()
	_dock.name = "MapPositionDock"
	_dock.add_theme_stylebox_override("panel", host.get_theme_stylebox("panel", "Panel"))
	_dock.hide()
	host.add_child(_dock)
	_dock.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_dock.offset_left = 8.0
	_dock.offset_right = -8.0
	_dock.offset_top = -DOCK_HEIGHT
	_dock.offset_bottom = -8.0
	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	_dock.add_child(column)
	_caption = Label.new()
	_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_caption.add_theme_font_size_override("font_size", 20)
	_caption.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_caption)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(row)
	_undo_button = _toolbar_button(row, "撤销", _undo)
	_save_button = _toolbar_button(row, "保存", _save)
	_close_button = _toolbar_button(row, "关闭", _discard_and_close)

func _toolbar_button(row: HBoxContainer, text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(104.0, 40.0)
	button.pressed.connect(action)
	row.add_child(button)
	return button

func is_editing() -> bool:
	return _overlay.visible

func set_entry_visible(value: bool) -> void:
	_open.visible = value and not is_editing()

func _begin_editing() -> void:
	editing_started.emit()
	var scroll := _map.get_v_scroll_bar()
	var at_bottom := scroll.value >= scroll.max_value - scroll.page - 1.0
	_open.hide()
	_dock.show()
	_overlay.show()
	_map.offset_bottom = _scroll_bottom - DOCK_HEIGHT
	if at_bottom:
		_scroll_to_bottom.call_deferred()
	set_process_input(true)
	_refresh()

func _scroll_to_bottom() -> void:
	var scroll := _map.get_v_scroll_bar()
	_map.scroll_vertical = roundi(scroll.max_value - scroll.page)

func request_close() -> void:
	if not _drag_id.is_empty():
		_cancel_drag()
	elif _points != _saved:
		_refresh("有未保存的位置，请选择保存或放弃")
	else:
		_discard_and_close()

func _discard_and_close() -> void:
	_cancel_drag()
	for id: String in _points:
		if _points[id] != _saved[id]:
			_move(id, _saved[id])
	_history.clear()
	_selected = ""
	_map.offset_bottom = _scroll_bottom
	_overlay.hide()
	_dock.hide()
	_open.show()
	set_process_input(false)
	editing_finished.emit()

func _on_surface_input(event: InputEvent) -> void:
	if event is not InputEventMouseButton or event.button_index != MOUSE_BUTTON_LEFT or not event.pressed:
		return
	var point: Vector2 = _overlay.get_global_transform() * event.position
	var ids := _stops.keys()
	ids.reverse()
	for id: String in ids:
		var stop: MapStop = _stops[id]
		if stop.contains_point(point):
			_selected = id
			_drag_id = id
			_drag_from = _points[id]
			_mouse_from = event.position
			_overlay.accept_event()
			_refresh()
			return

func _input(event: InputEvent) -> void:
	if not _drag_id.is_empty():
		if event is InputEventMouseMotion:
			_drag_to(event.position)
			get_viewport().set_input_as_handled()
		elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
			_drag_to(event.position)
			_record(_drag_id, _drag_from)
			_drag_id = ""
			# The GUI also needs the release to drop its capture of the drag surface.
		return
	if event is not InputEventKey or not event.pressed or _selected.is_empty():
		return
	if event.keycode == KEY_Z and (event.ctrl_pressed or event.meta_pressed):
		_undo()
		get_viewport().set_input_as_handled()
		return
	var direction := Vector2i.ZERO
	match event.keycode:
		KEY_LEFT: direction = Vector2i.LEFT
		KEY_RIGHT: direction = Vector2i.RIGHT
		KEY_UP: direction = Vector2i.UP
		KEY_DOWN: direction = Vector2i.DOWN
	if direction != Vector2i.ZERO:
		var previous: Vector2i = _points[_selected]
		_move(_selected, previous + direction * (10 if event.shift_pressed else 1))
		_record(_selected, previous)
		get_viewport().set_input_as_handled()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_cancel_drag()

func _drag_to(viewport_point: Vector2) -> void:
	var local := _overlay.get_global_transform_with_canvas().affine_inverse() * viewport_point
	_move(_drag_id, _drag_from + Vector2i(((local - _mouse_from) / _scale).round()))
	_refresh()

func _cancel_drag() -> void:
	if not _drag_id.is_empty():
		_move(_drag_id, _drag_from)
		_drag_id = ""
		_refresh()

func _move(id: String, point: Vector2i) -> void:
	point = point.clamp(Vector2i.ZERO, _bounds - Vector2i.ONE)
	if point == _points[id]:
		return
	_points[id] = point
	var stop: MapStop = _stops[id]
	stop.move_to_ground(Vector2(point) * _scale, _overlay.size)
	point_moved.emit()

func _record(id: String, previous: Vector2i) -> void:
	if _points[id] != previous:
		_history.append({"id": id, "point": previous})
	_refresh()

func _undo() -> void:
	if _history.is_empty():
		return
	var action: Dictionary = _history.pop_back()
	_selected = action.id
	_move(action.id, action.point)
	_refresh()

func _save() -> void:
	var changes := {}
	for id: String in _points:
		if _points[id] != _saved[id]:
			changes[id] = _points[id]
	var result := _positions.save(changes, _expected)
	if result == ERR_BUSY:
		_refresh("位置正在保存或已有更新。稍后重试，仍冲突时请重进地图")
		return
	if result != OK:
		_refresh("保存失败，修改仍在预览中（%s）" % error_string(result))
		return
	for id: String in changes:
		_expected[id] = _points[id]
	_saved = _points.duplicate()
	_history.clear()
	_refresh("位置已保存到 data/map_positions.json")

func _refresh(message: String = "") -> void:
	var dirty := _points != _saved
	_undo_button.disabled = _history.is_empty()
	_save_button.disabled = not dirty
	_close_button.text = "放弃" if dirty else "关闭"
	if message.is_empty():
		if _selected.is_empty():
			message = "拖动木牌或花苞，选中后用方向键微调"
		else:
			var point: Vector2i = _points[_selected]
			message = "%s  ·  X %d  Y %d" % [_selected, point.x, point.y]
	_caption.text = message
	_overlay.queue_redraw()

func _draw_selection() -> void:
	if not _selected.is_empty():
		var point := Vector2(_points[_selected]) * _scale
		_overlay.draw_circle(point, 9.0, Color("462b16"), true, -1.0, true)
		_overlay.draw_circle(point, 6.0, Color("fff1ac"), true, -1.0, true)
