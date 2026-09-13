# Scene-hunt v2 runtime contract

All fields below are optional for old packs. New packs use `rules.feedbackVersion:2` plus `performance`; do not edit old rules, IDs or art. Stages describe teaching presentation, not hazard prediction.

```json
{
  "version":2,
  "atmosphere":"indoor",
  "sound":"quiet_electric",
  "retreatDirection":1,
  "missCaption":"这里没有识别目标，隐患仍未找齐。",
  "stages":[
    {"atMs":0,"breathMs":2800,"breathPx":2,"retractPx":0,"vignette":0,"bpm":64,"rainCount":0,"smokeCount":0,"smokeAlpha":0,"flameScale":1},
    {"atMs":30000,"breathMs":2300,"breathPx":2.4,"retractPx":4,"vignette":0.06,"bpm":71,"rainCount":0,"smokeCount":0,"smokeAlpha":0,"flameScale":1},
    {"atMs":60000,"breathMs":1900,"breathPx":2.8,"retractPx":7,"vignette":0.12,"bpm":77,"rainCount":0,"smokeCount":0,"smokeAlpha":0,"flameScale":1},
    {"atMs":90000,"breathMs":1700,"breathPx":3.2,"retractPx":10,"vignette":0.16,"bpm":84,"rainCount":0,"smokeCount":0,"smokeAlpha":0,"flameScale":1}
  ]
}
```

The above is `performance.json`, imported by registry as `pack.performance`. Set old presentation fields to `environment:"none",characters:"breathing",audio:"quiet_electric",timer:"elapsed"`; v2 atmosphere/audio override legacy effects without changing old packs. Set 5 distinct targets, seconds90, markMs800, revealMs5500. Positive retreatDirection means screen-right upper-body retreat; choose from actual safe space, never hazard approach.

Seven sounds: quiet_electric, kitchen_check, corridor, preparedness (indoor); rain_street (rain); thunder_park (thunder); forest_edge (fire). Each stage's BPM comes from its own production card. Weather rainCount is 36/80/130/170. Fire smokeCount16/32/52/64, smokeAlpha.16/.26/.36/.42, flameScale1/1.25/1.55/1.8. Indoor rain/smoke must be zero; flameScale stays1. Vignette maximum .16.

## Pixel permission contract

`skin.effects` fields (all paths local `/levels/.../*.png`, all masks full-size720×1280, black opaque forbidden / white opaque allowed):

- `characterMask` required for v2: approved maximum movement/reconstruction area (source family silhouette expanded conservatively by about15px, minus every target). It clips ALL deformed pixels, not hit testing.
- `weatherMask` required for rain/thunder: approved exterior region for rain/leaves, never indoor floor, faces or foreground safe interior.
- `waterMask` optional rain/thunder: only existing water, used for ripples. Water boundary remains immutable.
- `skyMask` required thunder: non-target distant clouds. At12/42/72/102sec one700ms alpha≤.09 cloud swell, then never repeats at peak. Reduced-motion mode hides it.
- `fireMask` / `smokeMask` required fire: approved fire/smoke areas. Both use full white/black masks, not bounding-box permissions.
- `fireSources` required fire: array of `{kind:"flame"|"ember"|"fountain",x,y,w,h}` anchors in720×1280 coordinates. Flame for existing wood/paper fires only, ember for cigarette/charcoal red core, fountain for existing ground fireworks; boxes do not participate in hit testing.
- `smokeDrift` optional -1/1, choose direction away from people.

Runtime subtracts exact ID-mask target pixels from every permission mask and from vignette. Resulting coverage of those pixels is zero (stricter than .12/.18). All environment layers precede source-derived family drawing; family is itself clipped to characterMask minus targets. If approved masks are missing, schema/load fails instead of silently filling rectangles.

## Input, clocks and reward contract

Exact RGB ID map only. Unknown colors, black/white, UI, people and contain margins cannot produce target IDs. Mark800ms locks additional marks without queuing; found once. Miss450ms feedback has500ms activity-time cooldown but valid clicks remain immediately eligible. New missCaption can override neutral default; thunder card must not imply non-target outdoor locations are safe.

Four tiers use activeElapsed at0/30000/60000/90000ms. Paused/background work freezes elapsed, mark, miss, nod, reveal, tier. Peak is recoverable indefinitely. End through pause creates unfinished state, cancels in-flight mark, freezes painting, awards0; only retry or back is allowed. No background transition ends a run.

Last found begins reveal. Hold800ms, fade1800ms, show complete ending2900ms, settle at5500ms. Resolve sound is emitted once when fade becomes positive, not on initial hold. Three flowers animate180ms each at settlement. Existing onFinish and best-score idempotence remain responsible for persistence.

No speech, network audio, third-party music or public-alert imitation. Gesture unlock only; mute dominates; pause/background mute; exit stops all scheduled/loop sources and closes AudioContext. Quiet indoor scenes do not receive wind/rain/fire audio. Sound failures do not block recognition. Automated tests are not real-speaker listening.
