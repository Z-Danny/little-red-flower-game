extends SceneTree
## Native scene-level regression: real routed mouse input, authored rule IDs and signals.

const Runner = preload("res://scenes/configured_runner.tscn")
const Rules = preload("res://scripts/configured_runner/rules.gd")
const World = preload("res://scripts/configured_runner/world.gd")
const Effects = preload("res://scripts/configured_runner/effects.gd")
const INDEX := "res://assets/configured_runner/source_index.json"
const LEGACY := ["flood-kit", "clear-corridor", "lift-wait", "well-call"]

var _runner: Control
var _model: Rules
var _world: World
var _id := ""
var _signals: Array = []
var _errors: Array[String] = []
var _checks := 0
var _checks_at_start := 0
var _coverage: Array[String] = []
var _report: Dictionary = {}
var _capture_dir := ""

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var index: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(INDEX))
	var report_path := "res://configured_test_results.json"
	var filter := ""
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--report="):
			report_path = arg.trim_prefix("--report=")
		elif arg.begins_with("--capture="):
			_capture_dir = arg.trim_prefix("--capture=")
		elif arg.begins_with("--only="):
			filter = arg.trim_prefix("--only=")
	for id: String in index["levels"]:
		if (filter == "legacy" and id not in LEGACY) or (not filter.is_empty() and filter != "legacy" and filter != id):
			continue
		_id = id
		var errors_before := _errors.size()
		_checks_at_start = _checks
		_coverage = []
		await _open()
		await _capture("initial")
		if _model != null and _runner._blocked_text.is_empty():
			match id:
				"flood-kit": await _flood_kit()
				"clear-corridor": await _corridor()
				"lift-wait": await _lift_wait()
				"well-call": await _well_call()
				"quake-cover-practice": await _quake_cover()
				"quake-exit-practice": await _quake_exit()
				"collapse-signal-practice": await _collapse()
				"flood-highground-practice": await _highground()
				"car-window-practice": await _car_window()
				"lift-contact-practice": await _lift_contact()
				"fire-shelter-practice": await _fire_shelter()
				"fire-stairs-practice": await _fire_stairs()
				"first-aid-aed": await _aed()
				_: _check(false, "Missing route coverage")
		var metadata: Dictionary = index["levels"][id]
		_check(FileAccess.get_sha256(metadata["path"]) == metadata["packageSha256"], "tested package matches imported source index digest")
		var passed := errors_before == _errors.size()
		_report[id] = {"passed": passed, "adapter": metadata["adapter"], "skinId": metadata["skinId"],
			"packageSha256": metadata["packageSha256"], "checks": _coverage.duplicate(), "assertions": _checks - _checks_at_start}
		print("%s %s: %d assertions" % ["PASS" if passed else "FAIL", id, _checks - _checks_at_start])
		if is_instance_valid(_runner):
			_runner.free()
		await process_frame
	# Real audio threads release queued stream references after their mix callback.
	await create_timer(.2).timeout
	if _report.is_empty():
		_check(false, "No levels tested")
	var output := FileAccess.open(report_path, FileAccess.WRITE)
	if output != null:
		output.store_string(JSON.stringify({"schemaVersion": 1, "godot": Engine.get_version_info()["string"],
			"levels": _report, "errors": _errors}, "  ") + "\n")
	else:
		_check(false, "Cannot write result data")
	print("Configured native: %d assertions across %d scopes; %d failures" % [_checks, _report.size(), _errors.size()])
	quit(0 if _errors.is_empty() else 1)

func _check(ok: bool, message: String) -> bool:
	_checks += 1
	if not ok:
		_errors.append(_id + ": " + message)
		printerr(_errors[-1])
	return ok

func _tested(key: String) -> void:
	if key not in _coverage:
		_coverage.append(key)

