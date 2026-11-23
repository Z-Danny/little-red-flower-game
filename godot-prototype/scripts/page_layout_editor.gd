extends Node

const PageLayoutRuntime = preload("res://scripts/page_layout_runtime.gd")
const SELECTION_COLOR := Color("fff1ac")
const DOCK_HEIGHT := 210.0
const MAX_OFFSET := 8192

var _host: Control
var _runtime: PageLayoutRuntime
var _open: Button
var _canvas: Control
var _dock: PanelContainer
var _layers: OptionButton
var _mode_button: Button
var _restore_button: Button
var _save_button: Button
var _close_button: Button
var _reset_button: Button
var _text_box: TextEdit
var _status: Label
var _selected: Control
var _listed: Array[Control] = []
var _old_focus: Control
var _old_mode := Node.PROCESS_MODE_INHERIT
var _at_top := false
var _syncing_text := false
var _dragging := false
var _drag_start := Vector2.ZERO
var _drag_offset := Vector2i.ZERO
var _drag_to_local := Transform2D.IDENTITY

func setup(host: Control) -> void:
	_host = host
	_open = Button.new()
	_open.name = "EditPageLayout"
	_open.text = "页面布局"
	_host.add_child(_open)
	_open.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	_open.offset_left = -154.0
	_open.offset_right = -16.0
	_open.offset_top = -66.0
	_open.offset_bottom = -16.0
	_open.pressed.connect(begin_editing)
	_open.hide()

	_canvas = Control.new()
	_canvas.name = "PageLayoutCanvas"
	_canvas.mouse_filter = Control.MOUSE_FILTER_STOP
	_canvas.mouse_default_cursor_shape = Control.CURSOR_MOVE
	_host.add_child(_canvas)
	_canvas.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_canvas.gui_input.connect(_canvas_input)
	_canvas.draw.connect(_draw_selection)
	_canvas.hide()

	_dock = PanelContainer.new()
	_dock.name = "PageLayoutInspector"
	_dock.add_theme_stylebox_override("panel", host.get_theme_stylebox("panel", "Panel"))
	_host.add_child(_dock)
	var column := VBoxContainer.new()
	_dock.add_child(column)
	var selection_row := HBoxContainer.new()
	column.add_child(selection_row)
	_layers = OptionButton.new()
	_layers.fit_to_longest_item = false
	_layers.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_layers.item_selected.connect(_select_layer)
	selection_row.add_child(_layers)
	_reset_button = _add_button(selection_row, "重置此项", _reset_selection)
	_mode_button = _add_button(selection_row, "面板移到上方", _flip_dock)

	_text_box = TextEdit.new()
	_text_box.name = "PageText"
	_text_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_text_box.custom_minimum_size.y = 54.0
	_text_box.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_text_box.add_theme_font_size_override("font_size", 22)
	_text_box.text_changed.connect(_preview_text)
	column.add_child(_text_box)

	_status = Label.new()
	_status.add_theme_font_size_override("font_size", 18)
	_status.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_status)
	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_child(actions)
	_restore_button = _add_button(actions, "恢复上次保存", _restore)
	_save_button = _add_button(actions, "保存", _save)
	_close_button = _add_button(actions, "关闭", _close)
	_place_dock()
	_dock.hide()

func _add_button(row: HBoxContainer, title: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = title
	button.custom_minimum_size.y = 36.0
	button.add_theme_font_size_override("font_size", 20)
	row.add_child(button)
	button.pressed.connect(action)
	return button

func set_target(runtime: PageLayoutRuntime) -> void:
	if runtime == _runtime:
		return
	if is_editing():
		_close()
	_runtime = runtime
	_open.visible = is_instance_valid(_runtime)

func is_editing() -> bool:
	return is_instance_valid(_canvas) and _canvas.visible

func begin_editing() -> void:
	if is_editing() or not is_instance_valid(_runtime) or not is_instance_valid(_runtime.page):
		return
	_old_focus = _host.get_viewport().gui_get_focus_owner()
	if is_instance_valid(_old_focus):
		_old_focus.release_focus()
	_old_mode = _runtime.page.process_mode
	_runtime.page.process_mode = Node.PROCESS_MODE_DISABLED
	_open.hide()
	_canvas.show()
	_dock.show()
	_rebuild_layers()
	_select(null)

func _close() -> void:
	if is_instance_valid(_runtime) and is_instance_valid(_runtime.page):
		_runtime.restore()
		_runtime.page.process_mode = _old_mode
	_dragging = false
	_selected = null
	_listed.clear()
	_dock.hide()
	_canvas.hide()
	_open.visible = is_instance_valid(_runtime)
	if is_instance_valid(_old_focus) and _old_focus.is_visible_in_tree():
		_old_focus.grab_focus()
	_old_focus = null

func _flip_dock() -> void:
	_at_top = not _at_top
	_place_dock()
	_mode_button.text = "面板移到底部" if _at_top else "面板移到上方"

func _place_dock() -> void:
	_dock.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE if _at_top else Control.PRESET_BOTTOM_WIDE)
	_dock.offset_left = 10.0
	_dock.offset_right = -10.0
	_dock.offset_top = 8.0 if _at_top else -DOCK_HEIGHT - 8.0
	_dock.offset_bottom = DOCK_HEIGHT + 8.0 if _at_top else -8.0

