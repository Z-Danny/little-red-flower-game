extends Control
## The stop's origin is the catalog ground contact. Only its plaque moves to clear the HUD.

signal selected

const WOOD_NATURE = preload("res://assets/map_ui/map_plaque_nature.webp")
const WOOD_HOME = preload("res://assets/map_ui/map_plaque_home.webp")
const BUD = preload("res://assets/map_ui/map_bud.webp")
const FLOWER = preload("res://assets/map_ui/map_flower.webp")
const STAMP = preload("res://assets/map_ui/map_plaque_stamp.svg")
const LOCK = preload("res://assets/map_ui/map_lock.svg")
const HUD_GAP := 12.0
const HUD_APPROACH := 48.0

@export var plaque_rim: StyleBoxFlat
@export var plaque_shadow: StyleBoxFlat
@export var muted_plaque: ShaderMaterial
@export var muted_plant: ShaderMaterial

@onready var _plaque: Button = %Plaque
@onready var _plant: TextureButton = %Plant
@onready var _face: TextureRect = %Face
@onready var _title: Label = %Title
var _plaque_home_x := 0.0

func _ready() -> void:
	_plaque.pressed.connect(selected.emit)
	_plant.pressed.connect(selected.emit)
	for button: BaseButton in [_plaque, _plant]:
		button.button_down.connect(_show_press.bind(true))
		button.button_up.connect(_show_press.bind(false))

func place(entry: Dictionary, island_id: String, ground: Vector2, map_size: Vector2) -> void:
	position = ground
	_title.text = entry.title
	%Number.text = "%02d" % int(entry.number)
	_face.texture = WOOD_HOME if island_id == "home" else WOOD_NATURE
	var motif: TextureRect = %Motif
	var motif_path := "res://assets/map_ui/motifs/map_%s.svg" % String(entry.id)
	if ResourceLoader.exists(motif_path, "Texture2D"):
		motif.texture = load(motif_path) as Texture2D
		_title.offset_right = motif.offset_left - 4.0
	_plaque_home_x = clampf(ground.x - _plaque.size.x * 0.5, 8.0, map_size.x - _plaque.size.x - 8.0)
	_plaque.position = Vector2(_plaque_home_x, clampf(ground.y + 12.0, 8.0, map_size.y - _plaque.size.y - 8.0)) - ground

func set_status(status: String, caption: String) -> void:
	var complete := status == "complete"
	var available := status == "available"
	var dormant := not complete and not available
	_plant.texture_normal = FLOWER if complete else BUD
	_plant.material = muted_plant if dormant else null
	_plant.self_modulate.a = 0.65 if dormant else 1.0
	_face.material = muted_plaque if dormant else null
	%Motif.self_modulate.a = 0.75 if dormant else 1.0
	%Rim.add_theme_stylebox_override("panel", plaque_rim if available else plaque_shadow)
	%Status.text = caption
	%StateMark.texture = STAMP if complete else LOCK if status == "locked" else null
	_plaque.accessibility_name = "%s，%s" % [_title.text, caption]
	_plant.accessibility_name = _plaque.accessibility_name
	_plaque.tooltip_text = _title.text
	_plant.tooltip_text = _title.text

func avoid_hud(hud: Rect2) -> void:
	# Recompute from the authored rest position, never from the last scroll frame.
	# The 48px approach makes the signs move aside before they meet the tools.
	var clear_y := hud.end.y + HUD_GAP
	var clearance := 1.0 - smoothstep(clear_y, clear_y + HUD_APPROACH, plaque_top())
	var safe_x := minf(_plaque_home_x, hud.position.x - HUD_GAP - _plaque.size.x)
	_plaque.position.x = roundf(lerpf(_plaque_home_x, maxf(8.0, safe_x), clearance) - position.x)
	# Keep the map number clear of the toolbar on far-right stops as well.
	%Number.position.x = 1.0 if position.x + 40.0 > hud.position.x - HUD_GAP else 51.0

func plaque_top() -> float:
	return position.y + _plaque.position.y

func focus_plaque() -> void:
	_plaque.grab_focus()

func _show_press(pressed: bool) -> void:
	_face.self_modulate = Color(0.88, 0.88, 0.88) if pressed else Color.WHITE
