extends RefCounted
## Headless state machine. Call tap_knob/drop/advance; the caller supplies time and hit zones.

const LEVEL_ID := &"oil-fire"
const Timing = preload("res://scripts/oil_fire_timing.gd")
const _EPSILON := 0.000001

enum Phase { PLAYING, FAILING, SETTLING, WON, LOST }
enum Item { NONE, KNOB, LID, WATER, CLOTH, PLATE, KNIFE, PERSON }
enum Zone { MISS, PAN, EXIT }
enum Action { NONE, SHUTOFF, COVER, EVACUATE, WATER, CLOTH, RETURN }
enum Feedback { NONE, SEALED, EXIT_BLOCKED, KNIFE, WATER, CLOTH, TIMEOUT }

var phase := Phase.PLAYING
var knob_off := false
var lid_sealed := false
var evacuated := false
var elapsed_seconds := 0.0
var risk := 0.0
var action := Action.NONE
var action_item := Item.NONE
var action_age := 0.0
var action_duration := 0.0
var focused_left := 0.0
var failure := Feedback.NONE

var _deadline_elapsed := 0.0
var _settling_age := 0.0
var _timing: Timing
var _duration: float
var _initial_risk: float


func _init(timing: Timing = null) -> void:
	# A fresh run owns a snapshot of the Inspector configuration.
	_timing = timing.duplicate() as Timing if timing != null else Timing.new()
	_duration = maxf(_timing.duration_seconds, 0.001)
	_initial_risk = clampf(_timing.initial_risk, 0.0, 0.99)
	risk = _initial_risk


func controlled() -> bool:
	return knob_off and lid_sealed


func heat() -> float:
	return 0.0 if controlled() else risk


func timeout_remaining_seconds() -> float:
	return maxf(_duration - _deadline_elapsed, 0.0)


func can_pick(item: Item) -> bool:
	if phase != Phase.PLAYING or action != Action.NONE:
		return false
	match item:
		Item.KNOB: return not knob_off
		Item.LID: return not lid_sealed
		Item.PERSON: return not evacuated
		Item.WATER, Item.CLOTH, Item.PLATE, Item.KNIFE: return true
		_: return false


func tap_knob() -> bool:
	if not can_pick(Item.KNOB):
		return false
	_begin(Action.SHUTOFF, Item.KNOB, _timing.knob_seconds)
	return true


func drop(item: Item, zone: Zone) -> Feedback:
	if not can_pick(item) or item == Item.KNOB:
		return Feedback.NONE
	if item == Item.LID and zone == Zone.PAN:
		_begin(Action.COVER, item, _timing.lid_seconds)
		return Feedback.NONE
	if item == Item.PERSON and zone == Zone.EXIT and controlled():
		_begin(Action.EVACUATE, item, _timing.evacuation_seconds)
		return Feedback.NONE
	if (item == Item.WATER or item == Item.CLOTH) and zone == Zone.PAN:
		if lid_sealed:
			return Feedback.SEALED
		var water := item == Item.WATER
		phase = Phase.FAILING
		risk = 1.0
		failure = Feedback.WATER if water else Feedback.CLOTH
		_begin(Action.WATER if water else Action.CLOTH, item, _timing.failure_feedback_seconds)
		return failure
	_begin(Action.RETURN, item, _timing.return_seconds)
	if item == Item.PERSON and zone == Zone.EXIT:
		return Feedback.EXIT_BLOCKED
	return Feedback.KNIFE if item == Item.KNIFE else Feedback.NONE


func advance(seconds: float) -> void:
	if not is_finite(seconds) or seconds <= 0.0:
		return
	match phase:
		Phase.PLAYING:
			_advance_play(seconds)
		Phase.FAILING:
			var step := minf(seconds, action_duration - action_age)
			action_age += step
			elapsed_seconds += step
			if action_age + _EPSILON >= action_duration:
				_fail(failure)
		Phase.SETTLING:
			_settling_age += seconds
			if _settling_age + _EPSILON >= _timing.safe_hold_seconds:
				phase = Phase.WON


func _advance_play(seconds: float) -> void:
	var step := seconds
	var until_timeout := timeout_remaining_seconds()
	if not controlled():
		step = minf(step, until_timeout)
	if action != Action.NONE:
		step = minf(step, action_duration - action_age)
	elapsed_seconds += step
	focused_left = maxf(0.0, focused_left - step)
	if not controlled():
		_deadline_elapsed += step
		# A still-incomplete action at the deadline cannot rescue the run.
		if step + _EPSILON >= until_timeout:
			_deadline_elapsed = _duration
			_fail(Feedback.TIMEOUT)
			return
		risk = clampf(risk + step * (1.0 - _initial_risk) / _duration, 0.0, 1.0)
	if action == Action.NONE:
		return
	action_age += step
	if action_age + _EPSILON >= action_duration:
		_commit_action()
		# Split at the action boundary so a long step cannot inflate the score
		# or consume hazard time after the second goal commits.
		advance(seconds - step)


func _begin(kind: Action, item: Item, seconds: float) -> void:
	action = kind
	action_item = item
	action_age = 0.0
	action_duration = maxf(0.001, seconds)


func _clear_action() -> void:
	action = Action.NONE
	action_item = Item.NONE
	action_age = 0.0
	action_duration = 0.0


func _commit_action() -> void:
	match action:
		Action.SHUTOFF, Action.COVER:
			if action == Action.SHUTOFF:
				knob_off = true
			else:
				lid_sealed = true
			risk = maxf(0.0, risk - clampf(_timing.risk_relief, 0.0, 1.0))
			focused_left = _timing.focused_seconds
		Action.EVACUATE:
			evacuated = true
			phase = Phase.SETTLING
	_clear_action()


func _fail(cause: Feedback) -> void:
	phase = Phase.LOST
	failure = cause
	risk = 1.0
	_clear_action()
