extends Control
## One transform for source-space painting, alpha picking, placement and labels.

const Rules = preload("res://scripts/configured_runner/rules.gd")
const Effects = preload("res://scripts/configured_runner/effects.gd")
const FONT = preload("res://assets/ui/flower-ui.woff2")

var model: Rules
var selected := ""
var target := ""
var drag: Dictionary = {}
var stage_scale := 1.0
var stage_origin := Vector2.ZERO
var reduced_motion := false
var _frame := Rect2()
var _poses: Dictionary = {}
var _sorted: Array[Dictionary] = []
var _art: Dictionary = {}
var _effects: Effects

static func point(data: Dictionary) -> Vector2:
	return Vector2(float(data["x"]), float(data["y"]))

static func box(data: Dictionary) -> Rect2:
	return Rect2(float(data["x"]), float(data["y"]), float(data["w"]), float(data["h"]))

func build(rules_model: Rules) -> Array[String]:
	model = rules_model
	var missing: Array[String] = []
	for id: String in model.pack["art"]:
		var data: Dictionary = model.pack["art"][id]
		var path: String = data["path"]
		var texture := load(path) as Texture2D if ResourceLoader.exists(path, "Texture2D") else null
		if texture == null:
			missing.append(id)
			continue
		var item := {"texture": texture}
		if data.has("mask"):
			var info: Array = data["mask"]
			var stride := ceili(float(info[0]) / 8.0)
			var count := stride * int(info[1])
			var bits := Marshalls.base64_to_raw(info[2]).decompress(count, FileAccess.COMPRESSION_DEFLATE)
			if bits.size() != count:
				missing.append(id + ":alpha")
			else:
				item.merge({"bits": bits, "stride": stride, "width": int(info[0]), "height": int(info[1])})
		_art[id] = item
	var size_world: Dictionary = model.skin["world"]
	_frame = Rect2(0, 0, float(size_world["width"]), float(size_world["height"]))
	# Fit the authored interaction canvas in the native HUD's protected stage. The
	# extended background is still painted at its sceneBounds, never independently scaled.
	# If authored critical regions extend outside that canvas, fit those as well.
	var framing: Dictionary = model.skin.get("framing", {})
	if framing.has("critical"):
		_frame = _frame.merge(box(framing["critical"]))
	for region: Dictionary in framing.get("criticalRegions", []):
		_frame = _frame.merge(box(region))
	_update_camera()
	resized.connect(_update_camera)
	_effects = Effects.new(model)
	refresh()
	return missing

func _update_camera() -> void:
	stage_scale = maxf(.001, minf(size.x / _frame.size.x, size.y / _frame.size.y))
	stage_origin = (size - _frame.size * stage_scale) * .5 - _frame.position * stage_scale
	queue_redraw()

func to_world(local_position: Vector2) -> Vector2:
	return (local_position - stage_origin) / stage_scale

func from_world(world_position: Vector2) -> Vector2:
	return stage_origin + world_position * stage_scale

func viewport_to_world(viewport_position: Vector2) -> Vector2:
	return to_world(get_global_transform_with_canvas().affine_inverse() * viewport_position)

func icon(id: String) -> Texture2D:
	var asset: String = model.skin["poses"].get(id, {}).get("asset", "")
	var texture: Texture2D = _art.get(asset, {}).get("texture")
	var frame: Dictionary = model.skin["assets"].get(asset, {}).get("frame", {})
	if texture != null and not frame.is_empty():
		var atlas := AtlasTexture.new()
		atlas.atlas = texture
		atlas.region = box(frame)
		return atlas
	return texture

func pose(id: String) -> Dictionary:
	return _poses.get(id, {})

func in_scene(id: String) -> bool:
	return not pose(id).is_empty() and float(pose(id).get("opacity", 1.0)) > .05

func refresh() -> void:
	if model == null:
		return
	_compose()
	queue_redraw()

