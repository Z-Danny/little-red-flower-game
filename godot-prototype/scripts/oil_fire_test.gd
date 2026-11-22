extends SceneTree
## Run after editor import: godot --headless --path godot-prototype -s res://scripts/oil_fire_test.gd

const Rules = preload("res://scripts/oil_fire_rules.gd")
const Timing = preload("res://scripts/oil_fire_timing.gd")
const Kitchen = preload("res://scripts/oil_fire.gd")
const SCENE := preload("res://scenes/oil_fire.tscn")
const KNOB := Vector2(201, 390)
const LID := Vector2(152, 689)
const WATER := Vector2(315, 664)
const CLOTH := Vector2(350, 343)
const PERSON := Vector2(460, 416)
const PAN := Vector2(214, 326)
const EXIT := Vector2(484, 368)
const BACK := Vector2(55, 50)
const PAUSE := Vector2(129, 50)

var _failures := 0


func _initialize() -> void:
	call_deferred("_run_tests")


func _run_tests() -> void:
	AudioServer.set_bus_mute(0, true)
	_test_rules()
	_test_scene_win(false)
	_test_scene_win(true)
	_test_scene_error(WATER)
	_test_scene_error(CLOTH)
	_test_scene_navigation()
	print("Oil-fire rule and scene tests: ", "PASS" if _failures == 0 else "FAIL (%d)" % _failures)
	quit(0 if _failures == 0 else 1)


func _test_rules() -> void:
	_expect(Rules.LEVEL_ID == &"oil-fire", "stable level ID")
	for lid_first: bool in [false, true]:
		var run := Rules.new()
		if lid_first:
			_cover(run)
			var previous := run.risk
			_expect(run.drop(Rules.Item.WATER, Rules.Zone.PAN) == Rules.Feedback.SEALED, "sealed pan rejects water before knob")
			_expect(run.drop(Rules.Item.CLOTH, Rules.Zone.PAN) == Rules.Feedback.SEALED, "sealed pan rejects cloth before knob")
			_expect(run.action == Rules.Action.NONE and run.risk == previous, "sealed drop changes no rule state")
			_shutoff(run)
		else:
			_shutoff(run)
			_expect(run.drop(Rules.Item.PERSON, Rules.Zone.EXIT) == Rules.Feedback.EXIT_BLOCKED, "one goal cannot evacuate")
			run.advance(0.45)
			_cover(run)
		_expect(run.controlled() and run.heat() == 0.0, "knob and lid in either order control fire")
		_expect(not run.tap_knob() and not run.can_pick(Rules.Item.LID), "no reopening or turning gas back on")
		var remaining := run.timeout_remaining_seconds()
		run.advance(65.0)
		_expect(run.phase == Rules.Phase.PLAYING and run.heat() == 0.0, "controlled kitchen cannot time out")
		_expect(run.timeout_remaining_seconds() == remaining, "controlled deadline freezes")
		run.drop(Rules.Item.PERSON, Rules.Zone.EXIT)
		run.advance(0.99)
		_expect(not run.evacuated, "evacuation waits for animation")
		run.advance(0.01)
		_expect(run.phase == Rules.Phase.SETTLING and run.evacuated, "exit completes when both goals are met")
		var elapsed := run.elapsed_seconds
		run.advance(0.64)
		_expect(run.phase == Rules.Phase.SETTLING, "success waits for safe hold")
		run.advance(0.01)
		_expect(run.phase == Rules.Phase.WON and run.elapsed_seconds == elapsed, "result excludes safe hold")
	for wrong: Rules.Item in [Rules.Item.WATER, Rules.Item.CLOTH]:
		var run := Rules.new()
		run.drop(wrong, Rules.Zone.MISS)
		_expect(run.phase == Rules.Phase.PLAYING and is_equal_approx(run.heat(), 0.22), "wrong prop harmless outside pan")
		run.advance(0.45)
		_shutoff(run)
		run.advance(48.8) # An unsafe drop can cross the 50s deadline during its feedback.
		var when := run.elapsed_seconds
		run.drop(wrong, Rules.Zone.PAN)
		_expect(run.phase == Rules.Phase.FAILING and run.heat() == 1.0, "unsealed pan fails even after gas-off")
		_expect(not run.can_pick(Rules.Item.LID), "incorrect action immediately locks input")
		run.advance(1.89)
		_expect(run.phase == Rules.Phase.FAILING and run.action_item == wrong, "preserve feedback before result")
		run.advance(0.02)
		_expect(run.phase == Rules.Phase.LOST and is_equal_approx(run.elapsed_seconds, when + 1.9), "failure feedback is exactly 1.9 active seconds")
		var finished_at := run.elapsed_seconds
		run.advance(60.0)
		_expect(run.elapsed_seconds == finished_at, "failed clock freezes")
	var timeout := Rules.new()
	timeout.advance(NAN)
	timeout.advance(-0.1)
	_expect(timeout.elapsed_seconds == 0.0, "ignore invalid deltas")
	timeout.advance(49.99)
	_expect(timeout.phase == Rules.Phase.PLAYING and timeout.heat() < 1.0, "timeout does not happen early")
	timeout.advance(0.02)
	_expect(timeout.phase == Rules.Phase.LOST and timeout.failure == Rules.Feedback.TIMEOUT and timeout.heat() == 1.0, "natural timeout fills meter and fails")
	_expect(is_equal_approx(timeout.elapsed_seconds, 50.0), "timeout caps game time at deadline")
	var tie := Rules.new()
	_cover(tie)
	tie.advance(48.5)
	tie.tap_knob()
	tie.advance(0.65)
	_expect(tie.phase == Rules.Phase.LOST and not tie.knob_off, "timeout wins when final action finishes at deadline")
	var shorter := Timing.new()
	shorter.duration_seconds = 3.0
	shorter.knob_seconds = 0.2
	var configured := Rules.new(shorter)
	shorter.duration_seconds = 1.0
	configured.tap_knob()
	configured.advance(0.2)
	_expect(configured.knob_off and is_equal_approx(configured.timeout_remaining_seconds(), 2.8), "fresh run snapshots adjustable timings")


