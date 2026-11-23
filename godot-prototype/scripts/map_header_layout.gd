extends RefCounted
## Manual map header values use the project's logical pixels.

const FILE := "res://data/map_header_layout.json"
const TOP_MIN := 0
const TOP_MAX := 48
const HEIGHT_MIN := -24
const HEIGHT_MAX := 32
const VERSION := 1
const ICON_IDS := ["back", "home", "progress"]
const ICON_OFFSET_LIMIT := 2048

var value := Vector2i.ZERO
var icons: Dictionary = {}
var _path: String

func _init(path: String = FILE) -> void:
	_path = path
	var loaded := _read()
	if loaded.error == OK:
		value = loaded.value
		icons = loaded.icons
	else:
		push_warning("Could not read map header layout (%s)." % error_string(loaded.error))

func save(layout: Vector2i, expected: Vector2i, icon_offsets: Variant = null, expected_icons: Variant = null) -> Error:
	if not _valid_integer(layout.x, TOP_MIN, TOP_MAX) or not _valid_integer(layout.y, HEIGHT_MIN, HEIGHT_MAX):
		return ERR_INVALID_PARAMETER
	if (icon_offsets != null and not _valid_icons(icon_offsets)) or (expected_icons != null and not _valid_icons(expected_icons)):
		return ERR_INVALID_PARAMETER

	# Hold the reservation across the conflict check and same-filesystem rename.
	var lock_path := _path + ".lock"
	var error := DirAccess.make_dir_absolute(lock_path)
	if error != OK:
		return ERR_BUSY if DirAccess.dir_exists_absolute(lock_path) else error
	var temporary := lock_path.path_join("layout.tmp")
	error = _save_locked(layout, expected, icon_offsets, expected_icons, temporary)
	if FileAccess.file_exists(temporary):
		DirAccess.remove_absolute(temporary)
	DirAccess.remove_absolute(lock_path)
	return error

func _save_locked(layout: Vector2i, expected: Vector2i, icon_offsets: Variant, expected_icons: Variant, temporary: String) -> Error:
	var loaded := _read()
	if loaded.error != OK:
		return loaded.error
	var current_icons: Dictionary = loaded.icons
	if loaded.value != expected or (expected_icons != null and current_icons != expected_icons):
		return ERR_BUSY
	var next_icons: Dictionary = current_icons if icon_offsets == null else icon_offsets.duplicate()
	if layout == expected and next_icons == current_icons:
		value = layout
		icons = next_icons
		return OK
	var document := {"schema_version": VERSION, "top": layout.x, "height_offset": layout.y}
	if not next_icons.is_empty():
		var entries := {}
		for id: String in ICON_IDS:
			if next_icons.has(id):
				var offset: Vector2i = next_icons[id]
				entries[id] = {"x": offset.x, "y": offset.y}
		document["icons"] = entries
	var output := FileAccess.open(temporary, FileAccess.WRITE)
	if output == null:
		return FileAccess.get_open_error()
	var written := output.store_string(JSON.stringify(document, "  ", false) + "\n")
	output.flush()
	var error := output.get_error()
	output.close()
	if not written or error != OK:
		return ERR_FILE_CANT_WRITE if error == OK else error
	var replaced := DirAccess.rename_absolute(temporary, _path)
	if replaced == OK:
		value = layout
		icons = next_icons
	return replaced

func _read() -> Dictionary:
	if not FileAccess.file_exists(_path):
		return {"error": OK, "value": Vector2i.ZERO, "icons": {}}
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
	if document.size() != (4 if document.has("icons") else 3) or not _valid_integer(document.get("schema_version"), VERSION, VERSION):
		return invalid
	var top: Variant = document.get("top")
	var height: Variant = document.get("height_offset")
	if not _valid_integer(top, TOP_MIN, TOP_MAX) or not _valid_integer(height, HEIGHT_MIN, HEIGHT_MAX):
		return invalid
	var encoded: Variant = document.get("icons", {})
	if not (encoded is Dictionary):
		return invalid
	var parsed_icons := {}
	for id: String in encoded:
		var entry: Variant = encoded[id]
		if id not in ICON_IDS or not (entry is Dictionary) or entry.size() != 2:
			return invalid
		var x: Variant = entry.get("x")
		var y: Variant = entry.get("y")
		if not _valid_icon_component(x) or not _valid_icon_component(y):
			return invalid
		parsed_icons[id] = Vector2i(int(x), int(y))
	return {"error": OK, "value": Vector2i(int(top), int(height)), "icons": parsed_icons}

static func _valid_icons(offsets: Variant) -> bool:
	if not (offsets is Dictionary):
		return false
	for id: Variant in offsets:
		var offset: Variant = offsets[id]
		if not (id is String) or id not in ICON_IDS or not (offset is Vector2i):
			return false
		if not _valid_icon_component(offset.x) or not _valid_icon_component(offset.y):
			return false
	return true

static func _valid_icon_component(number: Variant) -> bool:
	return _valid_integer(number, -ICON_OFFSET_LIMIT, ICON_OFFSET_LIMIT)

static func _valid_integer(number: Variant, minimum: int, maximum: int) -> bool:
	if not (number is int or number is float):
		return false
	return number >= minimum and number <= maximum and number == floor(number)
