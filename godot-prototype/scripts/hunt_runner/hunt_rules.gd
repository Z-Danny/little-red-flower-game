extends RefCounted
## Whole-scene recognition. No art, scene tree, input device or reward dependency.
## Source: app/game/scene-hunt/model.ts and app/game/challenge/rules.ts.

enum Phase { READY, PLAYING, REVEAL, COMPLETE, FAILED }
enum Tap { IGNORED, DUPLICATE, MARK_STARTED, PENALTY }

var phase := Phase.READY
var duration_ms: float
var mark_duration_ms: float
var reveal_duration_ms: float
var miss_penalty_ms: float
var elapsed_ms := 0.0
var reveal_ms := 0.0
var found: Array[String] = []
var marking_id := ""
var mark_age_ms := 0.0
var last_found_at_ms := -1.0
var miss_position := Vector2.ZERO
var miss_age_ms := -1.0
var penalty_position := Vector2.ZERO
var penalty_age_ms := -1.0
var feedback_v2 := false
var _ids: Dictionary = {}

func _init(rules: Dictionary, penalty_ms: float, journey_reveal_ms: float) -> void:
	duration_ms = float(rules["seconds"]) * 1000.0
	mark_duration_ms = float(rules["markMs"])
	reveal_duration_ms = journey_reveal_ms
	miss_penalty_ms = penalty_ms
	feedback_v2 = int(rules.get("feedbackVersion", 0)) == 2
	for target: Dictionary in rules["targets"]:
		_ids[target["id"]] = true

func start() -> void:
	if phase == Phase.READY:
		phase = Phase.PLAYING

func target_count() -> int:
	return _ids.size()

func final_mark_pending() -> bool:
	return not marking_id.is_empty() and found.size() == target_count() - 1

func remaining_ratio() -> float:
	if phase == Phase.REVEAL or phase == Phase.COMPLETE:
		return 0.0
	return clampf(1.0 - elapsed_ms / duration_ms, 0.0, 1.0)

func pressure() -> float:
	if phase == Phase.REVEAL or phase == Phase.COMPLETE:
		return 0.0
	return 1.0 - remaining_ratio()

func tap(id: String, point: Vector2) -> Tap:
	if phase != Phase.PLAYING:
		return Tap.IGNORED
	var valid := _ids.has(id)
	# A correct input is never queued. An empty-space tap still costs time
	# during a nonfinal mark; the final mark protects its accepted result.
	if not marking_id.is_empty() and (valid or final_mark_pending()):
		return Tap.IGNORED
	if elapsed_ms >= duration_ms:
		_fail_on_clock()
		return Tap.IGNORED
	if not valid:
		if not point.is_finite():
			return Tap.IGNORED
		elapsed_ms = minf(duration_ms, elapsed_ms + miss_penalty_ms)
		miss_position = point
		miss_age_ms = 0.0
		penalty_position = point
		penalty_age_ms = 0.0
		if elapsed_ms >= duration_ms:
			# Penalty exhaustion does not complete an in-flight nonfinal circle.
			marking_id = ""
			phase = Phase.FAILED
		return Tap.PENALTY
	if found.has(id):
		return Tap.DUPLICATE
	marking_id = id
	mark_age_ms = 0.0
	miss_age_ms = -1.0
	return Tap.MARK_STARTED

func tick(delta_ms: float) -> void:
	if not is_finite(delta_ms) or delta_ms <= 0.0:
		return
	var ms := minf(100.0, delta_ms) # same per-frame cap as the web run
	if phase == Phase.REVEAL:
		reveal_ms += ms
		if reveal_ms >= reveal_duration_ms:
			phase = Phase.COMPLETE
		return
	if phase != Phase.PLAYING:
		return
	elapsed_ms = minf(duration_ms, elapsed_ms + ms)
	if miss_age_ms >= 0.0:
		miss_age_ms += ms
		if miss_age_ms >= (450.0 if feedback_v2 else 420.0):
			miss_age_ms = -1.0
	if penalty_age_ms >= 0.0:
		penalty_age_ms += ms
		if penalty_age_ms >= 1600.0:
			penalty_age_ms = -1.0
	if elapsed_ms >= duration_ms and not final_mark_pending():
		_fail_on_clock()
		return
	if marking_id.is_empty():
		return
	mark_age_ms += ms
	if mark_age_ms >= mark_duration_ms:
		found.append(marking_id)
		last_found_at_ms = elapsed_ms
		marking_id = ""
		if found.size() == target_count():
			phase = Phase.REVEAL
			reveal_ms = 0.0

func _fail_on_clock() -> void:
	# A nonfinal circle already accepted before natural timeout is counted in
	# failure progress but cannot award anything.
	if not marking_id.is_empty():
		found.append(marking_id)
	marking_id = ""
	phase = Phase.FAILED
	miss_age_ms = -1.0
	elapsed_ms = duration_ms
