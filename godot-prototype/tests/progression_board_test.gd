extends SceneTree

const APP = preload("res://scenes/main.tscn")
const Profiles = preload("res://scripts/journey_profiles.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
var failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var folder := "user://progression-board-test-%d" % OS.get_process_id()
	DirAccess.make_dir_recursive_absolute(folder)
	var profile_path := folder.path_join("profiles.cfg")
	var other_id := "a".repeat(24)
	var previous_profiles := ConfigFile.new()
	previous_profiles.set_value(other_id, "name", "已有玩家")
	_check(previous_profiles.save(profile_path) == OK, "fixture seeds a saved legacy profile")
	var profiles := Profiles.new(profile_path, folder)
	var app := APP.instantiate()
	app._profiles = profiles
	root.add_child(app)
	await process_frame
	var catalogue := Catalog.new()
	var ids := catalogue.playable_ids()
	var cues: Array[String] = []
	app._journey_audio.cue_played.connect(func(cue: String) -> void: cues.append(cue))
	_check(ids.size() == 60, "all old and new map stops are playable")
	var source := Catalog.read_json(Catalog.MANIFEST)
	for island: Dictionary in source.maps:
		for i in island.stops.size():
			var id: String = island.stops[i].id
			_check(catalogue.can_play(id, app._save) == (i == 0), "normal mode begins on the first marker")
			_check(catalogue.can_play(id, app._save, true), "test mode can enter every marker")
	app._screen.get_node("%PlayMigrated").pressed.emit()
	await process_frame
	_check(app._test_unlock, "home unlock-all action chooses test mode")
	_check(cues == ["button"], "one audible cue for the home button")
	app._enter_islands(false)
	var picker: Control = app._screen
	picker.get_node("%SelectedIsland").pressed.emit()
	await process_frame
	await process_frame
	var map: Control = app._screen
	var start_id := "campus-canteen-check-v1"
	var next_id := "campus-rain-check-v1"
	var before := map.get_node("%Map").scroll_vertical as int
	var gesture := InputEventScreenTouch.new()
	gesture.index = 47
	gesture.pressed = true
	app._journey_audio._input(gesture)
	var navigation_music: AudioStreamPlayer = app._journey_audio._music
	_check(navigation_music.playing and not navigation_music.stream_paused, "navigation music plays on the map")
	map.inspect(start_id)
	map._intro.start_button.pressed.emit()
	await process_frame
	var player: Control = app._screen
	_check(player.scene_file_path.ends_with("find_three.tscn"), "first marker launches from ordinary map")
	app._journey_audio._input(gesture)
	_check(navigation_music.stream_paused, "navigation music stays paused after a gameplay touch")
	player.finished.emit(true, 1.0)
	await process_frame
	_check(cues.count("victory") == 1, "the new runner settles with one victory cue")
	_check(navigation_music.stream_paused, "the settlement keeps only its own cues")
	app._screen.get_node("%Map").pressed.emit()
	await create_timer(1.3).timeout
	map = app._screen
	_check(not navigation_music.stream_paused, "returning to the map resumes navigation music")
	_check(catalogue.status_for(start_id, app._save) == "complete", "first clear persists")
	_check(catalogue.status_for(next_id, app._save) == "available", "next numbered stop unlocks")
	_check(not catalogue.can_play("campus-stairs-check-v1", app._save), "third stop stays locked")
	_check(map.get_node("%Map").scroll_vertical < before, "map pans up after the first clear")
	_check(cues.count("plant-unlock") == 1, "first clear returns with one planting and unlock sequence")
	map.get_node("%Back").pressed.emit()
	await process_frame
	picker = app._screen
	var campus := picker.get_node("%SelectedIsland")
	_check(campus.accessibility_name.contains("已完成 1 关，共 8 关"), "the center exposes the updated first clear")
	var stars := campus.get_node("Progress/ProgressStars")
	_check(stars.get_child(0).visible and stars.get_child(0).texture.resource_path.ends_with("island-progress-star-full.webp"), "the first level keeps its filled star on the campus card")
	_check(stars.get_child(1).visible and stars.get_child(1).texture.resource_path.ends_with("island-progress-star-empty.webp"), "the newly unlocked level keeps its empty star until cleared")
	_check(stars.get_child(2).visible and stars.get_child(2).texture.resource_path.ends_with("island-progress-star-empty.webp"), "the next locked level keeps an empty star")
	campus.pressed.emit()
	await process_frame
	map = app._screen
	map.inspect(start_id)
	map._intro.start_button.pressed.emit()
	await process_frame
	app._screen.finished.emit(true, 1.0)
	await process_frame
	app._screen.get_node("%Map").pressed.emit()
	await process_frame
	_check(cues.count("plant-unlock") == 1 and not cues.has("plant") and not cues.has("count"), "same reward after replay does not replant or count flowers")
	app._show_progress()
	var dialog: Control = app._dialog
	dialog.get_node("%RankTab").pressed.emit()
	_check(dialog.get_node("%RankBody").visible, "rank tab has real content")
	_check(not dialog.has_node("%AddPlayer") and not dialog.has_node("%EditPlayer") and not dialog.has_node("%ProfileEditor"), "ranking has no profile editing UI")
	var rank_rows: VBoxContainer = dialog.get_node("%RankRows")
	_check(rank_rows.get_child(0).text.contains("第 1 名"), "current three flowers rank first")
	_check(rank_rows.get_child(1).text.contains("已有玩家"), "ranking lists an existing profile")
	rank_rows.get_child(1).pressed.emit()
	await process_frame
	_check(app._save.total(ids) == 0 and profiles.active_id == other_id, "switching to a legacy player loads their independent save")
	var other_save := profiles.current_save()
	rank_rows.get_child(0).pressed.emit()
	await process_frame
	_check(app._save.flowers_for(start_id) == 3 and profiles.active_id == Profiles.DEFAULT, "switching back preserves the original play record")
	dialog.closed.emit()
	other_save.claim(next_id, 10.0, 50.0)
	app._show_settings()
	var settings: Control = app._dialog
	settings.get_node("%Reset").pressed.emit()
	settings.get_node("Card/ConfirmReset").pressed.emit()
	var reloaded := Profiles.new(profile_path, folder)
	var records := reloaded.rows(ids, reloaded.current_save())
	_check(reloaded.active_id == Profiles.DEFAULT and records.size() == 2, "reset preserves profile registration and selection")
	_check(records[0].id == other_id and records[0].flowers == 3 and records[1].flowers == 0, "reset clears only the selected player's persisted record")
	var lock: Texture2D = app._screen._buttons[next_id].get_node("%StateMark").texture
	_check(lock != null and lock.resource_path.ends_with("map_lock.svg"), "the open map visibly relocks later levels after reset")
	settings.closed.emit()
	root.remove_child(app)
	app.queue_free()
	# Let the headless mixer release deferred audio references before exiting.
	await create_timer(0.25).timeout
	for file in DirAccess.get_files_at(folder):
		DirAccess.remove_absolute(folder.path_join(file))
	DirAccess.remove_absolute(folder)
	if failures == 0:
		print("PASS: all 60 levels, in-order unlocks, map pan, test unlock, music and two-tab local ranking")
	quit(failures)

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures += 1
		printerr("FAIL: " + label)
