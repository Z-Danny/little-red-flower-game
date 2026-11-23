extends SceneTree

const Player = preload("res://scenes/scene_actions.tscn")
const Model = preload("res://scripts/scene_actions_rules.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
const CONTENT := [
	["res://data/scene_actions.json", "res://data/scene_actions_skin.json"],
	["res://data/scene_actions_extra.json", "res://data/scene_actions_extra_skin.json"],
]
var _failures := 0
var _finish_count := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var invalid := Model.new({"items": [{"id": "x", "needs": ["y"]}, {"id": "y", "needs": ["x"]}]})
	_check(not invalid.remaining_dependencies_valid(), "cycles are rejected")
	var level_count := 0
	for pair: Array in CONTENT:
		var levels: Dictionary = Catalog.read_json(pair[0]).levels
		var visuals: Dictionary = Catalog.read_json(pair[1]).levels
		_check(levels.size() == visuals.size(), "every rule has a matching skin")
		level_count += levels.size()
		for id: String in levels:
			await _run_level(id, pair, levels[id].items, visuals[id].has("intro"))
	_check(_finish_count == level_count, "one win signal per scene")
	if _failures == 0:
		print("PASS: %d scenic levels, intros, touch dragging, tap-to-place, wrong recovery, dependency, unique completion" % level_count)
	quit(_failures)

func _run_level(id: String, pair: Array, actions: Array, has_intro: bool) -> void:
	var player := Player.instantiate()
	player.configure({"id": id, "title": "安全练习", "content_path": pair[0], "skin_path": pair[1]})
	player.finished.connect(func(won: bool, elapsed: float) -> void:
		_check(won and elapsed >= 0.0, "win emits elapsed time")
		_finish_count += 1
	)
	root.add_child(player)
	await process_frame
	if not is_instance_valid(player._board):
		_check(false, "scene opens: " + id)
		player.queue_free()
		return
	if has_intro:
		_check(is_instance_valid(player._intro_layer) and not player._board.visible, "intro visible: " + id)
		_tap(player, Vector2(479, 813))
		_check(not is_instance_valid(player._intro_layer) and player._board.visible, "intro skip activates the board: " + id)
		await process_frame
	for label: Label in player.find_children("*", "Label", true, false):
		if label.is_visible_in_tree():
			_check(label.get_visible_line_count() == label.get_line_count(), "clues fit the card: " + id + " " + label.text)
	player._reduce_motion = true
	var first: Dictionary = actions[0]
	if first.get("mode", "drag") == "drag" and player._targets.size() > 1:
		var first_box: Rect2 = player._subjects[first.id].get_rect()
		var wrong: String = Array(player._targets.keys()).filter(func(zone: String) -> bool: return zone != first.zone)[0]
		var wrong_pos: Vector2 = player._targets[wrong].get_rect().get_center()
		_drag(player, first_box.get_center(), wrong_pos)
		_check(player._run.completed.is_empty() and player._subjects[first.id].position == first_box.position, "wrong drop resets and keeps progress: " + id)
	if id == "campus-playground-check-v1":
		var boy: Vector2 = player._subjects["boy"].get_rect().get_center()
		_drag(player, boy, player._targets["warmup"].get_rect().get_center())
		_check(player._run.completed.is_empty() and player._notice.text.contains("先清理"), "student waits for both risk controls")
	for i in actions.size():
		var item: Dictionary = actions[i]
		var begin: Vector2 = player._subjects[item.id].get_rect().get_center()
		if item.get("mode", "drag") == "tap":
			_tap(player, begin)
		else:
			var end: Vector2 = player._targets[item.zone].get_rect().get_center()
			if i == 1:
				_tap(player, begin)
				_tap(player, end)
			else:
				_drag(player, begin, end)
		await create_timer(0.18).timeout
		_check(player._run.completed.has(item.id), "touch placed " + item.id + " in " + id)
	_check(player._finish_button.visible, "conclusion appears after every action in " + id)
	player._finish_button.pressed.emit()
	player._finish_button.pressed.emit()
	player.queue_free()
	await process_frame

func _tap(player: Control, point: Vector2) -> void:
	_touch(player, point, true)
	_touch(player, point, false)

func _drag(player: Control, origin: Vector2, target: Vector2) -> void:
	_touch(player, origin, true)
	var move := InputEventScreenDrag.new()
	move.position = player._design.get_global_transform_with_canvas() * target
	root.push_input(move, true)
	_touch(player, target, false)

func _touch(player: Control, point: Vector2, pressed: bool) -> void:
	var event := InputEventScreenTouch.new()
	event.pressed = pressed
	event.position = player._design.get_global_transform_with_canvas() * point
	root.push_input(event, true)

func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures += 1
		printerr("FAIL: " + message)
