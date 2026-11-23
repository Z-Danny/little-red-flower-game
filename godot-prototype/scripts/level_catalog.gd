extends RefCounted
## The original snapshot owns map placement and old IDs. New playable entries
## use the same IDs and positions with an explicit runner and content record.

const MANIFEST := "res://data/original_levels.json"
const NEW_LEVELS := "res://data/new_island_levels.json"
const Save = preload("res://scripts/journey_save.gd")
const RUNNERS := {
	"kitchen-v1": "res://scenes/oil_fire.tscn",
	"scene-hunt": "res://scenes/hunt_runner.tscn",
	"configured-v1": "res://scenes/configured_runner.tscn",
	"first-aid-cpr": "res://scenes/cpr_runner.tscn",
	"disaster-v1": "res://scenes/disaster_runner.tscn",
	"safety-choices": "res://scenes/safety_choices.tscn",
	"find-three": "res://scenes/find_three.tscn",
	"scene-actions": "res://scenes/scene_actions.tscn",
}
const VERIFIED := {
	"scene-hunt": "res://assets/hunt_runner/verified.json",
	"configured-v1": "res://assets/configured_runner/verified.json",
	"first-aid-cpr": "res://assets/cpr_runner/verified.json",
	"disaster-v1": "res://assets/disaster_runner/verified.json",
}

var _maps: Dictionary = {}
var _levels: Dictionary = {}
var _ready_engines: Dictionary = {}
var _new_levels: Dictionary = {}
var _island_order: Dictionary = {}

func _init() -> void:
	var data := read_json(MANIFEST)
	if int(data.get("schema_version", 0)) != 1:
		push_error("Original level catalog missing or invalid")
		return
	for map: Dictionary in data.get("maps", []):
		_maps[map.id] = map
		var order: Array[String] = []
		for entry: Dictionary in map.stops:
			var item := entry.duplicate()
			item["island_id"] = map.id
			_levels[item.id] = item
			order.append(item.id)
		_island_order[map.id] = order
	for engine: String in VERIFIED:
		var verification := read_json(VERIFIED[engine])
		if int(verification.get("schemaVersion", 0)) == 1 and verification.get("levels") is Dictionary:
			_ready_engines[engine] = verification.levels
	var additions := read_json(NEW_LEVELS)
	if int(additions.get("schema_version", 0)) != 1:
		return
	for id: String in additions.get("levels", {}):
		var entry := entry_for(id)
		var record: Dictionary = additions.levels[id]
		var path: String = record.get("content_path", "")
		var has_content := ResourceLoader.exists(path, "Resource") if record.get("engine") == "scene-hunt" else FileAccess.file_exists(path)
		if entry.is_empty() or entry.was_playable or not RUNNERS.has(record.get("engine")) or not has_content:
			push_error("Invalid new island level: " + id)
			continue
		entry["engine"] = record.engine
		entry["content_path"] = path
		if record.has("skin_path"):
			entry["skin_path"] = record.skin_path
		entry["description"] = record.get("description", entry.description)
		entry["knowledge"] = record.get("knowledge", entry.knowledge)
		entry["fixed_reward"] = 3
		_new_levels[id] = true

static func read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var result: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return result if result is Dictionary else {}

func map_for(island_id: String) -> Dictionary:
	return _maps.get(island_id, {})

func entry_for(id: String) -> Dictionary:
	return _levels.get(id, {})

func original_playable_ids() -> Array[String]:
	var ids: Array[String] = []
	for id: String in _levels:
		if _levels[id].was_playable:
			ids.append(id)
	return ids

func playable_ids() -> Array[String]:
	var ids: Array[String] = []
	for id: String in _levels:
		if not runner_for(id).is_empty():
			ids.append(id)
	return ids

func runner_for(id: String) -> String:
	var entry := entry_for(id)
	if not _new_levels.has(id) and not entry.get("was_playable", false):
		return ""
	var engine: String = entry.get("engine", "")
	var path: String = RUNNERS.get(engine, "")
	if path.is_empty() or not ResourceLoader.exists(path, "PackedScene"):
		return ""
	if _new_levels.has(id):
		return path
	if engine == "kitchen-v1":
		return path if id == "oil-fire" else ""
	var record: Variant = _ready_engines.get(engine, {}).get(id, {})
	return path if record is Dictionary and record.get("ready", false) == true else ""

func status_for(id: String, progress: Save, test_unlock: bool = false) -> String:
	var entry := entry_for(id)
	if runner_for(id).is_empty():
		return "unported" if entry.get("was_playable", false) else "preview"
	if progress.flowers_for(id) > 0:
		return "complete"
	var prerequisite := prerequisite_for(id)
	if test_unlock or prerequisite.is_empty() or progress.flowers_for(prerequisite) > 0:
		return "available"
	return "locked"

func can_play(id: String, progress: Save, test_unlock: bool = false) -> bool:
	return status_for(id, progress, test_unlock) in ["available", "complete"]

func prerequisite_for(id: String) -> String:
	var order: Array = _island_order.get(entry_for(id).get("island_id"), [])
	for i in range(order.find(id) - 1, -1, -1):
		if not runner_for(order[i]).is_empty():
			return order[i]
	return ""

func next_for(id: String, progress: Save, test_unlock := false) -> String:
	var order: Array = _island_order.get(entry_for(id).get("island_id"), [])
	var index := order.find(id)
	if index < 0:
		return ""
	for i in range(index + 1, order.size()):
		if status_for(order[i], progress, test_unlock) == "available":
			return order[i]
	return ""
