extends SceneTree

const Runner = preload("res://scenes/disaster_runner.tscn")
const Layout = preload("res://scripts/scene_layout.gd")
var _fails := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var view := _spawn("rain-street-preparation-v1")
	var model: RefCounted = view._sim
	var route := []
	view.finished.connect(func(won: bool, seconds: float) -> void: route.append([won, seconds]))
	_check(model.rules.goals.size() == 7 and model.remaining() == 50000.0, "street is the original seven-goal 50-second challenge")
	_check(model.act("", "", "tap") == "wrong" and model.penalty == 5000.0, "a miss subtracts five seconds")
	for action: Dictionary in model.rules.actions:
		var rect := Layout.rect(view._skin.sprites[action.source].box)
		var match_point := _find_source(view, action.source, rect)
		_check(match_point != Vector2.INF, "original mask has a reachable point: " + action.source)
		_tap(view, match_point)
		_check(model.pending.get("goal") == action.goal, "GUI dispatch accepted original mask: " + action.goal)
		_advance(view, 800)
	_check(model.goals.size() == 7 and model.phase == "reveal", "all street goals committed")
	_advance(view, 700)
	_check(route == [[true, 10.6]], "winner reports elapsed plus penalty before the reveal")
	_remove(view)
	view = _spawn("rain-street-preparation-v1")
	_advance(view, 50000)
	_check(view._terminal and view._sim.phase == "failed", "time-out cannot earn a reward")
	_remove(view)
	view = _spawn("flood-house-response-v1")
	model = view._sim
	_check(model.rules.goals.size() == 7 and model.remaining() == 120000.0, "actual shipped flood pack goals and 120 seconds")
	route = []
	view.finished.connect(func(won: bool, seconds: float) -> void: route.append([won, seconds]))
	var keys := ["approach", "power-off", "rescue-call", "pack-water", "pack-light", "assemble-panel", "reach-roof"]
	var tests := {}
	for action: Dictionary in model.rules.actions: tests[action.id] = action
	_check(model.act("phone", "person", "drop") == "notice" and model.goals.is_empty(), "flood prerequisites prevent early reward")
	for id: String in keys:
		var action: Dictionary = tests[id]
		var source_rect: Rect2 = view._pose(action.source).box
		var source := _find_source(view, action.source, source_rect)
		_check(source != Vector2.INF, "visible alpha point for flood source: " + action.source)
		if action.input == "tap":
			_tap(view, source)
		else:
			var dest: Rect2 = view._pose(action.target).box if view._skin.sprites.has(action.target) else Layout.rect(view._skin.zones[action.target].box)
			var target := _find_target(view, action.source, action.target, dest)
			_check(target != Vector2.INF, "authored flood destination reachable: " + action.target)
			_drag(view, source, target)
		_check(model.pending.get("id") == id, "GUI gesture starts the authored flood action: " + id)
		_advance(view, int(action.duration))
	_advance(view, 700)
	_check(model.phase == "complete" and route.size() == 1 and route[0][0] == true, "flood win reports only after final exit and reveal")
	_remove(view)
	view = _spawn("flood-house-response-v1")
	model = view._sim
	var escaped := [false]
	view.exited.connect(func() -> void: escaped[0] = true)
	view._take(model.act("person", "roof", "drop"))
	view._resume()
	_check(escaped[0] and model.phase == "evacuated" and model.goals.is_empty(), "early safe exit cannot grant flowers")
	_remove(view)
	view = _spawn("flood-house-response-v1")
	model = view._sim
	view._take(model.act("person", "wire", "drop"))
	_check(model.phase == "failed", "hazard outcome is retained")
	_remove(view)
	await process_frame
	if _fails == 0: print("PASS: both disaster scenes, exact hit geometry, seven goals, timer, safe exit and failure")
	quit(_fails)

func _spawn(id: String) -> Control:
	var view := Runner.instantiate() as Control
	view.configure({"id": id})
	root.add_child(view)
	view.set_process(false)
	view.audio_muted = true
	return view

func _remove(view: Control) -> void:
	root.remove_child(view)
	view.queue_free()

func _advance(view: Control, ms: int) -> void:
	var left := ms
	while left > 0:
		var tick := mini(left, 100)
		view._take(view._sim.advance(float(tick)))
		left -= tick

func _find_source(view: Control, id: String, rect: Rect2) -> Vector2:
	for y in range(roundi(rect.position.y) + 2, roundi(rect.end.y), 3):
		for x in range(roundi(rect.position.x) + 2, roundi(rect.end.x), 3):
			var p := Vector2(x + 0.5, y + 0.5)
			var screen: Vector2 = view._tx * p
			if Rect2(0, 92, 576, 922).has_point(screen) and view._hit(view._tx.affine_inverse() * screen) == id: return p
	return Vector2.INF

func _find_target(view: Control, source: String, id: String, rect: Rect2) -> Vector2:
	if view._target(rect.get_center(), source) == id: return rect.get_center()
	for y in range(roundi(rect.position.y) + 4, roundi(rect.end.y), 6):
		for x in range(roundi(rect.position.x) + 4, roundi(rect.end.x), 6):
			var p := Vector2(x, y)
			var screen: Vector2 = view._tx * p
			if Rect2(0, 92, 576, 922).has_point(screen) and view._target(p, source) == id: return p
	return Vector2.INF

func _tap(view: Control, point: Vector2) -> void:
	if not point.is_finite(): return
	_mouse(view, point, true)
	_mouse(view, point, false)

func _drag(view: Control, source: Vector2, target: Vector2) -> void:
	if not source.is_finite() or not target.is_finite(): return
	_mouse(view, source, true)
	var motion := InputEventMouseMotion.new()
	motion.position = view._tx * target
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	view._gui_input(motion)
	_mouse(view, target, false)

func _mouse(view: Control, point: Vector2, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.position = view._tx * point
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	view._gui_input(event)

func _check(condition: bool, message: String) -> void:
	if not condition:
		printerr("FAIL: " + message)
		_fails += 1
