extends Control

signal finished(won: bool, elapsed_seconds: float)
signal exited

const Data = preload("res://scripts/level_catalog.gd")
const Layout = preload("res://scripts/scene_layout.gd")
const Rules = preload("res://scripts/cpr_rules.gd")
const PACK := "res://assets/cpr_runner/pack.json"
const Painted = preload("res://scripts/painted_chrome.gd")

@onready var _world: Node2D = $Scene
@onready var _targets: Control = $TreatmentButtons
@onready var _audio: AudioStreamPlayer = $Cue

var _sim: Rules
var _copy: Dictionary
var _skin: Dictionary
var _actor: Sprite2D
var _aed: Sprite2D
var _actor_art: Texture2D
var _helper_art: Texture2D
var _continue: Button
var _rhythm: Button
var _presentation := ""
var _mode := ""
var _paused := false
var audio_muted := false
var _entry: Dictionary = {}

func configure(entry: Dictionary) -> void:
	_entry = entry

func _ready() -> void:
	Painted.hud(%Back, Painted.BACK, "返回地图")
	Painted.hud(%Pause, Painted.PAUSE, "暂停练习")
	Painted.hud(%Help, Painted.HINT, "练习说明")
	%Back.pressed.connect(func() -> void: exited.emit())
	%Pause.pressed.connect(func() -> void: _pause("pause"))
	%Help.pressed.connect(func() -> void: _pause("help"))
	var pack := Data.read_json(PACK)
	if pack.is_empty():
		%Copy.text = "该关素材暂时无法读取。"
		return
	_sim = Rules.new(pack.rules)
	_copy = pack.presentation
	_skin = pack.skin
	_world.transform = Layout.cover(Layout.rect(_skin.sceneBounds), Vector2(576, 1024), Layout.union_boxes(_skin.criticalRegions))
	_place(_skin.scene, Rect2(0, 0, float(_skin.width), float(_skin.height)))
	_aed = _place(_skin.aed, Rect2(661, 735, 128, 103))
	_actor = _place(_skin.actor, Layout.rect(_skin.actorBox))
	_actor_art = _actor.texture
	_helper_art = Layout.texture(_skin.helper)
	_refresh(true)

func _place(resource: String, box: Rect2) -> Sprite2D:
	var sprite := Sprite2D.new()
	sprite.texture = Layout.texture(resource)
	sprite.centered = false
	sprite.position = box.position
	if sprite.texture != null:
		sprite.scale = box.size / sprite.texture.get_size()
	_world.add_child(sprite)
	return sprite

func _process(delta: float) -> void:
	if _paused or _sim == null or _sim.phase == "complete": return
	var arrived := _sim.aed_ready
	_sim.advance(minf(100.0, delta * 1000.0))
	if not arrived and _sim.aed_ready:
		_play("rescue-arrival")
	_refresh(false)

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and is_node_ready() and _sim != null and not _paused and _sim.phase != "complete":
		_pause("pause")

func _pause(mode: String) -> void:
	if _sim == null: return
	_sim.suspend()
	_mode = mode
	_paused = true
	_audio.stop()
	_refresh(true)

func _resume() -> void:
	_mode = ""
	_paused = false
	_sim.suspend()
	_refresh(true)

func _unhandled_key_input(event: InputEvent) -> void:
	if not event.is_action_pressed(&"ui_cancel") or _sim == null: return
	get_viewport().set_input_as_handled()
	if _paused: _resume()
	else: _pause("pause")

func _do(id: String, correct: bool = true) -> void:
	if _paused or _sim == null: return
	var cue := _sim.action(id, correct)
	if cue == "finish":
		finished.emit(true, _sim.elapsed / 1000.0)
	else:
		_play(cue)
		_refresh(false)

func _play(cue: String) -> void:
	if cue.is_empty() or audio_muted: return
	var path := "res://assets/shared_cues/" + cue + ".wav"
	if ResourceLoader.exists(path, "AudioStream"):
		_audio.stream = load(path)
		_audio.play()

func result_detail() -> Dictionary:
	return {"title": "练习完成", "summary": _copy.get("ending", "")}

func prepare_result_backdrop() -> void:
	# Keep the original layered plaza, person still performing simulated CPR,
	# and arrived AED visible behind the end card. This is not a new still.
	_refresh(false)
	$Hud.hide()
	$Guide.hide()
	_targets.hide()