func _cover(run: Rules) -> void:
	run.drop(Rules.Item.LID, Rules.Zone.PAN)
	run.advance(0.84)
	_expect(not run.lid_sealed, "lid commits only after animation")
	run.advance(0.01)
	_expect(run.lid_sealed, "lid seals on its configured deadline")


func _shutoff(run: Rules) -> void:
	_expect(run.tap_knob(), "knob press starts action")
	run.advance(0.64)
	_expect(not run.knob_off, "knob commits only after animation")
	run.advance(0.01)
	_expect(run.knob_off, "knob turns off on its configured deadline")


func _test_scene_win(lid_first: bool) -> void:
	var viewport := _new_viewport()
	var kitchen: Kitchen = viewport.get_child(0)
	var results := []
	kitchen.finished.connect(func(won: bool, elapsed: float) -> void: results.append([won, elapsed]))
	_drag(viewport, PERSON, EXIT)
	_drive(kitchen, 0.46)
	_expect(results.is_empty(), "early drag to exit does not report a win")
	if lid_first:
		_drag(viewport, LID, PAN)
		_drive(kitchen, 0.86)
		_drag(viewport, WATER, PAN)
		_drag(viewport, CLOTH, PAN)
		_tap(viewport, KNOB)
		_drive(kitchen, 0.66)
	else:
		_drag(viewport, KNOB, PAN)
		_drive(kitchen, 0.66)
		_expect(is_zero_approx(kitchen.get_node("World/Knob").rotation), "dragging the knob does not count as a tap")
		_tap(viewport, KNOB)
		_drive(kitchen, 0.66)
		_drag(viewport, LID, PAN)
		_drive(kitchen, 0.86)
	_expect(not kitchen.get_node("World/Flame").visible, "sealed lid hides flame")
	_expect(kitchen.get_node("World/Lid").get_rect() == Rect2(146, 456, 176, 78), "one lid at authored seal position")
	_expect(is_equal_approx(kitchen.get_node("World/Knob").rotation, -PI * 0.5), "tap rotates the physical knob in place")
	_drive(kitchen, 51.0)
	_expect(results.is_empty(), "same GUI run survives its original deadline once controlled")
	_drag(viewport, PERSON, EXIT)
	_drive(kitchen, 1.64)
	_expect(results.is_empty(), "scene waits for exit and hold before emitting")
	_drive(kitchen, 0.02)
	_expect(results.size() == 1 and results[0][0] and results[0][1] > 50.0, "real pointer inputs emit one successful result")
	_drive(kitchen, 1.0)
	_expect(results.size() == 1, "terminal scene reports only once")
	viewport.free()


