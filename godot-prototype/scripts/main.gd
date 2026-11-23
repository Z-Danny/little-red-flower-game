extends Control

const HOME = preload("res://scenes/home.tscn")
const ARCHIPELAGO = preload("res://scenes/archipelago.tscn")
const ISLAND_MAP = preload("res://scenes/island_map.tscn")
const SETTLEMENT = preload("res://scenes/settlement.tscn")
const Save = preload("res://scripts/journey_save.gd")
const Catalog = preload("res://scripts/level_catalog.gd")
const IslandInfo = preload("res://scripts/island_info.gd")
const AssetPacks = preload("res://scripts/asset_packs.gd")
const ProgressDialog = preload("res://scenes/journey_progress.tscn")
const SettingsDialog = preload("res://scenes/journey_settings.tscn")
const JourneyAudio = preload("res://scripts/journey_audio.gd")
const Profiles = preload("res://scripts/journey_profiles.gd")
const PageLayoutOverrides = preload("res://scripts/page_layout_overrides.gd")
const PageLayoutRuntime = preload("res://scripts/page_layout_runtime.gd")
const PageLayoutEditor = preload("res://scripts/page_layout_editor.gd")
const NAVIGATION_PAGES := [HOME, ARCHIPELAGO, ISLAND_MAP, SETTLEMENT]
const RUNNER_BUTTONS := [&"Back", &"BackButton", &"Pause", &"PauseButton", &"Hint", &"HintButton", &"Resume", &"PauseBack", &"ExitMap", &"Replay", &"Restart", &"FinishPractice", &"SkipIntro"]
const SAFE_GAP := 6.0
const WECHAT_MENU_FPS := 30
const WECHAT_GAMEPLAY_FPS := 60

var _asset_packs := AssetPacks.new()
var _journey_audio := JourneyAudio.new()
var _dialog: Control
var _dialog_origin: Control
var _focus_origin: Control
var _result_backdrop: Control
var _loading := false
var _save: Save
var _profiles := Profiles.new()
var _catalog := Catalog.new()
var _screen: Control
var _island_index := 0
var _island: IslandInfo
var _active: Dictionary = {}
var _test_unlock := false
var _focus_level := ""
var _next_level := ""
var _wechat_safe_area: JavaScriptObject
var _wechat_performance: JavaScriptObject
var _wechat_fps := 0
var _authored_offsets: Dictionary[Control, Vector4] = {}
var _preview_safe_area: Variant = null
var _layout_storage := PageLayoutOverrides.new()
var _screen_layout: PageLayoutRuntime
var _dialog_layout: PageLayoutRuntime
var _intro_layout: PageLayoutRuntime
var _page_layout_editor: PageLayoutEditor

func _ready() -> void:
	if OS.has_feature("web"):
		var host_window := JavaScriptBridge.get_interface("window")
		if host_window != null:
			_wechat_safe_area = host_window.redFlowerSafeArea
			_wechat_performance = host_window.redFlowerPerformance
		_asset_packs.sequential_downloads = _wechat_performance != null
	resized.connect(_apply_page_safe_area)
	if _save == null:
		_save = _profiles.current_save()
	add_child(_asset_packs)
	add_child(_journey_audio)
	get_tree().node_added.connect(_route_screen_audio)
	_asset_packs.status_changed.connect(func(text: String) -> void: %LoadingText.text = text)
	if OS.has_feature("editor"):
		_page_layout_editor = PageLayoutEditor.new()
		_page_layout_editor.name = "PageLayoutEditor"
		add_child(_page_layout_editor)
		_page_layout_editor.setup(self)
	_show_home()

func _swap(page: Control, preserve := false) -> Control:
	_dismiss_dialog()
	_screen_layout = null
	_intro_layout = null
	_sync_layout_editor()
	_journey_audio.stop_effect("action")
	_journey_audio.stop_effect("plant")
	if is_instance_valid(_result_backdrop):
		_result_backdrop.hide()
		_result_backdrop.queue_free()
		_result_backdrop = null
	if is_instance_valid(_screen):
		_screen.process_mode = Node.PROCESS_MODE_DISABLED
		for audio: AudioStreamPlayer in _screen.find_children("*", "AudioStreamPlayer", true, false):
			audio.stop()
		if preserve:
			_result_backdrop = _screen
		else:
			_screen.hide()
			_screen.queue_free()
	_screen = page
	_set_wechat_pacing(page.scene_file_path)
	_authored_offsets.clear()
	_journey_audio.set_navigation_active(page.scene_file_path in [HOME.resource_path, ARCHIPELAGO.resource_path, ISLAND_MAP.resource_path])
	%Page.add_child(_screen)
	_apply_page_safe_area()
	return _screen

