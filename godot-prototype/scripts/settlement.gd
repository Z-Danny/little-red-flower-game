extends Control

signal replay_requested
signal map_requested

const SUCCESS_HEADER = preload("res://assets/settlement_ui/success/header.webp")
const SUCCESS_BODY = preload("res://assets/settlement_ui/success/body.webp")
const SUCCESS_FOOTER = preload("res://assets/settlement_ui/success/footer.webp")
const FAILURE_HEADER = preload("res://assets/settlement_ui/failure/header.webp")
const FAILURE_BODY = preload("res://assets/settlement_ui/failure/body.webp")
const FAILURE_FOOTER = preload("res://assets/settlement_ui/failure/footer.webp")
const GOLD = preload("res://assets/settlement_ui/success/button.webp")
const GREEN = preload("res://assets/settlement_ui/failure/secondary-button.webp")
const DEFAULT_SKY = preload("res://assets/ui/sky.webp")
const LESSON_PATH := "res://assets/settlement_ui/lessons.json"
const INK := Color("123e28")
const CREAM := Color("fff4ce")
const OIL_SUCCESS := "火灭后保持锅盖覆盖，等待冷却。\n若火势失控，立即撤离并拨打 119。"
const OIL_FAILURE := "油锅起火切勿泼水。\n若火势失控，立即撤离并拨打 119。"

static var _lessons: Dictionary = {}
var _failed := false
var _show_zero_score := false
var _decoration: Tween

@onready var _paper: Control = $Paper
@onready var _scroll: ScrollContainer = %ContentScroll
@onready var _map: Button = %Map
@onready var _replay: Button = %Replay
@onready var _petal: TextureRect = %Petal

func _ready() -> void:
	_replay.pressed.connect(func() -> void: replay_requested.emit())
	_map.pressed.connect(func() -> void: map_requested.emit())
	_scroll.gui_input.connect(_scroll_with_keys)
	var scrollbar := _scroll.get_v_scroll_bar()
	scrollbar.add_theme_stylebox_override("scroll", _round_box(Color("8a6b2e22"), 3))
	for state in ["grabber", "grabber_highlight", "grabber_pressed"]:
		scrollbar.add_theme_stylebox_override(state, _round_box(Color("a57b3bea"), 4))
	resized.connect(_layout_card)
	_apply_skin(false, false)

## The runner and save layer decide the outcome. This page only presents it.
func show_outcome(won: bool, elapsed_seconds: float, result: Dictionary, entry: Dictionary, detail: Dictionary) -> void:
	var id := _copy(entry, "id")
	var level := _copy(entry, "title", _copy(detail, "title", "关卡结果"))
	var neutral: bool = not won and detail.get("escaped") == true
	var lesson := _lesson_for(id) if won else {}
	var safe_art: Texture2D = detail.get("safe_art") as Texture2D if won else null
	# Explicit artwork wins over an already retained terminal scene. Never show a
	# success image on failure or imply a level has a dedicated painting by default.
	$Sky.texture = safe_art if safe_art != null else DEFAULT_SKY
	$Sky.visible = not (safe_art == null and detail.get("live_backdrop") == true)

	var score := int(result.get("score", 0)) if won else 0
	var delta := int(result.get("delta", 0)) if won else 0
	var total := int(result.get("total", 0))
	%LevelTitle.text = level
	_set_label(%Message, _copy(lesson, "message"))
	%Knowledge.visible = won
	%FailureReview.visible = not won
	%Reward.visible = won and score > 0
	%Summary.visible = won
	%Progress.visible = won
	_show_zero_score = not won
	%FailureScore.visible = _show_zero_score
	var title := _copy(detail, "title", _copy(lesson, "result"))
	var base_guidance := _copy(entry, "knowledge", _copy(lesson, "summary"))
	if won:
		var guidance := _copy(detail, "summary", base_guidance)
		if id == "oil-fire":
			title = "处置成功"
			guidance = OIL_SUCCESS
		_set_label(%OutcomeTitle, title if title != level else "")
		_set_label(%Advice, guidance)
		%Summary.text = "本次 %d 朵小红花" % score if result.get("fixed", false) else "用时 %.1f 秒  /  本次 %d 朵" % [elapsed_seconds, score]
		%Progress.text = "新增 %d 朵  /  累计 %d 朵\n%s" % [delta, total, "进度已保存" if result.get("saved", false) else "进度仅保留在本次运行"]
	else:
		_set_label(%OutcomeTitle, "")
		_set_label(%Advice, "")
		var fallback := OIL_FAILURE if id == "oil-fire" else base_guidance
		_set_failure(entry, detail, title, fallback, neutral)
		%FailureReward.text = "本次没有获得小红花" if neutral else "本局小红花：0 朵"
		%FailureTotal.text = "累计 %d 朵小红花" % total
	_build_lesson(lesson)
	_apply_skin(not won and not neutral, neutral)
	_map.text = "种下小红花" if won and delta > 0 else "返回地图"
	_scroll.set_deferred("scroll_vertical", 0)
	_scroll.grab_focus()

	var reduced: bool = detail.get("reduced_motion") == true or entry.get("reduced_motion") == true
	if not reduced and OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		reduced = JavaScriptBridge.eval("typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches") == true
	_decorate(score, delta, reduced)

