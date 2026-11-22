extends Control

signal home_pressed
signal progress_pressed
signal settings_pressed

@onready var _progress: TextureButton = $ProgressButton
@onready var _count: Label = $ProgressButton/WalletCount

func _ready() -> void:
	$HomeButton.pressed.connect(home_pressed.emit)
	_progress.pressed.connect(progress_pressed.emit)
	$SettingsButton.pressed.connect(settings_pressed.emit)
	for button: TextureButton in [$HomeButton, _progress, $SettingsButton]:
		button.button_down.connect(func() -> void: button.modulate = Color(0.95, 0.95, 0.95))
		button.button_up.connect(func() -> void: button.modulate = Color.WHITE)

func set_wallet(total: int) -> void:
	_count.text = str(total)
	_count.add_theme_font_size_override("font_size", 25 if total < 10 else 20 if total < 100 else 16)
	var description := "累计 %d 朵小红花，打开我的进度" % total
	_progress.tooltip_text = description
	_progress.accessibility_name = description
