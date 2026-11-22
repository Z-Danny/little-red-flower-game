extends Node
## Native playback of the source feedback scores, approved result PCM, and
## pressure-directed authored music. No voices, scene timers, or global buses.

const Pack = preload("res://scripts/hunt_runner/hunt_pack.gd")
const Rules = preload("res://scripts/hunt_runner/hunt_rules.gd")
const Direction = preload("res://scripts/hunt_runner/hunt_performance.gd")
const Bank := preload("res://assets/hunt_runner/shared/audio/bank.tres")

var last_cue := ""
var muted := false
var music_enabled := true
var _pack: Pack
var _route: String
var _profile: Dictionary = {}
var _streams: Dictionary = Bank.get_meta("resources")
var _quiet: Dictionary = Bank.get_meta("quiet")
var _mix: Dictionary = Bank.get_meta("mix")
var _effects: Array[AudioStreamPlayer] = []
var _music: Array[AudioStreamPlayer] = []
var _beds: Array[AudioStreamPlayer] = []
var _bed_kinds: Array[String] = []
var _next_beat_ms := 0.0
var _last_thunder_ms := -100000.0
var _last_stage_thunder := -1
var _beat := 0
var _duck_until_ms := 0.0
var _sparks: Array = []
var _spark_slots := {}
var _delayed: Array[Dictionary] = []
var _now_ms := 0.0

func build(pack: Pack, silent: bool) -> void:
	name = "HuntAudio"
	_pack = pack
	muted = silent
	_sparks = _pack.skin.get("effects", {}).get("electricSparks", [])
	if _pack.performance.is_empty():
		_route = "legacy/" + str(_pack.presentation["audio"])
		if _route == "legacy/storm":
			_bed_kinds.assign(["storm-wind", "storm-rain"])
	else:
		var sound_name: String = _pack.performance["sound"]
		_route = "perf/" + sound_name
		_profile = Bank.get_meta("profiles")[sound_name]
		match _profile["ambience"]:
			"room": _bed_kinds.assign(["room"])
			"rain": _bed_kinds.assign(["wind", "rain"])
			"fire": _bed_kinds.assign(["wind", "fire"])
	for kind in _bed_kinds:
		var player := _player()
		var stream := (_streams["ambience/" + kind] as AudioStreamWAV).duplicate() as AudioStreamWAV
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		stream.loop_end = roundi(stream.get_length() * stream.mix_rate)
		player.stream = stream
		_beds.append(player)
	for i in range(6):
		_effects.append(_player())
	for i in range(4):
		_music.append(_player())

func _player() -> AudioStreamPlayer:
	var player := AudioStreamPlayer.new()
	add_child(player)
	return player

func reset() -> void:
	stop_all()
	_now_ms = 0.0
	_next_beat_ms = 0.0
	_last_thunder_ms = -100000.0
	_last_stage_thunder = -1
	_beat = 0
	_duck_until_ms = 0.0
	_spark_slots.clear()
	last_cue = ""

func stop_all() -> void:
	_stop_bed_and_music()
	for player in _effects:
		player.stop()

func _stop_bed_and_music() -> void:
	for player in _beds:
		player.stop()
	for player in _music:
		player.stop()
	_delayed.clear()

func set_muted(value: bool) -> void:
	muted = value
	if muted:
		stop_all()

func set_music_enabled(value: bool) -> void:
	music_enabled = value
	if not music_enabled:
		for player in _music:
			player.stop()

func cue(which: String) -> void:
	last_cue = which
	if muted:
		return
	var stream_key := which
	match which:
		"found", "wrong":
			stream_key = ("perf" if not _profile.is_empty() else _route) + "/" + which
		"resolve":
			_stop_bed_and_music()
			stream_key = _route + "/resolve"
		"failure":
			stop_all()
	if _streams.has(stream_key):
		var stream := _streams[stream_key] as AudioStream
		_play(_effects, stream_key, 0.92)
		_duck_until_ms = maxf(_duck_until_ms, _now_ms + minf(550.0, stream.get_length() * 1000.0))

func update_playing(run: Rules) -> void:
	_now_ms = run.elapsed_ms
	var tier := Direction.tier(_pack.performance, run.elapsed_ms, run.duration_ms)
	var p := run.pressure()
	if muted:
		return
	var master := _master()
	for i in range(_beds.size()):
		var player := _beds[i]
		var kind := _bed_kinds[i]
		var gain: float
		match kind:
			"storm-wind":
				gain = 0.1 + p * 0.28
				player.pitch_scale = 0.75 + p * 0.65
			"storm-rain": gain = 0.025 + p * 0.09
			_: gain = float(_mix["ambience"][tier]) * (0.14 if kind == "room" else 0.48 if kind == "wind" else 0.68)
		player.volume_db = linear_to_db(gain * master)
		if not player.playing:
			player.play(fposmod(_now_ms / 1000.0, player.stream.get_length()))
	_drain_delayed()
	_update_ambience_cues(run, tier, p)
	if music_enabled and _now_ms >= _next_beat_ms:
		if not _profile.is_empty():
			_performance_beat(tier, run.duration_ms)
		elif _route == "legacy/quiet_electric":
			_quiet_beat(p)
		else:
			_storm_beat(p)
		_beat += 1

