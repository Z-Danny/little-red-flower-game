extends RefCounted

const SLOT_COUNT := 5

var recipes: Array
var tray: Array[String] = []
var collected: Array[String] = []
var recipe_index := 0

func _init(configured_recipes: Array) -> void:
	recipes = configured_recipes

func done() -> bool:
	return recipe_index == recipes.size()

func current() -> Dictionary:
	return {} if done() else recipes[recipe_index]

func can_pick(id: String) -> bool:
	return not done() and not tray.has(id) and not collected.has(id)

func pick(id: String) -> String:
	if not can_pick(id):
		return "ignored"
	if tray.size() == SLOT_COUNT:
		return "full"
	tray.append(id)
	var required: Array = current()["items"]
	for item: String in required:
		if not tray.has(item):
			return "picked"
	for item: String in required:
		tray.erase(item)
		collected.append(item)
	recipe_index += 1
	return "combined"

func put_back(id: String) -> bool:
	if done() or not tray.has(id):
		return false
	tray.erase(id)
	return true