func _open(scenario: String = "") -> void:
	if is_instance_valid(_runner):
		_runner.free()
	_signals.clear()
	_runner = Runner.instantiate()
	_runner.configure({"id": _id, "title": "测试目录标题", "engine": "configured-v1", "knowledge": "场景验证", "reference_seconds": 30, "core": true})
	_runner.finished.connect(func(won: bool, seconds: float) -> void: _signals.append([won, seconds]))
	_runner.exited.connect(func() -> void: _signals.append(["exited"]))
	root.add_child(_runner)
	_runner.set_process(false)
	_runner._hidden = false
	_model = _runner._model
	_world = _runner._world
	await process_frame
	await process_frame
	if not _check(_model != null and _runner._blocked_text.is_empty(), "Configured before add_child; scene data and alpha masks must load"):
		return
	if not scenario.is_empty():
		_check(_model.reset(scenario), "deterministic fixture scenario exists: " + scenario)
		_runner._audio.reset()
		_runner._update()
	_check(_runner.size.is_equal_approx(Vector2(576, 1024)), "expected 576×1024 native design")
	_check(_runner._heading.text == "测试目录标题", "accepts configure metadata before tree")
	_check(_model.run["elapsed"] == 0.0, "run begins at zero active time")
	for asset: Dictionary in _model.pack["art"].values():
		_check(ResourceLoader.exists(asset["path"], "Texture2D"), "imported art exists: " + str(asset["path"]))
	var audio: Dictionary = _model.pack["audio"]
	var sound_paths: Array = audio.get("cues", {}).values() + audio.get("result", {}).values() + audio.get("ambient", []) + audio.get("notes", [])
	if audio.has("music"):
		sound_paths.append(audio["music"])
	for path: String in sound_paths:
		_check(ResourceLoader.exists(path, "AudioStreamWAV"), "authored audio resource resolves: " + path)
	for key: String in ["alarm", "heartbeat", "cough", "rescue"]:
		if audio.get("emergency", {}).has(key):
			_check(ResourceLoader.exists(audio["emergency"][key], "AudioStreamWAV"), "specialized authored cue resolves: " + key)
	_tested("native_scene_and_sources")

func _time(ms: float) -> void:
	var remaining := ms
	while remaining > .01:
		var step := minf(100.0, remaining)
		_runner._process(step / 1000.0)
		remaining -= step

func _direct_idle(ms: float) -> void:
	var remaining := ms
	while remaining > .01:
		var step := minf(100.0, remaining)
		_model.tick(step)
		remaining -= step
	_runner._update()

func _mouse(pos: Vector2, pressed: bool) -> void:
	var input := InputEventMouseButton.new()
	input.button_index = MOUSE_BUTTON_LEFT
	input.position = pos
	input.global_position = pos
	input.pressed = pressed
	input.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
	root.push_input(input, true)

func _motion(pos: Vector2, pressed: bool) -> void:
	var input := InputEventMouseMotion.new()
	input.position = pos
	input.global_position = pos
	input.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
	root.push_input(input, true)

func _click(pos: Vector2) -> void:
	_motion(pos, false)
	_mouse(pos, true)
	_mouse(pos, false)

func _button(name: String) -> bool:
	var button := _runner.find_child(name, true, false) as Button
	if not _check(button != null and button.is_visible_in_tree() and not button.disabled, "native player button is enabled: " + name):
		return false
	var at := button.get_global_rect().get_center()
	_click(at)
	return true

func _source(id: String) -> Vector2:
	var p := _world.pose(id)
	if p.is_empty():
		return Vector2.INF
	# Find a visible authored alpha pixel not covered by a foreground prop.
	var center := World.local_to_world(p, Vector2(.5, .5))
	var best := Vector2.INF
	var distance := INF
	for y: int in range(1, 32):
		for x: int in range(1, 32):
			var candidate := World.local_to_world(p, Vector2(x / 32.0, y / 32.0))
			var local := _world.from_world(candidate)
			if not Rect2(Vector2.ZERO, _world.size).has_point(local):
				continue
			var dist := center.distance_squared_to(candidate)
			if dist < distance and _world.pick(candidate, _runner._deadline_challenge(), 0.0) == id:
				best = candidate
				distance = dist
	return best

func _target(source: String, id: String) -> Vector2:
	var box := World.box(_model.skin["zones"][id])
	var center := box.get_center()
	if _world.pick_zone(source, center) == id:
		return center
	for y: int in range(1, 16):
		for x: int in range(1, 16):
			var candidate := box.position + Vector2(x / 16.0, y / 16.0) * box.size
			if _world.pick_zone(source, candidate) == id:
				return candidate
	return Vector2.INF

func _viewport_pos(world_point: Vector2) -> Vector2:
	return _world.get_global_transform_with_canvas() * _world.from_world(world_point)