func _compose() -> void:
	var run := model.run
	_poses.clear()
	_sorted.clear()
	var index := 0
	for id: String in model.pack["poseOrder"]:
		var p: Dictionary = model.skin["poses"][id].duplicate()
		p["id"] = id
		p["ordinal"] = index
		_poses[id] = p
		index += 1
	for state: Dictionary in model.skin["states"]:
		if model.matches(state["when"]):
			_poses[state["object"]].merge(state["pose"], true)
	for id: String in run["inventory"]:
		_hide(id)
	for id: String in model.objects:
		if not Rules.has_all(run["stages"], model.objects[id].get("stages", [])):
			_hide(id)
	for effect: Dictionary in model.skin["effects"]:
		if Rules.has_all(run["resolved"], effect["until"]):
			continue
		var p: Dictionary = _poses[effect["object"]]
		if effect["kind"] == "wobble" and not reduced_motion and run["risk"] >= model.rules["risk"]["warningAt"]:
			p["rotation"] = float(p.get("rotation", 0)) + sin(run["elapsed"] / 95.0) * .035
		elif effect["kind"] == "fire":
			var scale_factor := 1.0 + float(run["risk"]) / 220.0 + float(run["boost"])
			if not reduced_motion:
				scale_factor += sin(run["elapsed"] / 90.0) * .045
			p["x"] -= p["w"] * (scale_factor - 1) / 2.0
			p["y"] -= p["h"] * (scale_factor - 1)
			p["w"] *= scale_factor
			p["h"] *= scale_factor
	var action: Dictionary = run["action"]
	if action.is_empty():
		if not run["failure"].is_empty():
			action = run["failure"]
		elif run["escaped"]:
			var terminal: Dictionary = model.interactions[run["escapeRule"]]
			var duration: float = model.skin["animations"][terminal["animation"]]["durationMs"]
			action = {"rule": terminal["id"], "source": terminal["source"], "age": duration, "duration": duration}
	var animated: Array[String] = []
	if not action.is_empty():
		animated = _apply_action(action)
	if run["phase"] != "failed":
		_actor_motion(animated)
	for p: Dictionary in _poses.values():
		_sorted.append(p)
	_sorted.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a["ordinal"] < b["ordinal"] if a["depth"] == b["depth"] else a["depth"] < b["depth"])

func _hide(id: String) -> void:
	_poses[id]["opacity"] = 0.0
	_poses[id]["blockInput"] = false

static func _smooth(ratio: float) -> float:
	var p := clampf(ratio, 0, 1)
	return p * p * (3.0 - 2.0 * p)

static func _interpolate(a: Dictionary, b: Dictionary, progress: float) -> Dictionary:
	var result := a.duplicate()
	result["asset"] = b["asset"] if progress >= 1.0 else a["asset"]
	for key: String in ["x", "y", "w", "h", "rotation", "opacity"]:
		var default := 1.0 if key == "opacity" else 0.0
		result[key] = lerpf(float(a.get(key, default)), float(b.get(key, default)), progress)
	return result

func _apply_action(action: Dictionary) -> Array[String]:
	var rule: Dictionary = model.interactions.get(action["rule"], {})
	var progress := clampf(float(action["age"]) / maxf(1, float(action["duration"])), 0, 1)
	var release: Variant = action.get("point")
	var animated: Array[String] = []
	if rule.is_empty():
		var id: String = action["source"]
		var home: Dictionary = _poses[id]
		var start := home.duplicate()
		if release is Vector2:
			start["x"] = release.x - float(home["w"]) * .5
			start["y"] = release.y - float(home["h"]) * .5
		var projected := _interpolate(start, home, _smooth(progress))
		if not reduced_motion:
			projected["rotation"] += sin(progress * TAU * 2.0) * .07
		_poses[id] = projected
		return animated
	for track: Dictionary in model.skin["animations"][rule["animation"]]["tracks"]:
		var id: String = track["object"]
		var home: Dictionary = _poses[id]
		var previous := home.duplicate()
		var at := 0.0
		if track.get("fromDrop", false) and release is Vector2 and id == action["source"]:
			previous["x"] = release.x - float(home["w"]) * .5
			previous["y"] = release.y - float(home["h"]) * .5
		for keyframe: Dictionary in track["keyframes"]:
			var next: Dictionary = (home if keyframe.get("restoreHome", false) else previous).duplicate()
			for prop: String in keyframe:
				if prop not in ["at", "restoreHome"]:
					next[prop] = keyframe[prop]
			var end: float = keyframe["at"]
			if progress <= end:
				_poses[id] = _interpolate(previous, next, _smooth((progress - at) / maxf(.00001, end - at)))
				break
			previous = next
			at = end
		animated.append(id)
	return animated

