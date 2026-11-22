extends SceneTree
## Optional real OpenGL smoke test (not --headless): screenshots of every scene,
## active performance tier and original ending. All audio is muted in-process.
## Pass an existing output directory after '--'.

const Runner = preload("res://scripts/hunt_runner/hunt_runner.gd")
const Scene = preload("res://scenes/hunt_runner.tscn")
const Pack = preload("res://scripts/hunt_runner/hunt_pack.gd")
const Rules = preload("res://scripts/hunt_runner/hunt_rules.gd")

var _out := ""
var _failures := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if DisplayServer.get_name() == "headless" or args.size() != 1 or not DirAccess.dir_exists_absolute(args[0]):
		printerr("Use a real renderer and pass an existing output directory after '--'.")
		quit(2)
		return
	_out = args[0]
	AudioServer.set_bus_mute(0, true)
	for id: String in Pack.contract_ids():
		var runner := Scene.instantiate() as Runner
		runner.configure({"id": id, "title": "", "muted": true})
		root.add_child(runner)
		runner.set_process(false)
		if runner.run == null:
			_failure(id + ": " + runner.pack.error)
			runner.free()
			continue
		var opening := await _capture(id + "-opening")
		_check_opening_caption(id, runner, opening)
		for i in range(390):
			runner._advance(100.0)
		var pressure := await _capture(id + "-pressure")
		_check_scene_pixels(id, runner, opening, pressure)
		if id == "typhoon-home":
			runner._toggle_pause()
			await _capture(id + "-pause")
			runner._toggle_pause()
		for target: Dictionary in runner.pack.rules["targets"]:
			runner.run.tap(target["id"], Vector2.ZERO)
			for i in range(8):
				runner._advance(100.0)
		var ending := await _capture(id + "-ending")
		_check_ending_pixels(id, runner, ending)
		runner.free()
	quit(0 if _failures == 0 else 1)

func _capture(name: String) -> Image:
	await process_frame
	await process_frame # let Controls apply deferred text shaping and resize
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if image.is_empty() or image.save_png(_out.path_join(name + ".png")) != OK:
		_failure("capture failed: " + name)
	return image

func _check_opening_caption(id: String, runner: Runner, opening: Image) -> void:
	if opening.is_empty():
		return
	var panel := runner.get_node("HUD/Caption") as Control
	var rect := panel.get_global_rect()
	if rect.size.y > 130.0 or rect.end.y < 960.0:
		_failure(id + ": opening caption covers too much of the scene")
		return
	var ink := 0
	for y in range(ceili(rect.position.y + 8.0), floori(rect.end.y - 8.0), 2):
		for x in range(ceili(rect.position.x + 8.0), floori(rect.end.x - 8.0), 2):
			var color := opening.get_pixelv(_screenshot_pixel(opening, runner, Vector2(x, y)))
			if color.r > 0.6 and color.g > 0.55 and color.b >= 0.34:
				ink += 1
	if ink < 20:
		_failure(id + ": no rendered opening caption glyphs")

func _check_scene_pixels(id: String, runner: Runner, a: Image, b: Image) -> void:
	if a.is_empty() or b.is_empty():
		return
	var mask := runner.pack.texture("mask").get_image()
	var protected_points := 0
	var kept := 0
	var changed := 0
	for y in range(140, 900, 9):
		for x in range(26, 550, 9):
			var view := Vector2(x + 0.5, y + 0.5)
			var px := _screenshot_pixel(a, runner, view)
			var delta := _color_delta(a.get_pixelv(px), b.get_pixelv(px))
			if delta > 0.016:
				changed += 1
			var at := Vector2i(runner._world.camera.affine_inverse() * view)
			if not _is_interior(mask, at, runner.pack):
				continue
			protected_points += 1
			if delta < 0.025:
				kept += 1
	if changed < 5 or protected_points < 10 or float(kept) / protected_points < 0.97:
		_failure("%s: expected motion and protected evidence (changed %d, kept %d/%d)" % [id, changed, kept, protected_points])
	else:
		print("Render ", id, ": pressure animation changed ", changed, " samples, preserved ", kept, "/", protected_points, " protected samples")

func _check_ending_pixels(id: String, runner: Runner, rendered: Image) -> void:
	if rendered.is_empty():
		return
	var art := runner.pack.texture("safe").get_image()
	var matched := 0
	var samples := 0
	for y in range(160, 790, 40):
		for x in range(30, 550, 51):
			var location := Vector2(x + 0.5, y + 0.5)
			var viewport_pixel := _screenshot_pixel(rendered, runner, location)
			var world_pixel := Vector2i(runner._world.camera.affine_inverse() * location)
			var expected := art.get_pixelv(world_pixel)
			var actual := rendered.get_pixelv(viewport_pixel)
			if _color_delta(expected, actual) < 0.14:
				matched += 1
			samples += 1
	if runner.run.phase != Rules.Phase.REVEAL or float(matched) / samples < 0.9:
		_failure("%s: rendered ending pixels didn't match its actual safe painting (%d/%d)" % [id, matched, samples])
	else:
		print("Ending ", id, ": ", matched, "/", samples, " original painting samples")

static func _is_interior(mask: Image, at: Vector2i, pack: Pack) -> bool:
	var color := mask.get_pixelv(at)
	var id := pack.exact_hit(Vector2(at))
	if id.is_empty():
		return false
	for step: Vector2i in [Vector2i(-3, -3), Vector2i(3, -3), Vector2i(-3, 3), Vector2i(3, 3)]:
		if mask.get_pixelv(at + step) != color:
			return false
	return true

static func _screenshot_pixel(image: Image, runner: Runner, ref: Vector2) -> Vector2i:
	return Vector2i(ref * Vector2(image.get_size()) / runner.size)

static func _color_delta(a: Color, b: Color) -> float:
	return (absf(a.r - b.r) + absf(a.g - b.g) + absf(a.b - b.b)) / 3.0

func _failure(what: String) -> void:
	_failures += 1
	printerr("FAIL render ", what)