func _set_failure(entry: Dictionary, detail: Dictionary, title: String, fallback: String, neutral: bool) -> void:
	# Only use structured failure information. The hunt runner's sole terminal
	# failure is the timer; other runners keep their supplied reason verbatim.
	var kind := "" if neutral else _copy(detail, "kind", "timeout" if entry.get("engine") == "scene-hunt" else "")
	var status := "本次练习未完成"
	var roast := ""
	match kind:
		"wrong-inventory":
			status = "物品选错了！"
			roast = "背包装满了，\n但还没选对。"
		"unsafe-action":
			status = "这步踩雷了！"
			roast = "这操作，\n小红花都看愣了。"
		"timeout":
			status = "时间到！"
			roast = "时间可不等人，\n这局先交卷！"
			var missed: Variant = detail.get("missed")
			if missed is Dictionary:
				var count := int(missed.get("count", 0))
				if count > 0 and missed.get("unit") == "件":
					roast = "还剩 %d 件，\n这就收工了？" % count
				elif count > 0 and missed.get("unit") == "处":
					roast = "漏了 %d 处，\n还想领花？" % count
	_set_label(%Roast, roast)
	_set_label(%FailureTitle, title if not title.is_empty() else ("已先行转移" if neutral else status))
	_set_label(%FailureProgress, _copy(detail, "progress"))
	var reason := _copy(detail, "reason", fallback)
	_set_label(%FailureReason, reason)
	var hint := _copy(detail, "hint", fallback if reason != fallback else "")
	if entry.get("id") == "oil-fire" and fallback != reason and fallback != hint:
		hint = fallback if hint.is_empty() else "%s\n%s" % [hint, fallback]
	_set_label(%FailureHint, hint if hint != reason else "")

func _apply_skin(failed: bool, neutral: bool) -> void:
	_failed = failed
	%HeaderArt.texture = FAILURE_HEADER if failed else SUCCESS_HEADER
	%BodyArt.texture = FAILURE_BODY if failed else SUCCESS_BODY
	%FooterArt.texture = FAILURE_FOOTER if failed else SUCCESS_FOOTER
	%Heading.text = "怎么回事！" if failed else ("练习结果" if neutral else "还得是你！")
	%Mascot.visible = failed
	_set_button_art(_map, not failed)
	_set_button_art(_replay, failed)
	_replay.text = "不服，再来！" if failed else "再练一次"
	_layout_card()