func _actor_motion(animated: Array[String]) -> void:
	var run := model.run
	var elapsed: float = run["elapsed"]
	for actor: Dictionary in model.skin.get("presentation", {}).get("actors", []):
		var until: Array = actor.get("until", [])
		var id: String = actor["object"]
		if (not until.is_empty() and Rules.has_all(run["resolved"], until)) or id in animated:
			continue
		var p: Dictionary = _poses[id]
		var perf: Dictionary = actor.get("performance", {})
		if perf.is_empty():
			if not reduced_motion:
				var stretch := (sin(elapsed / 330.0) * .006 + _effects.action_danger() * .004) * clampf(float(actor["amplitude"]), 0, 1)
				var h := float(p["h"]) * stretch
				p["y"] -= h
				p["h"] += h
			continue
		if perf.has("activeAssets") and p["asset"] not in perf["activeAssets"]:
			continue
		var cycle: Dictionary = perf.get("cycle", {})
		if not cycle.is_empty() and not reduced_motion and run["phase"] == "playing" and p["asset"] in cycle["frames"] and model.matches(cycle.get("when", {})):
			var frames: Array = cycle["frames"]
			p["asset"] = frames[floori(elapsed / float(cycle["periodMs"]) * frames.size()) % frames.size()]
		var cough: Dictionary = perf.get("cough", {})
		var coughing: bool = (not cough.is_empty() and run["phase"] == "playing" and not Rules.has_all(run["resolved"], cough["until"])
			and elapsed >= cough["everyMs"] and fposmod(elapsed, cough["everyMs"]) < cough["durationMs"])
		if coughing:
			p["asset"] = cough["asset"]
			p["x"] += (p["w"] - cough["w"]) * .5
			p["y"] += p["h"] - cough["h"]
			p["w"] = cough["w"]
			p["h"] = cough["h"]
		if not reduced_motion:
			var wobble := sin(elapsed / float(perf["periodMs"]) * TAU)
			var intensity := .55 + _effects.pressure() * .45 if run["phase"] == "playing" else .25
			p["rotation"] = float(p.get("rotation", 0)) + wobble * float(perf["lean"]) * intensity + (sin(elapsed / 65.0) * .018 if coughing else 0.0)
			if not p.has("pivot"):
				p["pivot"] = {"x": .5, "y": 1.0}

static func pivot(p: Dictionary) -> Vector2:
	return point(p["pivot"]) if p.has("pivot") else Vector2(.5, .5)

static func local_to_world(p: Dictionary, uv: Vector2) -> Vector2:
	var b := box(p)
	var anchor := pivot(p) * b.size
	return b.position + anchor + (uv * b.size - anchor).rotated(float(p.get("rotation", 0)))

static func world_to_local(p: Dictionary, world_point: Vector2) -> Vector2:
	var b := box(p)
	var anchor := pivot(p) * b.size
	return ((world_point - b.position - anchor).rotated(-float(p.get("rotation", 0))) + anchor) / b.size

func _alpha(asset: String, uv: Vector2) -> bool:
	if uv.x < 0 or uv.y < 0 or uv.x > 1 or uv.y > 1 or not _art.has(asset):
		return false
	var item: Dictionary = _art[asset]
	if not item.has("bits"):
		return true
	var width: int = item["width"]
	var height: int = item["height"]
	var stride: int = item["stride"]
	var x := mini(width - 1, floori(uv.x * width))
	var y := mini(height - 1, floori(uv.y * height))
	var bits: PackedByteArray = item["bits"]
	return (bits[stride * y + (x >> 3)] & (1 << (7 - (x & 7)))) != 0

