extends Control

signal begin
signal test_run
signal settings_requested
signal ranking_requested
signal island_selection_requested

const Painted = preload("res://scripts/painted_chrome.gd")
const PRIMARY = preload("res://assets/home_menu/primary.webp")
const SECONDARY = preload("res://assets/restored_ui/title-secondary.webp")
const STARTING_SEEDS := 5
const INK := Color("fff4cf")

@onready var _play: Button = %Play
@onready var _play_height := _play.position.y
var _press_motion: Tween
var _starting := false

func _ready() -> void:
	Painted.action(_play, PRIMARY, Color("382615"))
	%PlayMigrated.visible = OS.has_feature("editor")
	if %PlayMigrated.visible:
		Painted.action(%PlayMigrated, SECONDARY, INK)
		%PlayMigrated.pressed.connect(func() -> void: test_run.emit())
	for icon: TextureButton in [%Settings, %Ranking, %ChooseIsland]:
		icon.button_down.connect(func() -> void: icon.modulate = Color("d9c7a5"))
		icon.button_up.connect(func() -> void: icon.modulate = Color.WHITE)
	_play.button_down.connect(_sink_play.bind(true))
	_play.button_up.connect(_sink_play.bind(false))
	_play.pressed.connect(_play_then_begin)
	%Settings.pressed.connect(settings_requested.emit)
	%Ranking.pressed.connect(ranking_requested.emit)
	%ChooseIsland.pressed.connect(island_selection_requested.emit)
	%SeedCount.text = "× %d" % STARTING_SEEDS
	%SeedCounter.accessibility_name = "生命值，%d 颗种子" % STARTING_SEEDS
	_animate_idle()

func _sink_play(down: bool) -> void:
	if _starting:
		return
	_animate_press(down)

func _play_then_begin() -> void:
	if _starting:
		return
	_starting = true
	# Fast taps can release before the first down frame is drawn.
	_play.position.y = maxf(_play.position.y, _play_height + 4.0)
	_animate_press(false)
	await _press_motion.finished
	_starting = false
	begin.emit()

func _animate_press(down: bool) -> void:
	if is_instance_valid(_press_motion):
		_press_motion.kill()
	%PlayShine.visible = not down
	_press_motion = create_tween().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	if down:
		_press_motion.tween_property(_play, "position:y", _play_height + 7.0, 0.10)
		_press_motion.parallel().tween_property(_play, "scale", Vector2(0.97, 0.97), 0.10)
	else:
		_press_motion.tween_property(_play, "position:y", _play_height - 5.0, 0.13)
		_press_motion.parallel().tween_property(_play, "scale", Vector2(1.025, 1.025), 0.13)
		_press_motion.tween_property(_play, "position:y", _play_height, 0.10)
		_press_motion.parallel().tween_property(_play, "scale", Vector2.ONE, 0.10)

func _animate_idle() -> void:
	var glint := create_tween().set_loops()
	glint.tween_interval(2.0)
	glint.tween_property(%PlayShine, "modulate:a", 0.82, 0.28)
	glint.tween_property(%PlayShine, "modulate:a", 0.0, 0.46)

func update_progress(flowers: int) -> void:
	_play.text = "继续游戏" if flowers > 0 else "开始游戏"