func _test_scene_error(source: Vector2) -> void:
	var viewport := _new_viewport()
	var kitchen: Kitchen = viewport.get_child(0)
	var results := []
	kitchen.finished.connect(func(won: bool, elapsed: float) -> void: results.append([won, elapsed]))
	_drag(viewport, source, PAN)
	_expect(kitchen.get_node("World/Person").texture.resource_path.ends_with("panicked.png"), "wrong item immediately changes the actor")
	_drive(kitchen, 1.0)
	_tap(viewport, KNOB)
	_drive(kitchen, 0.89)
	_expect(results.is_empty(), "wrong item has a feedback window before signal")
	_drive(kitchen, 0.02)
	_expect(results.size() == 1 and not results[0][0] and is_equal_approx(results[0][1], 1.9), "unsealed wrong drag reports exactly one failure")
	_expect(is_zero_approx(kitchen.get_node("World/Knob").rotation), "knob input is ignored during wrong feedback")
	viewport.free()


func _test_scene_navigation() -> void:
	var viewport := _new_viewport()
	var kitchen: Kitchen = viewport.get_child(0)
	var calls := [0, 0]
	kitchen.finished.connect(func(_won: bool, _elapsed: float) -> void: calls[0] += 1)
	kitchen.exited.connect(func() -> void: calls[1] += 1)
	_tap(viewport, PAUSE)
	_expect(kitchen.get_node("Hud/PauseOverlay").visible, "pause button opens pause overlay")
	_drive(kitchen, 51.0)
	_expect(calls[0] == 0, "pause freezes hazard time")
	_tap(viewport, PAUSE)
	_expect(not kitchen.get_node("Hud/PauseOverlay").visible, "pause toggles resume")
	_tap(viewport, BACK)
	_tap(viewport, BACK)
	_drive(kitchen, 51.0)
	_expect(calls == [0, 1], "back emits exited only once and never finishes")
	viewport.free()


func _new_viewport() -> SubViewport:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(576, 1024)
	root.add_child(viewport)
	var kitchen := SCENE.instantiate()
	# Deterministic UI fixtures advance many virtual seconds in one engine frame.
	# Keep audio out of that clock so the real mixer never receives skipped-time playback.
	for player: AudioStreamPlayer in kitchen.get_node("Audio").get_children():
		player.stream = null
	viewport.add_child(kitchen)
	kitchen.set_process(false)
	return viewport


func _drive(kitchen: Kitchen, seconds: float) -> void:
	var remaining := seconds
	while remaining > 0.000001:
		var step := minf(remaining, 0.08)
		kitchen._process(step)
		remaining -= step


func _tap(viewport: Viewport, at: Vector2) -> void:
	_button(viewport, at, true)
	_button(viewport, at, false)


func _drag(viewport: Viewport, from: Vector2, to: Vector2) -> void:
	_button(viewport, from, true)
	for fraction in [0.25, 0.5, 0.75, 1.0]:
		var motion := InputEventMouseMotion.new()
		motion.position = from.lerp(to, fraction)
		motion.global_position = motion.position
		motion.button_mask = MOUSE_BUTTON_MASK_LEFT
		viewport.push_input(motion, true)
	_button(viewport, to, false)


func _button(viewport: Viewport, at: Vector2, pressed: bool) -> void:
	var button := InputEventMouseButton.new()
	button.position = at
	button.global_position = at
	button.button_index = MOUSE_BUTTON_LEFT
	button.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
	button.pressed = pressed
	viewport.push_input(button, true)


func _expect(condition: bool, label: String) -> void:
	if not condition:
		_failures += 1
		push_error("Oil-fire: " + label)
