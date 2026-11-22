extends Control

signal begin
signal test_run

const Painted = preload("res://scripts/painted_chrome.gd")
const PRIMARY = preload("res://assets/restored_ui/title-primary.webp")
const SECONDARY = preload("res://assets/restored_ui/title-secondary.webp")

@onready var _play: Button = %Play
@onready var _progress: Label = %Progress

func _ready() -> void:
	Painted.action(_play, PRIMARY)
	Painted.action(%PlayMigrated, SECONDARY, Color("fff4cf"))
	_play.pressed.connect(func() -> void: begin.emit())
	%PlayMigrated.pressed.connect(func() -> void: test_run.emit())

func update_progress(flowers: int) -> void:
	_progress.text = "已收集 %d 朵小红花" % flowers
	_play.text = "继续游戏" if flowers > 0 else "开始游戏"
