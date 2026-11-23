extends SceneTree

const IslandMap = preload("res://scenes/island_map.tscn")
const IslandInfo = preload("res://scripts/island_info.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
const Save = preload("res://scripts/journey_save.gd")
const MapHeaderLayout = preload("res://scripts/map_header_layout.gd")
const SHIPPED_HEADER := "res://data/map_header_layout.json"
const MAP_POSITIONS := "res://data/map_positions.json"
const APPROVED_HEADER := Vector2i(0, -24)
const ICON_IDS := ["back", "home", "progress"]
const OFFSETS := {"back": Vector2i(11, -7), "home": Vector2i(-8, -9), "progress": Vector2i(-14, 7)}

var _failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	root.size = Vector2i(576, 1024)
	AudioServer.set_bus_mute(0, true)
	var fixture := "map-header-icons-test-%d-%d" % [OS.get_process_id(), Time.get_ticks_msec()]
	var path := "user://%s.json" % fixture
	var approved_hash := FileAccess.get_sha256(SHIPPED_HEADER)
	var points_hash := FileAccess.get_sha256(MAP_POSITIONS)
	var input := FileAccess.open(path, FileAccess.WRITE)
	if input == null:
		printerr("FAIL: could not write isolated header fixture")
		quit(1)
		return
	input.store_string('{"schema_version":1,"top":0,"height_offset":-24}\n')
	input.close()
	var initial_hash := FileAccess.get_sha256(path)
	var storage := MapHeaderLayout.new(path)
	_check(storage.value == APPROVED_HEADER, "a version-one file keeps the approved body geometry")
	for role: String in ICON_IDS:
		_check(storage.icons.get(role, Vector2i.ZERO) == Vector2i.ZERO, "version-one file starts with default %s position" % role)

	var map := IslandMap.instantiate()
	map._header_storage = storage
	map._header_layout = storage.value
	var info := IslandInfo.new()
	info.island_id = &"campus"
	info.title = "校园安全"
	root.add_child(map)
	map.setup(info, 0, Catalog.new(), Save.new(fixture + ".cfg"))
	map.set_header_safe_area(73.0, Vector2(448.0, 82.0))
	await process_frame

	var editor: Node = map._header_editor
	var entry: Button = map.get_node("EditMapHeader")
	var header: Control = map.get_node("Header")
	var icons := {"back": map.get_node("%Back"), "home": map.get_node("%MapTools/HomeButton"), "progress": map.get_node("%MapTools/ProgressButton")}
	var original_rects := {}
	for role: String in ICON_IDS:
		original_rects[role] = icons[role].get_global_rect()
	var original_header := header.get_global_rect()
	var taps := {"back": 0, "home": 0, "progress": 0}
	map.back_requested.connect(func() -> void: taps.back += 1)
	map.home_requested.connect(func() -> void: taps.home += 1)
	map.progress_requested.connect(func() -> void: taps.progress += 1)

	_click(entry)
	await process_frame
	_check(editor.is_editing(), "header editor opens through its normal control")
	var back_before: Rect2 = original_rects.back
	var home_before: Rect2 = original_rects.home
	_drag(back_before.get_center(), home_before.get_center() - back_before.get_center())
	_check(icons.back.get_global_rect().is_equal_approx(back_before), "cannot place Back over the Home hit target")
	var edited := {}
	for role: String in ICON_IDS:
		var control: Control = icons[role]
		var offset := Vector2(OFFSETS[role])
		_drag(control.get_global_rect().get_center(), offset)
		edited[role] = OFFSETS[role]
		_check(editor._icon_offsets.get(role) == OFFSETS[role], "%s drag records the expected 2D offset" % role)
		for other: String in ICON_IDS:
			var original: Rect2 = original_rects[other]
			var expected := Rect2(original.position + Vector2(edited.get(other, Vector2i.ZERO)), original.size)
			_check(icons[other].get_global_rect().is_equal_approx(expected), "%s drag keeps %s at its independent position" % [role, other])
		_check(header.get_global_rect().is_equal_approx(original_header), "%s drag leaves the approved timber geometry in place" % role)
	_check(taps == {"back": 0, "home": 0, "progress": 0}, "drags do not navigate while editing")
	_check(FileAccess.get_sha256(path) == initial_hash, "draft drags do not touch the saved file")

	_click(editor._undo_button)
	for role: String in ICON_IDS:
		_check(icons[role].get_global_rect().is_equal_approx(original_rects[role]), "restore resets %s draft" % role)
	for role: String in ICON_IDS:
		_drag(icons[role].get_global_rect().get_center(), Vector2(OFFSETS[role]))
	_click(editor._save_button)
	var saved := MapHeaderLayout.new(path)
	_check(saved.value == APPROVED_HEADER, "saving icons keeps the approved timber dimensions")
	_check(saved.icons == OFFSETS, "a fresh store reads all three approved icon offsets")
	var saved_hash := FileAccess.get_sha256(path)
	var saved_back: Rect2 = icons.back.get_global_rect()
	_drag(saved_back.get_center(), Vector2(-6.0, 6.0))
	_check(not icons.back.get_global_rect().is_equal_approx(saved_back), "an unsaved second drag previews immediately")
	_click(editor._close_button)
	await process_frame
	_check(not editor.is_editing() and icons.back.get_global_rect().is_equal_approx(saved_back), "discard restores the last saved icon geometry")
	_check(FileAccess.get_sha256(path) == saved_hash, "discard does not rewrite the layout")

	root.size = Vector2i(576, 1252)
	var capsule := Vector2(427.0, 127.0)
	map.set_header_safe_area(91.0, capsule)
	await process_frame
	var home_rect: Rect2 = icons.home.get_global_rect()
	_check(home_rect.end.y <= 91.0 or home_rect.position.y >= capsule.y or home_rect.end.x < capsule.x, "moved Home respects the phone capsule after resize")
	for role: String in ICON_IDS:
		var control: Control = icons[role]
		_check(root.get_visible_rect().encloses(control.get_global_rect()), "resized viewport contains the %s hit area" % role)
		_click(control)
	_check(taps == {"back": 1, "home": 1, "progress": 1}, "moved icons use their new hit areas outside editor mode")
	_check(MapHeaderLayout.new(path).icons == OFFSETS, "responsive layout does not rewrite saved offsets")
	_check(FileAccess.get_sha256(SHIPPED_HEADER) == approved_hash, "test does not change the shipped layout")
	_check(FileAccess.get_sha256(MAP_POSITIONS) == points_hash, "icon edits never change island point positions")
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)
	if _failures == 0:
		print("PASS: three independent icon drags, legacy header, draft restore, save/discard and responsive hit targets")
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
