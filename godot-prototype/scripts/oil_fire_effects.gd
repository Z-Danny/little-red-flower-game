extends Node2D
## Lightweight procedural smoke, water splash and drop-zone affordances.

@export var pan_art: TextureRect

var _clock := 0.0
var _smoke := 0.0
var _splash := -1.0
var _target: ReferenceRect
var _is_exit := false
var _eligible := false
var _hovering := false


func update_view(clock: float, smoke: float, splash: float, target: ReferenceRect,
		is_exit: bool, eligible: bool, hovering: bool) -> void:
	_clock = clock
	_smoke = smoke
	_splash = splash
	_target = target
	_is_exit = is_exit
	_eligible = eligible
	_hovering = hovering
	queue_redraw()


func _draw() -> void:
	if pan_art == null:
		return
	var mouth := pan_art.position + pan_art.size * Vector2(0.39, 0.10)
	if _smoke > 0.001:
		for i in range(6):
			var progress := fposmod(_clock * 0.52 + float(i) / 6.0, 1.0)
			var sway := sin(float(i) * 1.64 + _clock * 2.1) * (8.0 + progress * 43.0)
			var point := mouth + Vector2(sway, -progress * lerpf(130.0, 410.0, _smoke))
			var tint := Color(0.24, 0.20, 0.18, _smoke * sin(progress * PI) * 0.18)
			draw_circle(point, 11.0 + progress * 36.0, tint, true, -1.0, true)
	if _splash >= 0.0 and _splash < 1.0:
		var tint := Color(0.83, 0.93, 0.96, (1.0 - _splash) * 0.86)
		for i in range(9):
			var angle := float(i) * 2.4
			var movement := Vector2(cos(angle) * 110.0, sin(angle) * 83.0) * _splash
			var at := mouth + movement + Vector2(0.0, _splash * _splash * 78.0)
			draw_line(at, at + Vector2(4.0, 9.0), tint, 3.0, true)
	if _target == null:
		return
	var bounds := _target.get_rect()
	var color := Color("c8e4aa") if _is_exit and _eligible else Color("fff0ba")
	var width := 4.0 if _hovering else 2.5
	if not _is_exit:
		for i in range(36):
			var angle := TAU * float(i) / 36.0
			var start := bounds.get_center() + Vector2.from_angle(angle) * bounds.size * 0.5
			var end := bounds.get_center() + Vector2.from_angle(angle + 0.12) * bounds.size * 0.5
			draw_line(start, end, color, width, true)
		return
	var corners := [bounds.position, Vector2(bounds.end.x, bounds.position.y),
		bounds.end, Vector2(bounds.position.x, bounds.end.y)]
	if _hovering and _eligible:
		draw_rect(bounds, Color(color, 0.17))
	for i in range(4):
		draw_dashed_line(corners[i], corners[(i + 1) % 4], color, width, 9.0, true, true)