func _set_wechat_pacing(scene_path: String) -> void:
	if _wechat_performance == null:
		return
	var is_menu := NAVIGATION_PAGES.any(func(scene: PackedScene) -> bool: return scene.resource_path == scene_path)
	var target := WECHAT_MENU_FPS if is_menu else WECHAT_GAMEPLAY_FPS
	if _wechat_fps != target:
		_wechat_fps = target
		Engine.max_fps = target
		_wechat_performance.setPreferredFps(target)

func _install_page_layout(page: Control, id: String, dialog := false) -> void:
	var runtime := _make_page_layout(page, id)
	if dialog:
		_dialog_layout = runtime
	else:
		_screen_layout = runtime
	_sync_layout_editor()

func _make_page_layout(page: Control, id: String) -> PageLayoutRuntime:
	var runtime := PageLayoutRuntime.new()
	runtime.name = "PageLayoutRuntime"
	page.add_child(runtime)
	runtime.setup(page, id, _layout_storage)
	return runtime

func _sync_layout_editor() -> void:
	if is_instance_valid(_page_layout_editor):
		var active := _screen_layout
		if is_instance_valid(_intro_layout):
			active = _intro_layout
		if is_instance_valid(_dialog_layout):
			active = _dialog_layout
		_page_layout_editor.set_target(active)

func set_preview_safe_area(top_fraction: float, bottom_fraction: float, capsule_left_fraction: float, capsule_bottom_fraction: float) -> void:
	if OS.has_feature("editor"):
		_preview_safe_area = Vector4(top_fraction, bottom_fraction, capsule_left_fraction, capsule_bottom_fraction)
		_apply_page_safe_area()

func _apply_page_safe_area() -> void:
	if not is_instance_valid(_screen):
		return
	var area := Vector4(0.0, 0.0, 1.0, 0.0)
	if _wechat_safe_area != null:
		area = Vector4(float(_wechat_safe_area.topFraction()), float(_wechat_safe_area.bottomFraction()), float(_wechat_safe_area.capsuleLeftFraction()), float(_wechat_safe_area.capsuleBottomFraction()))
	elif _preview_safe_area != null:
		area = _preview_safe_area
	var fractions := Vector2(area.x, area.y)
	var insets := (fractions.clamp(Vector2.ZERO, Vector2(0.2, 0.2)) * size.y).round()
	if insets.x > 0.0:
		insets.x += SAFE_GAP
	var capsule := Vector2(
		clampf(area.z, 0.0, 1.0) * size.x,
		clampf(area.w, 0.0, 0.25) * size.y
	)
	if _screen.scene_file_path == ISLAND_MAP.resource_path:
		_screen.set_header_safe_area(maxf(0.0, insets.x - SAFE_GAP), capsule)
	for child in _screen.get_children():
		if child is Control:
			_apply_control_safe_area(child, insets, capsule)
	if is_instance_valid(_screen_layout):
		_screen_layout.queue_apply()

func _apply_control_safe_area(control: Control, insets: Vector2, capsule: Vector2) -> void:
	var top := control.is_in_group(&"wechat_top")
	var below_capsule := control.is_in_group(&"wechat_below_capsule")
	var left_of_capsule := control.is_in_group(&"wechat_left_of_capsule")
	var content_top := control.is_in_group(&"wechat_content_top")
	var scroll_top := control.is_in_group(&"wechat_scroll_top")
	var bottom := control.is_in_group(&"wechat_bottom")
	if not (top or below_capsule or left_of_capsule or content_top or scroll_top or bottom):
		return
	if not _authored_offsets.has(control):
		_authored_offsets[control] = Vector4(control.offset_left, control.offset_top, control.offset_right, control.offset_bottom)
	var authored: Vector4 = _authored_offsets[control]
	var shift := Vector2.ZERO
	var authored_top := control.anchor_top * size.y + authored.y
	if scroll_top or content_top:
		shift.y = insets.x
	elif bottom:
		shift.y = -insets.y
	else:
		shift.y = maxf(0.0, insets.x - authored_top)
		var right := control.anchor_right * size.x + authored.z
		var capsule_gap := capsule.x - SAFE_GAP
		if capsule.y > 0.0 and right > capsule_gap and authored_top + shift.y < capsule.y + SAFE_GAP:
			if left_of_capsule:
				shift.x = capsule_gap - right
			elif below_capsule:
				shift.y = capsule.y + SAFE_GAP - authored_top
	control.offset_left = authored.x + shift.x
	control.offset_right = authored.z + shift.x
	control.offset_top = authored.y + shift.y
	control.offset_bottom = authored.w + (0.0 if scroll_top else shift.y)

