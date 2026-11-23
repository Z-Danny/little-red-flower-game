extends RefCounted
## Page layout positions use Godot logical pixels. Optional text keeps its original whitespace.

const FILE := "res://data/page_layout_overrides.json"
const VERSION := 1
const MIN_COORDINATE := -2147483648
const MAX_COORDINATE := 2147483647

var _path: String
var _pages: Dictionary = {}

func _init(path: String = FILE) -> void:
	_path = path
	var loaded := _read()
	if loaded.error == OK:
		_pages = loaded.pages
	else:
		push_warning("Could not read page layout overrides (%s)." % error_string(loaded.error))

func page(id: String) -> Dictionary:
	var saved: Dictionary = _pages.get(id, {})
	return saved.duplicate(true)

func save_page(id: String, overrides: Dictionary, expected: Dictionary) -> Error:
	if not _valid_page_id(id) or not _valid_page(overrides) or not _valid_page(expected):
		return ERR_INVALID_PARAMETER

	# Hold the reservation across the conflict check and same-filesystem rename.
	var lock_path := _path + ".lock"
	var error := DirAccess.make_dir_absolute(lock_path)
	if error != OK:
		return ERR_BUSY if DirAccess.dir_exists_absolute(lock_path) else error
	var temporary := lock_path.path_join("pages.tmp")
	error = _save_locked(id, overrides, expected, temporary)
	if FileAccess.file_exists(temporary):
		DirAccess.remove_absolute(temporary)
	DirAccess.remove_absolute(lock_path)
	return error

func _save_locked(id: String, overrides: Dictionary, expected: Dictionary, temporary: String) -> Error:
	var loaded := _read()
	if loaded.error != OK:
		return loaded.error
	var latest: Dictionary = loaded.pages
	if latest.get(id, {}) != expected:
		return ERR_BUSY
	if overrides == expected:
		_pages = latest
		return OK
	if overrides.is_empty():
		latest.erase(id)
	else:
		latest[id] = overrides.duplicate(true)
	var write_result := _write(latest, temporary)
	if write_result == OK:
		_pages = latest
	return write_result

func _write(pages: Dictionary, temporary: String) -> Error:
	var serialized := {}
	var ids := pages.keys()
	ids.sort()
	for id: String in ids:
		var overrides: Dictionary = pages[id]
		var entries := {}
		var paths := overrides.keys()
		paths.sort()
		for path: String in paths:
			var entry: Dictionary = overrides[path]
			var offset: Vector2i = entry.offset
			var next := {"offset": {"x": offset.x, "y": offset.y}}
			if entry.has("text"):
				next["text"] = entry.text
			entries[path] = next
		serialized[id] = entries
	var output := FileAccess.open(temporary, FileAccess.WRITE)
	if output == null:
		return FileAccess.get_open_error()
	var document := {"schema_version": VERSION, "pages": serialized}
	var written := output.store_string(JSON.stringify(document, "  ", false) + "\n")
	output.flush()
	var error := output.get_error()
	output.close()
	if not written or error != OK:
		return ERR_FILE_CANT_WRITE if error == OK else error
	return DirAccess.rename_absolute(temporary, _path)

func _read() -> Dictionary:
	if not FileAccess.file_exists(_path):
		return {"error": OK, "pages": {}}
	var input := FileAccess.open(_path, FileAccess.READ)
	if input == null:
		return {"error": FileAccess.get_open_error()}
	var text := input.get_as_text()
	input.close()
	var invalid := {"error": ERR_FILE_CORRUPT}
	var json := JSON.new()
	if json.parse(text) != OK or not (json.data is Dictionary):
		return invalid
	var document: Dictionary = json.data
	var version: Variant = document.get("schema_version")
	var encoded: Variant = document.get("pages")
	if document.size() != 2 or not (version is int or version is float) or version != VERSION or not (encoded is Dictionary):
		return invalid
	var parsed := {}
	for id: String in encoded:
		var overrides: Variant = _decode_page(encoded[id])
		if not _valid_page_id(id) or overrides == null:
			return invalid
		parsed[id] = overrides
	return {"error": OK, "pages": parsed}

static func _decode_page(encoded: Variant) -> Variant:
	if not (encoded is Dictionary):
		return null
	var decoded := {}
	for path: String in encoded:
		var entry: Variant = encoded[path]
		if not _valid_node_path(path) or not _valid_entry(entry):
			return null
		var position: Variant = entry.get("offset")
		if not (position is Dictionary) or position.size() != 2:
			return null
		var x: Variant = position.get("x")
		var y: Variant = position.get("y")
		if not _valid_coordinate(x) or not _valid_coordinate(y):
			return null
		var next := {"offset": Vector2i(int(x), int(y))}
		if entry.has("text"):
			next["text"] = entry.text
		decoded[path] = next
	return decoded

static func _valid_page(overrides: Dictionary) -> bool:
	for path: Variant in overrides:
		var entry: Variant = overrides[path]
		if not (path is String) or not _valid_node_path(path) or not _valid_entry(entry):
			return false
		if not (entry.get("offset") is Vector2i):
			return false
	return true

static func _valid_entry(entry: Variant) -> bool:
	if not (entry is Dictionary) or not entry.has("offset"):
		return false
	if entry.has("text"):
		return entry.size() == 2 and entry.text is String
	return entry.size() == 1

static func _valid_page_id(id: String) -> bool:
	return not id.strip_edges().is_empty()

static func _valid_node_path(path: String) -> bool:
	if path.is_empty() or path.contains(":"):
		return false
	for segment in path.split("/"):
		if segment in ["", ".", ".."]:
			return false
	return true

static func _valid_coordinate(number: Variant) -> bool:
	if not (number is int or number is float):
		return false
	return number >= MIN_COORDINATE and number <= MAX_COORDINATE and number == floor(number)
