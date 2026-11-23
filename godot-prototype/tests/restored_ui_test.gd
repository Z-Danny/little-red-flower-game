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
	_check(skin != null and skin.texture.resource_path.ends_with("home_menu/primary.webp"), "homepage uses the generated bevelled gold frame")
	_check(home.get_node("%SeedCount").text == "× 5", "home displays the provisional initial five seeds")
	var baseline := play.position.y
	play.button_down.emit()
	await home._press_motion.finished
	_check(play.position.y > baseline + 4.0, "the play button depresses under the pointer")
	play.button_up.emit()
	await home._press_motion.finished
	_check(is_equal_approx(play.position.y, baseline), "the play button rises after release")
	await _shot("01-title")
	home.get_node("%Ranking").pressed.emit()
	_check(app._dialog != null and app._dialog.get_node("%RankBody").visible, "home ranking button opens the ranking tab directly")
	_check(not app._dialog.has_node("%Back") and not app._dialog.has_node("%Close"), "the leaderboard has no close buttons")
	_mouse_tap(Vector2(288, 224))
	_check(app._dialog != null, "clicking blank space on the card leaves the leaderboard open")
	app._dialog.get_node("%ProgressTab").pressed.emit()
	_check(app._dialog.get_node("%Totals").visible and not app._dialog.has_node("%Back"), "the home leaderboard keeps both tabs without a return-to-map button")
	_mouse_tap(Vector2(59, 54))
	_check(app._dialog == null and home.process_mode == Node.PROCESS_MODE_INHERIT, "a backdrop click closes the leaderboard without activating the covered settings button")
	home.get_node("%Ranking").pressed.emit()
	_touch_tap(Vector2(288, 50))
	_check(app._dialog == null, "the leaderboard can also close from a backdrop touch")
	home.get_node("%ChooseIsland").pressed.emit()
	await process_frame
	var picker: Control = app._screen
	picker.set_current(1)
	picker.get_node("%SelectedIsland").pressed.emit()
	await process_frame
	await process_frame
	var map: Control = app._screen
	var toolbar: Control = map.get_node("%MapTools")
	var scroll: ScrollContainer = map.get_node("%Map")
	var before := scroll.scroll_vertical
	var journal_button := toolbar.find_child("ProgressButton", true, false) as BaseButton
	var home_button := toolbar.find_child("HomeButton", true, false) as BaseButton
	_check(journal_button != null and home_button != null and not toolbar.has_node("SettingsButton"), "settings moved to the home screen")
	if journal_button == null or home_button == null:
		quit(1)
		return
	await _shot("02-map")
	journal_button.pressed.emit()
	await process_frame
	var playable: int = app._catalog.playable_ids().size()
	_check(app._dialog != null and app._dialog.get_node("%Totals").text == "已完成 0 / %d 关" % playable, "journal counts real playable IDs rather than placeholders")
	app._dialog.get_node("%RankTab").pressed.emit()
	_check(app._dialog.get_node("%RankBody").visible and not app._dialog.get_node("%Totals").visible, "ranking is the second real tab")
	_check(not app._dialog.has_node("%Back") and not app._dialog.has_node("%Close"), "the map leaderboard tab uses backdrop dismissal")
	app._dialog.get_node("%ProgressTab").pressed.emit()
	_check(app._dialog.get_node("%Totals").visible and not app._dialog.has_node("%Close"), "both map dialog tabs use the same backdrop dismissal")
	_check(map.process_mode == Node.PROCESS_MODE_DISABLED, "map is inert while journal is open")
	await _shot("03-journal")
	_touch_tap(Vector2(288, 950))
	_check(app._dialog == null and scroll.scroll_vertical == before, "closing progress returns to the previous scroll")
	var seeded: Dictionary = app._save.claim("oil-fire", 10.0, 50.0)
	_check(seeded.delta == 3, "fixture saves only inside test path")
	map.refresh_progress()
	home_button.pressed.emit()
	await process_frame
	home = app._screen
	home.get_node("%Settings").pressed.emit()
	var panel: Control = app._dialog
	_check(not panel.has_node("%Close") and not panel.has_node("%Back"), "settings uses its backdrop as the close control")
	_check(panel.get_node("Card").size.y <= 400 and not panel.has_node("%Note") and not panel.get_node("%Status").visible, "the sound card is compact and opens without a footer note")
	_click_at(Vector2(288, 575))
	_check(app._dialog == panel, "tapping inside the settings card leaves it open")
	panel.get_node("%Music").pressed.emit()
	panel.get_node("%Effects").pressed.emit()
	_check(app._journey_audio.music_muted and app._journey_audio.effects_muted, "audio controls separately toggle music and effects")
	var prefs := ConfigFile.new()
	_check(prefs.load(sound_path) == OK and prefs.get_value("audio", "music_muted", false) and prefs.get_value("audio", "effects_muted", false), "both toggles persist")
	await _shot("04-settings")
	panel.get_node("%Reset").pressed.emit()
	_check(panel.get_node("Card/ConfirmReset").visible and app._save.flowers_for("oil-fire") == 3, "the reset action first shows a confirmation")
	panel.get_node("Card/CancelReset").pressed.emit()
	_check(app._save.flowers_for("oil-fire") == 3, "cancel leaves progress intact")
	panel.get_node("%Reset").pressed.emit()
	panel.get_node("Card/ConfirmReset").pressed.emit()
	_check(app._save.flowers_for("oil-fire") == 0 and Save.new(save_path).flowers_for("oil-fire") == 0, "confirmed reset clears only test progress")
	_check(app._journey_audio.music_muted and app._journey_audio.effects_muted, "reset leaves audio preferences intact")
	_check(home.get_node("%Play").text == "开始游戏", "reset refreshes the home screen")
	_touch_tap(Vector2(288, 752))
	_check(app._dialog == null and home.process_mode == Node.PROCESS_MODE_INHERIT, "tapping the backdrop closes settings and restores the home screen")
	home.get_node("%Play").pressed.emit()
	await home._press_motion.finished
	await process_frame
	map = app._screen
	map.inspect("first-aid-burn")
	_check(map._intro.start_button.disabled and map.get_node("%Map").process_mode == Node.PROCESS_MODE_DISABLED, "painted modal retains draft gate and traps map input")
	var intro: Control = map._intro
	var card: Control = intro.get_node("Card")
	var card_blank := card.get_global_rect().position + Vector2(40.0, 45.0)
	var backdrop := intro.get_global_rect().position + Vector2(12.0, 12.0)
	_check(not card.has_node("Close"), "level intro has no close button")
	_mouse_tap(card_blank)
	_touch_tap(card_blank)
	_check(intro.visible, "mouse and touch keep the intro open on blank card space")
	map._intro.start_button.pressed.emit()
	_check(app._screen == map, "disabled popup cannot launch a draft even if triggered manually")
	_mouse_tap(backdrop)
	_check(not intro.visible and map.get_node("%Map").process_mode == Node.PROCESS_MODE_INHERIT, "mouse backdrop dismisses the intro and restores map input")
	map.inspect("first-aid-burn")
	_touch_tap(backdrop)
	_check(not intro.visible, "touch backdrop dismisses the intro")
	_intro_duplicate_close(map, intro)
	map.inspect("first-aid-burn")
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	root.push_input(escape, true)
	_check(not intro.visible, "Escape still dismisses the intro")
	app._test_unlock = true
	map._test_unlock = true
	map.inspect("oil-fire")
	_check(map._intro.start_button.text == "开始应对锅火", "intro restores the original per-level action")
	await _shot("05-intro")
	_mouse_tap(map._intro.start_button.get_global_rect().get_center())
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

func _click_at(point: Vector2) -> void:
	for down: bool in [true, false]:
		var click := InputEventMouseButton.new()
		click.button_index = MOUSE_BUTTON_LEFT
		click.position = point
		click.pressed = down
		root.push_input(click, true)

func _intro_duplicate_close(map: Control, intro: Control) -> void:
	var state := {"navigated": false}
	var count_back := func() -> void: state.navigated = true
	map.back_requested.connect(count_back)
	intro.closed.emit()
	_check(not state.navigated, "duplicate touch dismiss stays on the island map")
	map.back_requested.disconnect(count_back)

func _mouse_tap(point: Vector2) -> void:
	for pressed in [true, false]:
		var event := InputEventMouseButton.new()
		event.position = point
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = pressed
		root.push_input(event, true)

func _touch_tap(point: Vector2) -> void:
	for pressed in [true, false]:
		var event := InputEventScreenTouch.new()
		event.position = point
		event.pressed = pressed
		root.push_input(event, true)

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
