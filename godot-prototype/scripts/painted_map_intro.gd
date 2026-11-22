extends ColorRect

signal closed
signal started

const Painted = preload("res://scripts/painted_chrome.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
const COPY := "res://assets/restored_ui/level-introductions.json"

var _original_copy := {}
var _outside_since := Vector2.INF

@onready var start_button: Button = $Card/Start

func _ready() -> void:
	_original_copy = Catalog.read_json(COPY)
	Painted.action(start_button)
	start_button.pressed.connect(func() -> void:
		if not start_button.disabled: started.emit()
	)
	$Card/Close.pressed.connect(func() -> void: closed.emit())

func display(entry: Dictionary, status: String, requirement: String, can_start: bool) -> void:
	var intro: Dictionary = _original_copy.get(entry.id, {})
	$Card/Title.text = entry.title
	$Card/Title.add_theme_font_size_override("font_size", 25 if String(entry.title).length() > 11 else 30)
	$Card/Copy.text = intro.get("description", entry.description)
	$Card/State.text = requirement if not can_start else ""
	start_button.disabled = not can_start
	if can_start:
		start_button.text = "再玩一次" if status == "complete" else intro.get("startLabel", "开始练习")
	else:
		start_button.text = "尚未解锁" if status == "locked" else "暂未开放"
	var reference: Variant = entry.get("reference_seconds")
	$Note.text = "先正确处置，再挑战速度；重玩只补差额。" if can_start and reference != null else ""
	_outside_since = Vector2.INF
	show()
	$Card.grab_focus()

func _gui_input(event: InputEvent) -> void:
	if event is not InputEventMouseButton or event.button_index != MOUSE_BUTTON_LEFT:
		return
	var position_in_shade: Vector2 = event.position
	var outside: bool = not $Card.get_rect().has_point(position_in_shade)
	if event.pressed:
		_outside_since = position_in_shade if outside else Vector2.INF
	else:
		if outside and _outside_since.is_finite() and _outside_since.distance_to(position_in_shade) < 18.0:
			closed.emit()
		_outside_since = Vector2.INF
	accept_event()
