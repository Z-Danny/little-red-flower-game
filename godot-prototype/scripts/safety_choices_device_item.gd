extends Button

signal dropped(id: String)

var kind := ""
var accepted_id := ""

func _get_drag_data(_position: Vector2) -> Variant:
	if kind != "carry" or disabled: return null
	var preview := Label.new()
	preview.text = text
	preview.add_theme_color_override("font_outline_color", Color("23382d"))
	preview.add_theme_constant_override("outline_size", 8)
	set_drag_preview(preview)
	return {"device_evidence": String(name)}

func _can_drop_data(_position: Vector2, data: Variant) -> bool:
	return kind == "drop" and data is Dictionary and data.get("device_evidence", "") == accepted_id

func _drop_data(_position: Vector2, data: Variant) -> void:
	dropped.emit(data.device_evidence)
