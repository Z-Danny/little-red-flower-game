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

var _asset_packs := AssetPacks.new()
var _journey_audio := JourneyAudio.new()
var _dialog: Control
var _dialog_origin: Control
var _focus_origin: Control
var _result_backdrop: Control
var _loading := false
var _save := Save.new()
var _catalog := Catalog.new()
var _screen: Control
var _island_index := 0
var _island: IslandInfo
var _active: Dictionary = {}
var _test_unlock := false
var _focus_level := ""

func _ready() -> void:
	add_child(_asset_packs)
	add_child(_journey_audio)
	get_tree().node_added.connect(_route_screen_audio)
	_asset_packs.status_changed.connect(func(text: String) -> void: %LoadingText.text = text)
	%CloseLoading.pressed.connect(func() -> void:
		%Loading.hide()
		if is_instance_valid(_screen): _screen.process_mode = Node.PROCESS_MODE_INHERIT
	)
	_show_home()

func _swap(page: Control, preserve := false) -> Control:
	_dismiss_dialog()
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
	%Page.add_child(_screen)
	return _screen

func _route_screen_audio(node: Node) -> void:
	if node is AudioStreamPlayer and is_instance_valid(_screen) and _screen.is_ancestor_of(node) and node.bus == &"Master":
		node.bus = JourneyAudio.FX

func _show_home() -> void:
	_journey_audio.set_navigation_active(true)
	var page := _swap(HOME.instantiate() as Control)
	page.update_progress(_save.total(_catalog.original_playable_ids()))
	page.begin.connect(func() -> void: _enter_islands(false))
	page.test_run.connect(func() -> void: _enter_islands(true))

func _enter_islands(test_unlock: bool) -> void:
	_test_unlock = test_unlock
	_show_islands()

func _show_islands() -> void:
	var page := _swap(ARCHIPELAGO.instantiate() as Control)
	page.set_current(_island_index)
	page.back_requested.connect(_show_home)
	page.island_opened.connect(_open_map)

func _open_map(index: int, island: Resource) -> void:
	if _loading or %Loading.visible:
		return
	var info := island as IslandInfo
	if not await _prepare_media("map:" + String(info.island_id)):
		return
	_island_index = index
	_island = info
	_focus_level = ""
	_show_map()

func _show_map() -> void:
	if _island == null:
		_show_islands()
		return
	_active = {}
	_journey_audio.set_navigation_active(true)
	var page := _swap(ISLAND_MAP.instantiate() as Control)
	page.setup(_island, _island_index, _catalog, _save, _test_unlock, _focus_level)
	page.back_requested.connect(_show_islands)
	page.play_requested.connect(_play_level)
	page.connect("home_requested", _show_home)
	page.connect("progress_requested", _show_progress)
	page.connect("settings_requested", _show_settings)

func _show_progress() -> void:
	var dialog := _open_dialog(ProgressDialog)
	if dialog == null: return
	dialog.display(_catalog, _save)

func _show_settings() -> void:
	var dialog := _open_dialog(SettingsDialog)
	if dialog == null: return
	dialog.display(_journey_audio.music_muted, _journey_audio.effects_muted, _save.total(_catalog.original_playable_ids()))
	dialog.sound_changed.connect(func(music_off: bool, effects_off: bool) -> void:
		var saved := _journey_audio.set_toggles(music_off, effects_off)
		dialog.update_sound(music_off, effects_off, saved)
		_journey_audio.tap()
	)
	dialog.reset_confirmed.connect(func() -> void:
		var ok := _save.reset() == OK
		if ok and _screen.has_method("refresh_progress"):
			_screen.refresh_progress()
		dialog.after_reset(ok)
	)

func _open_dialog(scene: PackedScene) -> Control:
	if is_instance_valid(_dialog) or _loading or %Loading.visible: return null
	_journey_audio.tap()
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
	if is_instance_valid(_dialog_origin): _dialog_origin.process_mode = Node.PROCESS_MODE_INHERIT
	if is_instance_valid(_focus_origin) and _focus_origin.is_visible_in_tree(): _focus_origin.grab_focus()
	_focus_origin = null
	_dialog_origin = null

func _prepare_media(key: String) -> bool:
	if not _asset_packs.needs_download(key): return true
	_loading = true
	%LoadingText.text = "正在准备素材…"
	%CloseLoading.hide()
	%Loading.show()
	var old_screen := _screen
	old_screen.process_mode = Node.PROCESS_MODE_DISABLED
	var ready := await _asset_packs.ensure_for(key)
	_loading = false
	if not ready:
		%LoadingText.text = "素材暂时无法加载。请检查网络，返回后重试。"
		%CloseLoading.show()
		%CloseLoading.grab_focus()
		return false
	old_screen.process_mode = Node.PROCESS_MODE_INHERIT
	%Loading.hide()
	return true

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
		run_entry["muted"] = _journey_audio.effects_muted
		player.configure(run_entry)
	_journey_audio.set_navigation_active(false)
	_active = entry
	_focus_level = id
	player.finished.connect(_show_result.bind(player), CONNECT_ONE_SHOT)
	player.exited.connect(_show_map)
	_swap(player)

func _show_result(won: bool, elapsed_seconds: float, player: Control) -> void:
	if _active.is_empty() or player != _screen:
		return
	var id: String = _active.id
	var fixed := int(_active.fixed_reward) if _active.fixed_reward != null else 0
	var reference := float(_active.reference_seconds) if _active.reference_seconds != null else 0.0
	var result: Dictionary = _save.claim(id, elapsed_seconds, reference, fixed) if won else {}
	result["total"] = _save.total(_catalog.original_playable_ids())
	result["fixed"] = fixed > 0
	var detail: Dictionary = player.result_detail() if player.has_method("result_detail") else {}
	var path := "res://assets/hunt_runner/shared/audio/victory.wav"
	var victory: AudioStream
	if won and _active.engine == "scene-hunt" and (not ("audio_muted" in player) or not player.audio_muted) and ResourceLoader.exists(path, "AudioStream"):
		victory = load(path) as AudioStream
	var keep_world := (not won or not detail.get("safe_art") is Texture2D) and player.has_method("prepare_result_backdrop")
	if keep_world:
		player.prepare_result_backdrop()
		detail["live_backdrop"] = true
	var page := _swap(SETTLEMENT.instantiate() as Control, keep_world)
	page.show_outcome(won, elapsed_seconds, result, _active, detail)
	page.replay_requested.connect(_play_level.bind(id))
	page.map_requested.connect(_show_map)
	if victory != null:
		var audio := AudioStreamPlayer.new()
		audio.stream = victory
		page.add_child(audio)
		audio.play()
