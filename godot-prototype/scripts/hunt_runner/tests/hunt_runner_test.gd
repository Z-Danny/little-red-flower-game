extends SceneTree
## Scene-level test: synthetic native GUI events go through the Control, cover
## transform and imported exact-colour mask. Only elapsed time is injected.

const Runner = preload("res://scripts/hunt_runner/hunt_runner.gd")
const Scene = preload("res://scenes/hunt_runner.tscn")
const Pack = preload("res://scripts/hunt_runner/hunt_pack.gd")
const Rules = preload("res://scripts/hunt_runner/hunt_rules.gd")
const Camera = preload("res://scripts/hunt_runner/hunt_viewport.gd")
const Direction = preload("res://scripts/hunt_runner/hunt_performance.gd")
const AudioBank = preload("res://assets/hunt_runner/shared/audio/bank.tres")
const IDs := [
	"typhoon-home", "charging-bedroom", "bedroom-night-check-v2",
	"kitchen-before-cooking-v2", "clear-corridor-check-v2", "quake-bedroom-v2",
	"storm-street-check-v2", "thunder-park-v2", "forest-fire-sources-v2",
	"campus-classroom-check-v1", "campus-lab-check-v1",
]
const THREE_TARGET_IDS := ["charging-bedroom", "campus-classroom-check-v1", "campus-lab-check-v1"]
const VARIANTS := ["storm", "legacy/quiet_electric", "quiet_electric", "kitchen_check", "corridor", "preparedness", "rain_street", "thunder_park", "forest_edge", "quiet_electric", "quiet_electric"]

var _errors: Array[String] = []
var _context := ""
var _results: Array[Array] = []
var _exits: Array[bool] = []
var _probes := {}
var _empty := Vector2.ZERO

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	_check(Pack.contract_ids() == IDs, "original hunt IDs plus the two authored campus packs")
	for key in ["victory", "failure"]:
		var wave := AudioBank.get_meta("resources")[key] as AudioStreamWAV
		var digest := HashingContext.new()
		digest.start(HashingContext.HASH_SHA256)
		digest.update(wave.data)
		_check(wave.mix_rate == 44100 and wave.format == AudioStreamWAV.FORMAT_16_BITS and digest.finish().hex_encode() == AudioBank.get_meta("approved_pcm_sha256")[key], "approved PCM remains exact after import: " + key)
	var v := Vector2(390.0, 844.0)
	var art := Vector2(720.0, 1280.0)
	var camera := Camera.cover(v, art)
	_check(is_equal_approx(camera.x.length(), camera.y.length()), "camera is uniformly scaled")
	_check(is_equal_approx((camera * art).y, v.y) and camera.origin.x < 0.0, "portrait cover with shared inverse")
	_check((camera.affine_inverse() * (camera * Vector2(343.0, 635.0))).is_equal_approx(Vector2(343.0, 635.0)), "cover input inverse")
	for i in range(IDs.size()):
		_context = IDs[i]
		var before := _errors.size()
		var runner := await _launch(_context)
		if runner.run == null:
			_check(false, "registered pack loaded: " + runner.pack.error)
			runner.free()
			continue
		_check(runner.size.is_equal_approx(Vector2(576, 1024)), "root has exactly the native reference size")
		_check(runner.pack.rules["id"] == _context and runner.pack.rules["seconds"] == 50, "identity and authored limit")
		_check(runner.run.target_count() == (3 if _context in THREE_TARGET_IDS else 5), "authored target count")
		_check(runner.pack.texture("safe").resource_path.begins_with(Pack.BASE + _context + "/"), "the pack's own original ending is loaded")
		if runner.pack.performance.is_empty():
			var variant: String = runner.pack.presentation["audio"]
			_check(("legacy/" if variant != "storm" else "") + variant == VARIANTS[i], "correct source legacy profile")
		else:
			_check(runner.pack.performance["sound"] == VARIANTS[i], "correct source authored performance")
			_check(Direction.tier(runner.pack.performance, 12499, 50000) == 0 and Direction.tier(runner.pack.performance, 12500, 50000) == 1 and Direction.tier(runner.pack.performance, 37500, 50000) == 3, "quarters follow the same fifty-second clock")
		if _context == "typhoon-home":
			_check(runner.pack.presentation["characterAudio"] == "none", "typhoon never re-enables voice startles")
		var ids := _world_probes(runner)
		if ids.size() == runner.run.target_count() and _empty != Vector2.ZERO:
			if _context == "campus-lab-check-v1":
				_check_touch_gestures(runner, _probes[ids[0]])
			_win_from_pointers(runner, ids)
			await process_frame
			runner.free()
			runner = await _launch(_context)
			_fail_from_clock(runner, ids)
			await process_frame
			runner.free()
			runner = await _launch(_context)
			_fail_from_penalty(runner, ids)
			await process_frame
			runner.free()
			runner = await _launch(_context)
			_exit_without_result(runner)
			await process_frame
		runner.free()
		if _errors.size() == before:
			print("PASS hunt ", _context, " (", ids.size(), " exact-mask targets; win, natural/penalty failure, pause, hints, exit)")
	_context = "unsupported"
	var invalid := await _launch("campus-playground-check-v1")
	_check(invalid.run == null and not invalid.pack.error.is_empty(), "disabled drafts cannot be configured")
	_click_control(invalid.get_node("Modal/Back"))
	_check(_results.is_empty() and _exits.size() == 1, "bad configuration can leave without an outcome")
	invalid.free()
	_context = "summary"
	if _errors.is_empty():
		print("All eleven hunt runner packs passed native GUI and terminal tests.")
	else:
		printerr("Native hunt failures: ", _errors.size())
	quit(0 if _errors.is_empty() else 1)

