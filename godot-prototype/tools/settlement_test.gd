extends SceneTree
## Controlled settlement-boundary test. No player/save is instantiated.

const Settlement = preload("res://scenes/settlement.tscn")
const Catalog = preload("res://scripts/level_catalog.gd")
const SKY = preload("res://assets/ui/sky.webp")
const HUNT_ENDING = "res://assets/hunt_runner/quake-bedroom-v2/ending.webp"
const SUCCESS := {"score": 3, "delta": 2, "total": 7, "saved": true}

var _failures := 0
var _map_calls := 0
var _replay_calls := 0
var _underlay_calls := 0
var _page: Control
var _capture_dir := ""

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--capture="):
			_capture_dir = arg.trim_prefix("--capture=")
	var underlay := ColorRect.new()
	underlay.color = Color("749d71")
	root.add_child(underlay)
	underlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var underlying_button := Button.new()
	underlying_button.position = Vector2(15, 15)
	underlying_button.size = Vector2(80, 50)
	underlying_button.pressed.connect(func() -> void: _underlay_calls += 1)
	underlay.add_child(underlying_button)
	_page = Settlement.instantiate() as Control
	_page.map_requested.connect(func() -> void: _map_calls += 1)
	_page.replay_requested.connect(func() -> void: _replay_calls += 1)
	root.add_child(_page)
	await process_frame
	var catalog := Catalog.new()
	var hunt := catalog.entry_for("quake-bedroom-v2")
	var safe_art := load(HUNT_ENDING) as Texture2D
	var sky := _page.get_node("Sky") as TextureRect
	var scroll := _page.get_node("%ContentScroll") as ScrollContainer
	var map_button := _page.get_node("%Map") as Button
	var replay_button := _page.get_node("%Replay") as Button
	var frame := _page.get_node("Paper") as Control
	var mascot := _page.get_node("%Mascot") as TextureRect

	_page.show_outcome(true, 8.4, SUCCESS, hunt, {"title": "原结局标题", "summary": "原规则的结局提示", "safe_art": safe_art, "reduced_motion": true, "live_backdrop": true})
	await process_frame
	await process_frame
	_check(sky.visible and sky.texture == safe_art and sky.stretch_mode == TextureRect.STRETCH_KEEP_ASPECT_COVERED, "supplied hunt artwork wins over live backdrop, preserving cover")
	_check(not mascot.visible and _text("Heading") == "还得是你！", "completion title and no failure mascot")
	_check(_text("OutcomeTitle") == "原结局标题" and _text("Advice") == "原规则的结局提示", "runner title and verbatim advice are visible")
	_check(_text("Summary") == "用时 8.4 秒  /  本次 3 朵" and _text("Progress") == "新增 2 朵  /  累计 7 朵\n进度已保存", "timed score, exact delta and real save status")
	_check(_count_flowers() == 3 and map_button.text == "种下小红花", "three score flowers; map button uses award wording")
	_check(_segments(false), "real completion segments join with no panel gaps")
	_check(scroll.scroll_vertical == 0 and scroll.get_v_scroll_bar().visible, "long lesson starts at top with visible scrollbar")
	_check(_action_layout(frame, map_button, replay_button), "success actions are separated, in frame and outside the scroll clip")
	print("576-reference success logical buttons: Map %s; Replay %s" % [map_button.get_global_rect(), replay_button.get_global_rect()])
	await _capture("01-success")
	_mouse(scroll.get_global_rect().get_center(), MOUSE_BUTTON_WHEEL_DOWN, true)
	_mouse(scroll.get_global_rect().get_center(), MOUSE_BUTTON_WHEEL_DOWN, false)
	await process_frame
	_check(scroll.scroll_vertical > 0, "wheel scroll opens more lesson text")
	scroll.grab_focus()
	_key(KEY_PAGEDOWN)
	_key(KEY_PAGEDOWN)
	_key(KEY_PAGEDOWN)
	await process_frame
	var sources := _page.get_node("%Sources") as HFlowContainer
	_check(scroll.scroll_vertical > 0 and scroll.get_global_rect().encloses(sources.get_global_rect()), "Page Down reaches authored source links")
	await _capture("02-success-sources")
	_click(map_button.get_global_rect().get_center())
	_click(replay_button.get_global_rect().get_center())
	_check(_map_calls == 1 and _replay_calls == 1, "mouse clicks emit original actions after scrolling (map %d, replay %d)" % [_map_calls, _replay_calls])

	var oil := catalog.entry_for("oil-fire")
	_page.show_outcome(true, 30.2, {"score": 1, "delta": 0, "total": 7, "saved": false}, oil, {"live_backdrop": true, "reduced_motion": true})
	await process_frame
	_check(not sky.visible and _page.get_node("Shade").color.a < 0.3, "live backdrop exposes the underlying frame through a translucent shade")
	_check(_text("OutcomeTitle") == "处置成功" and _text("Advice").contains("保持锅盖覆盖") and _text("Advice").contains("119"), "retains original oil-fire success and safe advice")
	_check(_count_flowers() == 1 and map_button.text == "返回地图" and _text("Progress").contains("仅保留在本次运行"), "one-score replay and temporary save status")
	_click(Vector2(45, 36))
	_check(_underlay_calls == 0, "click outside card does not pass through to retained world")
	await _capture("03-live-same-page-replay")

	_page.show_outcome(false, 50.0, {"score": 3, "total": 7}, hunt, {
		"kind": "timeout", "missed": {"count": 2, "unit": "处"}, "reason": "还有两处隐患未找到。", "progress": "已找到 3 / 5 处",
		"safe_art": safe_art, "live_backdrop": true, "reduced_motion": true,
	})
	await process_frame
	await process_frame
	_check(sky.visible and sky.texture == SKY, "failure restores neutral sky, never the passed success art or live backdrop")
	_check(_text("Heading") == "怎么回事！" and mascot.visible and _segments(true), "real failure title, mascot and segments")
	_check(_text("Roast") == "漏了 2 处，\n还想领花？" and _text("FailureProgress") == "已找到 3 / 5 处", "failure recap uses supplied structured progress")
	_check(_text("FailureReason") == "还有两处隐患未找到。" and _text("FailureHint") == hunt.knowledge, "failure displays original reason and safe fallback without editing")
	_check(_text("FailureReward") == "本局小红花：0 朵" and _text("FailureTotal") == "累计 7 朵小红花" and _count_flowers() == 0, "failure never presents the supplied score as earned")
	var failure_score := _page.get_node("%FailureScore") as Control
	_check(failure_score.is_visible_in_tree() and not scroll.get_global_rect().intersects(failure_score.get_global_rect()), "zero reward and total stay visible outside the scroll clip")
	_check(_action_layout(frame, map_button, replay_button), "failure actions are stacked, in frame and outside the scroll clip")
	print("576-reference failure logical buttons: Map %s; Replay %s" % [map_button.get_global_rect(), replay_button.get_global_rect()])
	await _capture("04-failure")
	_click(replay_button.get_global_rect().get_center())
	_click(map_button.get_global_rect().get_center())
	_key(KEY_ESCAPE)
	_check(_map_calls == 3 and _replay_calls == 2, "both failure buttons and Escape-to-map work (map %d, replay %d)" % [_map_calls, _replay_calls])

	_page.show_outcome(false, 50.0, {}, oil, {"reason": "原油锅失败原因。", "reduced_motion": true})
	_check(_text("FailureReason") == "原油锅失败原因。" and _text("FailureHint").contains("切勿泼水") and _text("FailureHint").contains("119"), "oil-fire failure keeps both safety lines and supplied reason")
	_page.show_outcome(false, 2.0, {}, oil, {"escaped": true, "reason": "原先行转移反馈", "reduced_motion": true})
	_check(_text("Heading") == "练习结果" and not mascot.visible and not _page.get_node("%Roast").visible, "neutral evacuation never uses failure character or roast")

	var lessons := Catalog.read_json("res://assets/settlement_ui/lessons.json")
	var playable_ids := catalog.original_playable_ids()
	_check(playable_ids.size() > 0 and lessons.levels.size() == playable_ids.size(), "snapshot covers every released playable level")
	for id in playable_ids:
		var fixed := id == "first-aid-cpr"
		var score := {"score": 2, "delta": 0, "total": 7, "saved": true, "fixed": fixed}
		_page.show_outcome(true, 20.5, score, catalog.entry_for(id), {"reduced_motion": true})
		var lesson: Dictionary = lessons.levels[id]
		var points := _page.get_node("%Points")
		_check(_text("Message") == lesson.message and points.get_child_count() == 3, "authored message and three lesson points: " + id)
		for index in points.get_child_count():
			var row = points.get_child(index).get_child(1)
			_check(row.get_child(0).text == lesson.points[index].title and row.get_child(1).text == lesson.points[index].body, "verbatim point: %s/%d" % [id, index + 1])
		_check(sources.get_child_count() - 1 == lesson.sources.size(), "all authored sources are present: " + id)
		for index in lesson.sources.size():
			var link := sources.get_child(index + 1) as LinkButton
			_check(link != null and link.text == lesson.sources[index].publisher and link.uri == lesson.sources[index].url, "publisher and URL are unmodified: %s/%d" % [id, index + 1])
		if fixed:
			_check(_text("Summary") == "本次 2 朵小红花" and "不代表患者已经恢复" in _text("Message"), "CPR uses fixed-score wording and unchanged safety boundary")
		_check(sky.visible and sky.texture == SKY, "missing outcome artwork never reuses a different level image: " + id)
	await process_frame
	if _failures == 0:
		print("PASS: painted settlement, 26 lessons, inputs, scoring, success/failure and backdrop contract")
	quit(_failures)

