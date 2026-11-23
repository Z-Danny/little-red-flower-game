shader_type canvas_item;

void fragment() {
	vec4 title = COLOR;
	float cycle = mod(TIME, 4.6);
	float phase = mix(-0.34, 1.56, clamp((cycle - 0.8) / 1.5, 0.0, 1.0));
	float position = UV.x + (1.0 - UV.y) * 0.24;
	float glint = 1.0 - smoothstep(0.012, 0.16, abs(position - phase));
	float strength = glint * 0.64 * smoothstep(0.10, 0.80, title.a);
	COLOR = vec4(mix(title.rgb, vec3(1.0, 0.955, 0.78), strength), title.a);
}
