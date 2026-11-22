extends SceneTree

const Runner = preload("res://scenes/cpr_runner.tscn")
var _fails := 0

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var view := Runner.instantiate()
	root.add_child(view)
	view.set_process(false)
	view.audio_muted = true
	var model: RefCounted = view._sim
	var results := []
	view.finished.connect(func(won: bool, elapsed: float) -> void: results.append([won, elapsed]))
	view._do("start")
	_check(model.step_id() == "call", "out of order actions rejected")
	view._do("call")
	view._do("continue")
	_check(model.review == "call", "reading hold cannot be skipped")
	_learn(view)
	view._do("aed")
	_learn(view)
	view._do("start")
	_learn(view)
	view._do("position", false)
	_check(model.phase == "position" and model.review.is_empty(), "wrong location retries")
	view._do("position", true)
	_learn(view)
	view._do("hands", false)
	_check(model.phase == "hands", "wrong placement retries")
	view._do("hands", true)
	_learn(view)
	view._do("posture", false)
	_check(model.phase == "posture", "wrong posture retries")
	view._do("posture", true)
	_learn(view)
	view._do("tap")
	_advance(model, 100)
	view._do("tap")
	_check(model.samples == 0, "rapid tap does not count")
	view._pause("help")
	view._do("tap")
	view._resume()
	_check(model.last_tap < 0.0, "help/pause clears timing interval")
	view._do("tap")
	for interval in 12:
		_advance(model, 550)
		view._do("tap")
	_check(model.samples == 12 and model.near == 12 and model.review == "rhythm", "12 rhythm samples with non-scoring feedback")
	_learn(view)
	_check(model.aed_ready, "assistant arrives")
	view._do("finish")
	_check(results.is_empty(), "handover must precede completion")
	view._do("handover")
	_learn(view)
	view._do("finish")
	_check(results.size() == 1 and results[0][0] == true, "completes and emits only once")
	view._do("finish")
	_check(results.size() == 1, "duplicate result rejected")
	root.remove_child(view)
	view.queue_free()
	await process_frame
	if _fails == 0: print("PASS: CPR choices, 3-second review, untimed rhythm, and handover")
	quit(_fails)

func _learn(view: Control) -> void:
	_advance(view._sim, 3000)
	view._do("continue")

func _advance(model: RefCounted, amount: int) -> void:
	var remaining := amount
	while remaining > 0:
		var step := mini(remaining, 100)
		model.advance(float(step))
		remaining -= step

func _check(condition: bool, message: String) -> void:
	if not condition:
		printerr("FAIL: " + message)
		_fails += 1
