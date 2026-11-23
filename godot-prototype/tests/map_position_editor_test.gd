extends SceneTree

const IslandMap = preload("res://scenes/island_map.tscn")
const Catalog = preload("res://scripts/level_catalog.gd")
const IslandInfo = preload("res://scripts/island_info.gd")
const MapPositions = preload("res://scripts/map_positions.gd")
const Save = preload("res://scripts/journey_save.gd")

var _failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	root.size = Vector2i(576, 1024)
	AudioServer.set_bus_mute(0, true)
	var path := "user://map-editor-test-%d.json" % OS.get_process_id()
	var info := IslandInfo.new()
	info.island_id = &"campus"
	info.title = "校园安全"
	var island := IslandMap.instantiate()
	root.add_child(island)
	var catalog := Catalog.new()
	var entry: Dictionary = catalog.map_for("campus").stops[0]
	var level_id: String = entry.id
	island.setup(info, 0, catalog, Save.new(path.get_basename() + ".cfg"))
	await process_frame
	var editor: Node = island.get_node_or_null("PositionEditor")
	_check(editor != null, "Godot editor run exposes a position editor")
	if editor == null:
		quit(_failures)
		return
	editor._positions = MapPositions.new(path)
	var opened: Button = island.get_node("EditMapPositions")
	var scroll: ScrollContainer = island.get_node("%Map")
	var stop: Control = island._buttons[level_id]
	var original := Vector2i(int(entry.x), int(entry.y))
	editor._move(level_id, original)
	editor._saved[level_id] = original
	editor._expected[level_id] = null
	var plaque: Button = stop.get_node("%Plaque")
	var plant: TextureButton = stop.get_node("%Plant")

	_click(opened)
	await process_frame
	_check(editor.is_editing(), "clicking the entry opens the edit mode")
	var previous_scroll := scroll.scroll_vertical
	_mouse_button(Vector2(140, 500), true, MOUSE_BUTTON_WHEEL_UP)
	_mouse_button(Vector2(140, 500), false, MOUSE_BUTTON_WHEEL_UP)
	await process_frame
	_check(scroll.scroll_vertical < previous_scroll, "mouse wheel still scrolls the map in edit mode")
	scroll.scroll_vertical = previous_scroll
	await process_frame
	var start := plaque.get_global_rect().get_center()
	var distance := Vector2(-36, -20)
	_mouse_button(start, true)
	_mouse_motion(start + distance)
	_mouse_button(start + distance, false)
	var moved := original + Vector2i((distance / editor._scale).round())
	_check(editor._points[level_id] == moved, "drag translates the point in source image pixels")
	_check(not island.get_node("%Intro").visible, "drag suppresses opening the level")
	_key(KEY_RIGHT, true)
	_check(editor._points[level_id] == moved + Vector2i(10, 0), "Shift plus arrow moves ten pixels")
	_key(KEY_Z, false, true)
	_check(editor._points[level_id] == moved, "keyboard undo restores the last coordinate")
	_click(editor._undo_button)
	_check(editor._points[level_id] == original, "toolbar undo restores the point before drag")

	_click(plant)
	_key(KEY_UP)
	_check(editor._points[level_id] == original + Vector2i.UP, "the bud can select a point and arrows nudge one pixel")
	_click(editor._close_button)
	_check(not editor.is_editing() and editor._points[level_id] == original, "discard closes the editor and restores saved positions")
	_check(not FileAccess.file_exists(path), "discard does not create an override")

	_click(opened)
	await process_frame
	_click(plaque)
	_key(KEY_LEFT)
	_click(editor._save_button)
	var stored := MapPositions.new(path)
	_check(stored.override_for(level_id) == original + Vector2i.LEFT, "save persists only the manual change")
	_click(editor._close_button)
	await process_frame
	_click(plaque)
	_check(island.get_node("%Intro").visible, "normal level selection resumes after closing the editor")
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)
	if _failures == 0:
		print("PASS: map editing, scrolling, drag, nudge, undo, save, discard and normal selection")
	quit(_failures)

func _click(control: Control) -> void:
	var point := control.get_global_rect().get_center()
	_mouse_button(point, true)
	_mouse_button(point, false)

func _mouse_button(point: Vector2, pressed: bool, button: MouseButton = MOUSE_BUTTON_LEFT) -> void:
	var event := InputEventMouseButton.new()
	event.position = point
	event.global_position = point
	event.button_index = button
	event.pressed = pressed
	event.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed and button == MOUSE_BUTTON_LEFT else 0
	root.push_input(event, true)

func _mouse_motion(point: Vector2) -> void:
	var event := InputEventMouseMotion.new()
	event.position = point
	event.global_position = point
	event.button_mask = MOUSE_BUTTON_MASK_LEFT
	root.push_input(event, true)

func _key(code: Key, shift: bool = false, ctrl: bool = false) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	event.shift_pressed = shift
	event.ctrl_pressed = ctrl
	root.push_input(event, true)

func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures += 1
		printerr("FAIL: " + message)
