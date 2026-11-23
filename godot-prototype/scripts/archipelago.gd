extends Control

signal back_requested
signal island_opened(index: int, island: Resource)
signal selection_settled

const IslandInfo = preload("res://scripts/island_info.gd")
const IslandCard = preload("res://scripts/island_card.gd")
const CARD = preload("res://scenes/island_card.tscn")
const Catalog = preload("res://scripts/level_catalog.gd")
const Save = preload("res://scripts/journey_save.gd")
const ARC_RADIUS := 240.0
const ARC_STEP := PI * 80.0 / 180.0
const DRAG_THRESHOLD := 20.0
const CENTER_SLOT := 2

@export var islands: Array[Resource] = []

@onready var _carousel: Control = %Carousel
@onready var _selected: IslandCard = %SelectedIsland

var _portraits: Array[IslandCard] = []
var _shown_islands: Array[int] = []
var _counts: Array[Vector2i] = []
var _index := -1
var _settled_index := -1
var _position := 0.0
var _snap: Tween
var _touch := -1
var _mouse_dragging := false
var _drag_origin := Vector2.ZERO
var _drag_position := 0.0
var _drag_target := 0.0
var _dragged := false

func _ready() -> void:
	set_process(false)
	%Back.pressed.connect(back_requested.emit)
	_selected.pressed.connect(_open)
	_carousel.gui_input.connect(_start_input)
	_counts.resize(islands.size())
	# Reuse the same five views during motion. Three remain visible after snapping.
	for slot in range(-2, 3):
		var portrait := _selected
		if slot != 0:
			portrait = CARD.instantiate() as IslandCard
			portrait.focus_mode = Control.FOCUS_NONE
			_carousel.add_child(portrait)
		_portraits.append(portrait)
		_shown_islands.append(-1)
	_carousel.resized.connect(func() -> void:
		if _index >= 0:
			_place_islands(_position)
	)
	set_current(0)

func show_progress(catalogue: Catalog, progress: Save) -> void:
	var playable := catalogue.playable_ids()
	for index in islands.size():
		var id := String(islands[index].island_id)
		var total := 0
		var cleared := 0
		for stop: Dictionary in catalogue.map_for(id).get("stops", []):
			if String(stop.id) in playable:
				total += 1
				if progress.flowers_for(String(stop.id)) > 0:
					cleared += 1
		_counts[index] = Vector2i(cleared, total)
	if _index >= 0:
		_place_islands(_position, true)

func set_current(index: int, notify := false) -> void:
	if islands.is_empty():
		return
	_stop_snap()
	_settle_at(clampi(index, 0, islands.size() - 1), notify)

func _place_islands(position_on_arc: float, refresh := false) -> void:
	_position = position_on_arc
	var nearest := roundi(position_on_arc)
	for slot in _portraits.size():
		var step := slot - CENTER_SLOT
		var relative := float(nearest + step) - position_on_arc
		var portrait := _portraits[slot]
		var distance := absf(relative)
		portrait.visible = distance < 1.65
		if not portrait.visible:
			continue
		var island_index := wrapi(nearest + step, 0, islands.size())
		if refresh or _shown_islands[slot] != island_index:
			portrait.display(islands[island_index] as IslandInfo, _counts[island_index])
			_shown_islands[slot] = island_index
		var center := _arc_origin() + Vector2.from_angle(relative * ARC_STEP) * ARC_RADIUS
		# The portrait and its progress move as one transform, without relaying out text.
		portrait.position = center - portrait.pivot_offset
		portrait.scale = Vector2.ONE * lerpf(1.0, 0.60, smoothstep(0.0, 1.0, distance))
		portrait.z_index = 2 - roundi(distance)
		portrait.modulate.a = 1.0 - smoothstep(1.0, 1.65, distance)
	_index = wrapi(nearest, 0, islands.size())

func _start_input(event: InputEvent) -> void:
	if islands.is_empty() or _touch >= 0 or _mouse_dragging:
		return
	if event is InputEventScreenTouch and event.pressed:
		_touch = event.index
		_begin_drag(event.position)
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.pressed:
		match event.button_index:
			MOUSE_BUTTON_LEFT:
				_mouse_dragging = true
				_begin_drag(event.position)
			MOUSE_BUTTON_WHEEL_UP: _turn(-1)
			MOUSE_BUTTON_WHEEL_DOWN: _turn(1)
			_: return
	else:
		return
	_carousel.accept_event()

