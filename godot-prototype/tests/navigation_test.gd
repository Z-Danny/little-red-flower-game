extends SceneTree

const Main = preload("res://scenes/main.tscn")
const Save = preload("res://scripts/journey_save.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
var _failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var path := "user://migration-map-test-%d.cfg" % OS.get_process_id()
	var progress := Save.new(path)
	var app := Main.instantiate()
	app._save = progress
	root.add_child(app)
	await process_frame
	var page := _page(app)
	_check(page.name == &"Home", "home opens first")
	var data := Catalog.read_json(Catalog.MANIFEST)
	_check(int(data.totals.playable) == 26 and int(data.totals.preview) == 6 and int(data.totals.placeholder) == 28, "exact original map state")
	var catalog := Catalog.new()
	_check(catalog.original_playable_ids().size() == 26, "26 original enabled ID records")
	for baseline: Dictionary in data.baselines.values():
		_check(baseline.absent_from_nine_islands.is_empty(), "baseline map is covered")
	var ready := 0
	for map: Dictionary in data.maps:
		for entry: Dictionary in map.stops:
			if not entry.was_playable:
				_check(not catalog.can_play(entry.id, progress, true), "preview is locked even in test mode: " + entry.id)
			elif not catalog.runner_for(entry.id).is_empty():
				ready += 1
				_check(catalog.can_play(entry.id, progress, true), "verified old game is reachable in test mode")
	page.get_node("%Play").pressed.emit()
	await process_frame
	page = _page(app)
	_check(page.name == &"Archipelago", "start opens island selection")
	var ids: Array[StringName] = []
	for info: Resource in page.islands:
		ids.append(info.island_id)
	_check(ids == [&"campus", &"home", &"traffic", &"water", &"network", &"emergency", &"social", &"food", &"outdoor"], "nine authored islands stay in web order")
	_check(page.get_node("%Counter").text == "01 / 09", "campus is number 01")
	page.island_opened.emit(0, page.islands[0])
	await process_frame
	page = _page(app)
	_check(page.get_node("%Map").visible and page._buttons.size() == 8, "campus shows eight original entry positions")
	page.inspect("first-aid-abrasion")
	_check(page._intro.start_button.disabled, "old preview cannot start")
	page._intro.closed.emit()
	page.back_requested.emit()
	await process_frame
	page = _page(app)
	page.set_current(1)
	_check(page.get_node("%Counter").text == "02 / 09", "home is number 02")
	page.island_opened.emit(1, page.islands[1])
	await process_frame
	page = _page(app)
	_check(page.name == &"IslandMap" and page._buttons.size() == 9, "home opens its authored map and all nine entries")
	page.inspect("home-food-storage-v1")
	_check(page._intro.start_button.disabled, "unfinished new draft remains locked")
	page._intro.closed.emit()
	page.inspect("oil-fire")
	_check(page.get_node("%Intro").visible and not page._intro.start_button.disabled, "original migrated first stop is playable")
	page._intro.closed.emit()
	_check(not page.get_node("%Intro").visible, "intro can be dismissed")
	_check(not catalog.can_play("charging-bedroom", progress), "the next home level requires oil-fire")
	progress.claim("oil-fire", 20.0, 50.0)
	if not catalog.runner_for("charging-bedroom").is_empty():
		_check(catalog.can_play("charging-bedroom", progress), "clearing oil-fire unlocks a verified bedroom stop")
	DirAccess.remove_absolute(path)
	if _failures == 0:
		print("PASS: 60 stops, unfinished entries locked, %d original levels currently verified" % ready)
	quit(_failures)

func _page(app: Node) -> Control:
	return app.get_node("Page").get_child(-1) as Control

func _check(condition: bool, message: String) -> void:
	if not condition:
		printerr("FAIL: " + message)
		_failures += 1
