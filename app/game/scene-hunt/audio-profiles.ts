/** Original note choices and gain starting points, not a calibrated sound-pressure claim. */
export const quietElectric = {
  bpm: [60, 72] as const,
  notes: [164.8138, 246.9417, 391.9954] as const, // E3, B3, G4
  ending: [329.6276, 391.9954, 493.8833] as const, // E4, G4, B4
  master: 0.45,
  musicGain: [0.025, 0.055] as const,
  ambienceGain: 0,
  markMs: 800,
  foundMs: 90,
  missMs: 70,
  sfxMax: 0.08,
};
/** All phrases are generated locally; frequencies are note material, not recordings. */
export const performanceAudio = {
  quiet_electric: {
    notes: [164.8138, 246.9417, 391.9954],
    ending: [329.6276, 391.9954, 493.8833],
    ambience: 'none',
    wave: 'sine',
    tail: 0.6,
  },
  kitchen_check: {
    notes: [195.9977, 293.6648, 440],
    ending: [391.9954, 493.8833, 587.3295],
    ambience: 'room',
    wave: 'triangle',
    tail: 0.45,
  },
  corridor: {
    notes: [130.8128, 195.9977, 293.6648],
    ending: [261.6256, 329.6276, 391.9954],
    ambience: 'none',
    wave: 'triangle',
    tail: 0.32,
  },
  preparedness: {
    notes: [195.9977, 246.9417, 293.6648],
    ending: [391.9954, 493.8833, 587.3295],
    ambience: 'none',
    wave: 'sine',
    tail: 0.85,
  },
  rain_street: {
    notes: [146.8324, 220, 261.6256],
    ending: [349.2282, 440, 523.2511],
    ambience: 'rain',
    wave: 'triangle',
    tail: 0.55,
  },
  thunder_park: {
    notes: [164.8138, 246.9417, 293.6648],
    ending: [391.9954, 493.8833, 587.3295],
    ambience: 'rain',
    wave: 'sine',
    tail: 0.65,
  },
  forest_edge: {
    notes: [146.8324, 195.9977, 220],
    ending: [391.9954, 440, 587.3295],
    ambience: 'fire',
    wave: 'triangle',
    tail: 0.6,
  },
} as const;
export const performanceMix = {
  master: 0.45,
  music: [0.025, 0.035, 0.045, 0.055],
  ambience: [0.02, 0.035, 0.05, 0.07],
  sfxMax: 0.08,
  missMs: 160,
  foundMs: 90,
  markMs: 800,
} as const;
