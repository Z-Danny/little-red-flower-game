extends Control
## Liquid overlay for the original thermometer shell and its authored SVG chamber.

const VIEW_ORIGIN := Vector2(312, 32)
const VIEW_WIDTH := 400.0
const LIQUID_TOP := 154.0
const LIQUID_BOTTOM := 1410.0
const PIGMENT := Color("ce493d")
const MINIMUM_FILL := 0.065

var _fill := 0.2707
var _chamber := PackedVector2Array()


func _ready() -> void:
	var curve := Curve2D.new()
	curve.add_point(Vector2(483, 179), Vector2.ZERO, Vector2(0, -21))
	curve.add_point(Vector2(512, 146), Vector2(-17, 0), Vector2(17, 0))
	curve.add_point(Vector2(541, 179), Vector2(0, -21))
	curve.add_point(Vector2(541, 1167), Vector2.ZERO, Vector2(0, 12.67))
	curve.add_point(Vector2(557, 1194), Vector2(-10.67, -5.33), Vector2(40, 18))
	curve.add_point(Vector2(619, 1300), Vector2(0, -48), Vector2(0, 65))
	curve.add_point(Vector2(512, 1403), Vector2(59, 0), Vector2(-61, 0))
	curve.add_point(Vector2(405, 1300), Vector2(0, 65), Vector2(0, -48))
	curve.add_point(Vector2(467, 1194), Vector2(-40, 18), Vector2(10.67, -5.33))
	curve.add_point(Vector2(483, 1167), Vector2(0, 12.67))
	curve.add_point(Vector2(483, 179))
	_chamber = curve.tessellate()
	_chamber.resize(_chamber.size() - 1) # The draw path closes automatically.


func update_heat(heat: float, safe: bool, delta: float) -> void:
	var target := 0.0 if safe else lerpf(MINIMUM_FILL, 1.0, clampf(heat, 0.0, 1.0))
	var fill := target if safe or heat >= 1.0 else lerpf(_fill, target, 1.0 - exp(-delta / 0.105))
	if not is_equal_approx(fill, _fill):
		_fill = fill
		queue_redraw()


func _draw() -> void:
	if _fill <= 0.0 or _chamber.is_empty():
		return
	var liquid_y := lerpf(LIQUID_BOTTOM, LIQUID_TOP, _fill)
	var factor := size.x / VIEW_WIDTH
	var points := PackedVector2Array()
	var previous := _chamber[-1]
	for point in _chamber:
		if (point.y >= liquid_y) != (previous.y >= liquid_y):
			var cross_x := lerpf(previous.x, point.x, inverse_lerp(previous.y, point.y, liquid_y))
			points.append((Vector2(cross_x, liquid_y) - VIEW_ORIGIN) * factor)
		if point.y >= liquid_y:
			points.append((point - VIEW_ORIGIN) * factor)
		previous = point
	if points.size() >= 3:
		draw_colored_polygon(points, PIGMENT)
	if liquid_y < 1175.0:
		var top := Vector2(495, liquid_y + 12.0) - VIEW_ORIGIN
		var bottom := Vector2(495, 1178) - VIEW_ORIGIN
		draw_line(top * factor, bottom * factor, Color(1.0, 0.95, 0.83, 0.4), 1.25, true)
