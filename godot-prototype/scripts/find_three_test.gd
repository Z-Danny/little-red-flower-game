extends SceneTree

const Player = preload("res://scenes/find_three.tscn")
const Cases := {
	"campus-canteen-check-v1": ["water", "soap", "tissue"],
	"home-food-storage-v1": ["yoghurt", "milk", "cheese", "dumplings", "peas", "fish", "rice", "noodles", "oats"],
	"food-table-check-v1": ["serving_chopsticks", "ladle", "plate", "chopsticks", "spoon", "bowl"],
}

var _failures := 0
var _finished := 0
var _exited := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	for id: String in Cases:
		var scene := Player.instantiate()
		scene.configure({"id": id, "title": id, "muted": true})
		scene.finished.connect(func(won: bool, elapsed: float) -> void:
			_check(won and elapsed >= 0.0, "valid completion")
			_finished += 1
		)
		scene.exited.connect(func() -> void: _exited += 1)
		root.add_child(scene)
		await process_frame
		if scene._run == null:
			_check(false, "runner builds: " + id)
			scene.queue_free()
			continue
		_check(scene._pieces.size() == 20, "twenty distinct props: " + id)
		_check(scene.result_detail().get("safe_art") is Texture2D, "runtime background loads: " + id)
		var wrong: Array[String] = []
		for prop: String in scene._pieces.keys():
			if not Cases[id].has(prop):
				wrong.append(prop)
		for i in range(5):
			_press(scene, "Item_" + wrong[i])
		_press(scene, "Item_" + Cases[id][0])
		_check(scene._run.tray.size() == 5 and not scene._run.tray.has(Cases[id][0]), "full tray refuses a sixth piece")
		_check(scene._notice.text.contains("满"), "full tray shows recovery instruction")
		_press(scene, "Slot1")
		_check(scene._pieces[wrong[0]].visible and scene._run.tray.size() == 4, "tray pick restores object to original board")
		scene._set_pause(true)
		_press(scene, "Item_" + Cases[id][0])
		_check(scene._run.tray.size() == 4, "pause freezes the board")
		scene._set_pause(false)
		scene._restart()
		_check(scene._run.tray.is_empty() and scene._run.recipe_index == 0, "restart resets collection")
		for target: String in Cases[id]:
			_press(scene, "Item_" + target)
		_check(scene._run.done() and scene._run.tray.is_empty(), "every set combines and clears its items: " + id)
		if id == "campus-canteen-check-v1":
			_press(scene, "Action_dry")
			_check(scene._sequence_index == 0, "out-of-order handwashing action is reversible")
			_press(scene, "Action_wet")
			_press(scene, "Action_scrub")
			_press(scene, "Action_dry")
			_check(scene._sequence_index == 3, "handwashing sequence completes")
			scene._restart()
			_check(scene._run.recipe_index == 0 and scene._sequence_index == 0 and scene._board.visible, "restarting from sequence/finish clears both UI panels")
			await process_frame
			for target: String in Cases[id]:
				_press(scene, "Item_" + target)
			_press(scene, "Action_wet")
			_press(scene, "Action_scrub")
			_press(scene, "Action_dry")
		_press(scene, "FinishPractice")
		_press(scene, "FinishPractice")
		scene.queue_free()
		await process_frame
	_check(_finished == 3 and _exited == 0, "one result per finished practice")
	if _failures == 0:
		print("PASS: 3 find-three levels, full tray, undo, pause, replay, wash order, unique completion signal")
	quit(_failures)

func _press(scene: Node, button_name: String) -> void:
	var button := scene.find_child(button_name, true, false) as Button
	if button == null:
		_check(false, "button exists: " + button_name)
	else:
		button.pressed.emit()

func _check(condition: bool, message: String) -> void:
	if not condition:
		printerr("FAIL: " + message)
		_failures += 1
