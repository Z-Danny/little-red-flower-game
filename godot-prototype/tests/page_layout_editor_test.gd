extends SceneTree

const Main = preload("res://scenes/main.tscn")
const Save = preload("res://scripts/journey_save.gd")
const Overrides = preload("res://scripts/page_layout_overrides.gd")
const Runtime = preload("res://scripts/page_layout_runtime.gd")
const Editor = preload("res://scripts/page_layout_editor.gd")
const POINTS := "res://data/map_positions.json"
const HEADER := "res://data/map_header_layout.json"
const HOME_ID := "home"
const MAP_ID := "map/campus"
const BUTTON_MOVE := Vector2(53.0, 22.0)
const LABEL_MOVE := Vector2(-24.0, 17.0)

var _failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	root.size = Vector2i(576, 1024)
	AudioServer.set_bus_mute(0, true)
	var name := "page-layout-test-%d-%d" % [OS.get_process_id(), Time.get_ticks_msec()]
	var path := "user://%s.json" % name
	var points_hash := _file_hash(POINTS)
	var header_hash := _file_hash(HEADER)
	var storage := Overrides.new(path)
	_check(await _test_editing(storage, path), "fixture editing phase completed")
	_check(await _test_normal_pages(name), "normal navigation phase completed")
	_check(_file_hash(POINTS) == points_hash and _file_hash(HEADER) == header_hash, "generic authoring preserves prior map and header settings")
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)
	if _failures == 0:
		print("PASS: real page drag/text input, cancel/save/restore, same-path page isolation, and normal page editor retargeting")
	quit(_failures)