func _route_screen_audio(node: Node) -> void:
	if node is AudioStreamPlayer and is_instance_valid(_screen) and _screen.is_ancestor_of(node):
		node.playback_type = JourneyAudio.playback_type()
		if node.bus == &"Master":
			node.bus = JourneyAudio.MUSIC_BUS if String(node.name).contains("Music") else JourneyAudio.FX
	if not node is BaseButton:
		return
	var navigation := is_instance_valid(_screen) and _screen.is_ancestor_of(node) and NAVIGATION_PAGES.any(
		func(scene: PackedScene) -> bool: return scene.resource_path == _screen.scene_file_path
	)
	var in_dialog := is_instance_valid(_dialog) and _dialog.is_ancestor_of(node)
	if navigation or in_dialog:
		_connect_button_cue(node)
	elif is_instance_valid(_screen) and _screen.is_ancestor_of(node):
		_route_runner_button.call_deferred(node)

func _route_runner_button(button: BaseButton) -> void:
	# Some runners name their generated controls just after adding them.
	if is_instance_valid(button) and button.name in RUNNER_BUTTONS:
		_connect_button_cue(button)

func _connect_button_cue(button: BaseButton) -> void:
	var cue := "button"
	if button.name in [&"Back", &"BackButton", &"Close", &"Resume", &"PauseBack", &"ExitMap"]:
		cue = "close"
	elif button.name in [&"Hint", &"HintButton"]:
		cue = "hint"
	elif button.name in [&"Pause", &"PauseButton", &"Plaque", &"Plant", &"Settings", &"Progress"]:
		cue = "open"
	button.pressed.connect(_journey_audio.play_cue.bind(cue, "interface"))

func _show_home() -> void:
	var page := _swap(HOME.instantiate() as Control)
	page.update_progress(_save.total(_catalog.playable_ids()))
	page.settings_requested.connect(_show_settings)
	page.ranking_requested.connect(_show_progress.bind(true))
	page.begin.connect(_start_journey)
	page.island_selection_requested.connect(_enter_islands.bind(false))
	page.test_run.connect(func() -> void: _enter_islands(true))
	_install_page_layout(page, "home")

func _start_journey() -> void:
	_test_unlock = false
	if _island != null:
		_open_map(_island_index, _island)
		return
	var picker := ARCHIPELAGO.instantiate()
	var first: Resource = picker.islands[0]
	picker.free()
	_open_map(0, first)

func _enter_islands(test_unlock: bool) -> void:
	_test_unlock = test_unlock
	_show_islands()

func _show_islands() -> void:
	var page := _swap(ARCHIPELAGO.instantiate() as Control)
	page.show_progress(_catalog, _save)
	page.selection_settled.connect(_journey_audio.play_island_switch)
	page.back_requested.connect(_show_home)
	page.island_opened.connect(_open_map)
	_install_page_layout(page, "archipelago")

func _open_map(index: int, island: Resource) -> void:
	if _loading or %Loading.visible:
		return
	var info := island as IslandInfo
	if not await _prepare_media("map:" + String(info.island_id)):
		return
	_island_index = index
	_island = info
	_focus_level = ""
	_next_level = ""
	_show_map()

func _show_map() -> void:
	_show_map_with_reward("")

