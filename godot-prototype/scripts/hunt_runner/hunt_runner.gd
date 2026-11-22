extends Control
## One portrait runner for the original getHunt packs. The route owner calls
## configure() before adding this scene and owns settlement, save and navigation.

signal finished(won: bool, elapsed_seconds: float)
signal exited

const Pack = preload("res://scripts/hunt_runner/hunt_pack.gd")
const Rules = preload("res://scripts/hunt_runner/hunt_rules.gd")
const World = preload("res://scripts/hunt_runner/hunt_world.gd")
const Hud = preload("res://scripts/hunt_runner/hunt_hud.gd")
const Modal = preload("res://scripts/hunt_runner/hunt_modal.gd")
const HuntAudio = preload("res://scripts/hunt_runner/hunt_audio.gd")
const FAILURE_CARD_MS := 1100.0

var pack: Pack
var run: Rules
var audio_muted := false
var audio_music := true
var _entry: Dictionary = {}
var _title := ""
var _world: World
var _hud: Hud
var _modal: Modal
var _audio: HuntAudio
var _paused := false
var _focus_lost := false
var _application_paused := false
var _clock_usec := 0
var _caption_left_ms := 0.0
var _failure_age_ms := 0.0
var _warning_tier := 0
var _terminal_sent := false
var _exit_sent := false
var _previous_focus: Control

func configure(entry: Dictionary) -> void:
	if is_inside_tree():
		push_error("HuntRunner.configure() must be called before adding the scene.")
		return
	_entry = entry.duplicate(true)

func _ready() -> void:
	_modal = Modal.new()
	_modal.build()
	_modal.back_requested.connect(_exit_to_parent)
	_modal.resumed.connect(_toggle_pause)
	_modal.restarted.connect(_start_attempt)
	_modal.sound_toggled.connect(_toggle_sound)
	_modal.music_toggled.connect(_toggle_music)
	pack = Pack.new(str(_entry.get("id", "")))
	if not pack.error.is_empty():
		_add_full(_modal)
		_modal.show_error(pack.error)
		set_process(false)
		return
	_title = str(_entry.get("title", ""))
	if _title.is_empty():
		_title = pack.rules["title"]
	audio_muted = bool(_entry.get("muted", false))
	_world = World.new()
	_add_full(_world)
	_world.build(pack, bool(_entry.get("reduced_motion", false)))
	_world.pressed_at.connect(_on_world_press)
	_hud = Hud.new()
	_add_full(_hud)
	_hud.build(pack, _title)
	_hud.back_requested.connect(_exit_to_parent)
	_hud.pause_requested.connect(_toggle_pause)
	_hud.keyboard_target.connect(_on_keyboard_target)
	_add_full(_modal)
	_audio = HuntAudio.new()
	add_child(_audio)
	_audio.build(pack, audio_muted)
	_start_attempt()

func _add_full(control: Control) -> void:
	add_child(control)
	control.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _start_attempt() -> void:
	if _exit_sent or _terminal_sent or _audio == null:
		return
	run = Rules.new(pack.rules, float(Pack.CONTRACT.get_meta("miss_penalty_ms")), float(Pack.CONTRACT.get_meta("safe_hold_ms")))
	run.start() # the parent already handled the player's single entry action
	_paused = false
	_modal.hide()
	_warning_tier = 0
	_failure_age_ms = 0.0
	_hud.set_interactive(true)
	_hud.close_hints()
	_audio.reset()
	_set_caption(pack.presentation["opening"], 6200.0)
	_redraw()
	if not _suspended():
		_audio.update_playing(run)
	_reset_clock()

func _process(_delta: float) -> void:
	_clock_to_now()

func _reset_clock() -> void:
	_clock_usec = Time.get_ticks_usec() if not _suspended() else 0

func _clock_to_now() -> void:
	if run == null or _suspended():
		return
	var now := Time.get_ticks_usec()
	var previous := _clock_usec
	_clock_usec = now
	if previous > 0:
		_advance(float(now - previous) / 1000.0)

func _suspended() -> bool:
	return _paused or _focus_lost or _application_paused or _terminal_sent or _exit_sent

func _advance(dt_ms: float) -> void:
	if run == null or _suspended() or not is_finite(dt_ms) or dt_ms <= 0.0:
		return
	var dt := minf(100.0, dt_ms)
	if run.phase == Rules.Phase.FAILED:
		_failure_age_ms += dt
		if _failure_age_ms >= FAILURE_CARD_MS:
			_report_terminal(false)
		return
	var previous := run.phase
	var found_before := run.found.size()
	run.tick(dt)
	if _caption_left_ms > 0.0:
		_caption_left_ms -= dt
		if _caption_left_ms <= 0.0:
			_hud.set_caption("")
	if run.found.size() > found_before:
		_hud.close_hints()
		if run.phase != Rules.Phase.FAILED:
			_audio.cue("found")
			if run.phase == Rules.Phase.PLAYING:
				_set_caption(pack.target_text(run.found.back(), "lesson"), 6000.0)
	if run.phase != previous:
		match run.phase:
			Rules.Phase.REVEAL:
				_set_caption(pack.presentation["reveal"], run.reveal_duration_ms)
				_audio.cue("resolve")
			Rules.Phase.FAILED:
				_present_failure()
			Rules.Phase.COMPLETE:
				_redraw()
				_report_terminal(true)
				return
	if run.phase == Rules.Phase.PLAYING:
		_advance_warnings()
		_audio.update_playing(run)
	_redraw()

