extends RefCounted

const Save = preload("res://scripts/journey_save.gd")
const MAX_PLAYERS := 50
const DEFAULT := "default"

var active_id := DEFAULT
var _profiles: Dictionary = {}
var _path: String
var _save_dir: String

func _init(path := "user://journey-profiles-v1.cfg", save_dir := "user://") -> void:
	_path = path
	_save_dir = save_dir
	_profiles[DEFAULT] = {"name": "小红花玩家", "region": "", "created": 0}
	var file := ConfigFile.new()
	if file.load(_path) != OK:
		return
	var valid_id := RegEx.create_from_string("^(?:default|[0-9a-f]{24})$")
	for id in file.get_sections():
		if valid_id.search(id) == null:
			continue
		var name := str(file.get_value(id, "name", "")).strip_edges()
		if name.is_empty():
			continue
		_profiles[id] = {"name": name.left(12), "region": str(file.get_value(id, "region", "")).left(20), "created": int(file.get_value(id, "created", 0))}
	var selected := str(file.get_value("board", "active", DEFAULT))
	if _profiles.has(selected):
		active_id = selected

func profile() -> Dictionary:
	return _profiles[active_id].duplicate()

func current_save() -> Save:
	return Save.new(_save_path(active_id))

func rows(levels: Array[String], current: Save) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for id: String in _profiles:
		var row: Dictionary = _profiles[id].duplicate()
		row["id"] = id
		var save := current if id == active_id else Save.new(_save_path(id))
		row["flowers"] = save.total(levels)
		result.append(row)
	result.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a.flowers != b.flowers: return a.flowers > b.flowers
		if a.created != b.created: return a.created < b.created
		return a.id < b.id
	)
	var last_count := -1
	var rank := 0
	for i in result.size():
		var count: int = result[i].flowers
		if count != last_count:
			rank = i + 1
		result[i]["rank"] = rank if count > 0 else 0
		last_count = count
	return result

func save_profile(name: String, region: String, create: bool) -> bool:
	name = name.strip_edges()
	region = region.strip_edges()
	if name.is_empty() or name.length() > 12 or region.length() > 20 or (create and _profiles.size() >= MAX_PLAYERS):
		return false
	var id := Crypto.new().generate_random_bytes(12).hex_encode() if create else active_id
	var updated := _profiles.duplicate()
	updated[id] = {"name": name, "region": region, "created": int(Time.get_unix_time_from_system()) if create else _profiles[id].created}
	return _persist(updated, id)

func switch_to(id: String) -> bool:
	return _profiles.has(id) and _persist(_profiles, id)

func _save_path(id: String) -> String:
	return _save_dir.path_join("prototype-progress-v1.cfg" if id == DEFAULT else "progress-" + id + ".cfg")

func _persist(profiles: Dictionary, selected: String) -> bool:
	var file := ConfigFile.new()
	file.set_value("board", "active", selected)
	for id: String in profiles:
		for key: String in profiles[id]:
			file.set_value(id, key, profiles[id][key])
	if file.save(_path) != OK:
		return false
	_profiles = profiles
	active_id = selected
	return true
