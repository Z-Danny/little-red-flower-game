extends RefCounted
## Runtime asset reader. Native .tres dependencies survive fresh import and PCK export.
## Rules, skin, written presentation and optional stage direction retain their source fields.

const BASE := "res://assets/hunt_runner/"
const CONTRACT := preload("res://assets/hunt_runner/shared/contract.tres")

var error := ""
var rules: Dictionary = {}
var skin: Dictionary = {}
var presentation: Dictionary = {}
var performance: Dictionary = {}
var assets: Dictionary = {}
var world_size := Vector2i.ZERO
var mask_rgba: PackedByteArray
var target_colors: PackedVector3Array
var _targets_by_rgb: Dictionary = {}
var _text_by_id: Dictionary = {}

func _init(id: String) -> void:
	if not contract_ids().has(id):
		error = "没有找到已启用的找隐患关卡。"
		return
	var path := BASE + id + "/pack.tres"
	if not ResourceLoader.exists(path):
		error = "没有找到关卡素材。"
		return
	var resource := ResourceLoader.load(path)
	if resource == null:
		error = "关卡素材载入失败。"
		return
	rules = resource.get_meta("rules", {})
	skin = resource.get_meta("skin", {})
	presentation = resource.get_meta("presentation", {})
	performance = resource.get_meta("performance", {})
	assets = resource.get_meta("resources", {})
	if rules.get("id") != id or rules.get("timeout") != "fail" or not rules.has("seconds") or not rules.has("markMs") or rules.get("targets", []).is_empty() or presentation.is_empty():
		error = "关卡配置不完整。"
		return
	world_size = Vector2i(int(skin.get("width", 0)), int(skin.get("height", 0)))
	for key in ["scene", "safe", "clean", "mask"]:
		if not _texture_size_is(key, world_size):
			error = "场景与蒙版尺寸不一致。"
			return
	if not _texture_size_is("family", Vector2i(box(skin.get("familyBox", {})).size)):
		error = "人物与原画的锚点尺寸不一致。"
		return
	for key: String in skin.get("effects", {}).keys():
		if key.ends_with("Mask") and not _texture_size_is(key, world_size):
			error = "演出许可蒙版尺寸不一致。"
			return
	var regions: Dictionary = skin.get("targets", {})
	for target: Dictionary in rules["targets"]:
		var target_id: String = target["id"]
		var region: Dictionary = regions.get(target_id, {})
		var rgb: Array = region.get("color", [])
		if rgb.size() != 3 or texture("icon:" + target_id) == null:
			error = "缺少目标蒙版颜色或剪影。"
			return
		var key := _rgb_key(int(rgb[0]), int(rgb[1]), int(rgb[2]))
		if _targets_by_rgb.has(key):
			error = "目标蒙版颜色重复。"
			return
		_targets_by_rgb[key] = target_id
		_text_by_id[target_id] = target
		target_colors.append(Vector3(float(rgb[0]), float(rgb[1]), float(rgb[2])) / 255.0)
	var image := texture("mask").get_image()
	if image == null or image.is_empty() or (image.is_compressed() and image.decompress() != OK):
		error = "无法读取目标像素。"
		return
	image.convert(Image.FORMAT_RGBA8)
	mask_rgba = image.get_data()

static func contract_ids() -> Array:
	return CONTRACT.get_meta("ids")

static func box(b: Dictionary) -> Rect2:
	return Rect2(float(b.get("x", 0)), float(b.get("y", 0)), float(b.get("w", 0)), float(b.get("h", 0)))

func texture(key: String) -> Texture2D:
	return assets.get(key) as Texture2D

func _texture_size_is(key: String, expected: Vector2i) -> bool:
	var image := texture(key)
	return image != null and expected.x > 0 and expected.y > 0 and Vector2i(image.get_size()) == expected

func bounds(id: String) -> Rect2:
	return box(skin["targets"][id]["bounds"])

func target_text(id: String, key: String) -> String:
	return _text_by_id.get(id, {}).get(key, "")

static func _rgb_key(r: int, g: int, b: int) -> int:
	return (r << 16) | (g << 8) | b

func exact_hit(point: Vector2) -> String:
	if not point.is_finite() or point.x < 0.0 or point.y < 0.0 or point.x >= world_size.x or point.y >= world_size.y:
		return ""
	var offset := (int(point.y) * world_size.x + int(point.x)) * 4
	if mask_rgba[offset + 3] < 128:
		return ""
	return _targets_by_rgb.get(_rgb_key(mask_rgba[offset], mask_rgba[offset + 1], mask_rgba[offset + 2]), "")

## Exact pixels take priority. A nearby miss is forgiven only when unambiguous.
## Source: app/game/display/pointer-hit.ts; radius is in original art pixels.
func hit(point: Vector2, radius: float) -> String:
	var direct := exact_hit(point)
	if not direct.is_empty() or not point.is_finite() or not is_finite(radius) or radius <= 0.0:
		return direct
	var r := minf(24.0, radius)
	var distances := {}
	for dy in range(-ceili(r), floori(r) + 1):
		for dx in range(-ceili(r), floori(r) + 1):
			var squared := dx * dx + dy * dy
			if squared == 0 or squared > r * r:
				continue
			var id := exact_hit(point + Vector2(dx, dy))
			if not id.is_empty():
				distances[id] = minf(float(squared), distances.get(id, INF))
	var best_id := ""
	var best := INF
	var second := INF
	for id: String in distances:
		var distance: float = distances[id]
		if distance < best:
			second = best
			best = distance
			best_id = id
		elif distance < second:
			second = distance
	return best_id if not best_id.is_empty() and sqrt(second) - sqrt(best) > 1.0 else ""