func _tap_source(id: String) -> bool:
	var p := _source(id)
	if not _check(p.is_finite(), "physical scene hotspot reachable: " + id):
		return false
	_click(_viewport_pos(p))
	return true

func _act(id: String, select_then_button := false) -> bool:
	var rule: Dictionary = _model.interactions[id]
	var source: String = rule["source"]
	var before: Array = _model.run["resolved"].duplicate()
	var old_mistakes: int = _model.run["mistakes"]
	var old_elapsed: float = _model.run["elapsed"]
	if rule.has("choice"):
		await process_frame
		if not _button("Choice_" + id):
			return false
	elif _model.objects[source].get("hudAction", false):
		await process_frame
		if not _button("Object_" + source):
			return false
	elif rule["mode"] == "tap":
		if not _tap_source(source):
			return false
	else:
		var start := _source(source)
		if not _check(start.is_finite(), "physical drag pickup reachable: " + source):
			return false
		var target := _target(source, rule["target"])
		if not _check(target.is_finite(), "authored visible drop zone reachable for " + id):
			return false
		if select_then_button:
			_click(_viewport_pos(start))
			await process_frame
			if not _button("Zone_" + rule["target"]):
				return false
		else:
			_motion(_viewport_pos(start), false)
			_mouse(_viewport_pos(start), true)
			_motion(_viewport_pos(target), true)
			_mouse(_viewport_pos(target), false)
	var duration: float = _model.skin["animations"][rule["animation"]]["durationMs"]
	if rule.get("failure", false):
		if not _check(_model.run["phase"] == "failed" and not _runner._scene_input_free(), "authored fatal input immediately locks native play: " + id):
			return false
		if _model.skin.get("presentation", {}).get("failureReveal", false):
			_check(_model.failure_revealing() and _model.run["failure"].get("rule") == id, "opt-in authored fatal reveal begins")
			_time(duration - 1.0)
			_check(_model.failure_revealing(), "fatal reveal observes authored time")
			_time(1.0)
		else:
			_check(_runner._failure_shown and not _model.failure_revealing(), "fatal result is immediate when selected skin has no reveal")
			_time(duration)
		_check(not _model.failure_revealing() and _model.run["elapsed"] == old_elapsed, "terminal action freezes gameplay time")
		_check(_runner.result_detail()["reason"] == rule["feedback"], "fatal reason preserved exactly")
		return true
	if not _check(_model.run["action"].get("rule") == id, "input resolves original action " + id + ", found " + str(_model.run["action"].get("rule", "–"))):
		return false
	_time(duration - 1.0)
	_check(_model.run["resolved"] == before, "no goal before animation ends: " + id)
	_time(1.0)
	_check(not _model.run["action"].has("rule"), "action finishes once: " + id)
	_check(Rules.has_all(_model.run["resolved"], rule["grants"]), "commits authored grants: " + id)
	if rule["outcome"] != "correct":
		_check(_model.run["resolved"] == before and _model.run["phase"] == "playing", "recoverable authored outcome grants no goals: " + id)
		_check(_model.run["mistakes"] == old_mistakes + (1 if rule["outcome"] == "danger" else 0), "correct mistake effect: " + id)
		if rule["outcome"] == "danger":
			_tested("authored_recoverable_errors")
	return true

func _route(ids: Array) -> bool:
	for id: String in ids:
		if not await _act(id):
			return false
	return true

func _win() -> void:
	if not _check(_model.run["phase"] == "settling" and _model.completed_goals(), "all authored requirements enter authored settling"):
		return
	var completion: Dictionary = _model.rules["completion"]
	var hold := float(completion["settleMs"]) + float(completion.get("observeMs", 0))
	var elapsed: float = _model.run["elapsed"] / 1000.0
	_time(hold - 1.0)
	_check(_signals.is_empty() and _model.run["phase"] == "settling", "observation/cooldown completes before result")
	_time(2000.0)
	_check(_model.run["phase"] == "complete", "completion transitions to complete")
	_check(_signals.size() == 1 and _signals[0][0] == true and is_equal_approx(_signals[0][1], elapsed), "one true finished signal excludes presentation time")
	_time(500.0)
	_check(_signals.size() == 1, "terminal result cannot repeat")
	_tested("original_success_and_finished_signal")