func _master() -> float:
	if not _profile.is_empty():
		return float(_mix["master"])
	return float(_quiet["master"]) if _route == "legacy/quiet_electric" else 0.58

func _performance_beat(tier: int, duration_ms: float) -> void:
	var step := Direction.stage(_pack.performance, _now_ms, duration_ms)
	var count: int = _profile["notes"].size()
	var gain := float(_mix["music"][tier])
	_next_beat_ms = _now_ms + 60000.0 / float(step["bpm"])
	if _beat % 2 == 0 or tier >= 2:
		_note("note%d" % (_beat % count), gain)
	if tier >= 1 and _beat % 4 == 0:
		_note("hold", gain * 0.50)
	if tier >= 3 and _beat % 2 == 1:
		_schedule(_route + "/urgent", gain * 0.36, 120.0, true)

func _quiet_beat(p: float) -> void:
	var bpm := lerpf(float(_quiet["bpm"][0]), float(_quiet["bpm"][1]), p)
	var gain := lerpf(float(_quiet["musicGain"][0]), float(_quiet["musicGain"][1]), p)
	_next_beat_ms = _now_ms + 60000.0 / bpm
	if _beat % 2 == 0:
		_note("note0", gain * 0.65)
	elif _beat % 4 == 1 or p > 0.6:
		_note("note1" if _beat % 4 == 1 else "note2", gain)

func _storm_beat(p: float) -> void:
	_next_beat_ms = _now_ms + 720.0 - p * 250.0
	_note("note%d" % (_beat % 8), 0.035)
	if _beat % 4 == 0:
		_note("hold%d" % (_beat % 8), 0.03 + p * 0.025)
	if p > 0.45:
		_note("heartbeat", 0.085)
		_schedule(_route + "/heartbeat-echo", 0.045, 160.0, true)

func _update_ambience_cues(run: Rules, tier: int, p: float) -> void:
	var master := _master()
	for index in range(_sparks.size()):
		var source: Dictionary = _sparks[index]
		var age := Direction.spark_age(source, _now_ms)
		var slot := Direction.spark_slot(source, _now_ms)
		if age >= 0.0 and age < 180.0 and _spark_slots.get(index, -1) != slot:
			_spark_slots[index] = slot
			_play(_effects, "electric-noise", 0.28 * master)
			_play(_effects, "electric-tone", 0.09 * master)
			_schedule("electric-echo", 0.12 * master, 90.0, false)
	if _route == "legacy/storm":
		if p > 0.55 and _now_ms - _last_thunder_ms > 18000.0 - p * 6000.0:
			_last_thunder_ms = _now_ms
			_play(_effects, "legacy/storm/thunder", 0.34 * master)
			_play(_effects, "legacy/storm/thunder-tone", 0.14 * master)
	elif _pack.performance.get("atmosphere") == "thunder":
		if _last_stage_thunder != tier and Direction.distant_thunder_age(_pack.performance, _now_ms, run.duration_ms) >= 0.0:
			_last_stage_thunder = tier
			_play(_effects, "thunder", 0.06 * master)
	elif _pack.performance.get("atmosphere") == "fire":
		if _now_ms - _last_thunder_ms > 3700.0 - tier * 500.0:
			_last_thunder_ms = _now_ms
			_play(_effects, "fire-crackle", (0.012 + tier * 0.003) * master)

func _note(key: String, gain: float) -> void:
	_play_music(_route + "/" + key, gain)

func _play_music(key: String, gain: float) -> void:
	# Music wavs have a 0.5 reference amplitude. Feedback remains on its own pool.
	if music_enabled:
		_play(_music, key, gain * 2.0 * _master() * (0.45 if _now_ms < _duck_until_ms else 1.0))

func _schedule(key: String, gain: float, delay_ms: float, is_music: bool) -> void:
	_delayed.append({"key": key, "gain": gain, "due": _now_ms + delay_ms, "music": is_music})

func _drain_delayed() -> void:
	for i in range(_delayed.size() - 1, -1, -1):
		var note := _delayed[i]
		var lag := _now_ms - float(note["due"])
		if lag < 0.0:
			continue
		_delayed.remove_at(i)
		if lag < 100.0: # no queued sounds when the penalty clock jumps a cue
			if note["music"]:
				_play_music(note["key"], note["gain"])
			else:
				_play(_effects, note["key"], note["gain"])

func _play(pool: Array[AudioStreamPlayer], key: String, gain: float) -> void:
	var stream := _streams.get(key) as AudioStream
	if stream == null:
		return
	var chosen := pool[0]
	for player in pool:
		if not player.playing:
			chosen = player
			break
		if player.get_playback_position() > chosen.get_playback_position():
			chosen = player
	chosen.stream = stream
	chosen.volume_db = linear_to_db(gain)
	chosen.play()
