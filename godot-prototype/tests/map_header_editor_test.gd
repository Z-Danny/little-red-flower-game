extends SceneTree

const IslandMap = preload("res://scenes/island_map.tscn")
const IslandInfo = preload("res://scripts/island_info.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
const Save = preload("res://scripts/journey_save.gd")
const MapHeaderLayout = preload("res://scripts/map_header_layout.gd")
const MAP_POSITIONS := "res://data/map_positions.json"
const SAFE_TOP := 73.0
const CAPSULE := Vector2(448.0, 101.0)

var _failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	root.size = Vector2i(576, 1024)
	AudioServer.set_bus_mute(0, true)
	var fixture := "map-header-editor-test-%d-%d" % [OS.get_process_id(), Time.get_ticks_msec()]
	var path := "user://%s.json" % fixture
	var points_hash := FileAccess.get_sha256(MAP_POSITIONS)
	var map := IslandMap.instantiate()
	map._header_storage = MapHeaderLayout.new(path)
	map._header_layout = map._header_storage.value
	var info := IslandInfo.new()
	info.island_id = &"campus"
	info.title = "校园安全"
	root.add_child(map)
	map.setup(info, 0, Catalog.new(), Save.new(fixture + ".cfg"))
	map.set_header_safe_area(SAFE_TOP, CAPSULE)
	await process_frame

	var editor: Node = map._header_editor
	var points: Node = map.get_node_or_null("PositionEditor")
	_check(editor != null and points != null, "both edit modes are available in the source project")
	if editor == null or points == null:
		quit(_failures)
		return
	var header_open: Button = map.get_node("EditMapHeader")
	var points_open: Button = map.get_node("EditMapPositions")
	var header: Control = map.get_node("Header")
	var back: TextureButton = map.get_node("%Back")
	var home: TextureButton = map.get_node("%MapTools/HomeButton")
	var progress: TextureButton = map.get_node("%MapTools/ProgressButton")
	var map_scroll: ScrollContainer = map.get_node("%Map")
	var stop: Control = map._buttons["campus-canteen-check-v1"]
	var stop_position := stop.position
	var original: Vector2i = map._header_layout
	var original_back_y := back.global_position.y
	var original_height := header.offset_bottom
	var original_scroll_top := map_scroll.offset_top
	var original_scroll_bottom := map_scroll.offset_bottom
	_check(original == Vector2i.ZERO, "isolated fixture has no manual adjustment")
	_check(original_back_y > 8.0 and original_height > 72.0, "phone safe area changes header geometry")
	var home_rect := home.get_global_rect()
	_check(home_rect.end.y <= SAFE_TOP or home_rect.position.y >= CAPSULE.y or home_rect.end.x < CAPSULE.x, "home does not overlap the system capsule")
	_check(header.get_global_rect().encloses(progress.get_global_rect()), "flower counter fits inside the header")
	_check(is_zero_approx(original_scroll_top), "map starts at the screen edge behind the timber")

	_click(header_open)
	await process_frame
	_check(editor.is_editing() and not points.is_editing(), "header mode opens alone")
	_check(not points_open.visible or points_open.disabled, "header mode blocks point-edit entry")
	_check(is_equal_approx(map_scroll.offset_bottom, original_scroll_bottom), "header editor leaves vertical map space available")
	var guide: Control = editor._guide
	var grip: ColorRect = editor._grip
	_drag(guide.get_global_rect().get_center(), Vector2(0.0, 9.0))
	_check(map._header_layout == original + Vector2i(9, 0), "dragging the timber changes its top adjustment")
	_drag(grip.get_global_rect().get_center(), Vector2(0.0, -7.0))
	_check(map._header_layout == original + Vector2i(9, -7), "dragging its lower grip also supports a negative height adjustment")
	_click(editor._undo_button)
	_check(map._header_layout == original, "restore discards both drag adjustments")
	var moving_top := mini(original.x + 8, int(editor._top_slider.max_value))
	var moving_height := mini(original.y + 12, int(editor._height_slider.max_value))
	_check(moving_top > original.x and moving_height > original.y, "both sliders permit independent adjustment")
	editor._top_slider.value = moving_top
	_check(back.global_position.y > original_back_y, "the top slider repositions the real top-row buttons")
	var shifted_bottom := header.offset_bottom
	editor._height_slider.value = moving_height
	_check(header.offset_bottom > shifted_bottom, "the height slider resizes the real timber")
	_check(is_zero_approx(map_scroll.offset_top), "adjusting the timber keeps the map full-screen")
	_check(header.get_global_rect().encloses(progress.get_global_rect()), "flower counter follows the header")
	_check(stop.position.is_equal_approx(stop_position), "reflow leaves the map's authored stop coordinates intact")
	_check(not FileAccess.file_exists(path), "live changes stay unsaved until requested")

	_click(editor._undo_button)
	_check(map._header_layout == original, "undo restores the last saved adjustment")
	_check(is_equal_approx(back.global_position.y, original_back_y) and is_equal_approx(header.offset_bottom, original_height),
		"undo restores actual preview geometry")

	editor._top_slider.value = moving_top
	editor._height_slider.value = moving_height
	_click(editor._save_button)
	var saved := Vector2i(moving_top, moving_height)
	_check(MapHeaderLayout.new(path).value == saved, "a fresh store reads the saved adjustment")
	if not editor.is_editing():
		_click(header_open)
		await process_frame
	var saved_header_bottom := header.offset_bottom
	editor._height_slider.value = moving_height - 1
	_check(map._header_layout != saved, "unsaved tweak applied after save")
	_click(editor._close_button)
	await process_frame
	_check(not editor.is_editing() and map._header_layout == saved, "discard restores the last saved adjustment")
	_check(is_equal_approx(header.offset_bottom, saved_header_bottom), "discard restores the saved timber height")
	_check(MapHeaderLayout.new(path).value == saved, "discard does not write draft geometry")

	_click(points_open)
	await process_frame
	_check(points.is_editing() and not editor.is_editing(), "map point-edit mode still opens")
	_check(not header_open.visible or header_open.disabled, "point-edit mode blocks header edit entry")
	_click(points._close_button)
	await process_frame
	_check(header_open.is_visible_in_tree() and not header_open.disabled, "header entry is restored after point-edit mode closes")
	_check(FileAccess.get_sha256(MAP_POSITIONS) == points_hash, "header save never touches the map point file")
	_check(stop.position.is_equal_approx(stop_position), "existing edited map point stays in place")
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)
	if _failures == 0:
		print("PASS: safe-area header preview, independent sliders, undo, save, discard, and map editing isolation")
	quit(_failures)

func _click(control: Control) -> void:
	var point := control.get_global_rect().get_center()
	_mouse_button(point, true)
	_mouse_button(point, false)

func _drag(start: Vector2, distance: Vector2) -> void:
	_mouse_button(start, true)
	var motion := InputEventMouseMotion.new()
	motion.position = start + distance
	motion.global_position = motion.position
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	root.push_input(motion, true)
	_mouse_button(motion.position, false)

func _mouse_button(point: Vector2, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.position = point
	event.global_position = point
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	event.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
	root.push_input(event, true)

func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures += 1
		printerr("FAIL: " + message)