func _layout_card() -> void:
	var available := size - Vector2(28.0, 28.0)
	var width := minf(536.0, minf(available.x, available.y * 536.0 / 620.0))
	if width <= 0.0:
		return
	var unit := width / 536.0
	var height := minf(available.y, (796.0 if _failed else 704.0) * unit)
	_place(_paper, roundf((size.x - width) * 0.5), size.y - height - 16.0, width, height)
	# Only the middle paper stretches. The hand, title plaque, leaf/bud corners,
	# mascot and buttons keep the proportions of their original Web artwork.
	var header := roundf(width * (270.0 if _failed else 250.0) / 964.0)
	var footer := roundf(width * (150.0 if _failed else 248.0) / 964.0)
	var footer_top := height - footer
	_place(%HeaderArt, 0.0, 0.0, width, header)
	_place(%BodyArt, 0.0, header, width, footer_top - header)
	_place(%FooterArt, 0.0, footer_top, width, footer)
	if _failed:
		_place(%Mascot, width * 0.015, header * 0.04, width * 0.28, header * 0.98)
		_place(%Heading, width * 0.30, header * 0.16, width * 0.57, header * 0.59)
	else:
		_place(%Heading, width * 0.24, header * 0.19, width * 0.52, header * 0.52)
	%Heading.add_theme_font_size_override("font_size", roundi((51.0 if _failed else 49.0) * unit))
	_map.add_theme_font_size_override("font_size", roundi((30.0 if _failed else 35.0) * unit))
	_replay.add_theme_font_size_override("font_size", roundi((35.0 if _failed else 29.0) * unit))

	var replay_top: float
	if _failed:
		var map_top := footer_top - 105.0 * unit
		replay_top = map_top - 106.0 * unit
		_place(_map, 56.0 * unit, map_top, 424.0 * unit, 103.0 * unit)
		_place(_replay, 56.0 * unit, replay_top, 424.0 * unit, 98.0 * unit)
	else:
		replay_top = footer_top - 85.0 * unit
		_place(_replay, 104.0 * unit, replay_top, 328.0 * unit, 80.0 * unit)
		_place(_map, 60.0 * unit, footer_top + 8.0 * unit, 388.0 * unit, 89.0 * unit)
	var body_top := header + (8.0 if _failed else 5.0) * unit
	var score_area := 0.0
	if _show_zero_score:
		score_area = 38.0 * unit
		%FailureReward.add_theme_font_size_override("font_size", maxi(11, roundi(21.0 * unit)))
		%FailureTotal.add_theme_font_size_override("font_size", maxi(11, roundi(18.0 * unit)))
		_place(%FailureScore, 0.092 * width, replay_top - score_area, 0.816 * width, 32.0 * unit)
	_place(_scroll, width * 0.092, body_top, width * 0.816, maxf(12.0, replay_top - 8.0 * unit - score_area - body_top))

func _build_lesson(lesson: Dictionary) -> void:
	for point in %Points.get_children():
		%Points.remove_child(point)
		point.queue_free()
	for child in %Sources.get_children():
		if child.name != &"SourceCaption":
			%Sources.remove_child(child)
			child.queue_free()
	var points: Array = lesson.get("points", [])
	for index in points.size():
		var point: Dictionary = points[index]
		var row := HBoxContainer.new()
		row.mouse_filter = MOUSE_FILTER_PASS
		row.add_theme_constant_override("separation", 9)
		var number := _new_label(str(index + 1), 16, INK)
		number.custom_minimum_size = Vector2(25.0, 25.0)
		number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		number.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		number.size_flags_vertical = SIZE_SHRINK_BEGIN
		var border := _round_box(Color.TRANSPARENT, 0, 14)
		border.set_border_width_all(1)
		border.border_color = Color("557047")
		number.add_theme_stylebox_override("normal", border)
		row.add_child(number)
		var info := VBoxContainer.new()
		info.mouse_filter = MOUSE_FILTER_PASS
		info.size_flags_horizontal = SIZE_EXPAND_FILL
		info.add_theme_constant_override("separation", 2)
		info.add_child(_new_label(point.title, 20, INK))
		info.add_child(_new_label(point.body, 19, Color("31513d")))
		row.add_child(info)
		%Points.add_child(row)
	for source: Dictionary in lesson.get("sources", []):
		var uri := _copy(source, "url")
		if not uri.begins_with("https://"):
			continue
		var link := LinkButton.new()
		link.text = source.publisher
		link.uri = uri
		link.tooltip_text = uri
		link.custom_minimum_size.y = 36.0
		link.add_theme_font_size_override("font_size", 16)
		link.add_theme_color_override("font_color", Color("365a3f"))
		link.add_theme_color_override("font_hover_color", INK)
		link.add_theme_color_override("font_focus_color", INK)
		%Sources.add_child(link)
	%Sources.visible = %Sources.get_child_count() > 1

