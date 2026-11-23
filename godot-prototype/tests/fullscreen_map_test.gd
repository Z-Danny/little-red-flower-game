extends SceneTree

const IslandMap = preload("res://scenes/island_map.tscn")
const IslandInfo = preload("res://scripts/island_info.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
const Save = preload("res://scripts/journey_save.gd")
const Positions = preload("res://scripts/map_positions.gd")
const DESIGN_WIDTH := 576.0

var _failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	AudioServer.set_bus_mute(0, true)
	var layout_hash := _source_hashes()
	await _check_viewport("portrait", Vector2i(576, 1024), 73.0, Vector2(448.0, 100.0))
	await _check_viewport("tall capsule", Vector2i(576, 1252), 89.0, Vector2(448.0, 123.0))
	await _check_viewport("compact capsule", Vector2i(576, 1024), 24.0, Vector2(448.0, 75.0), true)
	_check(_source_hashes() == layout_hash, "normal viewport changes leave the saved layouts intact")
	if _failures == 0:
		print("PASS: fullscreen painted map, source points, scroll reach, responsive toolbar and actual button input")
	quit(_failures)

func _check_viewport(profile: String, viewport_size: Vector2i, safe_top: float, capsule: Vector2, compact := false) -> void:
	root.size = viewport_size
	await process_frame
	var catalogue := Catalog.new()
	var map := IslandMap.instantiate() as Control
	var island := IslandInfo.new()
	island.island_id = &"campus"
	island.title = "校园安全"
	root.add_child(map)
	map.setup(island, 0, catalogue, Save.new("fullscreen-qa-%d.cfg" % OS.get_process_id()), false, "", "", false, false)
	map.set_header_safe_area(safe_top, capsule)
	await process_frame
	await process_frame
	var scroll := map.get_node("%Map") as ScrollContainer
	var painting := map.get_node("%Painting") as Control
	var art := map.get_node("%Art") as TextureRect
	var header := map.get_node("Header") as Control
	var icons := {
		"book": map.get_node("%Back") as TextureButton,
		"title": map.get_node("Header/TitlePlate") as TextureRect,
		"home": map.get_node("%MapTools/HomeButton") as TextureButton,
		"flower": map.get_node("%MapTools/ProgressButton") as TextureButton,
	}
	var bounds := map.get_global_rect()
	_check(scroll.get_global_rect().is_equal_approx(bounds), profile + ": the painted map scroll viewport covers the whole page")
	_check(header.get_index() > scroll.get_index(), profile + ": toolbar draws above the map")

	var catalog_map := catalogue.map_for("campus")
	var source_size := Vector2(int(catalog_map.width), int(catalog_map.height))
	var scaled_map_size := Vector2(DESIGN_WIDTH, source_size.y * DESIGN_WIDTH / source_size.x)
	_check(art.texture != null and art.texture.resource_path == catalog_map.image, profile + ": the original map texture is in use")
	_check(art.size.is_equal_approx(scaled_map_size) and painting.size.is_equal_approx(scaled_map_size), profile + ": the painting has its original design width and aspect")
	var positions := Positions.new()
	for entry: Dictionary in catalog_map.stops:
		var fallback := Vector2i(int(entry.x), int(entry.y))
		var saved := positions.position_for(entry.id, fallback)
		if not Rect2i(Vector2i.ZERO, Vector2i(source_size)).has_point(saved):
			saved = fallback
		var stop: Control = map._buttons[entry.id]
		var expected := Vector2(saved) * DESIGN_WIDTH / source_size.x
		_check(stop.position.is_equal_approx(expected), profile + ": catalog stop %s stays on its source pixels" % entry.id)

	var focus: Control = map._first_playable
	if is_instance_valid(focus):
		var plaque := focus.get_node("Plaque") as Control
		_check(bounds.encloses(plaque.get_global_rect()), profile + ": arrival brings the first available stop into view")
		_check(plaque.get_global_rect().position.y >= header.get_global_rect().end.y, profile + ": the initial stop plaque clears the toolbar")
	var bar := scroll.get_v_scroll_bar()
	var scroll_limit := roundi(bar.max_value - bar.page)
	_check(scroll_limit > 0, profile + ": scrolling reaches more of the painting")
	scroll.scroll_vertical = 0
	await process_frame
	_check(art.get_global_rect().position.is_equal_approx(bounds.position), profile + ": the top of the painting reaches the page edge")
	scroll.scroll_vertical = scroll_limit
	await process_frame
	_check(absf(art.get_global_rect().end.y - bounds.end.y) <= 1.0, profile + ": the final part of the painting reaches the bottom within one scroll pixel")

	var observed := {}
	var rows: Array[Rect2] = []
	var intended_centers := {"book": 94.0, "title": 290.0, "home": 487.0, "flower": 545.0}
	var intended_sizes := {"book": Vector2(82, 54), "title": Vector2(262, 54), "home": Vector2(48, 48), "flower": Vector2(46, 46)}
	for role: String in icons:
		var control: Control = icons[role]
		var rect := control.get_global_rect()
		rows.append(rect)
		observed[role] = [rect.position.x, rect.position.y, rect.size.x, rect.size.y]
		_check(bounds.encloses(rect) and rect.get_area() > 0.0, profile + ": %s has a valid on-page rect" % role)
		_check(rect.end.y <= safe_top or rect.position.y >= capsule.y or rect.end.x <= capsule.x, profile + ": %s avoids the capsule" % role)
		if compact:
			_check(rect.end.x <= capsule.x, profile + ": %s follows the compact group to the left" % role)
		else:
			var preferred_size: Vector2 = intended_sizes[role]
			_check(absf(rect.get_center().x - float(intended_centers[role])) <= 15.0, profile + ": %s remains near its reference center" % role)
			_check((rect.size - preferred_size).abs().length() <= 12.0, profile + ": %s is close to its reference dimensions" % role)
	for first in rows.size():
		for second in range(first + 1, rows.size()):
			_check(not rows[first].intersects(rows[second]), profile + ": toolbar controls do not share a hit region")
	var actions := {"book": 0, "home": 0, "flower": 0}
	map.back_requested.connect(func() -> void: actions.book += 1)
	map.home_requested.connect(func() -> void: actions.home += 1)
	map.progress_requested.connect(func() -> void: actions.flower += 1)
	for role: String in actions:
		var control: Control = icons[role]
		_click_at(control.get_global_rect().get_center())
	_check(actions == {"book": 1, "home": 1, "flower": 1}, profile + ": all three icons retain their distinct actual button action")
	_check(scroll.scroll_vertical == scroll_limit, profile + ": tapping the toolbar does not move the map")
	print("FULLSCREEN_RECTS ", JSON.stringify({"profile": profile, "toolbar": observed}))
	map.queue_free()
	await process_frame

func _source_hashes() -> Array[String]:
	var hashes: Array[String] = []
	for path: String in ["res://data/map_header_layout.json", "res://data/map_positions.json", "res://data/page_layout_overrides.json"]:
		hashes.append(FileAccess.get_sha256(path) if FileAccess.file_exists(path) else "")
	return hashes

func _click_at(point: Vector2) -> void:
	for pressed: bool in [true, false]:
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