func _refresh(force: bool) -> void:
	var key := "%s|%s|%s|%s" % [_sim.step_id(), _sim.review, _sim.aed_ready, _mode]
	if force or key != _presentation:
		_presentation = key
		_rebuild()
	_aed.visible = _sim.aed_ready
	_actor.visible = _sim.phase not in ["scene", "position"]
	var actor := _helper_art if _sim.handed_over else _actor_art
	if _actor.texture != actor and actor != null:
		_actor.texture = actor
		_actor.scale = Layout.rect(_skin.actorBox).size / actor.get_size()
	if _paused: return
	if not _sim.review.is_empty():
		_continue.disabled = _sim.review_ms > 0.0
		_continue.text = "先阅读 (%d 秒)" % ceili(_sim.review_ms / 1000.0) if _continue.disabled else "理解了，继续"
	elif _sim.step_id() == "rhythm":
		%Step.text = "节奏练习  %d / %d" % [_sim.samples, int(_sim.rules.sampleIntervals)]
		%Beat.value = 1.0 - absf(fmod(_sim.elapsed * float(_sim.rules.guideRate) / 60000.0, 1.0) * 2.0 - 1.0)
		%Copy.text = _copy.rhythm if _sim.feedback.is_empty() else _sim.feedback
	elif not _sim.feedback.is_empty() and _sim.phase != "scene":
		%Copy.text = _sim.feedback

func _rebuild() -> void:
	for slot: Control in [%Actions, _targets]:
		for child in slot.get_children():
			slot.remove_child(child)
			child.queue_free()
	%Note.text = "教学按序进行 / 不评定真实 CPR 能力"
	%Beat.hide()
	if _paused:
		%Step.text = "急救说明" if _mode == "help" else "练习已暂停"
		%Copy.text = str(_sim.rules.safety) if _mode == "help" else "仅暂停游戏。真实急救不能为了操作界面而中断。"
		Painted.action(_button(%Actions, "继续练习", _resume))
		if _mode == "pause":
			_button(%Actions, "开启声音" if audio_muted else "关闭声音", func() -> void:
				audio_muted = not audio_muted
				_refresh(true)
			)
		return
	if not _sim.review.is_empty():
		var info: Dictionary = _copy.reasons[_sim.review]
		%Step.text = info.title
		%Copy.text = info.reason
		%Note.text = "教学停顿只用于阅读，真实救助尽量减少中断。"
		_continue = _button(%Actions, "理解了，继续", _do.bind("continue"))
		return
	var step := _sim.step_id()
	%Copy.text = _copy.get(step, _copy.opening)
	match step:
		"call":
			%Step.text = "分工呼救"
			_hotspot("呼救", "phone", _skin.caller, _do.bind("call"))
		"aed":
			%Step.text = "分工取 AED"
			_hotspot("取 AED", "aed", _skin.runner, _do.bind("aed"))
		"start":
			%Step.text = "开始施救准备"
			_button(%Actions, "开始帮助", _do.bind("start"))
		"position":
			%Step.text = "选择施救位置"
			_hotspot("胸部一侧", "kneel", _skin.position, _do.bind("position", true))
			_hotspot("脚边", "kneel", _skin.wrongPosition, _do.bind("position", false))
		"hands":
			%Step.text = "放置双手"
			_button(%Actions, "胸部中央", _do.bind("hands", true), "hands-chest")
			_button(%Actions, "腹部", _do.bind("hands", false), "hands-abdomen")
		"posture":
			%Step.text = "调整施救姿势"
			_button(%Actions, "双臂伸直", _do.bind("posture", true), "posture-straight")
			_button(%Actions, "弯肘斜压", _do.bind("posture", false), "posture-bent")
		"rhythm":
			%Step.text = "节奏输入练习"
			%Beat.show()
			_rhythm = _button(%Actions, "跟随节拍点按", _do.bind("tap"), "hands")
		"handover":
			%Step.text = "交接救助"
			if _sim.aed_ready:
				_button(%Actions, "交接并协作", _do.bind("handover"), "relay")
			else:
				%Copy.text = "协助者正在取 AED，继续模拟救助。"
		"finish":
			%Step.text = "接替者继续模拟救助"
			_button(%Actions, "完成练习", _do.bind("finish"), "check")

func _button(parent: Control, text: String, callback: Callable, icon: String = "") -> Button:
	var button := Button.new()
	button.text = text
	button.add_theme_font_size_override("font_size", 20)
	if not icon.is_empty():
		button.icon = Layout.texture(_skin.icons[icon])
		button.add_theme_constant_override("icon_max_width", 42)
	button.pressed.connect(callback)
	parent.add_child(button)
	return button

func _hotspot(text: String, icon: String, point: Dictionary, callback: Callable) -> void:
	var button := _button(_targets, text, callback, icon)
	button.size = Vector2(136, 61)
	button.position = _world.transform * Layout.point(point) - button.size * 0.5
