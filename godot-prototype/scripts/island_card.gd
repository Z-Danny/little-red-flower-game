extends TextureButton

const IslandInfo = preload("res://scripts/island_info.gd")
const FILLED_STAR = preload("res://assets/ui/island-progress-star-full.webp")
const EMPTY_STAR = preload("res://assets/ui/island-progress-star-empty.webp")
const MAX_PROGRESS_STARS := 12

@onready var _name_plaque: TextureRect = $IslandNamePlaque
@onready var _name_label: Label = $IslandNamePlaque/IslandName
@onready var _progress: Control = $Progress
@onready var _stars: HBoxContainer = $Progress/ProgressStars

var _lit_stars := 0
var _star_pulse: Tween

func _ready() -> void:
	for index in MAX_PROGRESS_STARS:
		var star := TextureRect.new()
		star.mouse_filter = Control.MOUSE_FILTER_IGNORE
		star.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		star.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		star.hide()
		_stars.add_child(star)

func display(island: IslandInfo, counts: Vector2i) -> void:
	texture_normal = island.art
	_name_label.text = "\n".join(island.title.split(""))
	_name_label.accessibility_name = island.title
	accessibility_name = "进入%s，已完成 %d 关，共 %d 关" % [island.title, counts.x, counts.y]
	var visible_stars := mini(counts.y, MAX_PROGRESS_STARS)
	_lit_stars = mini(counts.x, visible_stars)
	if is_instance_valid(_star_pulse):
		_star_pulse.kill()
	var star_size := 19.0 if visible_stars > 9 else 24.0
	for index in MAX_PROGRESS_STARS:
		var star: TextureRect = _stars.get_child(index)
		star.custom_minimum_size = Vector2.ONE * star_size
		star.texture = FILLED_STAR if index < _lit_stars else EMPTY_STAR
		star.scale = Vector2.ONE
		star.visible = index < visible_stars

func animate_earned_stars() -> void:
	if _lit_stars == 0:
		return
	if is_instance_valid(_star_pulse):
		_star_pulse.kill()
	_star_pulse = create_tween()
	_star_pulse.tween_method(_set_star_pulse, 0.0, PI, 0.28)

func _set_star_pulse(phase: float) -> void:
	for index in _lit_stars:
		var star: TextureRect = _stars.get_child(index)
		star.pivot_offset = star.size * 0.5
		star.scale = Vector2.ONE * (1.0 + 0.16 * sin(phase))

func contains_parent_point(point: Vector2) -> bool:
	var local := get_transform().affine_inverse() * point
	return (
		Rect2(Vector2.ZERO, size).has_point(local)
		or _name_plaque.get_rect().has_point(local)
		or _progress.get_rect().has_point(local)
	)
