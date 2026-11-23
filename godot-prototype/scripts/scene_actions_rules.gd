extends RefCounted

var items: Dictionary = {}
var zones: Dictionary = {}
var completed: Dictionary = {}

func _init(level: Dictionary) -> void:
	for zone: Dictionary in level.get("zones", []):
		zones[str(zone.id)] = zone
	for item: Dictionary in level.get("items", []):
		items[str(item.id)] = item

func decision(id: String, zone_id: String) -> String:
	if not items.has(id) or completed.has(id):
		return "ignored"
	var item: Dictionary = items[id]
	for requirement: String in item.get("needs", []):
		if not completed.has(requirement):
			return "blocked"
	if item.get("mode", "drag") == "tap":
		return "placed" if zone_id.is_empty() else "wrong"
	return "placed" if not zone_id.is_empty() and item.get("zone") == zone_id else "wrong"

func done() -> bool:
	return completed.size() == items.size()

func remaining_dependencies_valid() -> bool:
	var pending := items.duplicate()
	while not pending.is_empty():
		var before := pending.size()
		for id: String in pending.keys():
			var ready := true
			for key: String in items[id].get("needs", []):
				if not items.has(key):
					return false
				if pending.has(key):
					ready = false
			if ready:
				pending.erase(id)
		if pending.size() == before:
			return false
	return true
