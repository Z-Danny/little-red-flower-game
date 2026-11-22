extends RefCounted
## Map placement and eligibility come from the frozen original release. A runner
## must additionally have an explicit, per-level migration acceptance record.

const MANIFEST := "res://data/original_levels.json"
const Save = preload("res://scripts/journey_save.gd")
const RUNNERS := {
	"kitchen-v1": "res://scenes/oil_fire.tscn",
	"scene-hunt": "res://scenes/hunt_runner.tscn",
	"configured-v1": "res://scenes/configured_runner.tscn",
	"first-aid-cpr": "res://scenes/cpr_runner.tscn",
	"disaster-v1": "res://scenes/disaster_runner.tscn",
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

func _init() -> void:
	var data := read_json(MANIFEST)
	if int(data.get("schema_version", 0)) != 1:
		push_error("Original level catalog missing or invalid")
		return
	for map: Dictionary in data.get("maps", []):
		_maps[map.id] = map
		for entry: Dictionary in map.stops:
			var item := entry.duplicate()
			item["island_id"] = map.id
			_levels[item.id] = item
	for engine: String in VERIFIED:
		var verification := read_json(VERIFIED[engine])
		if int(verification.get("schemaVersion", 0)) == 1 and verification.get("levels") is Dictionary:
			_ready_engines[engine] = verification.levels

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

func runner_for(id: String) -> String:
	var entry := entry_for(id)
	if not entry.get("was_playable", false):
		return ""
	var engine: String = entry.get("engine", "")
	var path: String = RUNNERS.get(engine, "")
	if path.is_empty() or not ResourceLoader.exists(path, "PackedScene"):
		return ""
	if engine == "kitchen-v1":
		return path if id == "oil-fire" else ""
	var record: Variant = _ready_engines.get(engine, {}).get(id, {})
	return path if record is Dictionary and record.get("ready", false) == true else ""

func status_for(id: String, progress: Save, test_unlock: bool = false) -> String:
	var entry := entry_for(id)
	if not entry.get("was_playable", false):
		return "preview"
	if runner_for(id).is_empty():
		return "unported"
	if progress.flowers_for(id) > 0:
		return "complete"
	var prerequisite: Variant = entry.get("unlock_after")
	if test_unlock or prerequisite == null or progress.flowers_for(str(prerequisite)) > 0:
		return "available"
	return "locked"

func can_play(id: String, progress: Save, test_unlock: bool = false) -> bool:
	return status_for(id, progress, test_unlock) in ["available", "complete"]
