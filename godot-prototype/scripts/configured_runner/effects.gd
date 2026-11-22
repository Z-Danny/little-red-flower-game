extends RefCounted
## Read-only native scene effects. Progress and mitigation times come from the reducer.

const Rules = preload("res://scripts/configured_runner/rules.gd")
const DEFAULTS := {
	"dust": "ac9475", "rain": "abc8d8", "water": "4e7f8c", "smoke": "484347", "glow": "ef9d55",
	"machine": "8bb9b6", "light": "f7dfa1", "alarm": "f14c43", "beam": "ffe9a1",
}

var model: Rules
var spec: Dictionary
var _layers: Array[Dictionary] = []
var _radial: GradientTexture2D
var _ceiling: GradientTexture2D

func _init(rules_model: Rules) -> void:
	model = rules_model
	spec = model.skin.get("presentation", {})
	for source: Dictionary in spec.get("effects", []):
		var effect := source.duplicate()
		if effect.has("clipPolygons"):
			var apertures: Array[PackedVector2Array] = []
			var bounds := _rectangle(_box(effect["box"]))
			for polygon: Array in effect["clipPolygons"]:
				var points: PackedVector2Array = []
				for p: Dictionary in polygon:
					points.append(_point(p))
				for aperture: PackedVector2Array in Geometry2D.intersect_polygons(bounds, points):
					apertures.append(aperture)
			effect["apertures"] = apertures
		_layers.append(effect)
	if spec.has("roomSmoke"):
		_layers.append({"kind": "roomSmoke", "depth": spec["roomSmoke"]["depth"]})
	_layers.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return a["depth"] < b["depth"])

static func _point(value: Dictionary) -> Vector2:
	return Vector2(value["x"], value["y"])

static func _box(value: Dictionary) -> Rect2:
	return Rect2(value["x"], value["y"], value["w"], value["h"])

static func _rectangle(rect: Rect2) -> PackedVector2Array:
	return PackedVector2Array([rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)])

func pressure() -> float:
	if spec.is_empty():
		return 0.0
	if spec.get("audio", {}).get("theme") == "lift":
		return .12
	return clampf(float(model.run["elapsed"]) / float(spec["durationMs"]), 0.0, 1.0)

func action_danger() -> float:
	var action: Dictionary = model.run["action"]
	if not action.is_empty() and model.interactions.get(action["rule"], {}).get("outcome") == "danger":
		return sin(PI * clampf(float(action["age"]) / float(action["duration"]), 0, 1))
	return 0.0

func intensity(effect: Dictionary) -> float:
	var factor := 1.0
	var mitigated := false
	for reduction: Dictionary in effect.get("reductions", []):
		if model.matches(reduction["when"]):
			mitigated = true
			factor *= float(reduction["factor"])
	return minf(2.0, float(effect.get("strength", 1.0)) * factor * (.3 if mitigated else .3 + pressure() * .7 + action_danger() * .3))

func visible_layers(poses: Dictionary) -> Array[Dictionary]:
	var visible: Array[Dictionary] = []
	for effect: Dictionary in _layers:
		if not model.matches(effect.get("when", {})):
			continue
		var scene: Dictionary = effect.get("whenScene", {})
		if not scene.is_empty():
			var p: Dictionary = poses.get(scene["object"], {})
			if p.get("asset") != scene["asset"] or float(p.get("opacity", 1.0)) <= .0001:
				continue
		visible.append(effect)
	return visible

static func _seed(index: int) -> float:
	return fposmod(sin(index * 127.1 + 311.7) * 43758.5453, 1.0)

