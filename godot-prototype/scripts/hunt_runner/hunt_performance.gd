extends RefCounted
## Active-clock stage selection for both image and audio direction.

static func tier(performance: Dictionary, elapsed_ms: float, duration_ms: float) -> int:
	var span := duration_ms * 0.25 if performance.get("timing") == "quarters" else 30000.0
	return clampi(floori(elapsed_ms / span), 0, 3)

static func stage(performance: Dictionary, elapsed_ms: float, duration_ms: float) -> Dictionary:
	if performance.is_empty():
		return {}
	return performance["stages"][tier(performance, elapsed_ms, duration_ms)]

static func distant_thunder_age(performance: Dictionary, elapsed_ms: float, duration_ms: float) -> float:
	if performance.get("atmosphere") != "thunder":
		return -1.0
	var span := duration_ms * 0.25 if performance.get("timing") == "quarters" else 30000.0
	var age := elapsed_ms - (tier(performance, elapsed_ms, duration_ms) + 0.4) * span
	return age if age >= 0.0 and age < 700.0 else -1.0

static func spark_age(source: Dictionary, elapsed_ms: float) -> float:
	var time := elapsed_ms - float(source["offsetMs"])
	return fposmod(time, float(source["periodMs"])) if time >= 0.0 else -1.0

static func spark_slot(source: Dictionary, elapsed_ms: float) -> int:
	return floori((elapsed_ms - float(source["offsetMs"])) / float(source["periodMs"]))

static func seed(i: int) -> float:
	var n := sin(float(i) * 12.9898 + 78.233) * 43758.5453
	return n - floorf(n)