func _launch(id: String) -> Runner:
	_results.clear()
	_exits.clear()
	var page := Scene.instantiate() as Runner
	var entry := {"id": id, "title": "测试关卡", "engine": "scene-hunt", "knowledge": "原配置", "muted": true}
	page.configure(entry)
	entry["id"] = "mutated-after-configure"
	page.finished.connect(func(won: bool, elapsed_seconds: float) -> void: _results.append([won, elapsed_seconds]))
	page.exited.connect(func() -> void: _exits.append(true))
	root.add_child(page)
	page.set_process(false)
	await process_frame
	return page

func _win_from_pointers(page: Runner, ids: Array[String]) -> void:
	_check(page.run.phase == Rules.Phase.PLAYING and page.run.elapsed_ms == 0.0, "entry launches an untouched fresh attempt")
	_check(not page._hud.hints_visible(), "clues hidden by default")
	_click_control(page.get_node("HUD/Hint"))
	_check(page._hud.hints_visible() and page.run.elapsed_ms == 0.0, "real hint button shows silhouettes without deduction")
	_click_control(page.get_node("HUD/Hint"))
	_check(not page._hud.hints_visible(), "hint button toggles silhouettes")
	_tap_at(page, _empty, true)
	_check(page.run.elapsed_ms == 5000.0 and page.run.penalty_age_ms == 0.0, "touch and its emulated mouse cost exactly one five-second penalty")
	_click_control(page.get_node("HUD/Pause"))
	_check(page.get_node("Modal").visible, "pause overlay opens from native pointer")
	_advance(page, 1300.0)
	_check(page.run.elapsed_ms == 5000.0, "paused time does not pass")
	_click_control(page.get_node("Modal/Restart"))
	_check(page.run.elapsed_ms == 0.0 and page.run.found.is_empty() and _results.is_empty() and not page._hud.hints_visible(), "pause restart clears state without reporting")
	_click_control(page.get_node("HUD/Pause"))
	_click_control(page.get_node("Modal/Resume"))
	_check(not page.get_node("Modal").visible, "resume closes pause")
	_click_control(page.get_node("HUD/Hint"))
	page.notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	_advance(page, 2300.0)
	_check(page.run.elapsed_ms == 0.0 and not page._hud.hints_visible(), "background freezes the clock and closes hints")
	page.notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
	_click_control(page.get_node("HUD/Hint"))
	_tap_at(page, _probes[ids[0]])
	_check(page.run.marking_id == ids[0] and not page._hud.hints_visible(), "exact target starts one circle and closes hints")
	_tap_at(page, _probes[ids[1]])
	_check(page.run.marking_id == ids[0] and page.run.found.is_empty(), "valid tap while marking is not queued")
	_tap_at(page, _empty)
	_check(page.run.elapsed_ms == 5000.0 and page.run.marking_id == ids[0], "miss during nonfinal circle deducts time")
	_advance(page, 799.0)
	_check(page.run.marking_id == ids[0] and page.run.found.is_empty(), "mark takes the original full 800 ms")
	_advance(page, 1.0)
	_check(page.run.found == [ids[0]] and page.run.marking_id.is_empty(), "first circle ends without consuming buffered clicks")
	var after_circle := page.run.elapsed_ms
	_tap_at(page, _probes[ids[0]])
	_check(page.run.elapsed_ms == after_circle and page.run.marking_id.is_empty(), "a repeat on a found object is not a miss")
	for i in range(1, ids.size() - 1):
		_tap_at(page, _probes[ids[i]], i % 2 != 0)
		_check(page.run.marking_id == ids[i], "native pointer selects exact mask of " + ids[i])
		_advance(page, 800.0)
	_check(page.run.found.size() == ids.size() - 1, "all except final marked in non-authored order")
	_advance(page, 49999.0 - page.run.elapsed_ms)
	_tap_at(page, _probes[ids.back()], true)
	_check(page.run.final_mark_pending(), "a real final pointer at 49.999 s is accepted")
	_tap_at(page, _empty)
	_check(page.run.elapsed_ms == 49999.0 and page.run.final_mark_pending(), "the last accepted circle protects against later misses")
	_advance(page, 799.0)
	_check(page.run.phase == Rules.Phase.PLAYING and page.run.elapsed_ms == 50000.0 and page.run.final_mark_pending(), "deadline clamps the clock but protects the final circle")
	_advance(page, 1.0)
	_check(page.run.phase == Rules.Phase.REVEAL and page._world.ending_visible() and page._audio.last_cue == "resolve", "the actual safe art and profile cue are shown before settlement")
	_check(page.run.found == ids and _results.is_empty(), "all true targets found without early reward")
	_click_control(page.get_node("HUD/Pause"))
	_advance(page, 800.0)
	_check(page.run.reveal_ms == 0.0 and _results.is_empty(), "the ending view can pause without an early handoff")
	_click_control(page.get_node("Modal/Resume"))
	_advance(page, 649.0)
	_check(_results.is_empty(), "original 650 ms journey ending hold")
	_advance(page, 1.0)
	_advance(page, 2000.0)
	_check(_results == [[true, 50.0]] and _exits.is_empty(), "one win with penalized capped time, never exit")