func _rebuild_layers() -> void:
	_listed = _runtime.targets()
	_layers.clear()
	_layers.add_item("选择元素")
	for target: Control in _listed:
		var original: Variant = _runtime.base_text(target)
		var title := String(target.name)
		if original is String and not original.is_empty():
			title = original.replace("\n", " ").left(26)
		_layers.add_item(title)

func _select_layer(index: int) -> void:
	_select(_listed[index - 1] if index > 0 and is_instance_valid(_listed[index - 1]) else null)

func _select(control: Control) -> void:
	_selected = control
	_layers.select(_listed.find(control) + 1)
	_sync_text()
	_refresh()

func _sync_text() -> void:
	var original: Variant = _runtime.base_text(_selected) if is_instance_valid(_selected) else null
	var draft := _selected_draft()
	_syncing_text = true
	_text_box.editable = original != null
	_text_box.text = draft.get("text", original) if original != null else ""
	_text_box.placeholder_text = "点选画面中的文字，或从上方列表选择元素" if _selected == null else "这个元素没有独立文案"
	_syncing_text = false

func _selected_draft() -> Dictionary:
	if not is_instance_valid(_selected):
		return {}
	return _runtime.draft.get(_runtime.path_for(_selected), {})

func _preview_text() -> void:
	if _syncing_text or not is_instance_valid(_selected) or not _text_box.editable:
		return
	var change := _selected_draft().duplicate()
	if _text_box.text == _runtime.base_text(_selected):
		change.erase("text")
	else:
		change["text"] = _text_box.text
	_set_selected_draft(change)

func _set_selected_draft(change: Dictionary) -> void:
	var key := _runtime.path_for(_selected)
	if not change.has("text") and change.get("offset", Vector2i.ZERO) == Vector2i.ZERO:
		_runtime.draft.erase(key)
	else:
		change["offset"] = change.get("offset", Vector2i.ZERO)
		_runtime.draft[key] = change
	_runtime.apply_draft()
	_refresh()

func _reset_selection() -> void:
	if is_instance_valid(_selected):
		_set_selected_draft({})
		_sync_text()

func _restore() -> void:
	_runtime.restore()
	_sync_text()
	_refresh()

func _save() -> void:
	match _runtime.save():
		OK: _refresh("已保存这个页面的布局和文字")
		ERR_BUSY: _refresh("这个页面已在另一处更新，请重新打开后再编辑")
		var error: _refresh("保存失败（%s），当前预览已保留" % error_string(error))

func _refresh(message: String = "") -> void:
	var dirty := _runtime.draft != _runtime.committed
	_restore_button.disabled = not dirty
	_save_button.disabled = not dirty
	_reset_button.disabled = _selected_draft().is_empty()
	_close_button.text = "放弃" if dirty else "关闭"
	if message.is_empty():
		message = "拖动元素调整位置，双击文字修改，下拉列表可选叠层"
	_status.text = message
	_canvas.queue_redraw()

func _input(event: InputEvent) -> void:
	if not is_instance_valid(_runtime) or not is_instance_valid(_runtime.page):
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F2 or (event.keycode == KEY_ESCAPE and is_editing()):
			if not is_editing():
				begin_editing()
			elif _dragging:
				_cancel_drag()
			elif _runtime.draft != _runtime.committed:
				_refresh("有未保存的修改，请保存或放弃")
			else:
				_close()
			_host.get_viewport().set_input_as_handled()
			return
	if not _dragging or not is_instance_valid(_selected):
		return
	if event is InputEventMouseMotion:
		_drag_to(event.position)
		_host.get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		_drag_to(event.position)
		_dragging = false

