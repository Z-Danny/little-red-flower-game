extends SceneTree
## Tests modal routing, persisted audio/reset preferences, and both forms of victory art.
## Gameplay state machines are exercised separately by their original runner tests.

const Main = preload("res://scenes/main.tscn")
const Save = preload("res://scripts/journey_save.gd")
const HuntRules = preload("res://scripts/hunt_runner/hunt_rules.gd")
var _failures := 0
var _capture := OS.get_environment("GODOT_UI_CAPTURE")

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var id := str(OS.get_process_id())
	var save_path := "user://ui-restoration-test-" + id + ".cfg"
	var sound_path := "user://ui-sound-test-" + id + ".cfg"
	var app := Main.instantiate()
	app._save = Save.new(save_path)
	app._journey_audio.preference_path = sound_path
	root.add_child(app)
	await process_frame
	var home := app._screen as Control
	var play := home.get_node("%Play") as Button
	var skin := play.get_theme_stylebox("normal") as StyleBoxTexture
	_check(skin != null and skin.texture.resource_path.ends_with("title-primary.webp"), "homepage uses original green-leaf gold frame")
	await _shot("01-title")
	play.pressed.emit()
	await process_frame
	var picker: Control = app._screen
	picker.island_opened.emit(1, picker.islands[1])
	await process_frame
	await process_frame
	var map: Control = app._screen
	var toolbar: Control = map.get_node("%MapTools")
	var scroll: ScrollContainer = map.get_node("%Map")
	var before := scroll.scroll_vertical
	var journal_button := toolbar.find_child("ProgressButton", true, false) as BaseButton
	var settings_button := toolbar.find_child("SettingsButton", true, false) as BaseButton
	var home_button := toolbar.find_child("HomeButton", true, false) as BaseButton
	_check(journal_button != null and settings_button != null and home_button != null, "three original map tools exist")
	if journal_button == null or settings_button == null or home_button == null:
		quit(1)
		return
	await _shot("02-map")
	journal_button.pressed.emit()
	await process_frame
	_check(app._dialog != null and app._dialog.get_node("%Totals").text == "已完成 0 / 26 关", "journal counts real playable IDs rather than placeholders")
	_check(map.process_mode == Node.PROCESS_MODE_DISABLED, "map is inert while journal is open")
	await _shot("03-journal")
	app._dialog.get_node("%Back").pressed.emit()
	_check(app._dialog == null and scroll.scroll_vertical == before, "closing progress returns to the previous scroll")
	var seeded: Dictionary = app._save.claim("oil-fire", 10.0, 50.0)
	_check(seeded.delta == 3, "fixture saves only inside test path")
	map.refresh_progress()
	settings_button.pressed.emit()
	var panel: Control = app._dialog
	panel.get_node("%Music").pressed.emit()
	panel.get_node("%Effects").pressed.emit()
	_check(app._journey_audio.music_muted and app._journey_audio.effects_muted, "audio controls separately toggle music and effects")
	var prefs := ConfigFile.new()
	_check(prefs.load(sound_path) == OK and prefs.get_value("audio", "music_muted", false) and prefs.get_value("audio", "effects_muted", false), "both toggles persist")
	await _shot("04-settings")
	panel.get_node("%Reset").pressed.emit()
	panel.get_node("Card/CancelReset").pressed.emit()
	_check(app._save.flowers_for("oil-fire") == 3, "cancel leaves progress intact")
	panel.get_node("%Reset").pressed.emit()
	panel.get_node("Card/ConfirmReset").pressed.emit()
	_check(app._save.flowers_for("oil-fire") == 0 and Save.new(save_path).flowers_for("oil-fire") == 0, "confirmed reset clears only test progress")
	_check(app._journey_audio.music_muted and app._journey_audio.effects_muted, "reset leaves audio preferences intact")
	panel.get_node("%Back").pressed.emit()
	map.inspect("home-food-storage-v1")
	_check(map._intro.start_button.disabled and map.get_node("%Map").process_mode == Node.PROCESS_MODE_DISABLED, "painted modal retains draft gate and traps map input")
	map._intro.start_button.pressed.emit()
	_check(app._screen == map, "disabled popup cannot launch a draft even if triggered manually")
	map._intro.closed.emit()
	map.inspect("oil-fire")
	_check(map._intro.start_button.text == "开始应对锅火", "intro restores the original per-level action")
	await _shot("05-intro")
	map._intro.start_button.pressed.emit()
	var oil: Control = app._screen
	_check(oil.scene_file_path.ends_with("/oil_fire.tscn"), "original intro opens the real oil-fire runner")
	# This stage verifies presenting the terminal state, not the gameplay input.
	oil._run.knob_off = true
	oil._run.lid_sealed = true
	oil._run.evacuated = true
	oil._present(0.0)
	oil.finished.emit(true, 11.0)
	var outcome: Control = app._screen
	_check(app._result_backdrop == oil and not oil.get_node("Hud").visible and oil.process_mode == Node.PROCESS_MODE_DISABLED, "original completed world freezes behind the painted outcome")
	await _shot("06-success-kitchen")
	outcome.get_node("%Map").pressed.emit()
	await process_frame
	_check(app._result_backdrop == null and not is_instance_valid(oil), "leaving the outcome frees the frozen world")
	map = app._screen
	map.inspect("charging-bedroom")
	map._intro.start_button.pressed.emit()
	var hunt: Control = app._screen
	# Use its verified terminal state so the settlement receives the authored still.
	hunt.run.phase = HuntRules.Phase.COMPLETE
	var expected: Texture2D = hunt.pack.texture("safe")
	hunt.finished.emit(true, 10.0)
	outcome = app._screen
	_check(outcome.get_node("Sky").texture == expected and app._result_backdrop == null, "the hunt settlement retains its own safe picture instead of frozen stage or generic sky")
	await _shot("07-success-hunt")
	outcome.get_node("%Replay").pressed.emit()
	await process_frame
	hunt = app._screen
	hunt.finished.emit(false, 50.0)
	outcome = app._screen
	_check(app._save.flowers_for("charging-bedroom") == 3 and outcome.get_node("Sky").texture != expected, "failure never grants extra flowers or shows a false safe picture")
	await _shot("08-failure")
	outcome.get_node("%Map").pressed.emit()
	await process_frame
	map = app._screen
	map.get_node("%MapTools").find_child("HomeButton", true, false).pressed.emit()
	await process_frame
	_check(app._screen.name == &"Home", "the painted home icon returns to the title")
	root.remove_child(app)
	app.queue_free()
	for file: String in [save_path, sound_path]:
		if FileAccess.file_exists(file): DirAccess.remove_absolute(file)
	await create_timer(0.25).timeout
	if _failures == 0: print("PASS: restored artwork, real popup actions, two settlement backgrounds, modal focus and persistence")
	quit(_failures)

func _shot(name: String) -> void:
	if _capture.is_empty(): return
	await process_frame
	await RenderingServer.frame_post_draw
	var img := root.get_texture().get_image()
	_check(img.save_png(_capture.path_join(name + ".png")) == OK, "captured " + name)

func _check(condition: bool, text: String) -> void:
	if not condition:
		_failures += 1
		printerr("FAIL: " + text)
