shader_type canvas_item;

uniform float saturation : hint_range(0.0, 1.0) = 1.0;
uniform float brightness : hint_range(0.0, 1.0) = 1.0;

void fragment() {
	float luma = dot(COLOR.rgb, vec3(0.2126, 0.7152, 0.0722));
	COLOR.rgb = mix(vec3(luma), COLOR.rgb, saturation) * brightness;
}
