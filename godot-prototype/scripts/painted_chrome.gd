extends RefCounted
## Presentation only: native Controls with the matching shipped Web artwork.

const ENTRY_PANEL := preload("res://assets/restored_ui/entry-panel.webp")
const ENTRY_BUTTON := preload("res://assets/restored_ui/entry-button.webp")
const BACK := preload("res://assets/restored_ui/hud-back.webp")
const HINT := preload("res://assets/restored_ui/hud-hint.webp")
const PAUSE := preload("res://assets/restored_ui/hud-pause.webp")

static func action(control: Button, texture: Texture2D = ENTRY_BUTTON, ink: Color = Color("382615")) -> void:
	var palette := {"normal": Color.WHITE, "hover": Color(1.10, 1.07, 1.00), "pressed": Color("e6bf79"), "hover_pressed": Color("efcc8f"), "disabled": Color("a69c83")}
	for state: String in palette:
		var style := StyleBoxTexture.new()
		style.texture = texture
		style.modulate_color = palette[state]
		control.add_theme_stylebox_override(state, style)
	for state: String in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		control.add_theme_color_override(state, ink)
	control.add_theme_color_override("font_disabled_color", Color("302e29"))
	control.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

static func hud(control: Button, art: Texture2D, label: String) -> void:
	control.text = ""
	control.tooltip_text = label
	control.icon = art
	control.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	control.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
	control.expand_icon = true
	control.add_theme_constant_override("icon_max_width", mini(54, roundi(control.size.x)))
	for state: String in ["normal", "hover", "pressed", "disabled", "hover_pressed"]:
		control.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	control.add_theme_color_override("icon_hover_color", Color(1.10, 1.08, 1.02))
	control.add_theme_color_override("icon_pressed_color", Color("e3cab0"))
	control.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

static func image(parent: Control, art: Texture2D, rect: Rect2, stretch := TextureRect.STRETCH_SCALE) -> TextureRect:
	var picture := TextureRect.new()
	picture.texture = art
	picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	picture.stretch_mode = stretch
	picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	picture.position = rect.position
	picture.size = rect.size
	parent.add_child(picture)
	return picture

static func paper(panel: Panel, title: Label, art: Texture2D = ENTRY_PANEL) -> void:
	var skin := StyleBoxTexture.new()
	skin.texture = art
	panel.add_theme_stylebox_override("panel", skin)
	title.add_theme_color_override("font_color", Color("fff3cc"))
