extends RefCounted
## Uniform framing shared by native scene runners. Hit-testing uses the inverse
## of the same Transform2D as textures; logical coords never depend on DPR.

static func rect(data: Dictionary) -> Rect2:
	return Rect2(float(data.x), float(data.y), float(data.w), float(data.h))

static func point(data: Dictionary) -> Vector2:
	return Vector2(float(data.x), float(data.y))

static func cover(bounds: Rect2, viewport: Vector2, critical: Rect2 = Rect2()) -> Transform2D:
	var ratio := maxf(viewport.x / bounds.size.x, viewport.y / bounds.size.y)
	var origin := (viewport - bounds.size * ratio) * 0.5 - bounds.position * ratio
	if critical.has_area():
		var left := maxf(viewport.x - bounds.end.x * ratio, -critical.position.x * ratio)
		var right := minf(-bounds.position.x * ratio, viewport.x - critical.end.x * ratio)
		var top := maxf(viewport.y - bounds.end.y * ratio, -critical.position.y * ratio)
		var bottom := minf(-bounds.position.y * ratio, viewport.y - critical.end.y * ratio)
		if left <= right:
			origin.x = clampf(origin.x, left, right)
		if top <= bottom:
			origin.y = clampf(origin.y, top, bottom)
	return Transform2D(Vector2(ratio, 0.0), Vector2(0.0, ratio), origin)

static func union_boxes(boxes: Array) -> Rect2:
	var result := Rect2()
	for box: Dictionary in boxes:
		result = result.merge(rect(box)) if result.has_area() else rect(box)
	return result

static func texture(path: String) -> Texture2D:
	return load(path) as Texture2D if not path.is_empty() and ResourceLoader.exists(path, "Texture2D") else null