func _canvas_input(event: InputEvent) -> void:
	if event is InputEventPanGesture:
		_scroll_at(_canvas.get_global_transform_with_canvas() * event.position, event.delta * 38.0)
		return
	if not event is InputEventMouseButton or not event.pressed:
		return
	var point: Vector2 = _canvas.get_global_transform_with_canvas() * event.position
	match event.button_index:
		MOUSE_BUTTON_WHEEL_UP: _scroll_at(point, Vector2(0, -84))
		MOUSE_BUTTON_WHEEL_DOWN: _scroll_at(point, Vector2(0, 84))
		MOUSE_BUTTON_WHEEL_LEFT: _scroll_at(point, Vector2(-84, 0))
		MOUSE_BUTTON_WHEEL_RIGHT: _scroll_at(point, Vector2(84, 0))
		MOUSE_BUTTON_LEFT: _begin_drag(point, event.double_click, event.alt_pressed)
	_canvas.accept_event()

func _begin_drag(point: Vector2, double_click: bool, pick_behind: bool) -> void:
	var next := _pick(point, pick_behind)
	if next != _selected:
		_text_box.release_focus()
		_select(next)
	if not is_instance_valid(_selected):
		return
	if double_click and _text_box.editable:
		_text_box.grab_focus()
		_text_box.select_all()
		return
	var parent := _selected.get_parent() as CanvasItem
	_drag_start = point
	var coordinate_space := _selected.get_canvas_transform()
	if parent != null and not _selected.top_level:
		coordinate_space = parent.get_global_transform_with_canvas()
	_drag_to_local = coordinate_space.affine_inverse()
	_drag_offset = _selected_draft().get("offset", Vector2i.ZERO)
	_dragging = true

func _drag_to(point: Vector2) -> void:
	var travel := (_drag_to_local * point - _drag_to_local * _drag_start).round()
	var limit := Vector2i.ONE * MAX_OFFSET
	var offset := (_drag_offset + Vector2i(travel)).clamp(-limit, limit)
	if offset == _selected_draft().get("offset", Vector2i.ZERO):
		return
	var change := _selected_draft().duplicate()
	change["offset"] = offset
	_set_selected_draft(change)

func _cancel_drag() -> void:
	if _dragging and is_instance_valid(_selected):
		var change := _selected_draft().duplicate()
		change["offset"] = _drag_offset
		_set_selected_draft(change)
	_dragging = false

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_cancel_drag()

func _pick(point: Vector2, pick_behind: bool) -> Control:
	var hits: Array[Control] = []
	for target: Control in _runtime.targets():
		if _visible_rect(target).has_point(point):
			hits.push_front(target)
	if hits.is_empty():
		return null
	if pick_behind:
		return hits[(hits.find(_selected) + 1) % hits.size()]
	for hit: Control in hits:
		if hit.get_class() != &"Control" and (not hit is Container or hit is PanelContainer):
			return hit
	return hits[0]

func _visible_rect(target: Control) -> Rect2:
	var visible := target.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, target.size)
	var parent := target.get_parent()
	while is_instance_valid(parent) and parent != _runtime.page:
		if parent is Control and parent.clip_contents:
			visible = visible.intersection(parent.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, parent.size))
		parent = parent.get_parent()
	return visible

func _draw_selection() -> void:
	if not is_instance_valid(_selected) or not _selected.is_visible_in_tree():
		return
	var rect := _visible_rect(_selected)
	if rect.has_area():
		_canvas.draw_rect(_canvas.get_global_transform_with_canvas().affine_inverse() * rect, SELECTION_COLOR, false, 2.0)

func _scroll_at(point: Vector2, delta: Vector2) -> void:
	var scrollers := _runtime.page.find_children("*", "ScrollContainer", true, false)
	scrollers.reverse()
	for scroller: ScrollContainer in scrollers:
		if scroller.is_visible_in_tree() and _visible_rect(scroller).has_point(point):
			scroller.scroll_vertical += roundi(delta.y)
			scroller.scroll_horizontal += roundi(delta.x)
			_canvas.queue_redraw()
			return
