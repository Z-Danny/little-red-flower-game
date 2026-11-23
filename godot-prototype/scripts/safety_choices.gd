extends Control

signal finished(won: bool, elapsed_seconds: float)
signal exited
signal cue_requested(cue: String)

const CONTENT_PATH := "res://data/safety_choices.json"
const Painted = preload("res://scripts/painted_chrome.gd")
const BUTTON_ART := preload("res://assets/safety_choices/button.webp")
const Device = preload("res://scripts/safety_choices_device.gd")

var _entry: Dictionary = {}
var _level: Dictionary = {}
var _round_index := 0
var _elapsed := 0.0
var _answered := false
var _done := false
var _paused := false
var _last_focus: Control
var _device: Control

static func read_level(id: String, path: String = CONTENT_PATH) -> Dictionary:
	if not FileAccess.file_exists(path): return {}
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not data is Dictionary or data.get("schema_version") != 1 or not data.get("levels") is Dictionary:
		return {}
	var level: Variant = data.levels.get(id)
	if not level is Dictionary: return {}
	if level.get("mode") == "device":
		return level if Device.is_valid(level.get("stages")) else {}
	if not level.get("rounds") is Array or level.rounds.is_empty():
		return {}
	for item: Variant in level.rounds:
		if not item is Dictionary or not item.get("context") is String or not item.get("question") is String or not item.get("options") is Array or item.options.size() < 2:
			return {}
		var correct_count := 0
		for option: Variant in item.options:
			if not option is Dictionary or not option.get("label") is String or not option.get("feedback") is String or not option.get("correct") is bool:
				return {}
			correct_count += int(option.correct)
		if correct_count != 1: return {}
	return level

func configure(entry: Dictionary) -> void:
	_entry = entry

func _ready() -> void:
	%Back.pressed.connect(func() -> void: exited.emit())
	%Pause.pressed.connect(_set_paused.bind(true))
	%Resume.pressed.connect(_set_paused.bind(false))
	%PauseBack.pressed.connect(func() -> void: exited.emit())
	Painted.hud(%Back, Painted.BACK, "返回地图")
	Painted.hud(%Pause, Painted.PAUSE, "暂停练习")
	_style_action(%Resume)
	_style_action(%PauseBack)
	%Title.text = _entry.get("title", "安全练习")
	_level = read_level(_entry.get("id", ""), _entry.get("content_path", CONTENT_PATH))
	if _level.is_empty():
		%Context.text = "这道练习暂时无法读取。"
		%Pause.hide()
		return
	var picture: String = _level.get("background", "")
	if ResourceLoader.exists(picture, "Texture2D"):
		%Background.texture = load(picture) as Texture2D
	if _level.get("mode") == "device":
		%Card.hide()
		var scene := load("res://scenes/safety_choices_device.tscn") as PackedScene
		if scene == null:
			%Card.show()
			%Context.text = "模拟设备暂时无法读取。"
			return
		_device = scene.instantiate() as Control
		_device.setup(_level.stages)
		_device.solved.connect(_complete)
		_device.cue_requested.connect(cue_requested.emit)
		%Interface.add_child(_device)
	else:
		_render_round()

func _process(delta: float) -> void:
	if not _paused and not _done and not _level.is_empty():
		_elapsed += delta

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and is_node_ready() and not _done and not _level.is_empty():
		_set_paused(true)

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel") and not _done and not _level.is_empty():
		get_viewport().set_input_as_handled()
		_set_paused(not _paused)

func _set_paused(value: bool) -> void:
	if value == _paused or _done: return
	if value: _last_focus = get_viewport().gui_get_focus_owner()
	_paused = value
	%Paused.visible = value
	%Interface.visible = not value
	if value:
		%Resume.grab_focus()
	elif is_instance_valid(_last_focus) and _last_focus.is_visible_in_tree():
		_last_focus.grab_focus()
	elif is_instance_valid(_device):
		_device.focus_action()
	elif %Actions.get_child_count() > 0:
		%Actions.get_child(0).grab_focus()

func _render_round() -> void:
	var rounds: Array = _level.rounds
	var item: Dictionary = rounds[_round_index]
	_answered = false
	%Step.text = "%d / %d" % [_round_index + 1, rounds.size()]
	%Heading.text = item.get("heading", "情境")
	%Context.text = item.context
	%Question.text = item.question
	%Feedback.hide()
	_clear_actions()
	for option: Dictionary in item.options:
		_add_action(option.label, _select.bind(option))
	%Scroll.set_deferred("scroll_vertical", 0)

func _clear_actions() -> void:
	for child: Node in %Actions.get_children():
		%Actions.remove_child(child)
		child.queue_free()

func _add_action(label: String, callback: Callable) -> Button:
	var button := Button.new()
	button.text = label
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.custom_minimum_size.y = 80
	_style_action(button)
	button.pressed.connect(callback)
	%Actions.add_child(button)
	return button

func _style_action(button: Button) -> void:
	Painted.action(button, BUTTON_ART)
	for state in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
		var skin := button.get_theme_stylebox(state)
		skin.content_margin_left = 26.0
		skin.content_margin_right = 26.0

func _select(option: Dictionary) -> void:
	if _answered or _paused or _done: return
	_answered = true
	cue_requested.emit("correct" if option.correct else "wrong")
	%FeedbackTitle.text = "判断正确" if option.correct else "再看看这条线索"
	%FeedbackBody.text = option.feedback
	%Feedback.show()
	_clear_actions()
	var last: bool = _round_index + 1 == _level.rounds.size()
	var action_text := "查看结算" if last else "下一步"
	var next := _add_action(action_text if option.correct else "重新选择", _continue.bind(option.correct))
	next.grab_focus()
	_reveal_action.call_deferred(next)

func _reveal_action(button: Button) -> void:
	if is_instance_valid(button) and button.is_visible_in_tree() and %Scroll.is_ancestor_of(button):
		%Scroll.ensure_control_visible(button)

func _continue(correct: bool) -> void:
	if not _answered or _paused or _done: return
	cue_requested.emit("button")
	if correct:
		_round_index += 1
		if _round_index == _level.rounds.size():
			_complete()
			return
	_render_round()
	%Actions.get_child(0).grab_focus()

func _complete() -> void:
	if _done: return
	_done = true
	finished.emit(true, _elapsed)

func result_detail() -> Dictionary:
	var detail := {"title": "练习完成", "summary": _level.get("summary", "")}
	var background: Texture2D = %Background.texture
	if background != null: detail["safe_art"] = background
	return detail

func prepare_result_backdrop() -> void:
	%Interface.hide()
	%Paused.hide()