func _decorate(score: int, delta: int, reduced: bool) -> void:
	if _decoration and _decoration.is_valid():
		_decoration.kill()
	_petal.hide()
	%Mascot.rotation = 0.0
	var blossoms: Array[Node] = %Flowers.get_children()
	for index in blossoms.size():
		var flower := blossoms[index] as TextureRect
		flower.visible = index < score
		flower.modulate.a = 0.8 if delta <= 0 else 1.0
		flower.scale = Vector2.ONE
	if reduced:
		return
	if _failed:
		var mascot := %Mascot as TextureRect
		mascot.pivot_offset = mascot.size * Vector2(0.54, 0.85)
		_decoration = create_tween()
		_decoration.tween_property(mascot, "rotation_degrees", -5.0, 0.12).set_delay(0.14)
		_decoration.tween_property(mascot, "rotation_degrees", 5.0, 0.22).set_trans(Tween.TRANS_SINE)
		_decoration.tween_property(mascot, "rotation_degrees", 0.0, 0.31).set_trans(Tween.TRANS_SINE)
	elif delta > 0 and score > 0:
		_decoration = create_tween().set_parallel(true)
		for index in mini(score, blossoms.size()):
			var flower := blossoms[index] as TextureRect
			flower.modulate.a = 0.0
			_decoration.tween_property(flower, "modulate:a", 1.0, 0.40).set_delay(index * 0.18)
		_petal.rotation_degrees = -20.0
		_petal.offset_top = -4.0
		_petal.offset_bottom = 16.0
		_petal.modulate.a = 0.0
		_petal.show()
		_decoration.tween_property(_petal, "modulate:a", 0.9, 0.20).set_delay(0.40)
		_decoration.tween_property(_petal, "rotation_degrees", 70.0, 1.2).set_delay(0.40)
		_decoration.tween_property(_petal, "position:y", 42.0, 1.2).set_delay(0.40).set_trans(Tween.TRANS_SINE)
		_decoration.tween_property(_petal, "modulate:a", 0.0, 0.40).from(0.9).set_delay(1.20)
		_decoration.chain().tween_callback(_petal.hide)

func _scroll_with_keys(event: InputEvent) -> void:
	var amount := 0
	if event.is_action_pressed(&"ui_down", true): amount = 36
	elif event.is_action_pressed(&"ui_up", true): amount = -36
	elif event.is_action_pressed(&"ui_page_down", true): amount = roundi(_scroll.size.y * 0.85)
	elif event.is_action_pressed(&"ui_page_up", true): amount = -roundi(_scroll.size.y * 0.85)
	if amount != 0:
		_scroll.scroll_vertical += amount
		_scroll.accept_event()

func _unhandled_key_input(event: InputEvent) -> void:
	if event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		map_requested.emit()

static func _place(node: Control, x: float, y: float, width: float, height: float) -> void:
	node.position = Vector2(x, y)
	node.size = Vector2(width, height)

static func _set_label(label: Label, text: String) -> void:
	label.text = text
	label.visible = not text.is_empty()

static func _copy(data: Dictionary, key: String, fallback := "") -> String:
	var value: Variant = data.get(key)
	return value if value is String and not value.strip_edges().is_empty() else fallback

static func _lesson_for(id: String) -> Dictionary:
	if _lessons.is_empty() and FileAccess.file_exists(LESSON_PATH):
		var file: Variant = JSON.parse_string(FileAccess.get_file_as_string(LESSON_PATH))
		if file is Dictionary and int(file.get("schema_version", 0)) == 1:
			_lessons = file.get("levels", {})
	return _lessons.get(id, {})

static func _new_label(text: String, font_size: int, ink: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = MOUSE_FILTER_IGNORE
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", ink)
	return label

static func _round_box(ink: Color, horizontal: int, radius := 4) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = ink
	style.set_content_margin(SIDE_LEFT, horizontal)
	style.set_content_margin(SIDE_RIGHT, horizontal)
	style.set_corner_radius_all(radius)
	return style

static func _set_button_art(button: Button, primary: bool) -> void:
	var texture: Texture2D = GOLD if primary else GREEN
	for state: String in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
		var style := StyleBoxTexture.new()
		style.texture = texture
		match state:
			"hover": style.modulate_color = Color(1.07, 1.07, 1.07)
			"pressed", "hover_pressed": style.modulate_color = Color(0.90, 0.88, 0.81)
			"disabled": style.modulate_color.a = 0.65
		button.add_theme_stylebox_override(state, style)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state, INK if primary else CREAM)
