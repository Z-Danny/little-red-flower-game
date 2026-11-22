extends Node
## Native playback of baked source cues. Timing/muting follows the active run, not wall time.

const Rules = preload("res://scripts/configured_runner/rules.gd")
const Effects = preload("res://scripts/configured_runner/effects.gd")
const CUE_POOL_SIZE := 5

var muted := false
var last_event := ""
var last_path := ""
var cues_played := 0
var _model: Rules
var _effects: Effects
var _profile: Dictionary
var _mode := "none"
var _music: AudioStreamPlayer
var _ambient: Array[AudioStreamPlayer] = []
var _pool: Array[AudioStreamPlayer] = []
var _tone: AudioStreamPlayer
var _streams: Dictionary = {}
var _cursor := 0
var _suspended := false
var _opened := false
var _last_serial := -1
var _goals: Array = []
var _stages: Array = []
var _last_phase := "playing"
var _waiting := false
var _beat := 0
var _next_beat := 0.0
var _last_pickup := -1000.0
var _emergency_ticks: Dictionary = {}
var _rescue_played := false

func build(model: Rules) -> void:
	_model = model
	_effects = Effects.new(model)
	_profile = model.pack.get("audio", {})
	_mode = _profile.get("mode", "none")
	for index: int in range(CUE_POOL_SIZE):
		_pool.append(_player("Cue%d" % index))
	if _mode == "collection":
		_tone = _player("PressureMusic")
	elif _profile.has("music"):
		_music = _make_loop("Music", _profile["music"])
		for path: String in _profile["ambient"]:
			_ambient.append(_make_loop("Ambience%d" % _ambient.size(), path))

func _exit_tree() -> void:
	stop_all()

func _player(label: String) -> AudioStreamPlayer:
	var player := AudioStreamPlayer.new()
	player.name = label
	add_child(player)
	return player

func _stream(path: String) -> AudioStream:
	if not _streams.has(path) and ResourceLoader.exists(path, "AudioStreamWAV"):
		_streams[path] = load(path)
	return _streams.get(path) as AudioStream

func _make_loop(label: String, path: String) -> AudioStreamPlayer:
	var player := _player(label)
	var source := _stream(path) as AudioStreamWAV
	if source != null:
		var stream := source.duplicate() as AudioStreamWAV
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		stream.loop_begin = 0
		stream.loop_end = roundi(stream.get_length() * stream.mix_rate)
		player.stream = stream
		player.volume_db = -70.0
	return player

func _beds() -> Array[AudioStreamPlayer]:
	var result := _ambient.duplicate()
	if _music != null:
		result.push_front(_music)
	return result

func set_suspended(suspend: bool) -> void:
	if _suspended == suspend:
		return
	_suspended = suspend
	_apply_pause()

func set_muted_state(value: bool) -> void:
	if muted == value:
		return
	muted = value
	_apply_pause()

func _apply_pause() -> void:
	var inactive := _suspended or muted
	for player: AudioStreamPlayer in _beds():
		player.stream_paused = inactive
	if inactive:
		_stop_shots()

func _stop_shots() -> void:
	for player: AudioStreamPlayer in _pool:
		player.stop()
	if _tone != null:
		_tone.stop()

func stop_all() -> void:
	_stop_shots()
	for player: AudioStreamPlayer in _beds():
		player.stop()

func reset() -> void:
	_stop_shots()
	for player: AudioStreamPlayer in _beds():
		player.stop()
	_opened = false
	_last_serial = -1
	_goals.clear()
	_stages.clear()
	_last_phase = "playing"
	_waiting = false
	_beat = 0
	_next_beat = 0.0
	_last_pickup = -1000.0
	_emergency_ticks.clear()
	_rescue_played = false
	last_event = ""
	last_path = ""
	cues_played = 0

func pickup() -> void:
	var elapsed: float = _model.run["elapsed"]
	if elapsed - _last_pickup >= 120.0:
		_last_pickup = elapsed
		_play("tap" if _mode == "collection" else "pickup")

func wrong() -> void:
	if _mode == "collection":
		_play("wrong")

func result(won: bool) -> float:
	_stop_shots()
	for player: AudioStreamPlayer in _beds():
		player.stop()
	var event := "victory" if won else "failure"
	return _play_path(event, _profile.get("result", {}).get(event, ""), 1.0)

func _play(event: String) -> void:
	_play_path(event, _profile.get("cues", {}).get(event, ""), .74)

func _play_path(event: String, path: String, gain: float) -> float:
	if path.is_empty() or muted or _suspended:
		return 0.0
	var stream := _stream(path)
	if stream == null:
		return 0.0
	var player := _pool[_cursor]
	_cursor = (_cursor + 1) % _pool.size()
	player.stream = stream
	player.volume_db = linear_to_db(gain)
	player.play()
	last_event = event
	last_path = path
	cues_played += 1
	return stream.get_length()