## null = empty, false = foreground blocks, string = interactive object.
func _pixel_hit(pos: Vector2, exact: bool, challenge: bool) -> Variant:
	for index: int in range(_sorted.size() - 1, -1, -1):
		var p := _sorted[index]
		if float(p.get("opacity", 1.0)) <= .05 or not _alpha(p["asset"], world_to_local(p, pos)):
			continue
		var id: String = p["id"]
		if model.objects.has(id) and (challenge or model.enabled(id)):
			if exact or challenge or model.objects[id]["input"] in ["drag", "both"]:
				return id
			return false
		if p.get("blockInput", true):
			return false
	return null

func pick(pos: Vector2, challenge: bool, radius: float) -> String:
	var exact: Variant = _pixel_hit(pos, true, challenge)
	if exact != null:
		return exact if exact is String else ""
	# Precise dangerous taps stay exact. The nearest distinct opaque object wins
	# only if the next one is more than one world pixel farther away.
	var limit := minf(24.0, radius)
	var nearest: Dictionary = {}
	for dy: int in range(-ceili(limit), ceili(limit) + 1):
		for dx: int in range(-ceili(limit), ceili(limit) + 1):
			var offset := Vector2(dx, dy)
			var distance := offset.length()
			if distance <= 0 or distance > limit:
				continue
			var id: Variant = _pixel_hit(pos + offset, false, challenge)
			if id is String and distance < nearest.get(id, INF):
				nearest[id] = distance
	var best := ""
	var first := INF
	var second := INF
	for id: String in nearest:
		var distance: float = nearest[id]
		if distance < first:
			second = first
			first = distance
			best = id
		elif distance < second:
			second = distance
	return best if second - first > 1.0 else ""

func pick_zone(source: String, at: Vector2) -> String:
	for id: String in model.relevant_zones(source):
		var rect := box(model.skin["zones"][id])
		if at.x >= rect.position.x and at.y >= rect.position.y and at.x <= rect.end.x and at.y <= rect.end.y:
			return id
	return ""

func placement(source: String, at: Vector2, offset: Vector2) -> Dictionary:
	var p := pose(source)
	if p.is_empty():
		return {}
	var center := at - offset + box(p).size * .5
	var id := pick_zone(source, at)
	if id.is_empty():
		id = pick_zone(source, center)
	return {"target": id, "point": center}

func _draw() -> void:
	if model == null:
		return
	draw_rect(Rect2(Vector2.ZERO, size), Color("2a302b"))
	var camera := Transform2D(0.0, Vector2.ONE * stage_scale, 0.0, stage_origin)
	var background: String = model.skin["background"]
	var b := box(model.skin["assets"][background]["sceneBounds"]) if model.skin["assets"][background].has("sceneBounds") else _frame
	draw_set_transform_matrix(camera)
	_paint_texture(background, b, Color.WHITE)
	var effects := _effects.visible_layers(_poses)
	var index := 0
	var carried: Dictionary = {}
	for p: Dictionary in _sorted:
		while index < effects.size() and effects[index]["depth"] <= p["depth"]:
			draw_set_transform_matrix(camera)
			_effects.paint(self, effects[index], _poses, reduced_motion)
			index += 1
		if not drag.is_empty() and drag.get("moved", false) and drag["id"] == p["id"]:
			carried = p.duplicate()
			var position_on_drop: Vector2 = drag["point"] - drag["offset"]
			carried["x"] = position_on_drop.x
			carried["y"] = position_on_drop.y
		else:
			_paint_pose(p, camera)
	while index < effects.size():
		draw_set_transform_matrix(camera)
		_effects.paint(self, effects[index], _poses, reduced_motion)
		index += 1
	draw_set_transform_matrix(camera)
	_paint_zones()
	if not carried.is_empty():
		_paint_pose(carried, camera)
	if not model.skin.has("presentation") and model.run["phase"] == "settling":
		draw_set_transform_matrix(camera)
		draw_rect(_frame, Color(1.0, .84, .55, minf(.12, model.run["settleAge"] / 18000.0)))
	draw_set_transform_matrix(Transform2D.IDENTITY)

