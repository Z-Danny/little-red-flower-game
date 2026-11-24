extends Node
## Used only by the release that includes the build-time asset manifest. The
## full desktop/editor project stays offline and never contacts a server.

signal status_changed(text: String)
signal _pack_finished
signal _mount_finished

const Catalog = preload("res://scripts/level_catalog.gd")
const MANIFEST := "res://data/asset-packs.json"
const WEB_PACKS_PATH := "./packs/"
const CACHE := "user://level-media-v1/"
const PACK_SIZE_LIMIT := 80_000_000
const DOWNLOAD_TIMEOUT_MS := 40_000
const RETRY_DELAY := 0.45

var sequential_downloads := false
var _details: Dictionary = {}
var _download_base_url := ""
var _mounted: Dictionary = {}
var _mounting: Dictionary = {}
var _closing := false

func _enter_tree() -> void:
	_closing = false

func _ready() -> void:
	if FileAccess.file_exists(MANIFEST):
		_details = Catalog.read_json(MANIFEST)

func _exit_tree() -> void:
	# Release suspended callers when the owning game scene is removed.
	_closing = true
	for child in get_children():
		if child is HTTPRequest:
			child.cancel_request()
			child.request_completed.emit(HTTPRequest.RESULT_REQUEST_FAILED, 0, PackedStringArray(), PackedByteArray())
		elif child is Timer:
			child.stop()
			child.timeout.emit()

func needs_download(id: String) -> bool:
	for group: String in _details.get("levels", {}).get(id, []):
		if not _mounted.has(group): return true
	return false

func ensure_for(id: String) -> bool:
	if _closing:
		return false
	var groups: Array = _details.get("levels", {}).get(id, [])
	if groups.is_empty(): return true
	_download_base_url = _resolve_base_url(str(_details.get("base_url", "")))
	if int(_details.get("schemaVersion", 0)) != 1 or _download_base_url.is_empty():
		push_warning("Media pack manifest has an invalid version or base URL.")
		return false
	if DirAccess.make_dir_recursive_absolute(CACHE) != OK:
		push_warning("Could not create the media pack cache.")
		return false
	var pending := groups.filter(func(group: String) -> bool: return not _mounted.has(group))
	var batch := {"remaining": pending.size(), "total": pending.size(), "ok": true}
	_report_batch(batch)
	for group: String in pending:
		if sequential_downloads:
			await _finish_pack(group, batch)
			if not batch.ok:
				return false
		else:
			_finish_pack(group, batch)
	while int(batch.remaining) > 0:
		await _pack_finished
	return batch.ok

func _resolve_base_url(configured: String) -> String:
	if configured.begins_with("https://"):
		return configured
	if configured != WEB_PACKS_PATH or not OS.has_feature("web"):
		return ""
	var browser := JavaScriptBridge.get_interface("window")
	if browser == null:
		return ""
	var location: JavaScriptObject = browser.location
	if location == null:
		return ""
	var protocol := str(location.protocol)
	var loopback := protocol == "http:" and str(location.hostname) in ["localhost", "127.0.0.1", "[::1]"]
	if protocol != "https:" and not loopback:
		return ""
	var resolved: JavaScriptObject = JavaScriptBridge.create_object("URL", WEB_PACKS_PATH, str(location.href))
	if resolved == null or str(resolved.origin) != str(location.origin):
		return ""
	return str(resolved.href)

func _finish_pack(group: String, batch: Dictionary) -> void:
	var succeeded := await _mount(group)
	batch.ok = batch.ok and succeeded
	batch.remaining -= 1
	if int(batch.remaining) > 0 and not _closing:
		_report_batch(batch)
	_pack_finished.emit()

func _report_batch(batch: Dictionary) -> void:
	status_changed.emit("已就绪 %d / %d" % [batch.total - batch.remaining, batch.total])

