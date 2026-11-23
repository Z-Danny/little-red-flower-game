extends RefCounted
## Per-level overrides authored in the map editor. Coordinates use source image pixels.

const FILE := "res://data/map_positions.json"
const VERSION := 1
const MAX_COORDINATE := 2147483647

var _path: String
var _positions: Dictionary

func _init(path: String = FILE) -> void:
	_path = path
	var loaded := _read()
	_positions = loaded.positions
	if loaded.error != OK:
		push_warning("Could not read map positions (%s)." % error_string(loaded.error))

func override_for(id: String) -> Variant:
	return _positions.get(id)

func position_for(id: String, fallback: Vector2i) -> Vector2i:
	return _positions.get(id, fallback)

func save(changes: Dictionary, expected: Dictionary) -> Error:
	for id: Variant in changes:
		var position: Variant = changes[id]
		if not (id is String) or id.is_empty() or not expected.has(id):
			return ERR_INVALID_PARAMETER
		var previous: Variant = expected[id]
		if previous != null and not (previous is Vector2i):
			return ERR_INVALID_PARAMETER
		if position != null and (not (position is Vector2i) or position.x < 0 or position.y < 0):
			return ERR_INVALID_PARAMETER
	if changes.is_empty():
		return OK

	# Reserve the read/merge/replace operation across game instances. The temp
	# file sits next to the target on the same filesystem for the final rename.
	var lock_path := _path + ".lock"
	var error := DirAccess.make_dir_absolute(lock_path)
	if error != OK:
		return ERR_BUSY if DirAccess.dir_exists_absolute(lock_path) else error
	var temp_path := lock_path.path_join("positions.tmp")
	error = _save_locked(changes, expected, temp_path)
	if FileAccess.file_exists(temp_path):
		DirAccess.remove_absolute(temp_path)
	DirAccess.remove_absolute(lock_path)
	return error

func _save_locked(changes: Dictionary, expected: Dictionary, temp_path: String) -> Error:
	var loaded := _read()
	if loaded.error != OK:
		return loaded.error
	var latest: Dictionary = loaded.positions
	for id: String in changes:
		if latest.get(id) != expected[id]:
			return ERR_BUSY
		if changes[id] == null:
			latest.erase(id)
		else:
			latest[id] = changes[id]

	var ordered := {}
	var ids := latest.keys()
	ids.sort()
	for id: String in ids:
		var position: Vector2i = latest[id]
		ordered[id] = {"x": position.x, "y": position.y}
	var output := FileAccess.open(temp_path, FileAccess.WRITE)
	if output == null:
		return FileAccess.get_open_error()
	var document := {"schema_version": VERSION, "positions": ordered}
	var written := output.store_string(JSON.stringify(document, "  ", false) + "\n")
	output.flush()
	var error := output.get_error()
	output.close()
	if not written or error != OK:
		return ERR_FILE_CANT_WRITE if error == OK else error
	var replaced := DirAccess.rename_absolute(temp_path, _path)
	if replaced == OK:
		_positions = latest
	return replaced

func _read() -> Dictionary:
	if not FileAccess.file_exists(_path):
		return {"error": OK, "positions": {}}
	var input := FileAccess.open(_path, FileAccess.READ)
	if input == null:
		return {"error": FileAccess.get_open_error(), "positions": {}}
	var text := input.get_as_text()
	input.close()
	var invalid := {"error": ERR_FILE_CORRUPT, "positions": {}}
	var json := JSON.new()
	if json.parse(text) != OK or not (json.data is Dictionary):
		return invalid
	var document: Dictionary = json.data
	var version: Variant = document.get("schema_version")
	var positions: Variant = document.get("positions")
	if document.size() != 2 or not (version is float or version is int) or version != VERSION or not (positions is Dictionary):
		return invalid
	var parsed := {}
	for id: String in positions:
		var entry: Variant = positions[id]
		if id.is_empty() or not (entry is Dictionary) or entry.size() != 2:
			return invalid
		if not _valid_coordinate(entry.get("x")) or not _valid_coordinate(entry.get("y")):
			return invalid
		parsed[id] = Vector2i(int(entry.x), int(entry.y))
	return {"error": OK, "positions": parsed}

func _valid_coordinate(value: Variant) -> bool:
	if not (value is int or value is float):
		return false
	return is_finite(value) and value >= 0 and value <= MAX_COORDINATE and value == floor(value)