func _failure() -> void:
	if not _check(_model.run["phase"] == "failed" and _signals.is_empty(), "failed phase shows reason before settlement"):
		return
	await process_frame
	if _button("AcknowledgeFailure"):
		_check(_signals.size() == 1 and _signals[0][0] == false and is_equal_approx(_signals[0][1], _model.run["elapsed"] / 1000.0),
			"one false finished signal at frozen active time")
		_tested("original_failure_and_finished_signal")

func _capture(stage: String) -> void:
	if _capture_dir.is_empty():
		return
	await RenderingServer.frame_post_draw
	var shot := root.get_texture().get_image()
	var path := _capture_dir.path_join(_id + "-" + stage + ".png")
	_check(shot != null and not shot.is_empty() and shot.save_png(path) == OK, "visual capture: " + stage)

func _flood_kit() -> void:
	var correct := ["pack-water", "pack-food", "pack-torch", "pack-radio", "pack-whistle"]
	if not await _route(["pack-water", "pack-food", "pack-torch", "pack-radio", "pack-tv-remote"]):
		return
	_check(_model.run["inventory"].size() == 5 and not _model.completed_goals(), "five slots; wrong item is a real carried item")
	_tap_source("whistle")
	_check(_model.run["action"].is_empty() and "背包已满" in _model.notice_text(), "full bag rejects sixth item")
	_tap_source("bag")
	await process_frame
	_check(_runner._inventory_open and _runner.find_child("Slot5", true, false) != null, "bag hit opens five actual slots")
	await _capture("full-bag")
	if not _button("Unpack_water"):
		return
	_check(not _model.enabled("tv-remote") and _model.enabled("water") and "water-packed" not in _model.run["resolved"], "unpack restores pose/input and retracts grant")
	await process_frame
	_check(_runner.find_child("Depart", true, false).disabled, "partial bag cannot depart")
	if not _button("Unpack_tv-remote"):
		return
	var tick_before: float = _model.run["elapsed"]
	_time(250.0)
	_check(_model.run["elapsed"] == tick_before + 250.0, "inventory checks do not pause deadline")
	_runner._close_sheets()
	_runner._update()
	if not await _route([correct[0], correct[4]]):
		return
	_check(_model.run["phase"] == "playing" and not _model.completed_goals(), "must explicitly confirm correct bag before departure")
	await process_frame
	_button("Inventory")
	await process_frame
	_button("Depart")
	await _win()
	_tested("five_slot_pack_unpack_capacity_and_explicit_departure")

	await _open()
	if not await _route(["pack-ceramic-ornament", "pack-tv-remote", "pack-water", "pack-food", "pack-torch"]):
		return
	await process_frame
	_button("Inventory")
	await process_frame
	_button("Depart")
	_check(_model.run["inventoryRejected"] and "陶瓷" in _runner.result_detail()["reason"] and "遥控器" in _runner.result_detail()["reason"], "authored wrong packing reasons survive settlement")
	await _capture("wrong-bag")
	await _failure()

	await _open()
	var empty := Vector2(42, 40)
	_check(_world.pick(empty, true, 15) == "", "empty patch available for misclick")
	_click(_viewport_pos(empty))
	_check(_model.run["elapsed"] == 5000.0, "challenge miss costs five authored seconds")
	_button("Pause")
	_time(2400.0)
	_check(_model.run["elapsed"] == 5000.0, "pause freezes gameplay countdown")
	_runner._toggle_pause()
	_direct_idle(45000.0)
	_check(_runner.result_detail()["reason"] == _model.rules["risk"]["peakFeedback"], "timeout reason matches source")
	await _failure()
	_tested("challenge_miss_pause_and_timeout")

func _corridor() -> void:
	_check(not _model.enabled("inspector"), "inspection locked until all four items stored")
	var before: float = _model.run["elapsed"]
	_click(_viewport_pos(Vector2(42, 40)))
	_check(_model.run["elapsed"] == before, "teaching collection does not penalize empty clicks")
	if not await _route(["box-to-corner", "case-to-fire-access", "store-box"]):
		return
	if not await _act("store-chair", true):
		return
	if not await _route(["store-case", "store-scooter"]):
		return
	_check(_model.enabled("inspector") and "ready-to-check" in _model.run["stages"] and _model.run["phase"] == "playing", "storing is not completing, inspection unlocks at staging commit")
	_direct_idle(49500.0 - float(_model.run["elapsed"]))
	await process_frame
	_button("Object_inspector")
	_check(_model.run["action"].get("rule") == "check-route" and "○" in _runner._inspection(), "walk inspection begins with unchecked segments")
	_time(2000.0)
	_check("✓" in _runner._inspection() and "○" in _runner._inspection(), "authored inspection timestamps mark a subset")
	await _capture("route-inspection")
	_time(2800.0)
	_check("route-checked" in _model.run["resolved"] and _model.run["elapsed"] == 50000.0, "accepted final inspection can finish at deadline")
	await _win()
	_tested("drag_tap_to_place_neutral_returns_and_timed_inspection")
	await _open()
	_direct_idle(50000.0)
	await _failure()

