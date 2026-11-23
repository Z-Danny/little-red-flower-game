shader_type canvas_item;

uniform float lantern_light : hint_range(0.0, 1.0) = 0.5;

void fragment() {
	vec2 window = (UV - vec2(0.5, 0.214)) * vec2(15.5, 7.5);
	float glass = 1.0 - smoothstep(0.30, 1.0, length(window));
	vec3 dim = COLOR.rgb * vec3(0.71, 0.63, 0.50);
	vec3 warm = vec3(1.0, 0.94, 0.72);
	float amount = (lantern_light - 0.5) * 2.0;
	COLOR.rgb = mix(COLOR.rgb, dim, glass * max(-amount, 0.0));
	COLOR.rgb = mix(COLOR.rgb, warm, glass * max(amount, 0.0));
}