func _mount(group: String) -> bool:
	if _mounted.has(group):
		return true
	if _mounting.has(group):
		var shared: Dictionary = _mounting[group]
		while not shared.done:
			await _mount_finished
		return shared.ok

	var pending := {"done": false, "ok": false}
	_mounting[group] = pending
	pending.ok = await _load_verified_pack(group)
	pending.done = true
	_mounting.erase(group)
	_mount_finished.emit()
	return pending.ok

func _load_verified_pack(group: String) -> bool:
	var info: Dictionary = _details.get("packs", {}).get(group, {})
	var file: String = info.get("file", "")
	var expected_hash: String = info.get("sha256", "")
	var bytes := int(info.get("bytes", 0))
	if bytes <= 0 or bytes > PACK_SIZE_LIMIT or expected_hash.length() != 64:
		push_warning("Media pack %s has invalid size or hash metadata." % group)
		return false
	var allowed := RegEx.create_from_string("^[a-z0-9-]+-[0-9a-f]{16}\\.pck$")
	if allowed.search(file) == null:
		push_warning("Media pack %s has an invalid filename." % group)
		return false
	var cache_file := CACHE + file
	if not _matches_hash(cache_file, expected_hash):
		var deadline := Time.get_ticks_msec() + DOWNLOAD_TIMEOUT_MS
		var url := _download_base_url + file
		var result := await _download(url, cache_file, bytes, expected_hash, DOWNLOAD_TIMEOUT_MS / 1000.0)
		if _closing:
			return false
		if not result.ok and result.retry and deadline - Time.get_ticks_msec() > 2000:
			var delay := Timer.new()
			delay.one_shot = true
			add_child(delay)
			delay.start(RETRY_DELAY)
			await delay.timeout
			delay.queue_free()
			if _closing:
				return false
			var remaining := (deadline - Time.get_ticks_msec()) / 1000.0
			if remaining > 0.0:
				result = await _download(url, cache_file, bytes, expected_hash, remaining)
				if _closing:
					return false
		if not result.ok:
			if FileAccess.file_exists(cache_file):
				DirAccess.remove_absolute(cache_file)
			push_warning("Media pack %s could not be downloaded: %s." % [group, result.reason])
			return false
	if not ProjectSettings.load_resource_pack(cache_file, false):
		push_warning("Media pack %s passed integrity checks but could not be mounted." % group)
		return false
	_mounted[group] = true
	return true

func _download(url: String, cache_file: String, bytes: int, expected_hash: String, timeout: float) -> Dictionary:
	var request := HTTPRequest.new()
	request.timeout = timeout
	request.max_redirects = 0
	request.body_size_limit = bytes
	# Keep the content-addressed path stable while the browser syncs user://.
	# The file won't be mounted until its expected SHA-256 is verified.
	request.download_file = cache_file
	add_child(request)
	var start_error := request.request(url)
	if start_error != OK:
		request.queue_free()
		return {"ok": false, "retry": false, "reason": "request error %d" % start_error}

	var response: Array = await request.request_completed
	request.queue_free()
	var transport: int = response[0]
	var status: int = response[1]
	if transport != HTTPRequest.RESULT_SUCCESS or status != 200:
		var interrupted := transport in [
			HTTPRequest.RESULT_CANT_CONNECT, HTTPRequest.RESULT_CONNECTION_ERROR,
			HTTPRequest.RESULT_CHUNKED_BODY_SIZE_MISMATCH,
		]
		var temporary_status := status in [408, 429] or status >= 500 and status < 600
		return {
			"ok": false,
			"retry": interrupted or temporary_status,
			"reason": "transport result %d, HTTP %d" % [transport, status],
		}
	if not _matches_hash(cache_file, expected_hash):
		return {"ok": false, "retry": true, "reason": "SHA-256 mismatch"}
	return {"ok": true}

func _matches_hash(file: String, expected_hash: String) -> bool:
	return FileAccess.file_exists(file) and FileAccess.get_sha256(file) == expected_hash
