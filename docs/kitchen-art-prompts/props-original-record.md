# Kitchen props atlas — builtin generation record

Status: NOT ACCEPTED. Both files contain baked opaque checkerboard backgrounds, confirmed by read-only System.Drawing metadata: 1254 x 1254; Format24bppRgb; corner Alpha 255. No genuine transparent alpha. No extraction or checkout edits were performed.

First draft: C:\Users\lenovo\.codex\generated_images\01a06d47-0dfb-7810-bd8a-fdf9fa5c07f9\exec-21404c1d-6aeb-4283-972e-393cb3d30d38.png

Attempted alpha correction: C:\Users\lenovo\.codex\generated_images\01a06d47-0dfb-7810-bd8a-fdf9fa5c07f9\exec-0d645773-937a-4dd2-b689-9de1942305a6.png

Visual caveats: Wok handle crosses the first equal-width cell boundary; do not crop into rigid 3 x 3 without adjusting bounds. Lid rim and wok mouth are not pixel-perfect matching ellipses. Rag is larger than requested relative to wok mouth. Nine requested subjects are present in requested order.

## Exact generation prompt

Use case: stylized-concept.
Asset type: ONE production-ready 2D kitchen game sprite atlas, a square 2048 x 2048 PNG if possible.
Primary request: Generate exactly nine isolated hand-painted kitchen objects in a precise invisible 3 by 3 grid of nine equal square cells. This is one sprite sheet, no visible cell borders.
Scene/backdrop: Genuine transparent alpha background, entirely empty between the objects. No background color, no drawn checkerboard, no floor, no contact shadows or shadows outside any object.
Style/medium: Cozy hand-painted 2D illustration, delicate dark brown charcoal outlines, warmly shaded cream, muted teal, ochre and warm red tones, gentle paper-brush texture confined inside object silhouettes. Clear readable cartoon game props, not photography, not 3D. Consistent line weight and gentle upper-left light.
Composition/framing: Each complete object is centered in its own equal cell with at least 15 percent empty margin on all four sides. All nine full silhouettes visible, no cropping or overlap. A slightly-above front view for the cookware. Objects never cross a cell boundary. No additional objects.

ROW ONE, left to right:
1. A dark charcoal wok / frying pan with exactly ONE long black handle pointing horizontally RIGHT, no helper handle. Its EMPTY open bowl is clearly visible from slightly above, with a broad horizontal oval mouth. No food, no oil, no fire inside or beneath it. Pan bowl mouth oval is approximately 2.1 times as wide as deep.
2. A separate matching silver pot lid, gently domed with a black knob precisely on top. Its horizontal oval outer rim has EXACTLY the same shape, viewing angle and apparent pixel width as the pan mouth in cell 1, so it can be placed onto that pan perfectly after extraction without rotating. The silver lid is not attached to a pan. The base rim is a horizontal 2.1:1 ellipse; the dome and black knob rise above this matching rim.
3. A simple clear glass drinking cup containing light pale-blue water, transparent glass sides with fine outlines and restrained highlights.

ROW TWO, left to right:
4. A small folded pale blue kitchen cleaning rag. It is visibly small: approximately HALF the width of the wok mouth above, clearly too small to cover that wok. Keep the rag small and centered with abundant empty cell space.
5. A compact red kitchen fire extinguisher with its black hose and handle, complete readable silhouette. Blank cylinder: no lettering, numbers, logos, labels or symbols.
6. One cream circular gas stove control knob, with a dark charcoal projecting grip. A single isolated knob, not an entire stove or panel. No printed text, tick marks or numbers.

ROW THREE, left to right:
7. One plain white ceramic plate with a delicate warm grey rim, elliptical view from slightly above, no food.
8. One kitchen knife, silver blade and dark warm wooden handle, complete silhouette, diagonally placed within its own cell.
9. A separate cluster of orange-gold curling flames, warm yellow centers and a fine illustrated contour. Flames only; absolutely no pan, logs, stove, charcoal, smoke, or ground below. Transparent gaps between outer flame tongues.

Constraints: Exactly the nine listed objects, in the specified cell order. No people, hands, captions, letters, numbers, watermarks, borders, logos, UI, texture outside silhouettes, cast shadows, ground plane, artificial checkerboard. Preserve genuine transparent alpha, including empty gutters. The pan and lid must be visually engineered as a matching pair.

## Exact correction prompt

Use case: background-extraction.
Asset type: production 2D kitchen sprite atlas.
Input image 1 is the edit target.
Critical correction: REMOVE THE ENTIRE BAKED-IN GREY AND WHITE CHECKERBOARD BACKGROUND and export the exact nine objects as isolated sprites on a genuinely transparent PNG alpha channel. The input image currently has an opaque checkerboard painted as RGB pixels; those squares are NOT artwork and must be erased to alpha = 0. A transparent background is a file property, not a pattern to draw. Do not draw any replacement background at all.
Preserve all nine objects and their detailed artwork: dark empty one-handled wok, separate silver matching lid, water glass, small blue rag, red fire extinguisher, cream gas knob, white plate, knife, orange flames. Preserve their row order, full silhouettes, colors, delicate painted texture and outlines. Keep empty gutters between the nine sprites. Preserve glass translucency and remove checkerboard showing through the glass. The nine objects must be on true alpha transparency, including all cell gutters and all outer margins. No shadows outside the silhouettes, no text, no new objects. Do not add white, grey, beige, black, or any colored flat background. Return one square PNG image with actual RGBA transparency.