func paint(canvas: CanvasItem, effect: Dictionary, poses: Dictionary, reduced: bool) -> void:
	var kind: String = effect["kind"]
	if kind == "roomSmoke":
		_paint_room_smoke(canvas, reduced)
		return
	var level := minf(1.0, intensity(effect))
	if level < .0001:
		return
	var b := _box(effect["box"])
	var time := 0.0 if reduced else float(model.run["elapsed"]) / 1000.0
	var ink := Color.from_string(effect.get("color", DEFAULTS[kind]), Color.WHITE)
	match kind:
		"dust":
			for i: int in range(7 if reduced else 12 + roundi(level * 21.0)):
				var p := b.position + Vector2(fposmod(_seed(i + 1) + time * .014, 1.0), fposmod(_seed(i + 30) + time * (.045 + _seed(i + 80) * .025), 1.0)) * b.size
				ink.a = (.1 + _seed(i + 13) * .25) * level
				canvas.draw_circle(p, 1.5 + _seed(i + 70) * 1.6, ink, true, -1.0, true)
		"rain":
			ink.a = .16 + level * .2
			for i: int in range(8 if reduced else 18 + roundi(level * 28.0)):
				var p := b.position + Vector2(fposmod(_seed(i + 80) - time * .065, 1), fposmod(_seed(i + 40) + time * .7, 1)) * b.size
				var line := PackedVector2Array([p, p + Vector2(-5, 13.0 + _seed(i) * 14.0)])
				_clipped_line(canvas, effect, b, line, ink, 1.4)
		"water":
			var surface := b.position.y + b.size.y * (.72 - level * .28)
			var flood := Rect2(b.position.x, surface, b.size.x, b.end.y - surface)
			ink.a = .2 + level * .18
			_clipped_fill(canvas, effect, _rectangle(flood), ink)
			ink.a = .22 + level * .2
			for row: int in range(4):
				var line: PackedVector2Array = []
				for x: int in range(0, ceili(b.size.x) + 1, 6):
					line.append(Vector2(b.position.x + x, surface + row * maxf(9, b.size.y / 14.0) + sin(x / 34.0 + time * 1.4 + row * 2.0) * (1.0 if reduced else 3.0)))
				if line.size() >= 2:
					_clipped_line(canvas, effect, b, line, ink, 2.0)
		"smoke":
			for i: int in range(5 if reduced else 8 + roundi(level * 8.0)):
				var p := fposmod(_seed(i + 44) + time * (.05 + _seed(i + 10) * .035), 1.0)
				var side := 1.0 - p if b.get_center().x >= float(model.skin["world"]["width"]) * .5 else p
				var center := b.position + Vector2(side, .9 - p * .7 + sin(i * 3.0) * .12) * b.size
				var radius := maxf(9.0, minf(b.size.x, b.size.y) * (.2 + p * .28))
				ink.a = level * (.1 + sin(p * PI) * .24)
				_stamp(canvas, center, radius, ink, b)
		"light", "glow":
			ink.a = level * (.25 if kind == "light" else .18) * (1.0 if reduced else .95 + .05 * sin(time * 1.7))
			_stamp(canvas, b.get_center(), maxf(b.size.x, b.size.y) / 1.5, ink, b)
		"alarm":
			var pulse := .6 if reduced else .35 + .65 * pow((1.0 + sin(time * PI)) * .5, 3)
			canvas.draw_rect(b.grow(-7), Color("a4987e"))
			canvas.draw_rect(b.grow(-7), Color("534e43"), false, 2.0, true)
			ink.a = .4 + pulse * .5
			canvas.draw_circle(b.get_center(), minf(b.size.x, b.size.y) * .23, ink, true, -1.0, true)
			canvas.draw_circle(b.position + b.size * Vector2(.44, .43), 2.5, Color("f9d6a699"), true, -1.0, true)
		"machine":
			ink.a = level * .3
			canvas.draw_rect(b.grow(-3.0 - sin(time * 7.0) * .6), ink, false, 2.0, true)
		"beam":
			var on := .5 if reduced else 1.0 if sin(time * 2.4) > .05 else .08
			var attach: Dictionary = effect.get("beam", {})
			if attach.is_empty():
				ink.a = level * on * .30
				canvas.draw_colored_polygon(PackedVector2Array([b.end, b.position + Vector2(0, 60), b.position + Vector2(b.size.x * .6, 0)]), ink)
			elif poses.has(attach["object"]):
				var ray := attached_beam(poses[attach["object"]], attach)
				var bright := Color(1, .96, .75, level * on * .42)
				var faint := Color(1, .95, .71, level * on * .01)
				canvas.draw_polygon(ray, PackedColorArray([bright, faint, faint, bright]))

func _clipped_line(canvas: CanvasItem, effect: Dictionary, bounds: Rect2, line: PackedVector2Array, color: Color, width: float) -> void:
	for polygon: PackedVector2Array in effect.get("apertures", [_rectangle(bounds)]):
		for clipped: PackedVector2Array in Geometry2D.intersect_polyline_with_polygon(line, polygon):
			if clipped.size() >= 2:
				canvas.draw_polyline(clipped, color, width, true)

func _clipped_fill(canvas: CanvasItem, effect: Dictionary, poly: PackedVector2Array, color: Color) -> void:
	if not effect.has("apertures"):
		canvas.draw_colored_polygon(poly, color)
		return
	for polygon: PackedVector2Array in effect["apertures"]:
		for clipped: PackedVector2Array in Geometry2D.intersect_polygons(poly, polygon):
			if clipped.size() >= 3:
				canvas.draw_colored_polygon(clipped, color)

func _stamp(canvas: CanvasItem, center: Vector2, radius: float, color: Color, clip: Rect2 = Rect2()) -> void:
	if _radial == null:
		var gradient := Gradient.new()
		gradient.colors = PackedColorArray([Color.WHITE, Color(1, 1, 1, 0)])
		_radial = GradientTexture2D.new()
		_radial.width = 96
		_radial.height = 96
		_radial.gradient = gradient
		_radial.fill = GradientTexture2D.FILL_RADIAL
		_radial.fill_from = Vector2(.5, .5)
		_radial.fill_to = Vector2(1, .5)
	var p := Rect2(center - Vector2.ONE * radius, Vector2.ONE * radius * 2.0)
	var area := p.intersection(clip) if clip.has_area() else p
	if not area.has_area():
		return
	var source := Rect2((area.position - p.position) / p.size * 96.0, area.size / p.size * 96.0)
	canvas.draw_texture_rect_region(_radial, area, source, color)