func _segments(failure: bool) -> bool:
	var header := _page.get_node("%HeaderArt") as TextureRect
	var body := _page.get_node("%BodyArt") as TextureRect
	var footer := _page.get_node("%FooterArt") as TextureRect
	var path := "res://assets/settlement_ui/%s/" % ("failure" if failure else "success")
	return header.texture.resource_path == path + "header.webp" and body.texture.resource_path == path + "body.webp" and footer.texture.resource_path == path + "footer.webp" and is_equal_approx(header.position.y + header.size.y, body.position.y) and is_equal_approx(body.position.y + body.size.y, footer.position.y)

func _action_layout(frame: Control, map_button: Button, replay_button: Button) -> bool:
	var scroll := _page.get_node("%ContentScroll") as ScrollContainer
	var r := frame.get_global_rect()
	var map_box := map_button.get_global_rect()
	var replay_box := replay_button.get_global_rect()
	return r.encloses(map_box) and r.encloses(replay_box) and map_box.size.y >= 80.0 and replay_box.size.y >= 80.0 and not map_box.intersects(replay_box) and not scroll.get_global_rect().intersects(replay_box) and not scroll.get_global_rect().intersects(map_box)

func _count_flowers() -> int:
	var displayed := 0
	for node: TextureRect in _page.get_node("%Flowers").get_children():
		if node.is_visible_in_tree(): displayed += 1
	return displayed

func _capture(stem: String) -> void:
	if _capture_dir.is_empty() or DisplayServer.get_name() == "headless":
		return
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	_check(image != null and not image.is_empty() and image.save_png(_capture_dir.path_join(stem + ".png")) == OK, "native visual capture: " + stem)

func _text(node: String) -> String:
	return (_page.get_node("%" + node) as Label).text

func _click(point: Vector2) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = point
	motion.global_position = point
	root.push_input(motion, true)
	_mouse(point, MOUSE_BUTTON_LEFT, true)
	_mouse(point, MOUSE_BUTTON_LEFT, false)

func _mouse(point: Vector2, button: MouseButton, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = button
	event.position = point
	event.global_position = point
	event.pressed = pressed
	event.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed and button == MOUSE_BUTTON_LEFT else 0
	root.push_input(event, true)

func _key(code: Key) -> void:
	for pressed: bool in [true, false]:
		var event := InputEventKey.new()
		event.keycode = code
		event.pressed = pressed
		root.push_input(event, true)

func _check(value: bool, message: String) -> void:
	if not value:
		_failures += 1
		printerr("FAIL: " + message)