func _show_map_with_reward(reward_cue: String) -> void:
	if _island == null:
		_show_islands()
		return
	_active = {}
	var page := _swap(ISLAND_MAP.instantiate() as Control)
	page.setup(_island, _island_index, _catalog, _save, _test_unlock, _focus_level, _next_level, reward_cue.begins_with("plant"), false)
	_next_level = ""
	if not reward_cue.is_empty():
		_journey_audio.stop_effect("result")
		_journey_audio.play_cue(reward_cue, "plant")
	page.back_requested.connect(_show_islands)
	page.play_requested.connect(_play_level)
	page.connect("home_requested", _show_home)
	page.connect("progress_requested", _show_progress)
	page.intro_layout_changed.connect(_map_intro_layout.bind(page))
	_install_page_layout(page, "map/" + String(_island.island_id))

func _map_intro_layout(level_id: String, map: Control) -> void:
	var previous := _intro_layout
	_intro_layout = null
	if not level_id.is_empty():
		_intro_layout = _make_page_layout(map.get_node("%Intro"), "intro/" + level_id)
	_sync_layout_editor()
	if is_instance_valid(previous):
		previous.clear_applied()
		map.get_node("%Intro").remove_child(previous)
		previous.queue_free()

func _show_progress(open_ranking := false) -> void:
	var dialog := _open_dialog(ProgressDialog)
	if dialog == null: return
	dialog.closed.connect(_journey_audio.play_cue.bind("close", "interface"))
	dialog.display(_catalog, _save, _profiles)
	if open_ranking:
		dialog.show_ranking()
	dialog.active_player_changed.connect(func() -> void:
		_save = _profiles.current_save()
		_refresh_progress()
		dialog.display(_catalog, _save, _profiles)
		_dialog_layout.queue_apply()
	)
	_install_page_layout(dialog, "journey_progress", true)

func _refresh_progress() -> void:
	if _screen.has_method("refresh_progress"):
		_screen.refresh_progress(_save)
	elif _screen.scene_file_path == HOME.resource_path:
		_screen.update_progress(_save.total(_catalog.playable_ids()))
	if is_instance_valid(_screen_layout):
		_screen_layout.queue_apply()

func _show_settings() -> void:
	var dialog := _open_dialog(SettingsDialog)
	if dialog == null: return
	dialog.closed.connect(_journey_audio.play_cue.bind("close", "interface"))
	dialog.display(_journey_audio.music_muted, _journey_audio.effects_muted, _save.total(_catalog.playable_ids()))
	dialog.sound_changed.connect(func(music_off: bool, effects_off: bool) -> void:
		var reenabled := _journey_audio.effects_muted and not effects_off
		var saved := _journey_audio.set_toggles(music_off, effects_off)
		dialog.update_sound(music_off, effects_off, saved)
		_dialog_layout.queue_apply()
		if reenabled:
			_journey_audio.play_cue("button")
	)
	dialog.reset_confirmed.connect(func() -> void:
		var ok := _save.reset() == OK
		if ok:
			_refresh_progress()
		dialog.after_reset(ok)
		_dialog_layout.queue_apply()
	)
	_install_page_layout(dialog, "journey_settings", true)

func _open_dialog(scene: PackedScene) -> Control:
	if is_instance_valid(_dialog) or _loading or %Loading.visible: return null
	_focus_origin = get_viewport().gui_get_focus_owner()
	_dialog_origin = _screen
	_dialog_origin.process_mode = Node.PROCESS_MODE_DISABLED
	_dialog = scene.instantiate() as Control
	%DialogLayer.add_child(_dialog)
	_dialog.closed.connect(_dismiss_dialog)
	return _dialog

func _dismiss_dialog() -> void:
	if not is_instance_valid(_dialog): return
	_dialog.hide()
	_dialog.process_mode = Node.PROCESS_MODE_DISABLED
	_dialog.queue_free()
	_dialog = null
	_dialog_layout = null
	_sync_layout_editor()
	if is_instance_valid(_dialog_origin): _dialog_origin.process_mode = Node.PROCESS_MODE_INHERIT
	if is_instance_valid(_focus_origin) and _focus_origin.is_visible_in_tree(): _focus_origin.grab_focus()
	_focus_origin = null
	_dialog_origin = null

