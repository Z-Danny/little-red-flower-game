extends Node
## The approved journey music is independent of gameplay and button/reward sound.

const MUSIC = preload("res://assets/restored_ui/journey-music.mp3")
const FX := &"JourneyEffects"
const MUSIC_BUS := &"JourneyMusic"
const WECHAT_AUDIO_MARKER := "res://data/wechat-audio.json"
signal cue_played(cue: String)
const MOBILE_BROWSER_MUSIC := """
(() => {
	const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent)
		|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	if (!appleMobile || typeof HTMLAudioElement !== 'function' || typeof wx !== 'undefined') return null;
	const media = document.createElement('audio');
	media.dataset.journeyMusic = '';
	media.hidden = true;
	media.loop = true;
	media.preload = 'metadata';
	media.volume = 0.65;
	document.body.appendChild(media);
	let activated = false;
	let inJourney = false;
	let muted = true;
	let effectsMuted = true;
	let starting = false;
	let mediaURL = null;
	const effectPath = document.querySelector('meta[name="red-flower-sfx"]')?.content;
	const effects = new Map();
	function stopEffect(channel) {
		const effect = effects.get(channel);
		if (effect) {
			effect.remove();
			effect.pause();
			effects.delete(channel);
		}
	}
	function sync() {
		const enabled = activated && !muted && !document.hidden;
		if (effectsMuted || document.hidden) {
			for (const channel of effects.keys()) stopEffect(channel);
		}
		if (navigator.audioSession) {
			try {
				const type = enabled || (activated && !effectsMuted && !document.hidden) ? 'playback' : 'auto';
				if (navigator.audioSession.type !== type) navigator.audioSession.type = type;
			} catch (_) {}
		}
		if (!enabled || !inJourney) {
			media.pause();
		} else if (media.paused && !starting) {
			starting = true;
			media.play().catch(() => {}).finally(() => { starting = false; });
		}
	}
	function activate(event) {
		if (!event.isTrusted) return;
		if (activated) return;
		activated = true;
		sync();
	}
	const gestures = ['touchend', 'pointerup', 'keydown'];
	for (const name of gestures) document.addEventListener(name, activate, true);
	document.addEventListener('visibilitychange', sync);
	globalThis.redFlowerMusic = {
		onError(callback) { media.addEventListener('error', callback, {once: true}); },
		useHostedTrack() {
			const track = document.querySelector('meta[name="red-flower-music"]')?.content;
			if (!track) return false;
			media.src = new URL(track, document.baseURI).href;
			return true;
		},
		setEmbeddedTrack(base64) {
			const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
			mediaURL = URL.createObjectURL(new Blob([bytes], {type: 'audio/mpeg'}));
			media.src = mediaURL;
		},
		update(journey, musicMuted, fxMuted) {
			inJourney = journey;
			muted = musicMuted;
			effectsMuted = fxMuted;
			sync();
		},
		playEffect(cue, channel, fallback) {
			if (!effectPath || !activated || effectsMuted || document.hidden) return false;
			stopEffect(channel);
			const effect = document.createElement('audio');
			effect.dataset.journeyCue = cue;
			effect.hidden = true;
			effect.src = new URL(effectPath + cue + '.wav', document.baseURI).href;
			effects.set(channel, effect);
			document.body.appendChild(effect);
			effect.addEventListener('ended', () => {
				if (effects.get(channel) === effect) stopEffect(channel);
			}, {once: true});
			effect.play().catch(() => {
				if (effects.get(channel) !== effect) return;
				stopEffect(channel);
				fallback(cue, channel);
			});
			return true;
		},
		stopEffect,
		dispose() {
			muted = true;
			effectsMuted = true;
			sync();
			for (const name of gestures) document.removeEventListener(name, activate, true);
			document.removeEventListener('visibilitychange', sync);
			media.remove();
			if (mediaURL) URL.revokeObjectURL(mediaURL);
			delete globalThis.redFlowerMusic;
		},
	};
})()
"""

var preference_path := "user://journey-audio-v1.cfg"
var music_muted := false
var effects_muted := false
var _bus := -1
var _music_bus := -1
var _music: AudioStreamPlayer
var _browser_music: JavaScriptObject
var _wechat_audio: JavaScriptObject
var _browser_error: JavaScriptObject
var _effect_players: Dictionary = {}
var _browser_effect_error: JavaScriptObject
var _activated := false
var _navigating := false
var _window_active := true

static func is_wechat() -> bool:
	return OS.has_feature("web") and FileAccess.file_exists(WECHAT_AUDIO_MARKER)

static func playback_type() -> AudioServer.PlaybackType:
	return AudioServer.PLAYBACK_TYPE_SAMPLE if is_wechat() else AudioServer.PLAYBACK_TYPE_STREAM

