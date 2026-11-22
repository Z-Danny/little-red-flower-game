extends SceneTree

const Save = preload("res://scripts/journey_save.gd")
var _failures := 0

func _initialize() -> void:
	var path := "user://migration-save-test-%d.cfg" % OS.get_process_id()
	_check(Save.score_for(25.0, 50.0) == 3, "25 seconds earns three flowers")
	_check(Save.score_for(25.001, 50.0) == 2, "above 25 seconds earns two")
	_check(Save.score_for(40.0, 50.0) == 2 and Save.score_for(40.001, 50.0) == 1, "40-second boundary")
	_check(Save.score_for(-1.0, 50.0) == 0 and Save.score_for(INF, 50.0) == 0, "invalid scoring inputs are ignored")
	_check(Save.score_for(1000.0, 0.0, 3) == 3, "untimed CPR awards no speed penalty")
	var save := Save.new(path)
	_check(save.flowers_for("oil-fire") == 0, "new save is empty")
	var result: Dictionary = save.claim("oil-fire", 46.0, 50.0)
	_check(result.delta == 1 and result.saved and result.best == 1, "first success persists")
	save = Save.new(path)
	_check(save.flowers_for("oil-fire") == 1, "stored progress reopens")
	result = save.claim("oil-fire", 20.0, 50.0)
	_check(result.delta == 2 and result.saved and result.best == 3, "better score grants only the difference")
	result = save.claim("oil-fire", 34.0, 50.0)
	_check(result.delta == 0 and result.best == 3, "lower replay preserves the best reward")
	result = save.claim("charging-bedroom", 51.0, 50.0)
	_check(result.delta == 1 and result.saved and result.best == 1, "next level keeps a separate score")
	var read_back := Save.new(path)
	_check(read_back.flowers_for("oil-fire") == 3 and read_back.total(["oil-fire", "charging-bedroom"]) == 4, "new reader preserves both levels")
	DirAccess.remove_absolute(path)
	if _failures == 0:
		print("PASS: prototype score thresholds, untimed reward and multi-level delta saves")
	quit(_failures)

func _check(condition: bool, message: String) -> void:
	if not condition:
		printerr("FAIL: " + message)
		_failures += 1