func _fail_from_clock(page: Runner, ids: Array[String]) -> void:
	_advance(page, 49900.0)
	_tap_at(page, _probes[ids[0]])
	_check(page.run.marking_id == ids[0], "valid nonfinal just before deadline")
	_advance(page, 100.0)
	_check(page.run.found == [ids[0]], "already accepted nonfinal counts at natural timeout")
	_assert_failed(page, ids.back())

func _fail_from_penalty(page: Runner, ids: Array[String]) -> void:
	for i in range(9):
		_tap_at(page, _empty, i % 2 == 0)
	_check(page.run.elapsed_ms == 45000.0 and page.run.phase == Rules.Phase.PLAYING, "nine rapid misses deduct separately")
	_tap_at(page, _probes[ids[0]])
	_check(page.run.marking_id == ids[0], "nonfinal circle still starts after 9 misses")
	_tap_at(page, _empty)
	_check(page.run.found.is_empty(), "penalty exhaustion cancels a nonfinal in-flight circle")
	_assert_failed(page, ids[0])

func _assert_failed(page: Runner, id: String) -> void:
	var count := page.run.found.size()
	_check(page.run.phase == Rules.Phase.FAILED and page.run.elapsed_ms == 50000.0, "failure clamps immediately at deadline")
	_check(not page._world.ending_visible() and page._audio.last_cue == "failure" and page.get_node("Modal").visible, "failure shows a distinct card and original failure cue, never the safe painting")
	_tap_at(page, _probes[id], true)
	_check(page.run.found.size() == count and page.run.marking_id.is_empty(), "late pointer after timeout cannot mark")
	_advance(page, 1099.0)
	_check(_results.is_empty(), "brief failure presentation precedes parent settlement")
	_advance(page, 1.0)
	_advance(page, 2000.0)
	_check(_results == [[false, 50.0]] and _exits.is_empty(), "one failed result, never won or exited")

func _exit_without_result(page: Runner) -> void:
	_click_control(page.get_node("HUD/Back"))
	_click_control(page.get_node("HUD/Back"))
	_advance(page, 50000.0)
	_check(_results.is_empty() and _exits.size() == 1, "back emits one exit and no reward or failure")

func _check_touch_gestures(page: Runner, target: Vector2) -> void:
	var scene_target := _viewport_point(page, target)
	var hint := (page.get_node("HUD/Hint") as Control).get_global_rect().get_center()
	# The web backend forwards the browser's identifier, which need not be zero.
	_screen_touch(hint, 813, true)
	_mouse_click(hint, InputEvent.DEVICE_ID_EMULATION)
	_screen_touch(hint, 813, false)
	_check(page._hud.hints_visible() and page.run.elapsed_ms == 0.0, "HUD touch opens hints without a scene penalty")
	_click_control(page.get_node("HUD/Hint"))

	var accumulated_before := Input.use_accumulated_input
	_screen_touch(scene_target, 814, true)
	_check(page.run.marking_id.is_empty() and not Input.use_accumulated_input, "touch down waits for release and preserves drag samples")
	_screen_drag(scene_target + Vector2(28, 0), 814)
	_screen_drag(scene_target, 814)
	_screen_touch(scene_target, 814, false)
	_check(page.run.marking_id.is_empty() and page.run.elapsed_ms == 0.0, "a drag back to its starting point has no outcome")
	_check(Input.use_accumulated_input == accumulated_before, "touch release restores input accumulation")

	_screen_touch(scene_target, 815, true)
	_screen_touch(scene_target, 815, false, true)
	_check(page.run.marking_id.is_empty() and page.run.elapsed_ms == 0.0, "a canceled tap has no outcome")

	_screen_touch(scene_target, 816, true)
	page.notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	_check(Input.use_accumulated_input == accumulated_before, "focus loss restores input accumulation")
	page.notification(Node.NOTIFICATION_APPLICATION_FOCUS_IN)
	_screen_touch(scene_target, 816, false)
	_check(page.run.marking_id.is_empty() and page.run.elapsed_ms == 0.0, "focus loss cancels a pending tap")

	var at := _viewport_point(page, _empty)
	_screen_touch(at, 817, true)
	_mouse_click(at, InputEvent.DEVICE_ID_EMULATION)
	_check(page.run.elapsed_ms == 0.0, "an emulated click cannot act before touch release")
	_screen_touch(at + Vector2(2, 2), 817, false)
	_check(page.run.elapsed_ms == 5000.0, "one nonzero touch plus its emulated mouse costs only one penalty")
	_click_control(page.get_node("HUD/Pause"))
	_click_control(page.get_node("Modal/Restart"))

