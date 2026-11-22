extends Control
## Art and performance only: all commands use the common original-pixel camera.
## Each data-directed effect layer clips to its authored permission mask on GPU.

const Pack = preload("res://scripts/hunt_runner/hunt_pack.gd")
const Rules = preload("res://scripts/hunt_runner/hunt_rules.gd")
const Camera = preload("res://scripts/hunt_runner/hunt_viewport.gd")
const Direction = preload("res://scripts/hunt_runner/hunt_performance.gd")
const Permission = preload("res://scripts/hunt_runner/hunt_permission.gdshader")

signal pressed_at(point: Vector2, is_touch: bool)

class PaintLayer extends Node2D:
	var painter: Callable
	func _draw() -> void:
		painter.call(self)

var camera := Transform2D.IDENTITY
var _pack: Pack
var _run: Rules
var _painting := Node2D.new()
var _layers: Array[PaintLayer] = []
var _art_size: Vector2
var _effects: Dictionary = {}
var _fire_sources: Array = []
var _flame_sources: Array = []
var _legacy_storm := false
var _stage: Dictionary = {}
var _tier := 0
var _glow: GradientTexture2D
var _font: Font
var _reduced_motion := false

func build(pack: Pack, reduced_motion: bool) -> void:
	_pack = pack
	_art_size = Vector2(_pack.world_size)
	_effects = _pack.skin.get("effects", {})
	_fire_sources = _effects.get("fireSources", [])
	for source: Dictionary in _fire_sources:
		if source["kind"] == "flame":
			_flame_sources.append(source)
	_legacy_storm = _pack.performance.is_empty() and _pack.presentation["environment"] == "storm"
	_reduced_motion = reduced_motion
	_font = get_theme_default_font()
	_glow = _make_glow()
	name = "World"
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_painting)
	_add_layer(_draw_base)
	if not _pack.performance.is_empty():
		_add_layer(_draw_vignette, "", true, true)
	if _legacy_storm:
		_add_layer(_draw_legacy_storm, "", true)
		_add_layer(_draw_vignette, "", true, true)
	for layer in [["weatherMask", _draw_rain], ["waterMask", _draw_water], ["skyMask", _draw_sky], ["smokeMask", _draw_smoke], ["fireMask", _draw_fire]]:
		if _pack.texture(layer[0]) != null:
			_add_layer(layer[1], layer[0], true)
	if _pack.presentation["characters"] != "static":
		_add_layer(_draw_family, "characterMask", not _pack.performance.is_empty())
	if not _effects.get("electricSparks", []).is_empty():
		_add_layer(_draw_electric)
	_add_layer(_draw_feedback)
	resized.connect(_layout)
	_layout()

func _layout() -> void:
	if size.x <= 0.0 or size.y <= 0.0:
		return
	camera = Camera.cover(size, _art_size)
	_painting.transform = camera

func tick_view(run: Rules) -> void:
	_run = run
	_tier = Direction.tier(_pack.performance, _run.elapsed_ms, _run.duration_ms)
	_stage = Direction.stage(_pack.performance, _run.elapsed_ms, _run.duration_ms)
	for layer in _layers:
		layer.queue_redraw()

func ending_visible() -> bool:
	return _run != null and (_run.phase == Rules.Phase.REVEAL or _run.phase == Rules.Phase.COMPLETE)

func target_at(point: Vector2, touch: bool) -> String:
	return _pack.hit(point, Camera.pointer_radius(touch, camera.x.length()))

func _gui_input(event: InputEvent) -> void:
	if event.device == InputEvent.DEVICE_ID_EMULATION:
		return # don't receive both a physical tap and its emulated event
	var touch := event is InputEventScreenTouch
	var point: Vector2
	if event is InputEventScreenTouch and event.index == 0 and event.pressed and not event.canceled:
		point = event.position
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and not event.canceled:
		point = event.position
	else:
		return
	accept_event()
	var at := camera.affine_inverse() * point
	if Rect2(Vector2.ZERO, _art_size).has_point(at):
		pressed_at.emit(at, touch)