func _ready() -> void:
	var config := ConfigFile.new()
	if config.load(preference_path) == OK:
		music_muted = bool(config.get_value("audio", "music_muted", false))
		effects_muted = bool(config.get_value("audio", "effects_muted", false))
	_bus = _ensure_bus(FX)
	_music_bus = _ensure_bus(MUSIC_BUS)
	AudioServer.set_bus_mute(_bus, effects_muted)
	AudioServer.set_bus_mute(_music_bus, music_muted)
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		if is_wechat():
			_wechat_audio = JavaScriptBridge.get_interface("redFlowerWechatAudio")
		else:
			JavaScriptBridge.eval(MOBILE_BROWSER_MUSIC, true)
			var browser := JavaScriptBridge.get_interface("window")
			if browser != null:
				_browser_music = browser.redFlowerMusic
	if _wechat_audio != null:
		_browser_error = JavaScriptBridge.create_callback(_start_native_music)
		_browser_effect_error = JavaScriptBridge.create_callback(_native_effect_fallback)
		_wechat_audio.onError(_browser_error)
	elif _browser_music != null:
		_browser_error = JavaScriptBridge.create_callback(_start_native_music)
		_browser_effect_error = JavaScriptBridge.create_callback(_native_effect_fallback)
		_browser_music.onError(_browser_error)
		if not _browser_music.useHostedTrack():
			_browser_music.setEmbeddedTrack(Marshalls.raw_to_base64(MUSIC.data))
	else:
		_start_native_music()
	for channel in ["interface", "action", "result", "plant", "island"]:
		var player := AudioStreamPlayer.new()
		player.bus = FX
		player.playback_type = playback_type()
		add_child(player)
		_effect_players[channel] = player

func _start_native_music(_arguments: Array = []) -> void:
	if is_instance_valid(_music):
		return
	_music = AudioStreamPlayer.new()
	var stream := MUSIC.duplicate() as AudioStreamMP3
	stream.loop = true
	_music.stream = stream
	_music.bus = MUSIC_BUS
	_music.playback_type = playback_type()
	_music.volume_db = linear_to_db(0.65)
	add_child(_music)
	_sync_music()

func _exit_tree() -> void:
	if _browser_music != null:
		_browser_music.dispose()
	if _wechat_audio != null:
		_wechat_audio.dispose()

func _input(event: InputEvent) -> void:
	if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT) or event is InputEventScreenTouch or (event is InputEventKey and event.pressed and not event.echo):
		_activated = true
		_window_active = true
		_sync_music()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		_window_active = false
		for channel: String in _effect_players:
			stop_effect(channel)
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
	if _music_bus >= 0: AudioServer.set_bus_mute(_music_bus, music_muted)
	if effects_muted:
		for channel: String in _effect_players:
			stop_effect(channel)
	_sync_music()
	var config := ConfigFile.new()
	config.set_value("audio", "music_muted", music_muted)
	config.set_value("audio", "effects_muted", effects_muted)
	return config.save(preference_path) == OK

func play_cue(cue: String, channel := "interface") -> void:
	if effects_muted or not _window_active:
		return
	var host := _wechat_audio if _wechat_audio != null else _browser_music
	if host == null or not host.playEffect(cue, channel, _browser_effect_error):
		_play_native_effect(cue, channel)
	cue_played.emit(cue)

func play_island_switch() -> void:
	play_cue("island-switch", "island")

func stop_effect(channel: String) -> void:
	var player: AudioStreamPlayer = _effect_players.get(channel)
	if is_instance_valid(player):
		player.stop()
	if _browser_music != null:
		_browser_music.stopEffect(channel)
	if _wechat_audio != null:
		_wechat_audio.stopEffect(channel)

func _native_effect_fallback(arguments: Array) -> void:
	if not effects_muted and _window_active:
		_play_native_effect(str(arguments[0]), str(arguments[1]))

func _play_native_effect(cue: String, channel: String) -> void:
	var player: AudioStreamPlayer = _effect_players[channel]
	player.stream = load("res://assets/journey_sfx/%s.wav" % cue) as AudioStream
	if player.stream != null:
		player.play()

func _sync_music() -> void:
	if _wechat_audio != null:
		_wechat_audio.update(_activated and _navigating and _window_active and not is_instance_valid(_music),
			music_muted, effects_muted or not _window_active)
	if _browser_music != null:
		_browser_music.update(_navigating and not is_instance_valid(_music), music_muted, effects_muted)
	if not is_instance_valid(_music): return
	var active := _activated and _navigating and _window_active and not music_muted
	if active:
		if not _music.playing: _music.play()
		_music.stream_paused = false
	elif _music.playing:
		_music.stream_paused = true

func _ensure_bus(bus_name: StringName) -> int:
	var index := AudioServer.get_bus_index(bus_name)
	if index >= 0:
		return index
	AudioServer.add_bus()
	index = AudioServer.bus_count - 1
	AudioServer.set_bus_name(index, bus_name)
	return index