func _world_probes(page: Runner) -> Array[String]:
	_probes.clear()
	_empty = Vector2.ZERO
	var ids: Array[String] = []
	var image := page.pack.texture("mask").get_image()
	for target: Dictionary in page.pack.rules["targets"]:
		var id: String = target["id"]
		var color: Array = page.pack.skin["targets"][id]["color"]
		var bounds := page.pack.bounds(id)
		var at := Vector2.INF
		var best := INF
		# Independent from Pack.hit(): sample the imported image by exact RGB.
		for y in range(int(bounds.position.y), ceili(bounds.end.y), 3):
			for x in range(int(bounds.position.x), ceili(bounds.end.x), 3):
				var p := Vector2(x + 0.5, y + 0.5)
				# Default HUD ends at y=97; the hint row exists only on request.
				if not Rect2(4.0, 98.0, 568.0, 850.0).has_point(page._world.camera * p):
					continue
				var px := image.get_pixel(x, y)
				if px.r8 != color[0] or px.g8 != color[1] or px.b8 != color[2] or px.a8 < 128:
					continue
				var score := p.distance_squared_to(bounds.get_center())
				if score < best:
					best = score
					at = p
		_check(at.is_finite(), "there is a reachable exact mask witness for " + id)
		if at.is_finite():
			_probes[id] = at
			ids.append(id)
	for y in range(255, 1200, 41):
		for x in range(35, 685, 31):
			var p := Vector2(x + 0.5, y + 0.5)
			if page.pack.hit(p, 24.0).is_empty():
				_empty = p
				break
		if _empty != Vector2.ZERO:
			break
	_check(_empty != Vector2.ZERO, "reachable miss outside all exact mask targets")
	ids.reverse()
	return ids

func _click_control(control: Control) -> void:
	_mouse_click(control.get_global_rect().get_center(), 0)

func _tap_at(page: Runner, point: Vector2, touch := false) -> void:
	var viewport_point := _viewport_point(page, point)
	if touch:
		_screen_touch(viewport_point, 517, true)
		_mouse_click(viewport_point, InputEvent.DEVICE_ID_EMULATION)
		_screen_touch(viewport_point, 517, false)
	else:
		_mouse_click(viewport_point, 0)

func _viewport_point(page: Runner, point: Vector2) -> Vector2:
	return page._world.get_global_transform_with_canvas() * (page._world.camera * point)

func _screen_touch(point: Vector2, index: int, pressed: bool, canceled := false) -> void:
	var event := InputEventScreenTouch.new()
	event.position = point
	event.index = index
	event.pressed = pressed
	event.canceled = canceled
	root.push_input(event, true)

func _screen_drag(point: Vector2, index: int) -> void:
	var event := InputEventScreenDrag.new()
	event.position = point
	event.index = index
	root.push_input(event, true)

func _mouse_click(point: Vector2, device: int) -> void:
	var event := InputEventMouseButton.new()
	event.device = device
	event.position = point
	event.global_position = point
	event.button_index = MOUSE_BUTTON_LEFT
	event.button_mask = MOUSE_BUTTON_MASK_LEFT
	event.pressed = true
	root.push_input(event, true)
	var release := event.duplicate() as InputEventMouseButton
	release.pressed = false
	release.button_mask = 0
	root.push_input(release, true)

func _advance(page: Runner, ms: float) -> void:
	while ms > 0.0:
		var step := minf(100.0, ms)
		page._advance(step)
		ms -= step

func _check(condition: bool, text: String) -> void:
	if not condition:
		var issue := _context + ": " + text
		_errors.append(issue)
		printerr("FAIL ", issue)