func _add_layer(painter: Callable, key := "", protect := false, vignette := false) -> void:
	var layer := PaintLayer.new()
	layer.painter = painter
	if protect:
		var material := ShaderMaterial.new()
		material.shader = Permission
		material.set_shader_parameter("world_size", _art_size)
		material.set_shader_parameter("id_mask", _pack.texture("mask"))
		var colors := _pack.target_colors.duplicate()
		colors.resize(6)
		material.set_shader_parameter("target_colors", colors)
		material.set_shader_parameter("target_count", _pack.target_colors.size())
		var allowed := _pack.texture(key)
		material.set_shader_parameter("uses_permission", allowed != null)
		if allowed != null:
			material.set_shader_parameter("permission", allowed)
		material.set_shader_parameter("is_vignette", vignette)
		if vignette:
			material.set_shader_parameter("vignette_center", _art_size * Vector2(0.5, 0.48))
			material.set_shader_parameter("vignette_radii", Vector2(_art_size.x * 0.22, _art_size.y * (0.66 if _legacy_storm else 0.72)))
		layer.material = material
	_painting.add_child(layer)
	_layers.append(layer)

func _draw_base(c: Node2D) -> void:
	var asset := "scene" if _pack.presentation["characters"] == "static" else "clean"
	if ending_visible():
		# GameApp's journey path starts 2600 ms into the authored transition:
		# the complete original ending is already visible throughout safeHold.
		asset = "safe"
	c.draw_texture_rect(_pack.texture(asset), Rect2(Vector2.ZERO, _art_size), false)

func _effects_active() -> bool:
	return _run != null and not ending_visible() and _run.phase != Rules.Phase.READY

func _time() -> float:
	return 0.0 if _reduced_motion else _run.elapsed_ms

func _draw_vignette(c: Node2D) -> void:
	if not _effects_active():
		return
	var intensity := 0.12 + _run.pressure() * 0.45 if _legacy_storm else float(_stage.get("vignette", 0.0))
	if intensity > 0.0:
		c.draw_rect(Rect2(Vector2.ZERO, _art_size), Color(0.066, 0.14, 0.168, intensity))
	if _legacy_storm and not _reduced_motion and _run.pressure() > 0.6:
		var flash := fposmod(_time(), 12000.0)
		if flash < 220.0:
			c.draw_rect(Rect2(Vector2.ZERO, _art_size), Color(0.90, 0.95, 0.98, sin(flash * PI / 220.0) * 0.16))

func _draw_legacy_storm(c: Node2D) -> void:
	if not _effects_active():
		return
	var t := _time()
	var p := _run.pressure()
	var o := Pack.box(_pack.skin["outside"])
	c.draw_rect(o, Color(0.07, 0.133, 0.188, p * 0.24))
	var rain := Color(0.84, 0.93, 0.94, 0.18 + p * 0.25)
	var fall := Vector2(-10.0 - p * 18.0, 20.0 + p * 24.0)
	for i in range(65 + floori(p * 95.0)):
		var speed := 0.7 + Direction.seed(i + 600) * 0.6
		var x := fposmod(Direction.seed(i) * o.size.x + t * (0.025 + p * 0.05) * speed, o.size.x)
		var y := fposmod(Direction.seed(i + 300) * o.size.y + t * (0.21 + p * 0.26) * speed, o.size.y)
		var start := o.position + Vector2(x, y)
		var length := minf(1.0, minf(x / -fall.x, (o.size.y - y) / fall.y))
		if length > 0.0:
			c.draw_line(start, start + fall * length, rain, 1.5, true)
	if p > 0.48:
		var e := Pack.box(_pack.skin["entry"])
		for i in range(28):
			var q := fposmod(t / 1050.0 + i * 0.071, 1.0)
			var start := e.position + Vector2(i * e.size.x / 28.0 + q * 26.0, q * e.size.y)
			c.draw_line(start, start + Vector2(6.0, 12.0), Color(0.78, 0.91, 0.92, (p - 0.4) * (1.0 - q) * 0.55), 1.4, true)
		_ellipse(c, e.position + Vector2(e.size.x * 0.6, e.size.y), Vector2(e.size.x * 0.48, 10.0 + p * 11.0), Color(0.407, 0.61, 0.69, (p - 0.4) * 0.23))