func _prepare_media(key: String) -> bool:
	if not _asset_packs.needs_download(key): return true
	_loading = true
	var old_screen := _screen
	var old_process_mode := old_screen.process_mode
	var old_focus := get_viewport().gui_get_focus_owner()
	old_screen.process_mode = Node.PROCESS_MODE_DISABLED
	%LoadingTitle.text = "正在加载素材"
	%LoadingText.text = "正在连接…"
	%Loading.show()
	%Loading.grab_focus()
	var lantern_pulse := _animate_loading_lantern()
	await get_tree().process_frame
	var ready := await _asset_packs.ensure_for(key)
	lantern_pulse.kill()
	%LanternCard.material.set_shader_parameter("lantern_light", 0.5)
	if not ready:
		%LoadingTitle.text = "素材无法加载"
		%LoadingText.text = "请检查网络后再试。"
		await get_tree().create_timer(1.8).timeout
	%Loading.hide()
	if is_instance_valid(old_screen):
		old_screen.process_mode = old_process_mode
	if not ready and is_instance_valid(old_focus) and old_focus.is_visible_in_tree():
		old_focus.grab_focus()
	_loading = false
	return ready

func _animate_loading_lantern() -> Tween:
	var lantern: ShaderMaterial = %LanternCard.material
	lantern.set_shader_parameter("lantern_light", 0.14)
	var pulse := create_tween().set_loops().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse.tween_property(lantern, "shader_parameter/lantern_light", 0.96, 0.58)
	pulse.tween_property(lantern, "shader_parameter/lantern_light", 0.14, 0.76)
	return pulse

func _play_level(id: String) -> void:
	var entry := _catalog.entry_for(id)
	if _loading or %Loading.visible or is_instance_valid(_dialog) or not _catalog.can_play(id, _save, _test_unlock) or _island == null or entry.get("island_id") != String(_island.island_id):
		return
	if not await _prepare_media(id): return
	var scene := load(_catalog.runner_for(id)) as PackedScene
	if scene == null:
		return
	var player := scene.instantiate() as Control
	if player.has_method("configure"):
		# The screen bus controls the global mute. Hunt also uses the flag to
		# decide whether to schedule its local cues or settlement sound.
		var run_entry := entry.duplicate()
		run_entry["muted"] = _journey_audio.effects_muted if entry.engine != "scene-hunt" else false
		player.configure(run_entry)
	_active = entry
	_focus_level = id
	player.finished.connect(_show_result.bind(player), CONNECT_ONE_SHOT)
	player.exited.connect(_show_map)
	if player.has_signal("cue_requested"):
		player.cue_requested.connect(_journey_audio.play_cue.bind("action"))
	_journey_audio.stop_effect("result")
	_swap(player)
	_install_page_layout(player, "runner/" + id)

func _show_result(won: bool, elapsed_seconds: float, player: Control) -> void:
	if _active.is_empty() or player != _screen:
		return
	var id: String = _active.id
	var first_clear := won and _save.flowers_for(id) == 0
	var fixed := int(_active.fixed_reward) if _active.fixed_reward != null else 0
	var reference := float(_active.reference_seconds) if _active.reference_seconds != null else 0.0
	var result: Dictionary = _save.claim(id, elapsed_seconds, reference, fixed) if won else {}
	_next_level = _catalog.next_for(id, _save, _test_unlock) if first_clear else ""
	result["total"] = _save.total(_catalog.playable_ids())
	result["fixed"] = fixed > 0
	var detail: Dictionary = player.result_detail() if player.has_method("result_detail") else {}
	var engine: String = _active.engine
	var already_played := engine == "configured-v1" or (not won and engine in ["scene-hunt", "disaster-v1"])
	var award := int(result.get("delta", 0))
	var reward_cue := ""
	if first_clear and _save.flowers_for(id) > 0:
		reward_cue = "plant-unlock" if not _test_unlock and not _next_level.is_empty() else "plant"
	elif award > 0:
		reward_cue = "count"
	var keep_world := (not won or not detail.get("safe_art") is Texture2D) and player.has_method("prepare_result_backdrop")
	if keep_world:
		player.prepare_result_backdrop()
		detail["live_backdrop"] = true
	var page := _swap(SETTLEMENT.instantiate() as Control, keep_world)
	page.show_outcome(won, elapsed_seconds, result, _active, detail)
	page.replay_requested.connect(_play_level.bind(id))
	page.map_requested.connect(_show_map_with_reward.bind(reward_cue))
	_install_page_layout(page, "settlement/" + id + ("/success" if won else "/failure"))
	if not already_played and (not ("audio_muted" in player) or not player.audio_muted):
		_journey_audio.play_cue("victory" if won else "failure", "result")
