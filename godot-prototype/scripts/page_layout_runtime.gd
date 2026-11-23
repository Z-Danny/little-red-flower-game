extends Node

const PageLayoutOverrides = preload("res://scripts/page_layout_overrides.gd")
const LIVE_TEXT := [&"Count", &"Totals", &"Player", &"SeedCount", &"WalletCount", &"Clock", &"Time", &"Step", &"State"]

var page: Control
var page_id: String
var committed: Dictionary = {}
var draft: Dictionary = {}

var _storage: PageLayoutOverrides
var _applied: Dictionary = {}
var _refresh_queued := false
var _applying := false

func setup(target_page: Control, id: String, storage: PageLayoutOverrides) -> void:
	page = target_page
	page_id = id
	_storage = storage
	committed = storage.page(page_id)
	draft = committed.duplicate(true)
	page.resized.connect(queue_apply)
	apply_draft()
	queue_apply()

func targets() -> Array[Control]:
	var result: Array[Control] = []
	for control: Control in page.find_children("*", "Control", true, false):
		if control.is_visible_in_tree() and control.size.x > 0.0 and control.size.y > 0.0 and not path_for(control).is_empty():
			result.append(control)
	return result

func path_for(control: Control) -> String:
	if not page.is_ancestor_of(control):
		return ""
	var relative := String(page.get_path_to(control))
	if relative.contains("@") or (control.owner == null and not control.has_meta(&"page_layout_selectable")):
		return ""
	if page_id.begins_with("map/") and (relative == "Intro" or relative.begins_with("Intro/")):
		return ""
	if page_id.begins_with("runner/") and not (control is Label or control is RichTextLabel or control is Button or control is LinkButton):
		return ""
	return relative if relative != "Map/Painting" else ""

func base_text(control: Control) -> Variant:
	var applied: Dictionary = _applied.get(path_for(control), {})
	var current: Variant = _read_text(control)
	if not applied.is_empty() and applied.control == control and current == applied.text_applied:
		return applied.text_base
	return current

func queue_apply() -> void:
	if _applying or _refresh_queued or (draft.is_empty() and _applied.is_empty()):
		return
	_refresh_queued = true
	apply_draft.call_deferred()

func apply_draft() -> void:
	_refresh_queued = false
	if not is_instance_valid(page) or _applying:
		return
	_applying = true
	var paths := draft.duplicate()
	for path: String in _applied:
		if not paths.has(path):
			paths[path] = {}
	for path: String in paths:
		_apply_target(path, paths[path])
	_applying = false

func restore() -> void:
	draft = committed.duplicate(true)
	apply_draft()

func clear_applied() -> void:
	draft.clear()
	apply_draft()

func save() -> Error:
	if not OS.has_feature("editor"):
		return ERR_UNAVAILABLE
	var result := _storage.save_page(page_id, draft, committed)
	if result == OK:
		committed = draft.duplicate(true)
	return result

func _apply_target(path: String, entry: Dictionary) -> void:
	var control := page.get_node_or_null(NodePath(path)) as Control
	if not is_instance_valid(control) or path_for(control) != path:
		_applied.erase(path)
		return
	var offsets := _offsets(control)
	var state: Dictionary = _applied.get(path, {})
	if state.is_empty() or state.control != control:
		var original: Variant = _read_text(control)
		state = {
			"control": control,
			"base": offsets,
			"applied": offsets,
			"text_base": original,
			"text_applied": original,
		}
		if not control.item_rect_changed.is_connected(queue_apply):
			control.item_rect_changed.connect(queue_apply)
			control.minimum_size_changed.connect(queue_apply)
			control.visibility_changed.connect(queue_apply)
	var base: Vector4 = state.base
	for index: int in 4:
		if not is_equal_approx(offsets[index], state.applied[index]):
			base[index] = offsets[index]
	var movement: Vector2i = entry.get("offset", Vector2i.ZERO)
	var desired := base + Vector4(movement.x, movement.y, movement.x, movement.y)
	if not offsets.is_equal_approx(desired):
		control.offset_left = desired.x
		control.offset_top = desired.y
		control.offset_right = desired.z
		control.offset_bottom = desired.w
	var current: Variant = _read_text(control)
	if current != state.text_applied:
		state.text_base = current
	var next: Variant = entry.get("text", state.text_base)
	if current is String and next is String and current != next:
		control.set("text", next)
	state.base = base
	state.applied = _offsets(control)
	state.text_applied = _read_text(control)
	if entry.is_empty():
		_applied.erase(path)
	else:
		_applied[path] = state

func _offsets(control: Control) -> Vector4:
	return Vector4(control.offset_left, control.offset_top, control.offset_right, control.offset_bottom)

func _read_text(control: Control) -> Variant:
	if control.name in LIVE_TEXT:
		return null
	if control is Label or control is RichTextLabel or control is Button or control is LinkButton:
		return control.get("text")
	return null
