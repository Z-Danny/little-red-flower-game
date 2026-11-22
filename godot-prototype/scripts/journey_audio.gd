extends Node
## The approved journey music is independent of gameplay and button/reward sound.

const MUSIC = preload("res://assets/restored_ui/journey-music.mp3")
const TAP = preload("res://assets/restored_ui/button-cue.wav")
const FX := &"JourneyEffects"

var preference_path := "user://journey-audio-v1.cfg"
var music_muted := false
var effects_muted := false
var _bus := -1
var _music: AudioStreamPlayer
var _tap: AudioStreamPlayer
var _activated := false
var _navigating := false
var _window_active := true

func _ready() -> void:
	var config := ConfigFile.new()
	if config.load(preference_path) == OK:
		music_muted = bool(config.get_value("audio", "music_muted", false))
		effects_muted = bool(config.get_value("audio", "effects_muted", false))
	_bus = AudioServer.get_bus_index(FX)
	if _bus < 0:
		AudioServer.add_bus()
		_bus = AudioServer.bus_count - 1
		AudioServer.set_bus_name(_bus, FX)
	AudioServer.set_bus_mute(_bus, effects_muted)
	_music = AudioStreamPlayer.new()
	var stream := MUSIC.duplicate() as AudioStreamMP3
	stream.loop = true
	_music.stream = stream
	_music.volume_db = linear_to_db(0.65)
	add_child(_music)
	_tap = AudioStreamPlayer.new()
	_tap.stream = TAP
	_tap.bus = FX
	add_child(_tap)

func _input(event: InputEvent) -> void:
	if not _activated and ((event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT) or (event is InputEventScreenTouch and event.pressed) or (event is InputEventKey and event.pressed and not event.echo)):
		_activated = true
		_sync_music()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		_window_active = false
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN or what == NOTIFICATION_APPLICATION_RESUMED:
		_window_active = true
	else:
		return
	_sync_music()

func set_navigation_active(value: bool) -> void:
	_navigating = value
	_sync_music()

func set_toggles(music_off: bool, effects_off: bool) -> bool:
	music_muted = music_off
	effects_muted = effects_off
	if _bus >= 0: AudioServer.set_bus_mute(_bus, effects_muted)
	_sync_music()
	var config := ConfigFile.new()
	config.set_value("audio", "music_muted", music_muted)
	config.set_value("audio", "effects_muted", effects_muted)
	return config.save(preference_path) == OK

func tap() -> void:
	if not effects_muted and is_instance_valid(_tap): _tap.play()

func _sync_music() -> void:
	if not is_instance_valid(_music): return
	var active := _activated and _navigating and _window_active and not music_muted
	if active:
		if not _music.playing: _music.play()
		_music.stream_paused = false
	elif _music.playing:
		_music.stream_paused = true