func _test_editing(storage: Overrides, path: String) -> bool:
	var host := Control.new()
	root.add_child(host)
	host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var editor := Editor.new()
	host.add_child(editor)
	editor.setup(host)
	var home := _mount_fixture(host, HOME_ID, "开始", storage)
	var runtime: Runtime = home.runtime
	var button: Button = home.button
	var label: Label = home.caption
	var button_rect := button.get_global_rect()
	var label_rect := label.get_global_rect()
	var actions := {"pressed": 0}
	button.pressed.connect(func() -> void: actions.pressed += 1)
	await process_frame
	editor.set_target(runtime)
	editor.begin_editing()
	await process_frame
	_check(editor.is_editing() and editor._canvas.get_global_rect().encloses(button_rect), "editing canvas covers the actual button")
	var button_path := runtime.path_for(button)
	var label_path := runtime.path_for(label)
	_check(not button_path.is_empty() and not label_path.is_empty() and button_path != label_path, "sibling controls have independent saved paths")
	_drag(button_rect.get_center(), BUTTON_MOVE)
	_check(editor._selected == button and button.get_global_rect().position.is_equal_approx(button_rect.position + BUTTON_MOVE), "drag uses the real button geometry and selects it")
	_check(button.get_global_rect().size.is_equal_approx(button_rect.size), "position editing does not resize the button")
	_check(label.get_global_rect().is_equal_approx(label_rect), "dragging an element leaves its sibling in place")
	_check(actions.pressed == 0, "authoring drag never activates gameplay")
	_double_click(button.get_global_rect().get_center())
	await process_frame
	_check(editor._text_box.has_focus(), "double click gives the actual text field focus")
	_type_text(editor._text_box, "试玩")
	await process_frame
	_check(button.text == "试玩", "typed text appears on the actual button")
	_check(not FileAccess.file_exists(path), "live drag and text are a draft until saved")
	_click(editor._restore_button)
	await process_frame
	_check(button.get_global_rect().is_equal_approx(button_rect) and button.text == "开始", "restore reverts both coordinates and text")

	var dock_y := editor._mode_button.global_position.y
	_click(editor._mode_button)
	await process_frame
	_check(not is_equal_approx(editor._mode_button.global_position.y, dock_y), "the dock may switch sides to expose the page")
	_click(editor._mode_button)
	await process_frame
	_drag(button.get_global_rect().get_center(), BUTTON_MOVE)
	_double_click(button.get_global_rect().get_center())
	await process_frame
	_type_text(editor._text_box, "马上试玩")
	await process_frame
	_drag(label.get_global_rect().get_center(), LABEL_MOVE)
	_click(editor._save_button)
	var saved := Overrides.new(path)
	_check(saved.page(HOME_ID).get(button_path) == {"offset": Vector2i(BUTTON_MOVE), "text": "马上试玩"}, "saved button position and text can be read afresh")
	_check(saved.page(HOME_ID).get(label_path) == {"offset": Vector2i(LABEL_MOVE)}, "moving a label does not save an unsolicited text override")
	_check(saved.page(MAP_ID).is_empty(), "saving this page does not populate another page")

	var saved_button_rect := button.get_global_rect()
	if not editor.is_editing():
		editor.begin_editing()
		await process_frame
	_drag(button.get_global_rect().get_center(), Vector2(-10.0, 7.0))
	_click(editor._close_button)
	await process_frame
	_check(not editor.is_editing() and button.get_global_rect().is_equal_approx(saved_button_rect), "close discards only the unsaved draft")
	_click_at(button_rect.get_center() + Vector2(-60.0, 0.0))
	_check(actions.pressed == 0, "the old button hit area is inactive")
	_click_at(button.get_global_rect().get_center())
	_check(actions.pressed == 1, "the moved button keeps its normal action after closing the editor")

	home.page.hide()
	var map := _mount_fixture(host, MAP_ID, "地图入口", saved)
	await process_frame
	var map_button: Button = map.button
	var map_runtime: Runtime = map.runtime
	_check(map_runtime.path_for(map_button) == button_path, "fixtures deliberately reuse the same relative node path")
	_check(map_button.get_global_rect().is_equal_approx(button_rect) and map_button.text == "地图入口", "same-named controls on different pages are independent")
	editor.set_target(map_runtime)
	editor.begin_editing()
	await process_frame
	_drag(map_button.get_global_rect().get_center(), Vector2(-18.0, 27.0))
	_click(editor._save_button)
	if editor.is_editing():
		_click(editor._close_button)
	var two_pages := Overrides.new(path)
	_check(two_pages.page(HOME_ID) == saved.page(HOME_ID), "saving another page preserves the first page's records")
	_check(two_pages.page(MAP_ID).get(button_path) == {"offset": Vector2i(-18, 27)}, "second page stores its own coordinate")

	map.page.hide()
	var reopened := _mount_fixture(host, HOME_ID, "继续", two_pages)
	await process_frame
	var reopened_button: Button = reopened.button
	var reopened_runtime: Runtime = reopened.runtime
	_check(reopened_button.text == "马上试玩" and reopened_button.get_global_rect().is_equal_approx(saved_button_rect), "an ordinary fresh runtime applies the saved source overrides")
	reopened_runtime.apply_draft()
	reopened_runtime.apply_draft()
	_check(reopened_button.get_global_rect().is_equal_approx(saved_button_rect), "reapplying a layout does not add the offsets again")
	host.queue_free()
	await process_frame
	return true

func _mount_fixture(host: Control, id: String, text: String, storage: Overrides) -> Dictionary:
	var page := Control.new()
	page.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(page)
	host.move_child(page, 0)
	page.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var button := Button.new()
	button.name = "Play"
	button.position = Vector2(145.0, 390.0)
	button.size = Vector2(200.0, 72.0)
	button.text = text
	page.add_child(button)
	button.owner = page
	var caption := Label.new()
	caption.name = "Caption"
	caption.position = Vector2(235.0, 290.0)
	caption.size = Vector2(120.0, 38.0)
	caption.text = "提示"
	page.add_child(caption)
	caption.owner = page
	var runtime := Runtime.new()
	page.add_child(runtime)
	runtime.setup(page, id, storage)
	return {"page": page, "button": button, "caption": caption, "runtime": runtime}

