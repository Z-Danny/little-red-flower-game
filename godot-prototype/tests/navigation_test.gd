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
	var audio_path := "user://island-cue-test-%d.cfg" % OS.get_process_id()
	app._journey_audio.preference_path = audio_path
	var cues: Array[String] = []
	app._journey_audio.cue_played.connect(func(cue: String) -> void: cues.append(cue))
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
			if not entry.was_playable and catalog.runner_for(entry.id).is_empty():
				_check(not catalog.can_play(entry.id, progress, true), "preview is locked even in test mode: " + entry.id)
			elif entry.was_playable and not catalog.runner_for(entry.id).is_empty():
				ready += 1
				_check(catalog.can_play(entry.id, progress, true), "verified old game is reachable in test mode")
	var play := page.get_node("%Play") as Button
	var rest := play.position.y
	play.button_down.emit()
	await page._press_motion.finished
	_check(play.position.y > rest + 4.0, "pressing play visibly depresses the button")
	play.button_up.emit()
	play.pressed.emit()
	await create_timer(0.15).timeout
	_check(_page(app) == page and play.position.y < rest, "play visibly rebounds before leaving home")
	await create_timer(0.15).timeout
	page = _page(app)
	_check(page.name == &"IslandMap", "start opens the initial island map directly")
	page.get_node("%Back").pressed.emit()
	await process_frame
	page = _page(app)
	_check(page.name == &"Archipelago", "map offers island selection")
	var ids: Array[StringName] = []
	for info: Resource in page.islands:
		ids.append(info.island_id)
	_check(ids == [&"campus", &"home", &"traffic", &"water", &"network", &"emergency", &"social", &"food", &"outdoor"], "nine authored islands stay in web order")
	var center := page.get_node("%SelectedIsland") as TextureButton
	var previous: TextureButton
	var shown: Array[Texture2D] = []
	for slot: TextureButton in page.get_node("%Carousel").find_children("*", "TextureButton", true, false):
		if slot.is_visible_in_tree() and slot.modulate.a > 0.01:
			shown.append(slot.texture_normal)
			_check(slot.has_node("Progress/ProgressStars") and not slot.has_node("Progress/CountPlaque"), "every portrait shows progress through its own star row")
			if slot != center:
				_check(slot.get_rect().get_center().x < center.get_rect().get_center().x, "both neighbors follow the rightward arc")
			if slot.texture_normal == page.islands[8].art:
				previous = slot
	_check(shown.size() == 3, "only three island portraits appear at rest")
	_check(page.islands[8].art in shown and page.islands[0].art in shown and page.islands[1].art in shown, "the three portraits include the previous, current, and next islands")
	for index in page.islands.size():
		page.set_current(index)
		var info: Resource = page.islands[index]
		_check(center.texture_normal == info.art, "the selected image matches its island")
		var plaque := center.get_node("IslandNamePlaque") as TextureRect
		var name_label := plaque.get_node("IslandName") as Label
		_check(name_label.text.split("\n") == info.title.split(""), "the vertical name matches the island")
		_check(plaque.get_rect().get_center().x > center.size.x, "the name plaque sits to the right of the island")
		_check(name_label.get_rect().end.y <= plaque.size.y - 16, "the full name fits between the plaque's pins")
		var total := 0
		for stop: Dictionary in catalog.map_for(String(info.island_id)).stops:
			if not catalog.runner_for(stop.id).is_empty():
				total += 1
		_check(center.accessibility_name.contains("已完成 0 关，共 %d 关" % total), "the portrait exposes completed and total counts")
		var stars := center.get_node("Progress/ProgressStars")
		var visible_stars := 0
		for star: TextureRect in stars.get_children():
			if star.visible:
				visible_stars += 1
				_check(star.texture != null and star.texture.resource_path.ends_with("island-progress-star-empty.webp"), "unplayed levels have unlit stars")
		_check(visible_stars == total, "exactly one star is shown for each playable level in " + String(info.island_id))
	page.set_current(0)
	_check(center.accessibility_name.contains(page.islands[0].title), "the selected portrait exposes the current island name")
	_check(center.accessibility_name.contains("已完成 0 关，共 8 关"), "the center exposes the initial campus clear count")
	_check(cues.count("island-switch") == 0, "initial and programmatic selections play no switch cue")
	if previous != null:
		var point := previous.get_global_transform_with_canvas() * (previous.size * 0.5)
		for pressed in [true, false]:
			var touch := InputEventScreenTouch.new()
			touch.position = point
			touch.pressed = pressed
			root.push_input(touch, true)
		await create_timer(0.4).timeout
	_check(_page(app) == page, "touching the upper neighbor keeps the picker open")
	_check(center.accessibility_name.contains("已完成 0 关，共 6 关"), "the center exposes the selected outdoor progress")
	_check(cues.count("island-switch") == 1, "selecting a neighbor produces one switch cue after settling")
	page.set_current(8, true)
	_check(cues.count("island-switch") == 1, "selecting the same island stays silent")
	var plaque := center.get_node("IslandNamePlaque") as TextureRect
	var plaque_point := plaque.get_global_transform_with_canvas() * (plaque.size * 0.5)
	for pressed in [true, false]:
		var touch := InputEventScreenTouch.new()
		touch.position = plaque_point
		touch.pressed = pressed
		root.push_input(touch, true)
	await process_frame
	_check(String(app._island.island_id) == "outdoor", "touching the selected island's plaque opens its map")
	_page(app).get_node("%Back").pressed.emit()
	await process_frame
	page = _page(app)
	_check(page.get_node("%SelectedIsland").accessibility_name.contains("校园安全，已完成 0 关"), "returning from an island resets to campus")
	_check(cues.count("island-switch") == 1, "returning to campus stays silent")
	page.set_current(0)
	page.get_node("%SelectedIsland").pressed.emit()
	await process_frame
	page = _page(app)
	_check(page.get_node("%Map").visible and page._buttons.size() == 8, "campus shows eight original entry positions")
	page.inspect("first-aid-abrasion")
	_check(page._intro.start_button.disabled, "later campus stop cannot start out of order")
	page._intro.closed.emit()
	page.back_requested.emit()
	await process_frame
	page = _page(app)
	page.set_current(1)
	page.get_node("%SelectedIsland").pressed.emit()
	await process_frame
	page = _page(app)
	_check(page.name == &"IslandMap" and page._buttons.size() == 9, "home opens its authored map and all nine entries")
	page.inspect("first-aid-burn")
	_check(page._intro.start_button.disabled, "third home stop waits for the second")
	page._intro.closed.emit()
	page.inspect("home-food-storage-v1")
	_check(page.get_node("%Intro").visible and not page._intro.start_button.disabled, "first numbered home stop is playable")
	page._intro.closed.emit()
	_check(not page.get_node("%Intro").visible, "intro can be dismissed")
	_check(not catalog.can_play("home-kitchen-hygiene-v1", progress), "the second home stop requires the first")
	progress.claim("home-food-storage-v1", 10.0, 0.0, 3)
	_check(catalog.can_play("home-kitchen-hygiene-v1", progress), "clearing level 01 unlocks level 02")
	_check(not catalog.can_play("oil-fire", progress) and catalog.can_play("oil-fire", progress, true), "test mode bypasses normal order")
	page.back_requested.emit()
	await process_frame
	page = _page(app)
	center = page.get_node("%SelectedIsland") as TextureButton
	app._journey_audio.set_toggles(false, true)
	_swipe_up(center)
	await create_timer(0.4).timeout
	_check(center.accessibility_name.contains("居家安全，已完成 1 关，共 9 关"), "a swipe selects home and one clear counts as one star")
	var lit := 0
	for star: TextureRect in center.get_node("Progress/ProgressStars").get_children():
		if star.visible and star.texture.resource_path.ends_with("island-progress-star-full.webp"):
			lit += 1
	_check(lit == 1, "a three-flower first clear lights exactly one star")
	_check(cues.count("island-switch") == 1, "muted effects suppress a settled switch cue")
	app._journey_audio.set_toggles(false, false)
	_swipe_up(center)
	await create_timer(0.4).timeout
	_check(center.accessibility_name.contains("交通安全，已完成 0 关"), "a second swipe settles to traffic")
	_check(cues.count("island-switch") == 2, "an unmuted swipe plays once after settling")
	root.remove_child(app)
	app.queue_free()
	await create_timer(0.25).timeout
	DirAccess.remove_absolute(path)
	DirAccess.remove_absolute(audio_path)
	if _failures == 0:
		print("PASS: 60 stops, unfinished entries locked, %d original levels currently verified" % ready)
	quit(_failures)

func _page(app: Node) -> Control:
	return app.get_node("Page").get_child(-1) as Control

func _swipe_up(island: TextureButton) -> void:
	var start := island.get_global_transform_with_canvas() * (island.size * 0.5)
	var end := start - Vector2(0.0, 210.0)
	var touch := InputEventScreenTouch.new()
	touch.position = start
	touch.pressed = true
	root.push_input(touch, true)
	var drag := InputEventScreenDrag.new()
	drag.position = end
	drag.relative = end - start
	root.push_input(drag, true)
	var release := InputEventScreenTouch.new()
	release.position = end
	root.push_input(release, true)

func _check(condition: bool, message: String) -> void:
	if not condition:
		printerr("FAIL: " + message)
		_failures += 1