func _draw_rain(c: Node2D) -> void:
	if not _effects_active():
		return
	var t := _time()
	var delta := Vector2(-8.0 - _tier * 6.0, 16.0 + _tier * 5.0)
	var color := Color(0.82, 0.90, 0.91, 0.24 + _tier * 0.06)
	for i in range(int(_stage["rainCount"])):
		var speed := 0.75 + Direction.seed(i + 90) * 0.6
		var p := Vector2(fposmod(Direction.seed(i) * _art_size.x + t * (0.024 + _tier * 0.012) * speed, _art_size.x), fposmod(Direction.seed(i + 300) * _art_size.y + t * (0.2 + _tier * 0.04) * speed, _art_size.y))
		c.draw_line(p, p + delta, color, 1.8, true)
	if _tier >= 2:
		for i in range(9):
			var p := Vector2(fposmod(Direction.seed(i + 800) * _art_size.x + t * 0.045, _art_size.x), Direction.seed(i + 900) * _art_size.y + sin(t * 0.001 + i) * 12.0)
			_ellipse(c, p, Vector2(4.0, 1.7), Color(0.396, 0.44, 0.28, 0.42), i + t * 0.001)

func _draw_water(c: Node2D) -> void:
	if not _effects_active() or _tier < 2:
		return
	for i in range(22):
		var q := fposmod(_time() / 1600.0 + Direction.seed(i), 1.0)
		var point := Vector2(Direction.seed(i + 20), Direction.seed(i + 60)) * _art_size
		var radius := Vector2(3.0 + q * 15.0, 1.0 + q * 3.0)
		c.draw_polyline(_arc_points(point, radius, 0.0, TAU, 0.0, 20), Color(0.81, 0.89, 0.90, (1.0 - q) * 0.26), 1.4, true)

func _draw_sky(c: Node2D) -> void:
	if not _effects_active() or _reduced_motion:
		return
	var age := Direction.distant_thunder_age(_pack.performance, _run.elapsed_ms, _run.duration_ms)
	if age >= 0.0:
		c.draw_rect(Rect2(Vector2.ZERO, _art_size), Color(0.89, 0.92, 0.93, sin(age * PI / 700.0) * 0.09))

func _draw_smoke(c: Node2D) -> void:
	if not _effects_active() or _flame_sources.is_empty():
		return
	var drift := float(_effects.get("smokeDrift", -1))
	var alpha := float(_stage["smokeAlpha"])
	for i in range(int(_stage["smokeCount"])):
		var b := Pack.box(_flame_sources[i % _flame_sources.size()])
		var q := fposmod(_time() / 4200.0 + Direction.seed(i + 600), 1.0)
		var at := b.position + Vector2(b.size.x * 0.5 + drift * q * b.size.x * 1.1 + sin(q * 5.0 + i) * 6.0, b.size.y * 0.45 - q * (b.size.y * 2.4 + 38.0))
		var radius := 7.0 + q * (b.size.x * 0.35 + 15.0)
		_paint_glow(c, at, radius, Color(0.16, 0.17, 0.17, alpha * (1.0 - q) * 0.56))

