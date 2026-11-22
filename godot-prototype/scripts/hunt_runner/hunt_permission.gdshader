shader_type canvas_item;
render_mode unshaded;

// Only approved white, fully opaque pixels may receive a licensed effect.
// Exact target evidence always wins over the permission image.
uniform sampler2D id_mask : filter_nearest, repeat_disable;
uniform sampler2D permission : filter_nearest, repeat_disable;
uniform bool uses_permission;
uniform vec3 target_colors[6];
uniform int target_count;
uniform vec2 world_size;
uniform bool is_vignette;
uniform vec2 vignette_center;
uniform vec2 vignette_radii;
varying vec2 art_point;

void vertex() {
	art_point = VERTEX;
}

void fragment() {
	vec2 uv = art_point / world_size;
	vec4 id_pixel = texture(id_mask, uv);
	float visible_alpha = 1.0;
	if (id_pixel.a >= 0.5) {
		for (int i = 0; i < 6; i++) {
			if (i >= target_count) { break; }
			if (all(lessThan(abs(id_pixel.rgb - target_colors[i]), vec3(0.5 / 255.0)))) {
				visible_alpha = 0.0;
				break;
			}
		}
	}
	if (uses_permission) {
		vec4 allowed = texture(permission, uv);
		visible_alpha *= step(249.5 / 255.0, min(min(allowed.r, allowed.g), min(allowed.b, allowed.a)));
	}
	if (is_vignette) {
		float radius = distance(art_point, vignette_center);
		visible_alpha *= clamp((radius - vignette_radii.x) / (vignette_radii.y - vignette_radii.x), 0.0, 1.0);
	}
	COLOR.a *= visible_alpha;
}