func _paint_texture(asset: String, rect: Rect2, tint: Color) -> void:
	var texture: Texture2D = _art.get(asset, {}).get("texture")
	if texture == null:
		return
	var frame: Dictionary = model.skin["assets"][asset].get("frame", {})
	if frame.is_empty():
		draw_texture_rect(texture, rect, false, tint)
	else:
		draw_texture_rect_region(texture, rect, box(frame), tint)

func _paint_pose(p: Dictionary, camera: Transform2D) -> void:
	var alpha: float = p.get("opacity", 1.0)
	if alpha <= .0001:
		return
	var id: String = p["id"]
	var asset: String = p["asset"]
	var painted: Dictionary = model.skin["assets"][asset].get("sceneBounds", {})
	var dest := box(p) if painted.is_empty() else box(painted)
	var anchor := pivot(p) * dest.size
	var rect := Rect2(-anchor, dest.size)
	draw_set_transform_matrix(camera * Transform2D(float(p.get("rotation", 0)), dest.position + anchor))
	if selected == id:
		for offset: Vector2 in [Vector2(-3, 0), Vector2(3, 0), Vector2(0, -3), Vector2(0, 3)]:
			_paint_texture(asset, Rect2(rect.position + offset, rect.size), Color(1, .8, .45, .32 * alpha))
	_paint_texture(asset, rect, Color(1, 1, 1, alpha))
	for label: Dictionary in model.skin.get("labels", []):
		if label["object"] != id or not model.matches(label.get("when", {})):
			continue
		if label.has("background"):
			var fill := Color.from_string(label["background"], Color("eee1bf"))
			fill.a *= alpha
			draw_rect(rect, fill)
		_world_label(label, rect, alpha)

func _world_label(label: Dictionary, rect: Rect2, alpha: float) -> void:
	var color := Color.from_string(label["color"], Color.WHITE)
	color.a *= alpha
	var label_size := int(label["size"])
	var at := rect.position + Vector2(label["x"], label["y"]) * rect.size
	var align: String = label.get("align", "center")
	var room := 2.0 * minf(float(label["x"]), 1.0 - float(label["x"]))
	if align == "left":
		room = 1.0 - float(label["x"])
	elif align == "right":
		room = float(label["x"])
	var width := rect.size.x * (.92 * maxf(.01, room) if model.skin.has("presentation") else .91)
	var lines: PackedStringArray = str(label["text"]).split("\n")
	for index: int in range(lines.size()):
		var line := lines[index]
		var font_size := label_size
		var measured := FONT.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		if measured > width:
			font_size = maxi(7, floori(float(font_size) * width / measured))
			measured = FONT.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		var x := at.x - (measured if align == "right" else measured * .5 if align == "center" else 0.0)
		var y := at.y + (index - (lines.size() - 1) * .5) * label_size * 1.3 + float(font_size) * .32
		draw_string(FONT, Vector2(x, y), line, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)

func _paint_zones() -> void:
	if not model.input_free() or selected.is_empty():
		return
	for id: String in model.relevant_zones(selected):
		var rect := box(model.skin["zones"][id])
		var danger: bool = model.rule_for(selected, "drop", id)["outcome"] == "danger"
		var ink := Color("ffb19a") if danger else Color("fff0ba")
		var fill := ink
		fill.a = .34 if id == target else .13
		draw_rect(rect, fill)
		draw_rect(rect, ink, false, 3.5 if id == target else 2.0, true)
		var label: String = model.skin.get("zoneLabels", {}).get(id, "")
		if label.is_empty():
			continue
		var font_size := 23
		var text_width := FONT.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
		var center := rect.get_center().x
		var y := rect.position.y + 28.0 if model.skin.get("feedback", {}).get("zoneLabelPosition") == "inside" else maxf(35, rect.position.y - 8)
		var x := clampf(center - text_width * .5, 10, _frame.end.x - text_width - 10)
		draw_rect(Rect2(x - 6, y - 24, text_width + 12, 31), Color("393027e8"))
		draw_string(FONT, Vector2(x, y), label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, ink)