func _draw_fire(c: Node2D) -> void:
	if not _effects_active():
		return
	var t := _time()
	for index in range(_fire_sources.size()):
		var source: Dictionary = _fire_sources[index]
		var b := Pack.box(source)
		var at := Vector2(b.get_center().x, b.end.y)
		match source["kind"]:
			"ember":
				_paint_glow(c, Vector2(at.x, b.position.y + b.size.y * 0.55), b.size.x * 0.5, Color(0.93, 0.42, 0.18, 0.25 + sin(t * 0.003 + index) * 0.08))
			"fountain":
				for i in range(7):
					var q := fposmod(t / 900.0 + i * 0.14, 1.0)
					var point := at + Vector2((Direction.seed(i + 20) - 0.5) * b.size.x * q, -b.size.y * sin(q * PI * 0.5))
					c.draw_line(point, point + Vector2(1.8, 4.0), Color(0.95, 0.78, 0.47, 0.65), 1.5, true)
			"flame":
				for j in range(4):
					var spread := b.size.x * 0.22
					var height := b.size.y * float(_stage["flameScale"]) * (0.68 + 0.19 * sin(t * 0.007 + j + index))
					var base := at + Vector2((j - 1.5) * b.size.x * 0.16, 0.0)
					var tongue := PackedVector2Array([base + Vector2(-spread, 0.0), base + Vector2(-spread * 0.72, -height * 0.44), base + Vector2(sin(t * 0.004 + j) * 5.0, -height), base + Vector2(spread * 0.75, -height * 0.45), base + Vector2(spread, 0.0)])
					var colors := PackedColorArray([Color(0.9, 0.35, 0.12, 0.0), Color(0.96, 0.48, 0.18, 0.50), Color(1.0, 0.88, 0.6, 0.24), Color(0.97, 0.63, 0.28, 0.5), Color(0.9, 0.35, 0.12, 0.0)])
					c.draw_polygon(tongue, colors)
				if _tier >= 2:
					for i in range(3):
						var q := fposmod(t / 1450.0 + i * 0.3 + index * 0.15, 1.0)
						var point := at + Vector2(float(_effects.get("smokeDrift", -1)) * q * b.size.x * 0.3, -q * b.size.y * 1.6)
						c.draw_rect(Rect2(point, Vector2(2.0, 3.0)), Color(0.94, 0.74, 0.45, (1.0 - q) * 0.55))

func _draw_family(c: Node2D) -> void:
	if ending_visible():
		return
	var b := Pack.box(_pack.skin["familyBox"])
	var texture := _pack.texture("family")
	if _run == null or _reduced_motion:
		c.draw_texture_rect(texture, b, false)
		return
	var t := _time()
	if _pack.performance.is_empty():
		var p := _run.pressure() if _pack.presentation["characters"] == "storm" else 0.0
		var breath := sin(t * (0.003 + p * 0.004)) * (1.6 + p * 3.0)
		var lean := sin(t * 0.0017) * (0.003 + p * 0.008)
		_ellipse(c, Vector2(b.position.x + b.size.x * 0.52, b.end.y - 4.0), Vector2(b.size.x * 0.4, 8.0), Color(0.31, 0.23, 0.145, 0.19))
		c.draw_set_transform(Vector2(b.get_center().x, b.end.y), lean)
		for i in range(36):
			var k := 1.0 - i / 36.0
			var y := i * b.size.y / 36.0
			var sh := minf(b.size.y - y, b.size.y / 36.0 + 1.0)
			var dx := sin(t * 0.012 + i * 0.07) * p * 1.8 * k
			c.draw_texture_rect_region(texture, Rect2(-b.size.x * 0.5 + dx, -b.size.y + y - breath * k, b.size.x, sh + breath / 36.0), Rect2(0.0, y, b.size.x, sh))
		c.draw_set_transform(Vector2.ZERO)
		return
	if _stage.is_empty():
		c.draw_texture_rect(texture, b, false)
		return
	var miss := sin(minf(1.0, _run.miss_age_ms / 450.0) * PI) * 3.0 if _run.miss_age_ms >= 0.0 else 0.0
	var age := t - _run.last_found_at_ms if _run.last_found_at_ms >= 0.0 else -1.0
	var nod := sin(age * PI / 360.0) * 3.0 if age >= 0.0 and age < 360.0 else 0.0
	var thunder := Direction.distant_thunder_age(_pack.performance, t, _run.duration_ms)
	var startle := sin(thunder * PI / 180.0) * 2.0 if thunder >= 0.0 and thunder < 180.0 else 0.0
	var breath := sin(t * TAU / float(_stage["breathMs"])) * float(_stage["breathPx"])
	var retract := float(_stage["retractPx"]) + miss + startle
	var dir := float(_pack.performance["retreatDirection"])
	for i in range(48):
		var k := 1.0 - i / 47.0
		var upper := maxf(0.0, (k - 0.2) / 0.8)
		var y := i * b.size.y / 48.0
		var sh := minf(b.size.y - y, b.size.y / 48.0 + 1.0)
		var rect := Rect2(b.position.x + dir * retract * upper * upper, b.position.y + y - breath * upper + nod * maxf(0.0, (k - 0.7) / 0.3), b.size.x, sh + (breath / 48.0 if upper > 0.0 else 0.0))
		c.draw_texture_rect_region(texture, rect, Rect2(0.0, y, b.size.x, sh))

