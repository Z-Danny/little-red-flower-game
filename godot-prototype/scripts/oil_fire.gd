extends Control
## Input and presentation for the oil-fire scene. Rules never see sprites or pointers.

signal finished(won: bool, elapsed_seconds: float)
signal exited

const Rules = preload("res://scripts/oil_fire_rules.gd")
const Timing = preload("res://scripts/oil_fire_timing.gd")
const Effects = preload("res://scripts/oil_fire_effects.gd")
const Thermometer = preload("res://scripts/oil_fire_thermometer.gd")
const KitchenAudio = preload("res://scripts/oil_fire_audio.gd")
const Painted = preload("res://scripts/painted_chrome.gd")
const LEVEL_ID := Rules.LEVEL_ID
const SUMMARY := "油锅起火时，先关火，再用锅盖盖住，切勿直接泼水。"
const SAFETY := "现实中若火势失控，请立即撤离并拨打 119；儿童不要尝试灭火。"
const COOLING := "火灭后保持锅盖覆盖，等待充分冷却，不要急着揭盖。"

const FOCUSED = preload("res://assets/oil_fire/focused.png")
const PANICKED = preload("res://assets/oil_fire/panicked.png")
const RELIEVED = preload("res://assets/oil_fire/relieved.png")
const PICK_ORDER := [Rules.Item.PERSON, Rules.Item.KNIFE, Rules.Item.PLATE,
	Rules.Item.CLOTH, Rules.Item.WATER, Rules.Item.LID, Rules.Item.KNOB]
const DRAG_THRESHOLD := 9.0 # Authored scene pixels, shared by mouse and emulated touch.
const PICK_ALPHA := 35.0 / 255.0
const EXIT_PROMPT := "油锅明火已熄灭。请把人物拖到右侧门外。"

## Editable hazard, action, and feedback durations. Read once per fresh run.
@export var timing: Timing = Timing.new()

@onready var _world: Node2D = $World
@onready var _pan: TextureRect = %Pan
@onready var _flame: TextureRect = %Flame
@onready var _actor: TextureRect = %Person
@onready var _working_texture: Texture2D = _actor.texture
@onready var _pan_zone: ReferenceRect = %PanZone
@onready var _exit_zone: ReferenceRect = %ExitZone
@onready var _lid_pose: ReferenceRect = %SealedLidPose
@onready var _evacuated_pose: ReferenceRect = %EvacuatedPose
@onready var _effects: Effects = %Effects
@onready var _liquid: Thermometer = %Liquid
@onready var _audio: KitchenAudio = $Audio
@onready var _tint: ColorRect = %RoomShade
@onready var _burner: Polygon2D = %Burner
@onready var _notice: PanelContainer = %Notice
@onready var _notice_label: Label = %NoticeText
@onready var _pause_button: Button = %PauseButton
@onready var _pause_overlay: Control = %PauseOverlay
@onready var _sprites: Dictionary[int, TextureRect] = {
	Rules.Item.KNOB: %Knob, Rules.Item.LID: %Lid, Rules.Item.WATER: %Water,
	Rules.Item.CLOTH: %Cloth, Rules.Item.PLATE: %Plate, Rules.Item.KNIFE: %Knife,
	Rules.Item.PERSON: _actor,
}

var _run: Rules
var _homes: Dictionary[int, Rect2] = {}
var _flame_home: Rect2
var _hit_images: Dictionary[Texture2D, Image] = {}
var _held := Rules.Item.NONE
var _press_at := Vector2.ZERO
var _grab_offset := Vector2.ZERO
var _held_center := Vector2.ZERO
var _moved := false
var _release_center := Vector2.ZERO
var _notice_time := 0.0
var _message := ""
var _visual_clock := 0.0
var _paused := false
var _suspended := false
var _reported := false


func _ready() -> void:
	Painted.hud($Hud/BackButton, Painted.BACK, "返回地图")
	Painted.hud(_pause_button, Painted.PAUSE, "暂停练习")
	Painted.hud($Hud/HintButton, Painted.HINT, "关卡提示")
	Painted.paper($Hud/PauseOverlay/PauseCard, $Hud/PauseOverlay/PauseCard/PausedText)
	Painted.action($Hud/PauseOverlay/PauseCard/Resume)
	$Hud/PauseOverlay/PauseCard/Resume.pressed.connect(_on_pause_pressed)
	if timing == null:
		timing = Timing.new()
	_run = Rules.new(timing)
	_flame_home = _flame.get_rect()
	for item in _sprites:
		_homes[item] = _sprites[item].get_rect()
	_present(0.42)


