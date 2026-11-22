extends Control

signal back_requested
signal island_opened(index: int, island: Resource)

const IslandInfo = preload("res://scripts/island_info.gd")
const CARD = preload("res://scenes/island_card.tscn")

@export var islands: Array[Resource] = []
@export_range(20.0, 55.0) var step_degrees := 38.0
@export_range(0.1, 0.6) var snap_seconds := 0.29

@onready var _track: Control = %Track
@onready var _counter: Label = %Counter

var _cards: Array[Control] = []
var _index := 0
var _position := 0.0
var _holding := false
var _start := Vector2.ZERO
var _snap: Tween

func _ready() -> void:
	%Back.pressed.connect(func() -> void: back_requested.emit())
	%Track.gui_input.connect(_track_input)
	_track.resized.connect(_place_cards)
	%EditorPreview.hide()
	for i in islands.size():
		var info := islands[i] as IslandInfo
		var card := CARD.instantiate() as Control
		_track.add_child(card)
		(card.get_node("Art") as TextureRect).texture = info.art
		(card.get_node("Badge/Number") as Label).text = "%02d" % (i + 1)
		_cards.append(card)
	_show_index(0, false)

func set_current(index: int) -> void:
	_show_index(index, false)

func _show_index(index: int, tween: bool = true) -> void:
	if islands.is_empty():
		return
	_index = clampi(index, 0, islands.size() - 1)
	_counter.text = "%02d / %02d" % [_index + 1, islands.size()]
	if is_instance_valid(_snap):
		_snap.kill()
	if tween:
		_snap = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		_snap.tween_method(_set_carousel_position, _position, float(_index), snap_seconds)
	else:
		_set_carousel_position(float(_index))

func _set_carousel_position(value: float) -> void:
	_position = value
	_place_cards()

func _place_cards() -> void:
	var radius := _track.size.x
	for i in _cards.size():
		var card := _cards[i]
		var delta := float(i) - _position
		var distance := absf(delta)
		card.visible = distance < 1.9
		if not card.visible:
			continue
		var radians := deg_to_rad(delta * step_degrees)
		var center := Vector2(radius * 0.5 + sin(radians) * radius, _track.size.y * 0.5 + (cos(radians) - 1.0) * radius)
		card.position = center - card.size * 0.5
		card.scale = Vector2.ONE * maxf(0.58, 1.0 - distance * 0.34)
		card.modulate.a = 1.0 - distance * 0.35
		card.z_index = 30 - roundi(distance * 10)

func _track_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			if is_instance_valid(_snap):
				_snap.kill()
			_holding = true
			_start = event.position
		else:
			if not _holding:
				return
			_holding = false
			var motion: Vector2 = event.position - _start
			if absf(motion.x) > 54.0 and absf(motion.x) > absf(motion.y):
				_show_index(_index + (-1 if motion.x > 0.0 else 1))
			else:
				var tapped := -1
				if motion.length() < 14.0:
					tapped = _pick_card(event.position)
				if tapped >= 0:
					_open(tapped)
				else:
					_show_index(_index)
		_track.accept_event()
	elif event is InputEventMouseMotion and _holding:
		var motion: Vector2 = event.position - _start
		if motion.length() > 9.0 and absf(motion.x) > absf(motion.y):
			var offset := clampf(-motion.x / (_track.size.x * sin(deg_to_rad(step_degrees))), -1.0, 1.0)
			if (_index == 0 and offset < 0.0) or (_index == islands.size() - 1 and offset > 0.0):
				offset *= 0.18
			_set_carousel_position(float(_index) + offset)
		_track.accept_event()

func _pick_card(point: Vector2) -> int:
	var global_point: Vector2 = _track.get_global_transform() * point
	for offset: int in [0, -1, 1]:
		var i := _index + offset
		if i < 0 or i >= _cards.size() or not _cards[i].visible:
			continue
		var card := _cards[i]
		var local: Vector2 = card.get_global_transform().affine_inverse() * global_point
		if Rect2(Vector2.ZERO, card.size).has_point(local) or (card.get_node("Badge") as Control).get_rect().has_point(local):
			return i
	return -1

func _open(i: int) -> void:
	if i >= 0 and i < islands.size():
		island_opened.emit(i, islands[i])

func _unhandled_key_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	match event.keycode:
		KEY_LEFT: _show_index(_index - 1)
		KEY_RIGHT: _show_index(_index + 1)
		KEY_HOME: _show_index(0)
		KEY_END: _show_index(islands.size() - 1)
		KEY_ENTER, KEY_KP_ENTER: _open(_index)
		KEY_ESCAPE: back_requested.emit()
		_: return
	get_viewport().set_input_as_handled()