func _test_normal_pages(name: String) -> bool:
	var app := Main.instantiate()
	app._save = Save.new(name + "-game.cfg")
	root.add_child(app)
	await process_frame
	var editor: Editor = app._page_layout_editor
	_check(editor != null, "running the source project attaches the WYSIWYG entry")
	if editor == null:
		app.queue_free()
		return false
	var original_home: Control = app._screen
	_check(editor._runtime != null and editor._runtime.page == original_home, "editor follows the normal Home page")
	app._enter_islands(false)
	await process_frame
	var picker: Control = app._screen
	var home_island: Resource = picker.islands[1]
	_check(editor._runtime != null and editor._runtime.page == picker, "editor automatically follows the island picker")
	await app._open_map(0, picker.islands[0])
	await process_frame
	var map: Control = app._screen
	_check(editor._runtime != null and editor._runtime.page == map, "editor automatically follows the island page")
	var map_title := map.get_node("Header/TitlePlate/Title") as Label
	editor.begin_editing()
	await process_frame
	_double_click(map_title.get_global_rect().get_center())
	await process_frame
	_check(editor._selected == map_title and editor._text_box.editable, "the actual painted map title can be selected and edited above the toolbar")
	_click(editor._close_button)
	map.inspect("campus-canteen-check-v1")
	await process_frame
	_check(editor._runtime.page == map._intro and editor._runtime.page_id == "intro/campus-canteen-check-v1", "the selected level introduction has its own layout")
	map._dismiss_intro()
	await process_frame
	_check(editor._runtime.page == map, "closing the introduction returns to island editing")
	app._show_progress()
	await process_frame
	_check(editor._runtime.page == app._dialog and editor._runtime.page_id == "journey_progress", "the progress dialog has its own layout")
	app._dismiss_dialog()
	app._show_settings()
	await process_frame
	_check(editor._runtime != null and editor._runtime.page == app._dialog, "visible dialogs are editable pages")
	app._dismiss_dialog()
	await process_frame
	_check(editor._runtime != null and editor._runtime.page == map, "closing a dialog restores the underlying page target")
	await app._open_map(1, home_island)
	app._test_unlock = true
	await app._play_level("oil-fire")
	await process_frame
	var runner: Control = app._screen
	_check(editor._runtime.page == runner and editor._runtime.page_id == "runner/oil-fire", "a level exposes its safe authored interface under its own layout")
	if runner.has_signal("finished"):
		runner.emit_signal("finished", false, 12.0)
		await process_frame
		_check(editor._runtime.page == app._screen and editor._runtime.page_id == "settlement/oil-fire/failure", "settlement layout follows the level and outcome")
	app.queue_free()
	await create_timer(0.25).timeout
	return true

func _type_text(box: TextEdit, text: String) -> void:
	box.grab_focus()
	box.select_all()
	for index in text.length():
		var event := InputEventKey.new()
		event.unicode = text.unicode_at(index)
		event.pressed = true
		root.push_input(event, true)

func _click(control: Control) -> void:
	_click_at(control.get_global_rect().get_center())

func _click_at(point: Vector2) -> void:
	_mouse_button(point, true)
	_mouse_button(point, false)

func _double_click(point: Vector2) -> void:
	_mouse_button(point, true, true)
	_mouse_button(point, false)

func _drag(start: Vector2, distance: Vector2) -> void:
	_mouse_button(start, true)
	var motion := InputEventMouseMotion.new()
	motion.position = start + distance
	motion.global_position = motion.position
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	root.push_input(motion, true)
	_mouse_button(motion.position, false)

func _mouse_button(point: Vector2, pressed: bool, double_click := false) -> void:
	var event := InputEventMouseButton.new()
	event.position = point
	event.global_position = point
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = pressed
	event.double_click = double_click
	event.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
	root.push_input(event, true)

func _file_hash(path: String) -> String:
	return FileAccess.get_sha256(path) if FileAccess.file_exists(path) else ""

func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures += 1
		printerr("FAIL: " + message)