func _advance_warnings() -> void:
	var warnings: Array = pack.presentation.get("warnings", [])
	if not pack.performance.is_empty() or warnings.is_empty() or not run.marking_id.is_empty():
		return
	var p := run.pressure()
	var tier := 3 if p >= 1.0 else 2 if p >= 0.7 else 1 if p >= 0.42 else 0
	if tier > _warning_tier:
		_warning_tier = tier
		if run.found.is_empty() or _caption_left_ms <= 0.0:
			_set_caption(warnings[mini(tier - 1, warnings.size() - 1)], 4200.0)

func _on_world_press(point: Vector2, is_touch: bool) -> void:
	_hud.close_hints()
	if is_processing():
		_clock_to_now() # test exact expiry at the pointer event, not a frame later
	if not _suspended() and run.phase == Rules.Phase.PLAYING:
		_tap(_world.target_at(point, is_touch), point)

func _on_keyboard_target(id: String) -> void:
	_hud.close_hints()
	if is_processing():
		_clock_to_now()
	if not _suspended() and run.phase == Rules.Phase.PLAYING:
		_tap(id, _world.camera * Vector2.ZERO)

func _tap(id: String, point: Vector2) -> void:
	var outcome := run.tap(id, point)
	match outcome:
		Rules.Tap.MARK_STARTED:
			_audio.cue("tap")
		Rules.Tap.PENALTY:
			_audio.cue("wrong")
			_set_caption(Pack.CONTRACT.get_meta("miss_caption"), 1800.0)
	if run.phase == Rules.Phase.FAILED:
		_present_failure()
	_redraw()

func _present_failure() -> void:
	_hud.set_interactive(false)
	_set_caption("", 0.0)
	_failure_age_ms = 0.0
	_modal.show_failure(_title, run.found.size(), run.target_count())
	_audio.cue("failure")

## Optional presentation for the parent's settlement. No progress mutation here.
func result_detail() -> Dictionary:
	if run == null:
		return {}
	if run.phase == Rules.Phase.COMPLETE:
		return {
			"title": pack.presentation["completeTitle"],
			"summary": str(pack.rules["summary"]) + "\n" + str(pack.presentation["endingNote"]),
			"safe_art": pack.texture("safe"),
		}
	if run.phase == Rules.Phase.FAILED:
		return {
			"title": "时间到！",
			"kind": "timeout",
			"missed": {"count": run.target_count() - run.found.size(), "unit": "处"},
			"progress": "已找到 %d / %d 处" % [run.found.size(), run.target_count()],
			"reason": "还有 %d 处隐患未找到。\n给你%d秒，把隐患全揪出来。卡住了就点灯泡。" % [run.target_count() - run.found.size(), roundi(run.duration_ms / 1000.0)],
		}
	return {}

func prepare_result_backdrop() -> void:
	_hud.hide()
	_modal.hide()

func _report_terminal(won: bool) -> void:
	if _terminal_sent or _exit_sent:
		return
	_terminal_sent = true
	set_process(false)
	_audio.stop_all()
	finished.emit(won, run.elapsed_ms / 1000.0)

func _redraw() -> void:
	_world.tick_view(run)
	_hud.update_run(run)

func _set_caption(value: String, time_ms: float) -> void:
	_caption_left_ms = time_ms
	_hud.set_caption(value)

func _toggle_pause() -> void:
	if run == null or not run.phase in [Rules.Phase.PLAYING, Rules.Phase.REVEAL] or _exit_sent or _terminal_sent:
		return
	if _paused:
		_paused = false
		_modal.hide()
		_hud.set_interactive(true)
		_redraw()
		if is_instance_valid(_previous_focus) and _previous_focus.is_visible_in_tree():
			_previous_focus.grab_focus()
		if not _suspended() and run.phase == Rules.Phase.PLAYING:
			_audio.update_playing(run)
	else:
		if is_processing():
			_clock_to_now()
		if not run.phase in [Rules.Phase.PLAYING, Rules.Phase.REVEAL] or _terminal_sent:
			return
		_previous_focus = get_viewport().gui_get_focus_owner()
		_paused = true
		_hud.set_interactive(false)
		_audio.stop_all()
		_modal.show_pause(pack.presentation["pauseNote"], audio_muted, audio_music)
	_reset_clock()

func _toggle_sound() -> void:
	audio_muted = not audio_muted
	_audio.set_muted(audio_muted)
	_modal.update_sound(audio_muted, audio_music)

func _toggle_music() -> void:
	audio_music = not audio_music
	_audio.set_music_enabled(audio_music)
	_modal.update_sound(audio_muted, audio_music)

func _exit_to_parent() -> void:
	if _exit_sent or _terminal_sent or (run != null and run.phase == Rules.Phase.FAILED):
		return
	_exit_sent = true
	set_process(false)
	if _audio != null:
		_audio.stop_all()
	exited.emit()

func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_FOCUS_OUT:
			_focus_lost = true
		NOTIFICATION_APPLICATION_FOCUS_IN:
			_focus_lost = false
		NOTIFICATION_APPLICATION_PAUSED:
			_application_paused = true
		NOTIFICATION_APPLICATION_RESUMED:
			_application_paused = false
		_:
			return
	if _audio != null:
		if _suspended():
			_hud.close_hints()
			_audio.stop_all()
		else:
			if run.phase == Rules.Phase.PLAYING:
				_audio.update_playing(run)
		_reset_clock()

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo or _terminal_sent or _exit_sent:
		return
	if event.is_action_pressed(&"ui_cancel"):
		if _hud != null and _hud.hints_visible():
			_hud.close_hints()
		elif run == null:
			_exit_to_parent()
		else:
			_toggle_pause()
		get_viewport().set_input_as_handled()
	elif event.keycode == KEY_H and _hud != null and not _suspended():
		_hud.toggle_hints()
		get_viewport().set_input_as_handled()

func _exit_tree() -> void:
	if is_instance_valid(_audio):
		_audio.stop_all()