static func attached_beam(pose: Dictionary, attach: Dictionary) -> PackedVector2Array:
	var sprite := _box(pose)
	var pivot := _point(pose["pivot"]) if pose.has("pivot") else Vector2(.5, .5)
	var angle: float = pose.get("rotation", 0)
	var origin := sprite.position + pivot * sprite.size + ((_point(attach["origin"]) - pivot) * sprite.size).rotated(angle)
	var direction := (_point(attach["axis"]) * sprite.size).rotated(angle).normalized()
	var end := origin + direction * float(attach["length"])
	var normal := Vector2(-direction.y, direction.x)
	var near := float(attach["aperture"]) * .5
	var far := near + tan(float(attach["spread"])) * float(attach["length"])
	return PackedVector2Array([origin + normal * near, end + normal * far, end - normal * far, origin - normal * near])

func smoke_rates(at_time: float) -> Vector2:
	var room: Dictionary = spec.get("roomSmoke", {})
	if room.is_empty():
		return Vector2.ZERO
	var closed := _resolved_time(room["closedGoal"])
	var plugged := _resolved_time(room["pluggedGoal"])
	var reinforced := _resolved_time(room["reinforcedGoal"])
	return Vector2(0.0 if at_time >= closed else 1.0, .015 if at_time >= reinforced else .055 if at_time >= plugged else .22)

func _resolved_time(goal: String) -> float:
	if goal in model.run["resolved"]:
		return float(model.run["resolvedAt"].get(goal, model.run["elapsed"]))
	return INF

func smoke_load() -> float:
	var room: Dictionary = spec.get("roomSmoke", {})
	if room.is_empty():
		return 0.0
	var elapsed: float = model.run["elapsed"]
	var times: Array[float] = [0.0, elapsed]
	for key: String in ["closedGoal", "pluggedGoal", "reinforcedGoal"]:
		var time := _resolved_time(room[key])
		if time > 0 and time < elapsed:
			times.append(time)
	times.sort()
	var amount := 0.0
	for i: int in range(1, times.size()):
		var rate := smoke_rates((times[i] + times[i - 1]) * .5)
		amount += (times[i] - times[i - 1]) * (rate.x + rate.y)
	return clampf(float(room["initialLoad"]) + amount / float(room["fillMs"]), 0, 1)

func _paint_room_smoke(canvas: CanvasItem, reduced: bool) -> void:
	var room: Dictionary = spec["roomSmoke"]
	var b := _box(room["ceiling"])
	var load_now := smoke_load()
	var height := b.size.y * (.4 + .6 * load_now)
	var elapsed: float = model.run["elapsed"]
	if _ceiling == null:
		var gradient := Gradient.new()
		gradient.offsets = PackedFloat32Array([0, .60, 1.0])
		gradient.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, .54), Color(1, 1, 1, 0)])
		_ceiling = GradientTexture2D.new()
		_ceiling.width = 8
		_ceiling.height = 64
		_ceiling.gradient = gradient
		_ceiling.fill_from = Vector2(.5, 0)
		_ceiling.fill_to = Vector2(.5, 1)
	canvas.draw_texture_rect(_ceiling, Rect2(b.position, Vector2(b.size.x, height)), false, Color(.13, .12, .14, .10 + load_now * .35))
	for i: int in range(12):
		var x := b.position.x + fposmod(_seed(i + 1) - (0 if reduced else elapsed / 1000.0) * .012, 1.0) * b.size.x
		var y := b.position.y + height * (.12 + _seed(i + 40) * .55)
		_stamp(canvas, Vector2(x, y), 50 + load_now * 55, Color(.19, .18, .2, (.035 + load_now * .09) * 2.1), b)
	_smoke_stream(canvas, room["door"], true, elapsed, reduced)
	_smoke_stream(canvas, room["gap"], false, elapsed, reduced)

func _smoke_stream(canvas: CanvasItem, stream: Dictionary, door: bool, elapsed: float, reduced: bool) -> void:
	for i: int in range(22 if door else 16):
		var age := _seed(i + 80) if reduced else fposmod(elapsed / float(stream["lifetimeMs"]) + _seed(i + 80), 1.0)
		var rates := smoke_rates(elapsed - age * float(stream["lifetimeMs"]))
		var strength := rates.x if door else rates.y / .22
		if strength <= 0:
			continue
		var q := 1.0 - age
		var p := q * q * _point(stream["origin"]) + 2.0 * q * age * _point(stream["control"]) + age * age * _point(stream["end"])
		var radius: float = stream["radius"]
		p.x += 0.0 if reduced else sin(age * 9 + i) * radius * .28
		p.y += (_seed(i + 12) - .5) * float(stream["spread"]) * (1.0 - age * .65)
		var alpha := (.20 if door else .16) * strength * sin(PI * minf(.98, .06 + age * .9))
		_stamp(canvas, p, radius * (.35 + age * .95), Color(.19, .18, .20, alpha * 2.1))
