extends Node
## The kitchen keeps two beds and a few non-voice cues. No character channel.

const Rules = preload("res://scripts/oil_fire_rules.gd")

@onready var _music: AudioStreamPlayer = $Music
@onready var _fire: AudioStreamPlayer = $Burning
var _started := false


func _ready() -> void:
	for player in [_music, _fire]:
		if not player.stream is AudioStreamWAV:
			continue
		var stream := player.stream.duplicate() as AudioStreamWAV
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		stream.loop_begin = 0
		stream.loop_end = roundi(stream.get_length() * stream.mix_rate)
		player.stream = stream


func unlock() -> void:
	if _started:
		return
	_started = true
	_music.play()
	_fire.play()


func pause_all(value: bool) -> void:
	for player: AudioStreamPlayer in get_children():
		player.stream_paused = value


func stop_all() -> void:
	for player: AudioStreamPlayer in get_children():
		player.stop()


func update_mix(heat: float, sealed: bool, controlled: bool) -> void:
	_music.volume_db = -29.0 if controlled else lerpf(-23.0, -18.0, heat)
	if controlled:
		_fire.stop()
	else:
		_fire.volume_db = -32.0 if sealed else lerpf(-23.0, -11.0, heat)


func action_cue(action: Rules.Action) -> void:
	match action:
		Rules.Action.SHUTOFF: $KnobSfx.play()
		Rules.Action.COVER: $LidSfx.play()
		Rules.Action.WATER:
			$WaterSfx.play()
			$FlareSfx.play()
		Rules.Action.CLOTH:
			$ClothSfx.play()
			$FlareSfx.play()


func evacuation_cue() -> void:
	$EvacuatedSfx.play()
