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
	var locked := 0
	var source := Catalog.read_json(Catalog.MANIFEST)
	for i in source.maps.size():
		app._enter_islands(true)
		await process_frame
		var picker := _page(app)
		picker.island_opened.emit(i, picker.islands[i])
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
			if player != map and player.has_signal("exited"):
				unlocked += 1
				player.exited.emit()
				await process_frame
				map = _page(app)
			else:
				map._back()
	_check(locked == 34, "all six old previews and 28 new drafts remain locked")
	_check(app._save.total(catalog.original_playable_ids()) == 0, "entering and exiting a level never awards flowers")
	var expected := OS.get_environment("GODOT_MIGRATION_EXPECTED").to_int()
	if expected > 0:
		_check(unlocked == expected, "expected %d verified old levels, found %d" % [expected, unlocked])
	if FileAccess.file_exists(file): DirAccess.remove_absolute(file)
	root.remove_child(app)
	app.queue_free()
	await process_frame
	# In a headless burst the mixer can still hold deferred stream references
	# from scenes that have just exited. Let it tick before shutting down Godot.
	await create_timer(0.25).timeout
	if _failures == 0:
		print("PASS: %d original levels opened through actual maps; %d unfinished entries locked; no rewards on exit" % [unlocked, locked])
	quit(_failures)

func _page(app: Node) -> Control:
	return app.get_node("Page").get_child(-1) as Control

func _check(condition: bool, message: String) -> void:
	if not condition:
		printerr("FAIL: " + message)
		_failures += 1