func advance() -> void:
	if _suspended:
		return
	var run := _model.run
	var phase: String = run["phase"]
	if phase in ["complete", "failed"]:
		if phase != _last_phase:
			for player: AudioStreamPlayer in _beds():
				player.stop()
			if _tone != null:
				_tone.stop()
			if phase == "failed" and _model.failure_revealing():
				_play(run["failure"]["rule"])
		_last_phase = phase
		return
	if not _opened:
		_opened = true
		if _mode != "collection":
			_play("opening")
	if _mode == "collection":
		_collection(run)
		_last_phase = phase
		return
	if _mode == "none":
		return
	var calm_goals: Array = _profile["calmWhen"]
	var mitigated := not calm_goals.is_empty() and Rules.has_all(run["resolved"], calm_goals)
	_continuous_mix(mitigated or phase != "playing")
	_emergency(run, mitigated)
	var action: Dictionary = run["action"]
	if not action.is_empty() and action["serial"] != _last_serial:
		var danger: bool = _model.interactions.get(action["rule"], {}).get("outcome") == "danger"
		if float(action["age"]) / float(action["duration"]) >= (0.0 if danger else .3):
			_last_serial = action["serial"]
			if danger:
				_play("danger")
			_play("bounce" if action["rule"].is_empty() else action["rule"])
	if not Rules.has_all(_goals, run["resolved"]):
		_goals = run["resolved"].duplicate()
		_play("goal")
	for stage: String in run["stages"]:
		if stage not in _stages:
			_stages.append(stage)
			_play(stage)
	if not _waiting and (phase == "settling" or mitigated):
		_waiting = true
		_play("waiting")
	_last_phase = phase

func _continuous_mix(calm: bool) -> void:
	if _music == null:
		return
	for player: AudioStreamPlayer in _beds():
		if player.stream != null and not player.playing and not muted:
			player.play()
			player.stream_paused = false
	var level := _effects.pressure()
	var legacy := _mode == "legacy-response"
	var master := .65 if _profile["emergency"].has("alarm") else .35
	var duck := 1.0
	for player: AudioStreamPlayer in _pool:
		if player.playing:
			duck = .45
			break
	var music_gain := master * (.24 if legacy else .12) * (0.5 if calm else .7 + level * .3) * duck
	_fade(_music, music_gain)
	if _profile["floodWindow"]:
		var eased := level * level * (3.0 - 2.0 * level)
		_fade(_ambient[0], master * .18 * (.74 + .34 * eased) * (.68 if calm else 1.0))
		_fade(_ambient[1], master * .18 * (.46 + .24 * eased) * (.9 if calm else 1.0))
	elif not _ambient.is_empty():
		var theme: String = _profile["theme"]
		var relevant: Array = {"electric": ["machine"], "water": ["water", "rain"], "flood": ["water", "rain"], "quake": ["dust"],
			"collapse": ["dust"], "fire": ["smoke", "glow"]}.get(theme, [])
		var controlled := false
		var intensity := 0.0
		for effect: Dictionary in _model.skin.get("presentation", {}).get("effects", []):
			if effect["kind"] in relevant:
				controlled = true
				if _model.matches(effect.get("when", {})):
					intensity = maxf(intensity, _effects.intensity(effect))
		if not controlled:
			intensity = 0.0 if theme == "electric" else .2 if theme == "lift" else .2 + level * .2
		_fade(_ambient[0], master * .18 * minf(1.0, intensity))

func _fade(player: AudioStreamPlayer, gain: float) -> void:
	var linear := lerpf(db_to_linear(player.volume_db), maxf(.0003, gain), .14)
	player.volume_db = linear_to_db(linear)

func _emergency(run: Dictionary, calm: bool) -> void:
	var spec: Dictionary = _profile["emergency"]
	if run["phase"] == "playing":
		_periodic(run, spec, "alarm", 4500.0, "alarmUntil")
		_periodic(run, spec, "heartbeat", 1700.0 if calm or _profile["calmWhen"].is_empty() else 900.0)
		_periodic(run, spec, "cough", 6500.0, "coughUntil")
	if spec.has("rescue") and run["phase"] == "settling" and run["settleAge"] >= spec.get("rescueAfterMs", 500) and not _rescue_played:
		_rescue_played = true
		_play_path("rescue", spec["rescue"], .74)

func _periodic(run: Dictionary, spec: Dictionary, key: String, every: float, until_key := "") -> void:
	if not spec.has(key):
		return
	var until: Array = spec.get(until_key, [])
	if not until.is_empty() and Rules.has_all(run["resolved"], until):
		return
	var beat := floori(float(run["elapsed"]) / every)
	if beat > 0 and _emergency_ticks.get(key, 0) != beat:
		_emergency_ticks[key] = beat
		_play_path(key, spec[key], .67 if key == "alarm" else .42)

func _collection(run: Dictionary) -> void:
	if run["phase"] == "settling":
		if _last_phase != "settling":
			_tone.stop()
			_play("resolve")
		return
	var action: Dictionary = run["action"]
	if not action.is_empty() and action["serial"] != _last_serial:
		_last_serial = action["serial"]
		var rule: Dictionary = _model.interactions.get(action["rule"], {})
		if rule.is_empty() or rule["outcome"] == "danger" or (rule["outcome"] == "neutral" and rule["mode"] == "drop"):
			_play("wrong")
		elif rule["mode"] == "tap":
			_play("tap")
	if not Rules.has_all(_goals, run["resolved"]):
		_play("found")
	_goals = run["resolved"].duplicate()
	var elapsed: float = run["elapsed"]
	if elapsed < _next_beat:
		return
	var p := clampf(elapsed / (float(_model.rules["risk"]["seconds"]) * 1000.0), 0.0, 1.0)
	var i := 0 if _beat % 2 == 0 else 1 if _beat % 4 == 1 else 2 if p > .6 else -1
	var bpm: Array = _profile["bpm"]
	var gain: Array = _profile["musicGain"]
	_next_beat = elapsed + 60000.0 / lerpf(bpm[0], bpm[1], p)
	_beat += 1
	if i != -1 and not muted:
		var track := _stream(_profile["notes"][i])
		if track != null:
			_tone.stream = track
			_tone.volume_db = linear_to_db(.45 * lerpf(gain[0], gain[1], p) / .16 * (.65 if i == 0 else 1.0))
			_tone.play()
