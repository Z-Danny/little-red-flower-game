extends SceneTree
## Integrated launcher contract: every verified level is reachable from the real
## nine-island pages; unfinished and off-island IDs cannot trigger rewards.

const Main = preload("res://scenes/main.tscn")
const Catalog = preload("res://scripts/level_catalog.gd")
const Save = preload("res://scripts/journey_save.gd")
var _failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var file := "user://launch-verified-test-%d.cfg" % OS.get_process_id()
	var app := Main.instantiate()
	app._save = Save.new(file)
	root.add_child(app)
	await process_frame
	var catalog := Catalog.new()
	var unlocked := 0
	var original_unlocked := 0
	var new_unlocked := 0
	var locked := 0
	var source := Catalog.read_json(Catalog.MANIFEST)
	var additions: Dictionary = Catalog.read_json(Catalog.NEW_LEVELS).get("levels", {})
	for i in source.maps.size():
		app._enter_islands(true)
		await process_frame
		var picker := _page(app)
		picker.set_current(i)
		picker.get_node("%SelectedIsland").pressed.emit()
		await process_frame
		var map := _page(app)
		var stops: Array = source.maps[i].stops
		_check(map._buttons.size() == stops.size(), "every sign is mounted: " + source.maps[i].id)
		_check(map.get_node("%Art").texture != null, "island background loads: " + source.maps[i].id)
		for entry: Dictionary in stops:
			var runner := catalog.runner_for(entry.id)
			map.inspect(entry.id)
			if runner.is_empty():
				if not entry.was_playable: locked += 1
				_check(map._intro.start_button.disabled, "unmigrated or unfinished entry stays locked: " + entry.id)
				map._start_selected()
				_check(app._active.is_empty(), "disabled start handler rejects entry: " + entry.id)
				map._back()
				continue
			map._intro.start_button.pressed.emit()
			await process_frame
			var player := _page(app)
			_check(player.scene_file_path == runner and app._active.id == entry.id, "loads the true runner by ID: " + entry.id)
			_check(player.has_signal("finished") and player.has_signal("exited"), "runner has launch contract: " + entry.id)
			_check(not app._journey_audio._navigating, "navigation music is off inside " + entry.id)
			if player != map and player.has_signal("exited"):
				unlocked += 1
				original_unlocked += int(entry.was_playable)
				new_unlocked += int(not entry.was_playable)
				player.exited.emit()
				await process_frame
				map = _page(app)
				_check(app._journey_audio._navigating, "returning from " + entry.id + " restores map music")
			else:
				map._back()
	_check(new_unlocked == additions.size(), "every explicitly added level launches")
	_check(locked == 34 - new_unlocked, "remaining draft entries stay locked")
	_check(unlocked == catalog.playable_ids().size(), "map and progress agree on eligible levels")
	_check(app._save.total(catalog.playable_ids()) == 0, "entering and exiting a level never awards flowers")
	var expected := OS.get_environment("GODOT_MIGRATION_EXPECTED").to_int()
	if expected > 0:
		_check(original_unlocked == expected, "expected %d verified old levels, found %d" % [expected, original_unlocked])
	if FileAccess.file_exists(file): DirAccess.remove_absolute(file)
	root.remove_child(app)
	app.queue_free()
	await process_frame
	# In a headless burst the mixer can still hold deferred stream references
	# from scenes that have just exited. Let it tick before shutting down Godot.
	await create_timer(0.25).timeout
	if _failures == 0:
		print("PASS: %d original and %d new levels opened through actual maps; %d unfinished entries locked; no rewards on exit" % [original_unlocked, new_unlocked, locked])
	quit(_failures)

func _page(app: Node) -> Control:
	return app.get_node("Page").get_child(-1) as Control

func _check(condition: bool, message: String) -> void:
	if not condition:
		printerr("FAIL: " + message)
		_failures += 1