func _lift_wait() -> void:
	if not await _route(["explain-floor-1", "pry", "leave-door", "call"]):
		return
	_check(_model.active_conversation().get("id") == "location", "first authored coaching card opens after the call")
	_check(not _runner._scene_input_free(), "conversation owns scene input")
	await _capture("coaching")
	if not await _route(["guess-location", "report-location", "guess-status", "report-status", "contact-status", "wait", "rush-door", "confirm-wait"]):
		return
	await _win()
	_check(_model.run["mistakes"] == 2, "two recoverable warnings; wrong conversation answers not punitive")
	_tested("coaching_conversation_gates_recoverable_dangers")
	await _open()
	_direct_idle(91000)
	_check(_model.run["phase"] == "playing", "familiar fault has elapsed clock with no rescue deadline")
	_button("Back")
	_check(_signals == [["exited"]], "back emits only exited, no reward")
	_tested("no_invented_failure_or_deadline")

func _well_call() -> void:
	if not await _route(["inspect", "pull-in", "dial-120", "guess-medical", "report-medical", "dial-119", "vague-fire", "report-fire", "back", "approach-after-call", "confirm-perimeter"]):
		return
	await _win()
	_check(_model.run["mistakes"] == 1, "danger is recoverable; only unsafe drop raises mistakes")
	_tested("offline_calls_in_either_order_and_perimeter_confirmation")
	await _open()
	_direct_idle(91000)
	_check(_model.run["phase"] == "playing", "no false deadline")
	_tested("no_invented_failure_or_deadline")

func _quake_cover() -> void:
	if not await _route(["window-error", "early-radio", "lower-and-protect", "enter-cover", "grip-cover"]):
		return
	_check(not _world.in_scene("self-check") and _model.run["stageAges"].get("after-quake", -1) == 0.0, "post-tremor object and timer gated after grip commits")
	_time(3999)
	_check("after-quake" not in _model.run["stages"] and not _world.in_scene("self-check"), "four-second cooldown does not start early")
	_time(1)
	_check("after-quake" in _model.run["stages"] and _world.in_scene("self-check"), "after-quake objects appear with authored stage")
	await _capture("after-quake")
	if not await _route(["early-phone", "check-self", "check-guidance", "inform-family"]):
		return
	await _win()
	_tested("timed_after_quake_and_late_inputs")
	await _open()
	if not await _route(["rush-exit-error", "combined-cover", "grip-cover"]):
		return
	_time(4000)
	if await _route(["check-guidance", "check-self", "inform-family"]):
		await _win()
		_tested("combined_cover_alternate_route")

func _quake_exit() -> void:
	if not await _route(["early-stairs", "lift-error", "inspect-stairs", "wear-shoes", "leave-by-stairs"]):
		return
	_check(_world.in_scene("outside-scene") and not _model.zone_enabled("stairs-route"), "outside scene replaces indoor placement zones")
	await _capture("outside")
	if await _route(["wall-error", "early-report", "reach-assembly", "share-location"]):
		await _win()
		_tested("route_prerequisites_and_scene_swap")

func _collapse() -> void:
	_check(not _model.enabled("trapped-rest"), "resting pose requires head protection")
	if await _route(["move-stone-error", "protect-head", "early-rest", "reduce-dust", "request-help", "tap-signal", "rest-in-place"]):
		await _win()
		_tested("original_in_place_protection_call_signal_and_wait")

