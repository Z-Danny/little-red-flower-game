extends SceneTree

const MapPositions = preload("res://scripts/map_positions.gd")

var _failures := 0

func _initialize() -> void:
	var path := "user://map-positions-test-%d-%d.json" % [OS.get_process_id(), Time.get_ticks_usec()]
	var first := MapPositions.new(path)
	var second := MapPositions.new(path)
	var original := Vector2i(11, 22)
	var edited := Vector2i(121, 240)
	_check(first.position_for("campus-1", original) == original, "missing overrides retain the original map layout")
	_check(first.save({"campus-1": edited}, {"campus-1": null}) == OK, "a new coordinate can be recorded")
	_check(MapPositions.new(path).position_for("campus-1", original) == edited, "recorded coordinates survive reopening")
	_check(second.save({"home-1": Vector2i(90, 80)}, {"home-1": null}) == OK, "a stale editor can save a different point")
	_check(second.override_for("campus-1") == edited, "saving another point merges the latest file")
	_check(first.save({"home-1": Vector2i(10, 20)}, {"home-1": null}) == ERR_BUSY, "concurrent edits to the same point conflict")
	_check(first.save({"campus-1": null}, {"campus-1": edited}) == OK, "reset removes the manual override")
	_check(first.position_for("campus-1", original) == original, "reset restores the original coordinates")
	_check(MapPositions.new(path).override_for("home-1") == Vector2i(90, 80), "conflicts and resets preserve other points")
	_check(DirAccess.make_dir_absolute(path + ".lock") == OK, "the write reservation can be established")
	_check(first.save({"campus-1": original}, {"campus-1": null}) == ERR_BUSY, "an in-flight write rejects a second writer")
	DirAccess.remove_absolute(path + ".lock")
	var malformed := '{"schema_version":1,"positions":{"campus-1":{"x":12.5,"y":20}}}'
	var output := FileAccess.open(path, FileAccess.WRITE)
	if output != null:
		output.store_string(malformed)
		output.close()
	_check(first.save({"home-1": null}, {"home-1": first.override_for("home-1")}) == ERR_FILE_CORRUPT, "malformed coordinates block writes")
	_check(FileAccess.get_file_as_string(path) == malformed, "a malformed source is left intact")
	_check(not DirAccess.dir_exists_absolute(path + ".lock"), "a failed write releases its reservation")
	DirAccess.remove_absolute(path)
	if _failures == 0:
		print("PASS: map coordinate overrides persist, merge, reset, and reject conflicting or malformed writes")
	quit(_failures)

func _check(condition: bool, message: String) -> void:
	if not condition:
		printerr("FAIL: " + message)
		_failures += 1
