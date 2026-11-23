extends SceneTree
## Run against imported assets: godot --headless --path godot-prototype --script res://scripts/safety_choices_test.gd

const Scene = preload("res://scenes/safety_choices.tscn")
const Choices = preload("res://scripts/safety_choices.gd")
var _failures: Array[String] = []
var _completed := 0
var _exited := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var paths := [Choices.CONTENT_PATH]
	var extra := "res://data/safety_choices_more.json"
	if not "--network-only" in OS.get_cmdline_user_args() and FileAccess.file_exists(extra):
		paths.append(extra)
	var count := 0
	for path: String in paths:
		var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path))
		for id: String in data.levels:
			await _play(id, path)
			count += 1
	for message in _failures: push_error(message)
	print("Choice levels checked: %d; completed: %d; early exits: %d; failures: %d" % [count, _completed, _exited, _failures.size()])
	quit(0 if _failures.is_empty() else 1)

func _play(id: String, path: String) -> void:
	var data := Choices.read_level(id, path)
	_check(not data.is_empty(), "%s has valid questions" % id)
	if data.is_empty(): return
	if data.get("mode") == "device":
		await _play_device(id, path, data)
		return
	var player := Scene.instantiate() as Control
	player.configure({"id": id, "title": "界面文字排版测试", "content_path": path})
	player.finished.connect(func(won: bool, elapsed: float) -> void:
		_check(won and elapsed >= 0.0, "%s result" % id)
		_completed += 1
	)
	player.exited.connect(func() -> void: _exited += 1)
	root.add_child(player)
	await process_frame
	await process_frame
	var hud := player.get_node("%Interface") as Control
	var actions: Control = player.get_node("%Actions")
	var pause_button := player.get_node("%Pause") as Button
	var resume := player.get_node("%Resume") as Button
	var pause_panel := player.get_node("%Paused") as Control
	var feedback := player.get_node("%Feedback") as Control
	var step := player.get_node("%Step") as Label
	var scroll := player.get_node("%Scroll") as ScrollContainer
	var before := _completed
	var background: Texture2D = player.get_node("%Background").texture
	_check(background != null and is_equal_approx(background.get_width() * 16.0, background.get_height() * 9.0), "%s portrait background loaded" % id)
	pause_button.pressed.emit()
	_check(pause_panel.visible and not hud.is_visible_in_tree(), "%s pause hides question controls" % id)
	var elapsed_before: float = player._elapsed
	await process_frame
	_check(is_equal_approx(player._elapsed, elapsed_before), "%s pause freezes elapsed time" % id)
	resume.pressed.emit()
	_check(hud.is_visible_in_tree(), "%s resumes" % id)
	for i in range(data.rounds.size()):
		var round_data: Dictionary = data.rounds[i]
		var marker := "%d / %d" % [i + 1, data.rounds.size()]
		_check(step.text == marker, "%s round marker %s" % [id, marker])
		_check(actions.get_child_count() == round_data.options.size(), "%s all options shown" % id)
		var correct_index := -1
		var wrong_index := -1
		for j in range(round_data.options.size()):
			var option: Dictionary = round_data.options[j]
			var button := actions.get_child(j) as Button
			_check(button.text == option.label, "%s option copy" % id)
			_check(button.size.y >= 80 and scroll.get_global_rect().encloses(button.get_global_rect()), "%s option touch size and viewport fit" % id)
			_check(button.get_theme_stylebox("normal") is StyleBoxTexture, "%s uses a painted option texture" % id)
			if id == "network-chat-privacy-v1" and i == 0 and "--print-layout" in OS.get_cmdline_user_args():
				print("Choice %d: %s (panel %s, logical %s)" % [j + 1, button.get_global_rect(), scroll.get_global_rect(), root.get_visible_rect().size])
			if option.correct: correct_index = j
			else: wrong_index = j
		var wrong := actions.get_child(wrong_index) as Button
		wrong.pressed.emit()
		_check(feedback.visible and step.text == marker and _completed == before, "%s wrong answer shows feedback without advancing" % id)
		var retry := actions.get_child(0) as Button
		retry.pressed.emit()
		_check(not feedback.visible and step.text == marker, "%s retry restores same round" % id)
		var right := actions.get_child(correct_index) as Button
		right.pressed.emit()
		_check(feedback.visible and _completed == before, "%s correct answer gives review before advancing" % id)
		var advance := actions.get_child(0) as Button
		advance.pressed.emit()
		await process_frame
		await process_frame
	_check(_completed == before + 1, "%s completes exactly once" % id)
	player.prepare_result_backdrop()
	_check(not hud.is_visible_in_tree(), "%s result backdrop has no exercise controls" % id)
	player.queue_free()
	await process_frame

	if path == Choices.CONTENT_PATH:
		var early := Scene.instantiate() as Control
		early.configure({"id": id})
		early.exited.connect(func() -> void: _exited += 1)
		root.add_child(early)
		early.get_node("%Back").pressed.emit()
		_check(_completed == before + 1, "%s exit does not complete a second run" % id)
		early.queue_free()
		await process_frame