func _highground() -> void:
	var effects := _world._effects
	var before := effects.visible_layers(_world._poses)
	_check(before.any(func(effect: Dictionary) -> bool: return effect.get("whenScene", {}).get("asset") == "background"), "lower-stage clipped weather starts on lower scene")
	if not await _route(["enter-flood-error", "reach-higher-level"]):
		return
	var after := effects.visible_layers(_world._poses)
	_check(_world.pose("world-scene")["asset"] == "upstairs-background" and not _model.zone_enabled("high-route"), "upper floor scene and scope replace lower route")
	_check(after.any(func(effect: Dictionary) -> bool: return effect.get("whenScene", {}).get("asset") == "upstairs-background" and not effect.get("apertures", []).is_empty()), "upper-stage weather uses authored painted apertures")
	_check(not after.any(func(effect: Dictionary) -> bool: return effect.get("whenScene", {}).get("asset") == "background"), "no lower-stage rain survives scene transition")
	_check(_model.pack["audio"]["floodWindow"] and _runner._audio._ambient.size() == 2, "independent authored rain and flood PCM loop streams")
	await _capture("upper-room")
	if await _route(["return-lower-error", "early-wait", "contact-rescue", "monitor-updates", "place-water", "signal-from-inside", "wait-at-height"]):
		await _win()
		_tested("authored_upper_floor_apertures_and_calm_audio_layers")

func _car_window() -> void:
	_check(not _world.in_scene("adult-afloat") and not _model.zone_enabled("buoy-grip"), "outside actor and buoy destination start hidden")
	if not await _route(["wait-car-error", "early-exit", "open-window", "release-belt", "exit-window"]):
		return
	_check(not _world.in_scene("adult-inside") and _world.in_scene("adult-afloat") and _model.zone_enabled("buoy-grip"), "correct window exit switches to floating actor and buoy destination")
	await _capture("afloat")
	if await _route(["return-bag-error", "early-signal", "grip-buoy", "signal-afloat"]):
		await _win()
		_tested("belt_and_window_prerequisites_then_buoy_and_signal")

func _lift_contact() -> void:
	_check(not _model.enabled("location-info") and not _model.enabled("people-info") and not _model.zone_enabled("intercom-report"), "reporting props and target gated by contact")
	_direct_idle(310000)
	_check(is_equal_approx(_world._effects.pressure(), .12) and _model.run["phase"] == "playing", "stable lift atmosphere and clock do not invent emergency progression")
	if await _route(["ordinary-button-neutral", "pry-door-error", "crawl-gap-error", "climb-hatch-error", "light-floor", "establish-contact", "report-people", "report-location", "stand-back"]):
		await _win()
		_tested("device_contact_reports_and_stable_waiting")

func _fire_shelter() -> void:
	var effects := _world._effects
	var rates := effects.smoke_rates(0.0)
	_check(is_equal_approx(rates.x, 1.0) and is_equal_approx(rates.y, .22), "initial ceiling smoke and two sources reflect the authored room")
	if not await _route(["early-seal", "close-room-door"]):
		return
	var at: float = _model.run["resolvedAt"]["door-closed"]
	_check(effects.smoke_rates(at).x == 0.0 and effects.smoke_rates(at - 1.0).x == 1.0, "closed door only stops new smoke; existing particles retain source rates")
	var load_before := effects.smoke_load()
	if not await _route(["early-reinforce", "block-door-gaps", "reinforce-seal"]):
		return
	_check(is_equal_approx(effects.smoke_rates(_model.run["elapsed"]).y, .015) and effects.smoke_load() >= load_before, "reinforced gap attenuates while ceiling layer persists")
	_direct_idle(52000.0)
	_check(_runner._time.text == "00:00" and _model.run["phase"] == "playing", "fire-shelter countdown is training pressure, not failure")
	if not await _route(["shelter-family", "early-signal", "contact-fire-service", "signal-rescue"]):
		return
	var layers := effects.visible_layers(_world._poses)
	var beam: Dictionary = {}
	for effect: Dictionary in layers:
		if effect["kind"] == "beam":
			beam = effect["beam"]
	if _check(not beam.is_empty(), "signal activates attached beam"):
		var p := _world.pose(beam["object"])
		var ray := Effects.attached_beam(p, beam)
		_check(((ray[0] + ray[3]) * .5).distance_to(World.local_to_world(p, World.point(beam["origin"]))) < .001, "beam origin moves with true flashlight art lens")
	await _capture("signal-beam")
	_time(3200.0)
	_check(_runner._audio.last_event == "rescue", "original rescue cue scheduled during observation")
	_time(5900.0)
	_check(_signals.size() == 1 and _signals[0][0] == true, "success follows actual signal and observation")
	_tested("original_success_and_finished_signal")
	_tested("warning_clock_persistent_smoke_attached_beam_and_rescue")
	for id: String in ["reopen-door-error", "family-door-error", "corridor-error", "climb-out-error"]:
		await _open()
		if id == "reopen-door-error" and not await _act("close-room-door"):
			return
		if not await _act(id):
			return
		if id == "reopen-door-error":
			await _capture("fatal-result")
		await _failure()
	_tested("all_four_authored_fatal_actions")

