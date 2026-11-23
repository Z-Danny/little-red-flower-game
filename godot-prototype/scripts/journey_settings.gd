extends ColorRect

signal closed
signal sound_changed(music_off: bool, effects_off: bool)
signal reset_confirmed

const Painted = preload("res://scripts/painted_chrome.gd")
const NORMAL_FIELDS := ["MusicText", "Music", "EffectsText", "Effects", "Reset"]

var _music_off := false
var _effects_off := false
var _confirming := false
var _flowers := 0

func _ready() -> void:
	for button: Button in [%Reset, $Card/ConfirmReset]: Painted.action(button)
	%Music.pressed.connect(func() -> void: sound_changed.emit(not _music_off, _effects_off))
	%Effects.pressed.connect(func() -> void: sound_changed.emit(_music_off, not _effects_off))
	%Reset.pressed.connect(func() -> void: _confirm(true))
	$Card/CancelReset.pressed.connect(func() -> void: _confirm(false))
	$Card/ConfirmReset.pressed.connect(func() -> void: reset_confirmed.emit())

func display(music_off: bool, effects_off: bool, flowers: int) -> void:
	_flowers = flowers
	update_sound(music_off, effects_off)
	%Music.grab_focus()

func update_sound(music_off: bool, effects_off: bool, saved := true) -> void:
	_music_off = music_off
	_effects_off = effects_off
	_switch(%Music, _music_off)
	_switch(%Effects, _effects_off)
	_show_status("" if saved else "本次已切换，未能保存声音设置。")

func after_reset(ok: bool) -> void:
	if ok: _flowers = 0
	_confirm(false)
	_show_status("当前玩家记录已清空。" if ok else "暂时无法保存，原记录未清空。")

func _show_status(message: String) -> void:
	%Status.text = message
	%Status.visible = not message.is_empty()

func _confirm(value: bool) -> void:
	_confirming = value
	_show_status("")
	for path: String in NORMAL_FIELDS:
		$Card.get_node(path).visible = not value
	$Card/Title.text = "重置记录" if value else "游戏设置"
	$Card/ConfirmCopy.text = "将清空当前玩家的 %d 朵小红花、通关和解锁记录。此操作不可撤销。" % _flowers
	for control: Control in [$Card/ConfirmCopy, $Card/CancelReset, $Card/ConfirmReset]:
		control.visible = value
	if value: $Card/CancelReset.grab_focus()
	else: %Reset.grab_focus()

func _gui_input(event: InputEvent) -> void:
	var released := false
	if event is InputEventMouseButton:
		released = event.button_index == MOUSE_BUTTON_LEFT and not event.pressed
	elif event is InputEventScreenTouch:
		released = not event.pressed and not event.canceled
	if released and not $Card.get_rect().has_point(event.position):
		accept_event()
		closed.emit()

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		if _confirming: _confirm(false)
		else: closed.emit()

static func _switch(button: Button, off: bool) -> void:
	for state: String in ["normal", "hover", "pressed", "hover_pressed"]:
		var track := StyleBoxFlat.new()
		track.bg_color = Color("666a54") if off else Color("28633c")
		if state == "hover": track.bg_color = track.bg_color.lightened(0.09)
		if state == "pressed": track.bg_color = track.bg_color.darkened(0.09)
		track.border_color = Color("d6b567")
		track.set_border_width_all(2)
		track.set_corner_radius_all(29)
		button.add_theme_stylebox_override(state, track)
		button.add_theme_color_override("font_" + ("color" if state == "normal" else state + "_color"), Color("fff1c2"))
	button.add_theme_color_override("font_focus_color", Color("fff1c2"))
	button.text = "关" if off else "开"
	var dot := button.get_node_or_null("Knob") as Panel
	if dot == null:
		dot = Panel.new()
		dot.name = "Knob"
		dot.mouse_filter = MOUSE_FILTER_IGNORE
		var gold := StyleBoxFlat.new()
		gold.bg_color = Color("f8c451")
		gold.border_color = Color("8c5425")
		gold.set_border_width_all(2)
		gold.set_corner_radius_all(20)
		dot.add_theme_stylebox_override("panel", gold)
		button.add_child(dot)
	dot.size = Vector2(32, 32)
	dot.position = Vector2(8 if off else button.size.x - dot.size.x - 8, (button.size.y - dot.size.y) * 0.5)
