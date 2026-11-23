extends Node

signal editing_started
signal editing_finished
signal layout_changed(layout: Vector2i, icon_offsets: Dictionary)

const HeaderLayout = preload("res://scripts/map_header_layout.gd")
const GRIP_HEIGHT := 12.0

var _host: Control
var _storage: HeaderLayout
var _open: Button
var _dock: PanelContainer
var _guide: Control
var _grip: ColorRect
var _icon_guide: Control
var _icon_targets := {}
var _top_slider: HSlider
var _height_slider: HSlider
var _top_value: Label
var _height_value: Label
var _caption: Label
var _undo_button: Button
var _save_button: Button
var _close_button: Button
var _layout := Vector2i.ZERO
var _icon_offsets := {}
var _drag_axis := -1
var _drag_start := Vector2.ZERO
var _drag_value := 0
var _drag_icon := ""
var _drag_icon_start := Vector2.ZERO
var _drag_icon_offset := Vector2i.ZERO

func setup(host: Control, storage: HeaderLayout) -> void:
	_host = host
	_storage = storage
	_open = Button.new()
	_open.name = "EditMapHeader"
	_open.text = "调整顶栏"
	_host.add_child(_open)
	_open.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	_open.offset_left = 166.0
	_open.offset_right = 304.0
	_open.offset_top = -66.0
	_open.offset_bottom = -16.0
	_open.pressed.connect(_begin)

	_guide = Control.new()
	_guide.mouse_default_cursor_shape = Control.CURSOR_VSIZE
	_guide.gui_input.connect(_start_drag)
	_host.add_child(_guide)
	_guide.hide()
	_grip = ColorRect.new()
	_grip.color = Color("fff1ac")
	_grip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_guide.add_child(_grip)
	_grip.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_grip.offset_left = -40.0
	_grip.offset_right = 40.0
	_grip.offset_top = -8.0
	_grip.offset_bottom = -3.0

	_make_icon_targets()

	_dock = PanelContainer.new()
	_dock.name = "MapHeaderDock"
	_dock.add_theme_stylebox_override("panel", host.get_theme_stylebox("panel", "Panel"))
	_host.add_child(_dock)
	_dock.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_dock.offset_left = 8.0
	_dock.offset_right = -8.0
	_dock.offset_top = -164.0
	_dock.offset_bottom = -8.0
	_dock.hide()

	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	_dock.add_child(column)
	_caption = Label.new()
	_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_caption.add_theme_font_size_override("font_size", 18)
	_caption.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_caption)
	_top_value = Label.new()
	_height_value = Label.new()
	_top_slider = _add_slider(column, "距顶", HeaderLayout.TOP_MIN, HeaderLayout.TOP_MAX, _top_value)
	_height_slider = _add_slider(column, "高度微调", HeaderLayout.HEIGHT_MIN, HeaderLayout.HEIGHT_MAX, _height_value)
	_top_slider.value_changed.connect(_preview_from_controls)
	_height_slider.value_changed.connect(_preview_from_controls)

	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(actions)
	_undo_button = _add_button(actions, "恢复上次保存", _restore)
	_save_button = _add_button(actions, "保存", _save)
	_close_button = _add_button(actions, "关闭", _close)
	set_process_input(false)

func _make_icon_targets() -> void:
	_icon_guide = Control.new()
	_icon_guide.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_host.add_child(_icon_guide)
	_icon_guide.hide()
	var outline := StyleBoxFlat.new()
	outline.draw_center = false
	outline.set_border_width_all(1)
	outline.border_color = Color(1.0, 0.95, 0.68, 0.7)
	for id: String in HeaderLayout.ICON_IDS:
		var target := Panel.new()
		target.add_theme_stylebox_override("panel", outline)
		target.mouse_default_cursor_shape = Control.CURSOR_MOVE
		target.gui_input.connect(_start_icon_drag.bind(id))
		_icon_guide.add_child(target)
		_icon_targets[id] = target

func _add_slider(column: VBoxContainer, text: String, minimum: int, maximum: int, value: Label) -> HSlider:
	var row := HBoxContainer.new()
	column.add_child(row)
	var label := Label.new()
	label.text = text
	label.custom_minimum_size.x = 108.0
	row.add_child(label)
	var slider := HSlider.new()
	slider.min_value = minimum
	slider.max_value = maximum
	slider.step = 1
	slider.custom_minimum_size.y = 30.0
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.accessibility_name = text
	row.add_child(slider)
	value.custom_minimum_size.x = 48.0
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(value)
	return slider

