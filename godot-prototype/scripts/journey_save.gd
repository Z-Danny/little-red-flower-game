extends RefCounted
## Keep the original Godot prototype save path and the oil-fire section. The
## web edition's separate player archive is not read or modified here.

const SAVE_FILE := "user://prototype-progress-v1.cfg"

var _path: String
var _config := ConfigFile.new()

func _init(path: String = SAVE_FILE) -> void:
	_path = path
	var error := _config.load(path)
	if error != OK and error != ERR_FILE_NOT_FOUND:
		_config = ConfigFile.new()
		push_warning("Could not read Godot progress (%s)." % error_string(error))

static func score_for(elapsed_seconds: float, reference_seconds: float, fixed_reward: int = 0) -> int:
	if not is_finite(elapsed_seconds) or elapsed_seconds < 0.0:
		return 0
	if fixed_reward >= 1 and fixed_reward <= 3:
		return fixed_reward
	if not is_finite(reference_seconds) or reference_seconds <= 0.0:
		return 0
	if elapsed_seconds <= reference_seconds * 0.5:
		return 3
	if elapsed_seconds <= reference_seconds * 0.8:
		return 2
	return 1

func flowers_for(level_id: String) -> int:
	var value: Variant = _config.get_value(level_id, "flowers", 0)
	if not (value is int):
		return 0
	return clampi(value, 0, 3)

func total(level_ids: Array[String]) -> int:
	var flowers := 0
	for id in level_ids:
		flowers += flowers_for(id)
	return flowers

func claim(level_id: String, elapsed_seconds: float, reference_seconds: float, fixed_reward: int = 0) -> Dictionary:
	var score := score_for(elapsed_seconds, reference_seconds, fixed_reward)
	var previous := flowers_for(level_id)
	var award := maxi(0, score - previous)
	if score == 0 or level_id.is_empty():
		return {"score": 0, "delta": 0, "best": previous, "saved": false}
	var best: Variant = _config.get_value(level_id, "best_seconds", INF)
	if not (best is float or best is int) or not is_finite(float(best)) or float(best) < 0.0:
		best = INF
	_config.set_value(level_id, "flowers", maxi(score, previous))
	if fixed_reward == 0:
		_config.set_value(level_id, "best_seconds", minf(float(best), elapsed_seconds))
	var error := _write(_config)
	if error != OK:
		push_warning("Could not write Godot progress (%s)." % error_string(error))
	return {
		"score": score,
		"delta": award,
		"best": flowers_for(level_id),
		"saved": error == OK and (not OS.has_feature("web") or OS.is_userfs_persistent()),
	}

func reset() -> Error:
	# Only the current Godot file. Keep settings, downloaded art and Web-edition
	# player archives separate. Commit to memory only after the write succeeds.
	var empty := ConfigFile.new()
	var error := _write(empty)
	if error == OK: _config = empty
	return error

func _write(config: ConfigFile) -> Error:
	var error := config.save(_path + ".tmp")
	if error == OK: error = DirAccess.rename_absolute(_path + ".tmp", _path)
	return error