func _process(delta: float) -> void:
	if _paused or _suspended or _reported:
		return
	# Match the original's bounded active frame step on resume or a slow frame.
	var step := minf(delta, 0.1)
	var was_evacuated := _run.evacuated
	_run.advance(step)
	_visual_clock += step
	_notice_time = maxf(0.0, _notice_time - step)
	if not was_evacuated and _run.evacuated:
		_audio.evacuation_cue()
	if _run.phase != Rules.Phase.PLAYING and _held != Rules.Item.NONE:
		_cancel_drag()
	if _run.phase == Rules.Phase.LOST and _run.failure == Rules.Feedback.TIMEOUT:
		_show_notice(_feedback_text(_run.failure))
	_present(step)
	if _run.phase == Rules.Phase.WON or _run.phase == Rules.Phase.LOST:
		_reported = true
		_audio.stop_all()
		finished.emit(_run.phase == Rules.Phase.WON, _run.elapsed_seconds)


func _gui_input(event: InputEvent) -> void:
	if _paused or _suspended or _reported or _run.phase != Rules.Phase.PLAYING:
		return
	# project.godot enables primary-touch mouse emulation. Handle only the mouse stream.
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		var point: Vector2 = _world.transform.affine_inverse() * event.position
		if event.pressed:
			_audio.unlock()
			_grab(point)
		else:
			_release(point)
		_present(0.0)
		accept_event()
	elif event is InputEventMouseMotion and _held != Rules.Item.NONE:
		_follow(_world.transform.affine_inverse() * event.position)
		_present(0.0)
		accept_event()


func _notification(what: int) -> void:
	if not is_node_ready():
		return
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		_suspended = true
		_cancel_drag()
		_audio.pause_all(true)
		_present(0.0)
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN or what == NOTIFICATION_APPLICATION_RESUMED:
		_suspended = false
		_audio.pause_all(_paused)


func _grab(point: Vector2) -> void:
	if _held != Rules.Item.NONE:
		return
	for item: Rules.Item in PICK_ORDER:
		if not _run.can_pick(item) or not _opaque_at(_sprites[item], point):
			continue
		_held = item
		_press_at = point
		_held_center = _homes[item].get_center()
		_grab_offset = point - _held_center
		_moved = false
		if item == Rules.Item.KNIFE:
			_show_notice(_feedback_text(Rules.Feedback.KNIFE))
		return


func _follow(point: Vector2) -> void:
	_moved = _moved or _press_at.distance_to(point) > DRAG_THRESHOLD
	_held_center = point - _grab_offset


func _release(point: Vector2) -> void:
	if _held == Rules.Item.NONE:
		return
	_follow(point)
	var item := _held
	var moved := _moved
	_release_center = _held_center
	_cancel_drag()
	if item == Rules.Item.KNOB:
		if not moved and _opaque_at(_sprites[item], point) and _run.tap_knob():
			_audio.action_cue(_run.action)
	elif moved:
		var feedback := _run.drop(item, _zone_at(_release_center))
		if feedback != Rules.Feedback.NONE:
			_show_notice(_feedback_text(feedback))
		_audio.action_cue(_run.action)


func _cancel_drag() -> void:
	_held = Rules.Item.NONE
	_moved = false


func _zone_at(point: Vector2) -> Rules.Zone:
	if _pan_zone.get_rect().has_point(point):
		return Rules.Zone.PAN
	if _exit_zone.get_rect().has_point(point):
		return Rules.Zone.EXIT
	return Rules.Zone.MISS


func _opaque_at(sprite: TextureRect, point: Vector2) -> bool:
	var local := sprite.get_transform().affine_inverse() * point
	if not Rect2(Vector2.ZERO, sprite.size).has_point(local):
		return false
	var texture := sprite.texture
	if not _hit_images.has(texture):
		_hit_images[texture] = texture.get_image()
	var image := _hit_images[texture]
	if image == null or image.is_empty() or image.is_compressed():
		var pixel := Vector2i(local / sprite.size * texture.get_size())
		return texture.is_pixel_opaque(pixel.x, pixel.y)
	var pixel := Vector2i(local / sprite.size * Vector2(image.get_size()))
	return image.get_pixelv(pixel).a > PICK_ALPHA