func _input(event: InputEvent) -> void:
	if _touch >= 0:
		if event is InputEventScreenDrag and event.index == _touch:
			_drag_to(_local_position(event.position))
		elif event is InputEventScreenTouch and event.index == _touch and not event.pressed:
			_touch = -1
			_finish_drag(_local_position(event.position), event.is_canceled())
		else:
			return
	elif _mouse_dragging:
		if event is InputEventMouseMotion:
			_drag_to(_local_position(event.position))
		elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
			_mouse_dragging = false
			_finish_drag(_local_position(event.position), event.is_canceled())
		else:
			return
	else:
		return
	get_viewport().set_input_as_handled()

func _local_position(position_in_viewport: Vector2) -> Vector2:
	return _carousel.get_global_transform_with_canvas().affine_inverse() * position_in_viewport

func _begin_drag(at: Vector2) -> void:
	_stop_snap()
	_drag_origin = at
	_drag_position = _position
	_drag_target = _position
	_dragged = false

func _drag_to(at: Vector2) -> void:
	if not _dragged and at.distance_squared_to(_drag_origin) < DRAG_THRESHOLD * DRAG_THRESHOLD:
		return
	_dragged = true
	var travel := (_angle_at(_drag_origin) - _angle_at(at)) / ARC_STEP
	_drag_target = _drag_position + travel
	set_process(true)

func _process(delta: float) -> void:
	var next := lerpf(_position, _drag_target, 1.0 - exp(-34.0 * delta))
	if absf(next - _drag_target) < 0.001:
		next = _drag_target
		set_process(false)
	_place_islands(next)

func _angle_at(at: Vector2) -> float:
	var relative := at - _arc_origin()
	return atan2(relative.y, maxf(relative.x, 48.0))

func _arc_origin() -> Vector2:
	return Vector2(96.0, _carousel.size.y * 0.5 + 28.0)

func _finish_drag(at: Vector2, canceled: bool) -> void:
	var nearest := roundi(_position)
	if canceled:
		var cycle := roundi((_position - _settled_index) / islands.size())
		_snap_to(_settled_index + cycle * islands.size())
		return
	_drag_to(at)
	if _dragged:
		var start := roundi(_drag_position)
		nearest = roundi(_drag_target)
		var travel := _drag_target - _drag_position
		if nearest == start and absf(travel) > 0.09:
			nearest += 1 if travel > 0.0 else -1
		_snap_to(nearest)
		return
	for step in [0, -1, 1]:
		var portrait := _portraits[CENTER_SLOT + step]
		if portrait.visible and portrait.contains_parent_point(at):
			if step == 0:
				_selected.pressed.emit()
			else:
				_turn(step)
			return
	_snap_to(nearest)

func _turn(step: int) -> void:
	if not islands.is_empty():
		_snap_to(roundi(_position) + step)

func _snap_to(slot: int) -> void:
	_stop_snap()
	_snap = create_tween().set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	_snap.tween_method(_place_islands, _position, float(slot), 0.30)
	_snap.tween_callback(_settle_at.bind(wrapi(slot, 0, islands.size()), true))

func _settle_at(index: int, notify: bool) -> void:
	var changed := _settled_index != index
	_settled_index = index
	_place_islands(float(index))
	if changed and notify:
		_selected.animate_earned_stars()
		selection_settled.emit()

func _stop_snap() -> void:
	set_process(false)
	if is_instance_valid(_snap):
		_snap.kill()

func _open() -> void:
	if _index >= 0:
		island_opened.emit(_index, islands[_index])

func _unhandled_key_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	match event.keycode:
		KEY_UP: _turn(-1)
		KEY_DOWN: _turn(1)
		KEY_HOME: set_current(0, true)
		KEY_END: set_current(islands.size() - 1, true)
		KEY_ENTER, KEY_KP_ENTER: _open()
		KEY_ESCAPE: back_requested.emit()
		_: return
	get_viewport().set_input_as_handled()