func _draw_electric(c: Node2D) -> void:
	if _run == null or _run.phase != Rules.Phase.PLAYING:
		return
	for source: Dictionary in _effects.get("electricSparks", []):
		var age := Direction.spark_age(source, _run.elapsed_ms)
		if not _reduced_motion and (age < 0.0 or age >= 360.0):
			continue
		var slot := Direction.spark_slot(source, _run.elapsed_ms)
		var at := Vector2(source["x"], source["y"])
		var radius := float(source["radius"]) * (0.72 + _run.pressure() * 0.28)
		var alpha := 0.22 if _reduced_motion else sin(age * PI / 360.0)
		_paint_glow(c, at, radius, Color(1.0, 0.9, 0.63, alpha * 0.75))
		if _reduced_motion:
			continue
		for i in range(6):
			var angle := i * PI / 3.0 + slot * 0.7
			var reach := radius * (0.65 + 0.25 * sin(i * 7.0 + slot))
			var points := PackedVector2Array([at, at + Vector2(reach * 0.35, 3.0).rotated(angle), at + Vector2(reach * 0.50, -3.0).rotated(angle), at + Vector2(reach, 0.0).rotated(angle)])
			c.draw_polyline(points, Color(0.91, 0.63, 0.24, alpha), 4.0, true)
			c.draw_polyline(points, Color(1.0, 0.98, 0.89, alpha), 1.6, true)