func prepare_result_backdrop() -> void:
	$Hud.hide()

func result_detail() -> Dictionary:
	var reason := _feedback_text(_run.failure) if _run.phase == Rules.Phase.LOST else ""
	var kind := ""
	if _run.phase == Rules.Phase.LOST:
		kind = "timeout" if _run.failure == Rules.Feedback.TIMEOUT else "unsafe-action"
	return {"summary": SUMMARY + " " + COOLING + " " + SAFETY, "reason": reason, "kind": kind}

func _present(delta: float) -> void:
	var heat := _run.heat()
	var safe := _run.controlled()
	var failing := _run.phase == Rules.Phase.FAILING
	var wrong_phase := clampf(_run.action_age / maxf(0.001, timing.wrong_motion_seconds), 0.0, 1.0)
	var progress := clampf(_run.action_age / maxf(0.001, _run.action_duration), 0.0, 1.0)
	if safe:
		_actor.texture = RELIEVED
	elif heat >= 0.7:
		_actor.texture = PANICKED
	elif _run.focused_left > 0.0:
		_actor.texture = FOCUSED
	else:
		_actor.texture = _working_texture
	for item: Rules.Item in _sprites:
		_present_item(item, progress, wrong_phase)
	_present_fire(heat, safe, progress, wrong_phase)
	var target: ReferenceRect = null
	var is_exit := _held == Rules.Item.PERSON or (_held == Rules.Item.NONE and safe and not _run.evacuated)
	if is_exit and _run.action != Rules.Action.EVACUATE:
		target = _exit_zone
	elif _held != Rules.Item.NONE and _held != Rules.Item.KNOB and _held != Rules.Item.PERSON and not _run.lid_sealed:
		target = _pan_zone
	var smoke := 0.0 if safe else (0.12 if _run.lid_sealed else 0.3 + 0.62 * heat)
	var water_splash := wrong_phase * 1.73 if _run.action == Rules.Action.WATER else -1.0
	_effects.update_view(_visual_clock, smoke, water_splash, target, is_exit, not is_exit or safe,
		_moved and target != null and target.get_rect().has_point(_held_center))
	_liquid.update_heat(heat, safe, delta)
	_audio.update_mix(heat, _run.lid_sealed, safe)
	var copy := ""
	if failing:
		copy = _feedback_text(_run.failure)
	elif _notice_time > 0.0:
		copy = _message
	elif safe and not _run.evacuated and _run.action != Rules.Action.EVACUATE:
		copy = EXIT_PROMPT
	_notice.visible = not copy.is_empty()
	_notice_label.text = copy


func _present_item(item: Rules.Item, progress: float, wrong_phase: float) -> void:
	var home := _homes[item]
	var box := home
	var angle := 0.0
	var raised := false
	var travel := _ease(progress)
	if item == Rules.Item.KNOB:
		angle = -PI * 0.5 if _run.knob_off else (-PI * 0.5 * travel if _run.action == Rules.Action.SHUTOFF else 0.0)
	elif item == _run.action_item:
		var from := _recenter(home, _release_center)
		raised = true
		match _run.action:
			Rules.Action.COVER:
				box = _mix_box(from, _lid_pose.get_rect(), travel)
				box.position.y -= sin(progress * PI) * 18.0
			Rules.Action.EVACUATE:
				box = _mix_box(from, _evacuated_pose.get_rect(), travel)
			Rules.Action.RETURN:
				box = _mix_box(from, home, travel)
			Rules.Action.WATER, Rules.Action.CLOTH:
				var pan_center := _pan.get_rect().get_center()
				if wrong_phase < 0.58:
					var approach := wrong_phase / 0.58
					box = _recenter(home, _release_center.lerp(pan_center, _ease(approach)))
					angle = (-0.7 if _run.action == Rules.Action.WATER else 0.15) * sin(PI * approach)
				else:
					box = _recenter(home, pan_center.lerp(home.get_center(), _ease((wrong_phase - 0.58) / 0.42)))
				raised = wrong_phase < 1.0
	elif item == _held and _moved:
		box = _recenter(home, _held_center)
		raised = true
	elif item == Rules.Item.LID and _run.lid_sealed:
		box = _lid_pose.get_rect()
	elif item == Rules.Item.PERSON:
		if _run.evacuated:
			box = _evacuated_pose.get_rect()
		elif _run.phase == Rules.Phase.FAILING:
			box.position.x += sin(wrong_phase * PI) * 10.0
	var sprite := _sprites[item]
	_set_pose(sprite, box, angle)
	sprite.z_index = 2 if raised else 0


