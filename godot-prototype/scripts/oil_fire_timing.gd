extends Resource
## Training values, not physical measurements or a real evacuation deadline.

@export_group("Hazard")
@export_range(0.1, 300.0, 0.1, "or_greater", "suffix:s") var duration_seconds := 50.0
@export_range(0.0, 0.99, 0.01) var initial_risk := 0.22
@export_range(0.0, 1.0, 0.01) var risk_relief := 0.12

@export_group("Actions")
@export_range(0.01, 10.0, 0.01, "or_greater", "suffix:s") var knob_seconds := 0.65
@export_range(0.01, 10.0, 0.01, "or_greater", "suffix:s") var lid_seconds := 0.85
@export_range(0.01, 10.0, 0.01, "or_greater", "suffix:s") var evacuation_seconds := 1.0
@export_range(0.01, 10.0, 0.01, "or_greater", "suffix:s") var return_seconds := 0.45

@export_group("Feedback")
@export_range(0.01, 10.0, 0.01, "or_greater", "suffix:s") var wrong_motion_seconds := 0.9
@export_range(0.01, 10.0, 0.01, "or_greater", "suffix:s") var failure_feedback_seconds := 1.9
@export_range(0.01, 10.0, 0.01, "or_greater", "suffix:s") var safe_hold_seconds := 0.65
@export_range(0.01, 10.0, 0.01, "or_greater", "suffix:s") var focused_seconds := 2.2
