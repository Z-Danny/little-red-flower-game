extends Node
## Used only by the release that includes the build-time asset manifest. The
## full desktop/editor project stays offline and never contacts a server.

signal status_changed(text: String)

const Catalog = preload("res://scripts/level_catalog.gd")
const MANIFEST := "res://data/asset-packs.json"
const CACHE := "user://level-media-v1/"
const PACK_SIZE_LIMIT := 80_000_000

var _details: Dictionary = {}
var _mounted: Dictionary = {}

func _ready() -> void:
	if FileAccess.file_exists(MANIFEST):
		_details = Catalog.read_json(MANIFEST)

func needs_download(id: String) -> bool:
	for group: String in _details.get("levels", {}).get(id, []):
		if not _mounted.has(group): return true
	return false

func ensure_for(id: String) -> bool:
	var groups: Array = _details.get("levels", {}).get(id, [])
	if groups.is_empty(): return true
	if int(_details.get("schemaVersion", 0)) != 1 or not str(_details.get("base_url", "")).begins_with("https://"):
		return false
	if DirAccess.make_dir_recursive_absolute(CACHE) != OK:
		return false
	for group: String in groups:
		if _mounted.has(group): continue
		if not await _mount(group): return false
	return true

func _mount(group: String) -> bool:
	var info: Dictionary = _details.get("packs", {}).get(group, {})
	var file: String = info.get("file", "")
	var expected_hash: String = info.get("sha256", "")
	var bytes := int(info.get("bytes", 0))
	if bytes <= 0 or bytes > PACK_SIZE_LIMIT or expected_hash.length() != 64:
		return false
	var allowed := RegEx.create_from_string("^[a-z0-9-]+-[0-9a-f]{16}\\.pck$")
	if allowed.search(file) == null:
		return false
	var cache_file := CACHE + file
	if FileAccess.file_exists(cache_file) and FileAccess.get_sha256(cache_file) == expected_hash:
		status_changed.emit("正在读取已缓存的关卡素材…")
	else:
		status_changed.emit("正在下载关卡素材…")
		var pending := cache_file + ".tmp"
		var request := HTTPRequest.new()
		request.timeout = 40.0
		request.max_redirects = 0
		request.body_size_limit = bytes
		request.download_file = pending
		add_child(request)
		if request.request(str(_details.base_url) + file) != OK:
			request.queue_free()
			return false
		var response: Array = await request.request_completed
		request.queue_free()
		if response[0] != HTTPRequest.RESULT_SUCCESS or response[1] != 200 or FileAccess.get_sha256(pending) != expected_hash:
			if FileAccess.file_exists(pending): DirAccess.remove_absolute(pending)
			return false
		if DirAccess.rename_absolute(pending, cache_file) != OK:
			return false
	if not ProjectSettings.load_resource_pack(cache_file, false):
		return false
	_mounted[group] = true
	return true