func _present_fire(heat: float, safe: bool, progress: float, wrong_phase: float) -> void:
	_tint.color = Color(0.19, 0.12, 0.12, lerpf(0.045, 0.19, heat) if not safe else 0.0)
	_burner.visible = not _run.knob_off
	_flame.visible = not _run.lid_sealed
	if not _flame.visible:
		return
	var intensity := clampf(0.12 + heat * 0.9, 0.0, 1.0)
	var tall := 0.65 + intensity * 1.5 - (0.4 if _run.knob_off else 0.0)
	if _run.phase == Rules.Phase.FAILING:
		tall += 0.5 * (1.0 - 0.5 * wrong_phase)
	if _run.action == Rules.Action.COVER:
		tall *= 1.0 - _ease(progress)
	tall = maxf(0.05, tall * (1.0 + 0.035 * sin(_visual_clock * 10.0) + 0.018 * sin(_visual_clock * 19.0)))
	var span := Vector2(_flame_home.size.x * minf(1.85, tall), _flame_home.size.y * tall)
	var box := Rect2(Vector2(_flame_home.get_center().x - span.x * 0.5, _flame_home.end.y - span.y), span)
	_set_pose(_flame, box, 0.02 * sin(_visual_clock * 6.0))


static func _set_pose(sprite: TextureRect, box: Rect2, angle: float) -> void:
	sprite.position = box.position
	sprite.size = box.size
	sprite.pivot_offset = box.size * 0.5
	sprite.rotation = angle


static func _ease(progress: float) -> float:
	return 1.0 - pow(1.0 - progress, 3.0)


static func _recenter(home: Rect2, center: Vector2) -> Rect2:
	return Rect2(center - home.size * 0.5, home.size)


static func _mix_box(from: Rect2, to: Rect2, fraction: float) -> Rect2:
	return Rect2(from.position.lerp(to.position, fraction), from.size.lerp(to.size, fraction))


func _feedback_text(feedback: Rules.Feedback) -> String:
	match feedback:
		Rules.Feedback.SEALED: return "锅口已盖严，请保持覆盖。"
		Rules.Feedback.EXIT_BLOCKED: return "火势尚未受控。现实中若火势失控，请立即撤离。"
		Rules.Feedback.KNIFE: return "菜刀不能用来灭火，请放回原位。"
		Rules.Feedback.WATER: return "油锅起火不能泼水，火焰蹿高了。"
		Rules.Feedback.CLOTH: return "这块小化纤抹布盖不严锅口，已经着火。"
		Rules.Feedback.TIMEOUT: return "温度计已到顶，火势失控。"
		_: return ""


func _show_notice(message: String) -> void:
	_message = message
	_notice_time = 2.3


func _on_hint_pressed() -> void:
	if _paused or _reported or _run.phase != Rules.Phase.PLAYING:
		return
	_audio.unlock()
	if _run.action != Rules.Action.NONE:
		_show_notice("请等当前动作完成。")
	elif not _run.knob_off:
		_show_notice("观察灶台上的燃气旋钮，点击一下可以关火。")
	elif not _run.lid_sealed:
		_show_notice("把左下方备菜台上的锅盖拖到油锅上。")
	else:
		_show_notice(EXIT_PROMPT)
	_present(0.0)


func _on_pause_pressed() -> void:
	if _reported:
		return
	if not _paused:
		_audio.unlock()
	_paused = not _paused
	_cancel_drag()
	_pause_overlay.visible = _paused
	_pause_button.tooltip_text = "继续练习" if _paused else "暂停练习"
	_audio.pause_all(_paused or _suspended)
	_present(0.0)


func _on_back_pressed() -> void:
	if _reported:
		return
	_reported = true
	_cancel_drag()
	_audio.stop_all()
	exited.emit()