func _fire_stairs() -> void:
	_check(not _model.zone_enabled("stairs-route"), "stairs destination not active before door exit")
	if not await _act("exit-flat"):
		return
	_check(_world.pose("world-scene")["asset"] == "corridor-closed" and _model.zone_enabled("stairs-route"), "corridor door state set after exit motion")
	if not await _route(["ordinary-lift-error", "prop-door-error", "smoke-route-error", "use-stairs"]):
		return
	_check(_world.pose("world-scene")["asset"] == "outside" and not _model.zone_enabled("lift-zone"), "outside scene stops indoor dangers")
	await _capture("assembly")
	if await _route(["reach-outside-assembly", "report-fire"]):
		await _win()
		_tested("flat_to_stairs_to_outdoors_then_report")

func _aed() -> void:
	for scenario: String in ["no-shock-advised", "shock-advised"]:
		await _open(scenario)
		var initial := World.local_to_world(_world.pose("helper"), World.pivot(_world.pose("helper")))
		_check(initial.distance_to(Vector2(355, 456)) < 2.0 and _model.pack["skinId"] == "realistic-v2", "retained realistic CPR anatomy and asset set")
		var before: float = _world.pose("helper").get("rotation", 0.0)
		_time(130.0)
		_check(not is_equal_approx(before, _world.pose("helper").get("rotation", 0.0)), "native CPR motion anchored at authored hands")
		if not await _route(["place-device", "power-on", "unsafe-shock", "early-clear", "expose-chest", "dry-chest", "wrong-upper", "attach-upper", "attach-side", "clear-analysis"]):
			return
		var cleared := _world.pose("helper")
		var hand := World.local_to_world(cleared, World.pivot(cleared))
		_check(hand.distance_to(initial) > 100.0 and not World.box(_model.skin["zones"]["chest-zone"]).has_point(hand), "hands move clear of patient before analysis")
		_check(not _world.in_scene("context") and not _world.in_scene("cue") and not _runner._draw_caption.visible, "old floating panels stay hidden; AED notice is scene style")
		_check(_world.pose("pad-upper")["y"] == 405 and _world.pose("pad-side")["x"] == 373, "electrodes use realistic authored coordinates")
		_check("analyzed" not in _model.run["stages"] and _model.run["stageAges"]["analyzed"] == 0.0, "analysis starts only on clear commit")
		await _capture(scenario + "-analysis")
		_time(1599.0)
		_check("analyzed" not in _model.run["stages"] and _world.pose("helper").get("rotation", 0.0) == cleared.get("rotation", 0.0), "CPR idle motion stops during timed no-contact analysis")
		_time(1.0)
		_check("analyzed" in _model.run["stages"], "analysis completes at authored 1600 ms")
		if scenario == "shock-advised":
			if not await _act("clear-shock"):
				return
			_time(899.0)
			_check("shock-ready" not in _model.run["stages"], "900 ms second clear gates shock readiness")
			_time(1.0)
			if not await _route(["deliver-shock", "resume-after-shock"]):
				return
		else:
			if not await _act("unsafe-shock"):
				return
			_check("branch-ready" not in _model.run["resolved"] and "shock-ready" not in _model.run["stages"], "no-shock scenario rejects shock without changing branch")
			if not await _act("resume-without-shock"):
				return
		var contact := World.local_to_world(_world.pose("helper"), World.pivot(_world.pose("helper")))
		_check(contact.distance_to(initial) < .001, "CPR resumes at same authored contact anchor")
		if not await _act("handover-help"):
			return
		await _win()
	_tested("both_realistic_aed_branches_pad_prerequisites_and_clear_delays")
