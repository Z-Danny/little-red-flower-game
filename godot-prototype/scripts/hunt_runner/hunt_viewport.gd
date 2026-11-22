extends RefCounted
## A single cover transform for art, actors, rings, endings and inverse mask input.

static func cover(view_size: Vector2, world_size: Vector2) -> Transform2D:
	var factor := maxf(view_size.x / world_size.x, view_size.y / world_size.y)
	return Transform2D(0.0, Vector2(factor, factor), 0.0, (view_size - world_size * factor) * 0.5)

static func pointer_radius(touch: bool, visual_scale: float) -> float:
	return minf(24.0, (10.0 if touch else 6.0) / visual_scale) if visual_scale > 0.0 else 0.0