func _add_button(row: HBoxContainer, title: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = title
	button.custom_minimum_size = Vector2(96.0, 38.0)
	button.pressed.connect(action)
	row.add_child(button)
	return button

func is_editing() -> bool:
	return _dock.visible

func set_entry_visible(value: bool) -> void:
	_open.visible = value and not is_editing()

func update_header_rect(rect: Rect2) -> void:
	_guide.position = rect.position
	_guide.size = rect.size

func update_icon_rect(id: String, rect: Rect2) -> void:
	var target: Control = _icon_targets[id]
	target.position = rect.position
	target.size = rect.size

func request_close() -> void:
	if _drag_axis != -1 or not _drag_icon.is_empty():
		_cancel_drag()
	elif _is_dirty():
		_refresh("有未保存的修改，请保存或放弃")
	else:
		_close()

func _begin() -> void:
	_open.hide()
	_dock.show()
	_guide.show()
	_icon_guide.show()
	set_process_input(true)
	editing_started.emit()
	_restore()

func _restore() -> void:
	_icon_offsets = _storage.icons.duplicate()
	_top_slider.set_value_no_signal(_storage.value.x)
	_height_slider.set_value_no_signal(_storage.value.y)
	_preview_from_controls()

func _close() -> void:
	_cancel_drag()
	_restore()
	_dock.hide()
	_guide.hide()
	_icon_guide.hide()
	_open.show()
	set_process_input(false)
	editing_finished.emit()

func _preview_from_controls(_value: float = 0.0) -> void:
	_layout = Vector2i(roundi(_top_slider.value), roundi(_height_slider.value))
	_apply_preview()

func _apply_preview() -> void:
	layout_changed.emit(_layout, _icon_offsets)
	_refresh()

func _is_dirty() -> bool:
	return _layout != _storage.value or _icon_offsets != _storage.icons

func _refresh(message: String = "拖动图标调整位置，拖木栏或浅色下沿调整顶栏") -> void:
	var dirty := _is_dirty()
	_top_value.text = str(_layout.x)
	_height_value.text = "%+d" % _layout.y
	_undo_button.disabled = not dirty
	_save_button.disabled = not dirty
	_close_button.text = "放弃" if dirty else "关闭"
	_caption.text = message

func _save() -> void:
	var result := _storage.save(_layout, _storage.value, _icon_offsets, _storage.icons)
	if result == ERR_BUSY:
		_refresh("顶栏有其他修改，请重进地图再试")
	elif result != OK:
		_refresh("保存失败（%s），当前预览已保留" % error_string(result))
	else:
		_refresh("顶栏已保存")

func _start_drag(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_drag_axis = 1 if event.position.y >= _guide.size.y - GRIP_HEIGHT else 0
		_drag_start = _guide.position + event.position
		_drag_value = _layout[_drag_axis]
		_guide.accept_event()

func _start_icon_drag(event: InputEvent, id: String) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var target: Control = _icon_targets[id]
		_drag_icon = id
		_drag_start = target.position + event.position
		_drag_icon_start = _host.header_icon_position(id)
		_drag_icon_offset = _icon_offsets.get(id, Vector2i.ZERO)
		target.accept_event()

func _input(event: InputEvent) -> void:
	if _drag_axis == -1 and _drag_icon.is_empty():
		return
	if event is InputEventMouseMotion:
		_drag_to(event.position)
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		_drag_to(event.position)
		_drag_axis = -1
		_drag_icon = ""

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_cancel_drag()

func _drag_to(point: Vector2) -> void:
	var local := _host.get_global_transform_with_canvas().affine_inverse() * point
	var delta := local - _drag_start
	if not _drag_icon.is_empty():
		var offset: Vector2i = _drag_icon_offset if delta.is_zero_approx() else _host.header_icon_offset_at(_drag_icon, _drag_icon_start + delta)
		_move_icon(_drag_icon, offset)
	else:
		var slider := _top_slider if _drag_axis == 0 else _height_slider
		slider.value = _drag_value + roundi(delta.y)

func _move_icon(id: String, offset: Vector2i) -> void:
	if _icon_offsets.get(id, Vector2i.ZERO) == offset:
		return
	if offset == Vector2i.ZERO:
		_icon_offsets.erase(id)
	else:
		_icon_offsets[id] = offset
	_apply_preview()

func _cancel_drag() -> void:
	if not _drag_icon.is_empty():
		_move_icon(_drag_icon, _drag_icon_offset)
		_drag_icon = ""
	elif _drag_axis != -1:
		var slider := _top_slider if _drag_axis == 0 else _height_slider
		slider.value = _drag_value
		_drag_axis = -1