func _draw_feedback(c: Node2D) -> void:
	if _run == null:
		return
	if ending_visible():
		if _pack.presentation["celebration"] and not _reduced_motion:
			var age := _run.reveal_ms + 2600.0
			for i in range(22):
				var q := clampf((age - 1800.0 - i * 33.0) / 2400.0, 0.0, 1.0)
				var point := Vector2(fposmod(i * 167.0, _art_size.x) + sin(q * 5.0 + i) * 22.0, _art_size.y * (0.84 - q * 0.7))
				var color := Color("f6d57b") if i % 3 != 0 else Color("ef7463")
				color.a = sin(q * PI) * 0.7
				_ellipse(c, point, Vector2(3.0, 7.0), color, i + q)
		return
	for id in _run.found:
		_ring(c, _pack.bounds(id), 1.0)
	if not _run.marking_id.is_empty():
		_ring(c, _pack.bounds(_run.marking_id), _run.mark_age_ms / _run.mark_duration_ms)
	if _run.miss_age_ms >= 0.0:
		var age := _run.miss_age_ms
		var point := _run.miss_position
		var color := Color("efb75b") if _run.feedback_v2 else Color("fff0cb")
		color.a = clampf(1.0 - (age - 120.0) / 330.0, 0.0, 1.0) if _run.feedback_v2 else (1.0 - age / 420.0)
		c.draw_arc(point, 10.0 + age / 18.0, 0.0, TAU, 30, color, 2.0, true)
		if _run.feedback_v2:
			c.draw_line(point - Vector2(5, 5), point + Vector2(5, 5), color, 3.0, true)
			c.draw_line(point - Vector2(-5, 5), point + Vector2(-5, 5), color, 3.0, true)
	if _run.penalty_age_ms >= 0.0 and _run.phase == Rules.Phase.PLAYING:
		var age := _run.penalty_age_ms
		var point := _run.penalty_position
		var penalty := "−%d 秒" % roundi(_run.miss_penalty_ms / 1000.0)
		var width := _font.get_string_size(penalty, HORIZONTAL_ALIGNMENT_LEFT, -1, 30).x
		var at := Vector2(clampf(point.x, 100.0, _art_size.x - 100.0) - width * 0.5, clampf(point.y - 24.0 - age * 0.012, 150.0, _art_size.y - 100.0))
		var alpha := minf(1.0, (1600.0 - age) / 400.0)
		c.draw_string_outline(_font, at, penalty, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, 6, Color(1.0, 0.97, 0.91, alpha))
		c.draw_string(_font, at, penalty, HORIZONTAL_ALIGNMENT_LEFT, -1, 30, Color(0.79, 0.28, 0.21, alpha))

static func _ring(c: Node2D, b: Rect2, progress: float) -> void:
	if progress <= 0.0:
		return
	var pulse := 1.0 + sin(progress * PI) * 0.07 if progress < 1.0 else 1.0
	var start := -PI * 0.55
	var points := _arc_points(b.get_center(), (b.size * 0.5 + Vector2(10.0, 10.0)) * pulse, start, start + TAU * minf(1.0, progress * 1.4), -0.06, 72)
	c.draw_polyline(points, Color("fff2dd"), 10.0, true)
	c.draw_polyline(points, Color("ed3d36"), 6.0, true)
	if progress >= 1.0:
		var at := b.get_center() + b.size * Vector2(0.32, -0.35)
		c.draw_circle(at, 12.0, Color("ed3d36"), true, -1.0, true)
		c.draw_polyline(PackedVector2Array([at + Vector2(-5.0, 0.0), at + Vector2(-1.0, 4.0), at + Vector2(6.0, -5.0)]), Color("fff7df"), 3.0, true)

static func _ellipse(c: Node2D, at: Vector2, radius: Vector2, color: Color, rot := 0.0) -> void:
	var vertices := _arc_points(at, radius, 0.0, TAU, rot, 20)
	vertices.remove_at(vertices.size() - 1)
	c.draw_colored_polygon(vertices, color)

static func _arc_points(at: Vector2, radius: Vector2, start: float, end: float, rot: float, segments: int) -> PackedVector2Array:
	var points := PackedVector2Array()
	points.resize(segments + 1)
	for i in range(segments + 1):
		var angle := lerpf(start, end, i / float(segments))
		points[i] = at + (Vector2.from_angle(angle) * radius).rotated(rot)
	return points

static func _make_glow() -> GradientTexture2D:
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 0.4, 1.0])
	gradient.colors = PackedColorArray([Color.WHITE, Color(1.0, 1.0, 1.0, 0.50), Color(1.0, 1.0, 1.0, 0.0)])
	var glow := GradientTexture2D.new()
	glow.width = 64
	glow.height = 64
	glow.fill = GradientTexture2D.FILL_RADIAL
	glow.fill_from = Vector2(0.5, 0.5)
	glow.fill_to = Vector2(1.0, 0.5)
	glow.gradient = gradient
	return glow

func _paint_glow(c: Node2D, at: Vector2, radius: float, color: Color) -> void:
	var half := Vector2(radius, radius)
	c.draw_texture_rect(_glow, Rect2(at - half, half * 2.0), false, color)