func _check(condition: bool, message: String) -> void:
	if not condition: _failures.append(message)

func _play_device(id: String, path: String, data: Dictionary) -> void:
	var player := Scene.instantiate() as Control
	player.configure({"id": id, "title": "界面文字排版测试", "content_path": path})
	player.finished.connect(func(won: bool, elapsed: float) -> void:
		_check(won and elapsed >= 0.0, "%s device result" % id)
		_completed += 1
	)
	root.add_child(player)
	await process_frame
	await process_frame
	var device := player.get_node("%Interface").get_node_or_null("SafetyDevice") as Control
	_check(device != null, "%s device mounted" % id)
	if device == null:
		player.queue_free()
		return
	var row: Control = device.get_node("%DeviceRows")
	var step: Label = device.get_node("%DeviceStep")
	var scroll: ScrollContainer = device.get_node("%DeviceScroll")
	var before := _completed
	var background: Texture2D = player.get_node("%Background").texture
	_check(background != null and background.get_width() * 16 == background.get_height() * 9, "%s has portrait background" % id)
	player.get_node("%Pause").pressed.emit()
	_check(not row.is_visible_in_tree(), "%s device hides on pause" % id)
	player.get_node("%Resume").pressed.emit()
	_check(row.is_visible_in_tree(), "%s device resumes" % id)
	for i in range(data.stages.size()):
		var stage: Dictionary = data.stages[i]
		var advance: Button
		var pending := false
		var marker := "%d / %d" % [i + 1, data.stages.size()]
		for item: Dictionary in stage.controls:
			var button := row.get_node(NodePath(item.id)) as Button
			_check(button.size.y >= 80 and scroll.get_global_rect().encloses(button.get_global_rect()), "%s stage %d control %s fits" % [id, i, item.id])
			_check(button.get_theme_stylebox("normal") is StyleBoxTexture, "%s device uses painted controls" % id)
			if item.kind == "advance": advance = button
			if item.kind in ["mark", "drop"] or (item.kind == "switch" and item.initial != item.goal):
				pending = true
			if OS.get_cmdline_user_args().has("--print-layout"):
				print("%s %s %s center %s" % [id, marker, item.id, button.get_global_rect().get_center()])
		if pending:
			advance.pressed.emit()
			_check(_completed == before and step.text == marker, "%s cannot skip task" % id)
		for item: Dictionary in stage.controls:
			if item.kind == "advance": continue
			var button := row.get_node(NodePath(item.id)) as Button
			match item.kind:
				"mark", "reject", "carry":
					button.pressed.emit()
				"switch":
					if item.initial != item.goal: button.pressed.emit()
				"drop":
					var drag_payload := {"device_evidence": item.accept}
					_check(button._can_drop_data(Vector2.ZERO, drag_payload), "%s accepts its evidence drag" % id)
					_check(not button._can_drop_data(Vector2.ZERO, {"device_evidence": "other"}), "%s rejects unrelated drag" % id)
					button._drop_data(Vector2.ZERO, drag_payload)
			_check(_completed == before and step.text == marker, "%s task stays in its stage" % id)
		advance.pressed.emit()
		await process_frame
		await process_frame
	_check(_completed == before + 1, "%s device completes exactly once" % id)
	player.queue_free()
	await process_frame
