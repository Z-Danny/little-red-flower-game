extends ColorRect
## Native pause and brief failure presentation. The parent owns settlement/replay.

const PANEL_ART = preload("res://assets/hunt_runner/shared/ui/modal-panel-v2.webp")
const BUTTON_ART = preload("res://assets/hunt_runner/shared/ui/modal-button-v2.webp")
const MASCOT = preload("res://assets/hunt_runner/shared/ui/failure-mascot.webp")

signal resumed
signal restarted
signal sound_toggled
signal music_toggled
signal back_requested

var _card: TextureRect
var _mascot: TextureRect
var _title: Label
var _body: Label
var _resume: Button
var _sound: Button
var _music: Button
var _restart: Button
var _back: Button
var _mode := ""
var _backdrop_press := false

func build() -> void:
	name = "Modal"
	color = Color("10231bbb")
	mouse_filter = MOUSE_FILTER_STOP
	_card = _image(PANEL_ART)
	_card.mouse_filter = MOUSE_FILTER_STOP
	_mascot = _image(MASCOT)
	_title = _label(29, Color("fff2c7"))
	_body = _label(23, Color("304e40"))
	_resume = _button("Resume", "继续挑战", resumed, true)
	_sound = _button("Sound", "声音：开", sound_toggled)
	_music = _button("Music", "音乐：开", music_toggled)
	_restart = _button("Restart", "重新开始", restarted)
	_back = _button("Back", "返回地图", back_requested)
	resized.connect(_layout)
	hide()

func show_pause(note: String, muted: bool, music: bool) -> void:
	_backdrop_press = false
	_mode = "pause"
	_title.text = "游戏暂停"
	_body.text = note
	_body.add_theme_font_size_override("font_size", 19)
	update_sound(muted, music)
	_set_actions(true, true)
	show()
	_layout()
	_resume.grab_focus()

func show_failure(title: String, found: int, count: int) -> void:
	_mode = "failure"
	_title.text = "时间到！"
	_body.text = "%s\n已找到 %d/%d 处隐患\n还有 %d 处隐患未找到。" % [title, found, count, count - found]
	_set_actions(false, false)
	show()
	_layout()

func show_error(body: String) -> void:
	_mode = "error"
	_title.text = "场景未能打开"
	_body.text = body
	_set_actions(false, true)
	show()
	_layout()
	_back.grab_focus()

func update_sound(muted: bool, music: bool) -> void:
	_sound.text = "声音：关" if muted else "声音：开"
	_music.text = "音乐：开" if music else "音乐：关"
	_music.disabled = muted

func _set_actions(paused: bool, can_exit: bool) -> void:
	_resume.visible = paused
	_sound.visible = paused
	_music.visible = paused
	_restart.visible = paused
	_back.visible = can_exit
	_mascot.visible = _mode == "failure"

func _gui_input(event: InputEvent) -> void:
	if _mode != "pause" or not event is InputEventMouseButton or event.button_index != MOUSE_BUTTON_LEFT:
		return
	if event.pressed:
		_backdrop_press = true
	elif _backdrop_press:
		_backdrop_press = false
		resumed.emit()
	accept_event()

func _layout() -> void:
	if _card == null:
		return
	var width := minf(size.x - 28.0, 500.0)
	var height := width * 875.0 / 960.0
	var frame := Rect2((size - Vector2(width, height)) * 0.5, Vector2(width, height))
	_place(_card, frame, Rect2(0.0, 0.0, 1.0, 1.0))
	_place(_title, frame, Rect2(0.20, 0.030, 0.60, 0.18))
	match _mode:
		"pause":
			_place(_body, frame, Rect2(0.11, 0.24, 0.78, 0.36))
			_place(_resume, frame, Rect2(0.18, 0.61, 0.64, 0.14))
			_place(_sound, frame, Rect2(0.12, 0.76, 0.36, 0.095))
			_place(_music, frame, Rect2(0.52, 0.76, 0.36, 0.095))
			_place(_restart, frame, Rect2(0.12, 0.86, 0.36, 0.095))
			_place(_back, frame, Rect2(0.52, 0.86, 0.36, 0.095))
		"failure":
			_place(_body, frame, Rect2(0.12, 0.43, 0.76, 0.37))
			_place(_mascot, frame, Rect2(0.35, 0.19, 0.30, 0.26))
		_:
			_place(_body, frame, Rect2(0.12, 0.34, 0.76, 0.32))
			_place(_back, frame, Rect2(0.29, 0.71, 0.42, 0.13))

func _image(texture: Texture2D) -> TextureRect:
	var node := TextureRect.new()
	node.texture = texture
	node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	node.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	node.mouse_filter = MOUSE_FILTER_IGNORE
	add_child(node)
	return node

func _label(font_size: int, ink: Color) -> Label:
	var label := Label.new()
	label.mouse_filter = MOUSE_FILTER_IGNORE
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", ink)
	add_child(label)
	return label

func _button(id: String, text: String, destination: Signal, primary := false) -> Button:
	var button := Button.new()
	button.name = id
	button.text = text
	button.add_theme_font_size_override("font_size", 21)
	if primary:
		var style := StyleBoxTexture.new()
		style.texture = BUTTON_ART
		button.add_theme_stylebox_override("normal", style)
		var hover := style.duplicate() as StyleBoxTexture
		hover.modulate_color = Color("fff0be")
		button.add_theme_stylebox_override("hover", hover)
	button.pressed.connect(func() -> void: destination.emit())
	add_child(button)
	return button

static func _place(control: Control, frame: Rect2, fractions: Rect2) -> void:
	control.position = frame.position + fractions.position * frame.size
	control.size = fractions.size * frame.size
