/** Original offline DSP. These are synthesized water/rain textures, not field recordings. */
export type FloodLoop = 'flood-roar' | 'rain-window';
export const floodLoopSeconds: Record<FloodLoop, number> = { 'flood-roar': 8, 'rain-window': 6 };
const tau = Math.PI * 2;
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
const randomSource = (initial: number) => {
  let seed = initial;
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; };
};
function checkedRate(sampleRate: number) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new RangeError('Flood audio sample rate must be an integer from 8000 to 96000.');
}
function normalise(data: Float32Array, targetRms: number) {
  let sum = 0;
  for (const value of data) sum += value;
  const mean = sum / data.length;
  let energy = 0, peak = 0;
  for (let i = 0; i < data.length; i++) { const value = data[i] - mean; data[i] = value; energy += value * value; peak = Math.max(peak, Math.abs(value)); }
  const gain = Math.min(targetRms / Math.max(1e-8, Math.sqrt(energy / data.length)), .72 / Math.max(1e-8, peak));
  for (let i = 0; i < data.length; i++) data[i] *= gain;
  return data;
}

/** Explicit opt-in; the ordinary flood/water themes retain their current sound. */
export function usesFloodWindowProfile(profile: unknown): profile is 'flood-window' { return profile === 'flood-window'; }

/** Smooth pressure response; shelter reduces proximity, while the storm remains audible. */
export function floodAmbientMix(pressure: number, calm: boolean) {
  const p = clamp(pressure), eased = p * p * (3 - 2 * p);
  return { flood: (.74 + .34 * eased) * (calm ? .68 : 1), rain: (.46 + .24 * eased) * (calm ? .9 : 1) };
}

export function synthesiseFloodLoop(kind: FloodLoop, sampleRate = 22050): Float32Array {
  checkedRate(sampleRate);
  const seconds = floodLoopSeconds[kind], length = Math.round(seconds * sampleRate), blend = Math.round(sampleRate * .24);
  const raw = new Float32Array(length + blend), random = randomSource(kind === 'flood-roar' ? 7043903 : 2307411);
  // Pre-baked filtering keeps only three long-lived sources in the Web Audio graph.
  const broadAlpha = 1 - Math.exp(-tau * (kind === 'flood-roar' ? 760 : 5100) / sampleRate);
  const lowAlpha = 1 - Math.exp(-tau * (kind === 'flood-roar' ? 95 : 1050) / sampleRate);
  const subAlpha = 1 - Math.exp(-tau * 28 / sampleRate);
  let broad = 0, low = 0, sub = 0;
  for (let i = 0; i < raw.length; i++) {
    const t = i / sampleRate, n = random();
    broad += broadAlpha * (n - broad); low += lowAlpha * (n - low); sub += subAlpha * (low - sub);
    if (kind === 'flood-roar') {
      const swell = .82 + .14 * Math.sin(tau * t / seconds) + .1 * Math.sin(tau * 3 * t / seconds + .7);
      const froth = .75 + .25 * Math.sin(tau * 13 * t / seconds + .3);
      raw[i] = ((low - sub) * 2.9 + broad * .72 * froth) * swell;
    } else {
      const sheets = .86 + .09 * Math.sin(tau * 2 * t / seconds + .8) + .05 * Math.sin(tau * 7 * t / seconds);
      raw[i] = (broad - low) * .52 * sheets;
    }
  }
  if (kind === 'rain-window') {
    // Many light, non-tonal ticks on the pane, with varied spacing and decay.
    for (let at = 0; at < raw.length;) {
      at += Math.round(sampleRate * (.009 + (random() + 1) * .018));
      const gain = .04 + (random() + 1) * .035, frequency = 1800 + (random() + 1) * 1100;
      for (let j = 0; j < sampleRate * .024 && at + j < raw.length; j++) {
        const t = j / sampleRate;
        raw[at + j] += (random() * .75 + Math.sin(tau * frequency * t) * .25) * gain * Math.exp(-t * 190) * Math.min(1, t / .0015);
      }
    }
  }
  // Overlap the extra tail with the head, then trim the consumed head. The
  // wrap continues into adjacent samples instead of fading the entire bed to zero.
  const loop = raw.slice(blend);
  for (let i = 0; i < blend; i++) {
    const p = i / (blend - 1), ease = p * p * (3 - 2 * p);
    loop[length - blend + i] = raw[length + i] * (1 - ease) + raw[i] * ease;
  }
  return normalise(loop, kind === 'flood-roar' ? .22 : .18);
}

const rooftopCueSeconds: Record<string, number> = {
  'flood-alert': 1.5, 'flood-message-sent': .42, 'flood-power-off': .42, 'flood-pack-zip': .85,
};

/** Smooth endpoints, then balance signed area while preserving silence between events. */
function finishRooftopCue(data: Float32Array, sampleRate: number, targetRms: number) {
  const fade = Math.round(sampleRate * .015);
  const envelope = (i: number) => {
    const p = Math.min(1, i / fade, (data.length - 1 - i) / fade);
    return .5 - .5 * Math.cos(Math.PI * p);
  };
  let sum = 0, weight = 0;
  for (let i = 0; i < data.length; i++) { data[i] *= envelope(i); sum += data[i]; weight += Math.abs(data[i]); }
  const dc = sum / weight;
  let peak = 0, energy = 0;
  for (let i = 0; i < data.length; i++) {
    data[i] -= dc * Math.abs(data[i]); peak = Math.max(peak, Math.abs(data[i])); energy += data[i] * data[i];
  }
  const gain = Math.min(targetRms / Math.max(1e-8, Math.sqrt(energy / data.length)), .71 / Math.max(1e-8, peak));
  for (let i = 0; i < data.length; i++) data[i] *= gain;
  return data;
}

function rooftopSound(id: string, sampleRate: number): Float32Array | null {
  const seconds = Object.hasOwn(rooftopCueSeconds, id) ? rooftopCueSeconds[id] : undefined;
  if (!seconds) return null;
  checkedRate(sampleRate);
  const data = new Float32Array(Math.ceil(seconds * sampleRate)), random = randomSource(id === 'flood-power-off' ? 193391 : 799337);
  const broadAlpha = 1 - Math.exp(-tau * 2200 / sampleRate), lowAlpha = 1 - Math.exp(-tau * 440 / sampleRate);
  const pulse = (time: number, start: number, duration: number, attack = .012, release = .02) => {
    const q = time - start;
    if (q <= 0 || q >= duration) return 0;
    const a = Math.min(1, q / attack), r = Math.min(1, (duration - q) / release);
    return (.5 - .5 * Math.cos(Math.PI * a)) * (.5 - .5 * Math.cos(Math.PI * r));
  };
  let broad = 0, low = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate, n = random(); broad += broadAlpha * (n - broad); low += lowAlpha * (n - low);
    if (id === 'flood-alert') {
      // Three fixed-pitch electronic alarm beeps; no vocal model or siren glide.
      for (const [at, f] of [[.06, 880], [.5, 660], [.94, 880]]) {
        data[i] += (Math.sin(tau * f * t) * .3 + Math.sin(tau * f * 2 * t) * .045) * pulse(t, at, .29, .018, .025);
      }
    } else if (id === 'flood-message-sent') {
      // Brief same-pitch double acknowledgement, separate from the victory melody.
      for (const [at, gain] of [[.025, .23], [.19, .15]]) {
        data[i] += Math.sin(tau * 1040 * t) * gain * pulse(t, at, .12, .014, .035);
      }
    } else if (id === 'flood-power-off') {
      for (const [at, gain] of [[.035, .42], [.17, .3]]) {
        const q = t - at;
        if (q > 0 && q < .17) data[i] += (broad * .65 + low * .3 + Math.sin(tau * 175 * q) * .23) * gain * Math.exp(-q * 24) * pulse(t, at, .17, .004, .025);
      }
    } else {
      const rustle = pulse(t, .03, .38, .04, .08) * (.72 + .28 * Math.sin(tau * 9 * t));
      const zip = pulse(t, .34, .42, .025, .055), teeth = Math.pow(.5 + .5 * Math.sin(tau * (68 * t + 38 * t * t)), 4);
      data[i] = low * .4 * rustle + (broad - low) * .38 * zip * (.25 + .75 * teeth);
    }
  }
  return finishRooftopCue(data, sampleRate, id === 'flood-alert' ? .17 : id === 'flood-message-sent' ? .1 : .12);
}

const cueSeconds: Record<string, number> = { 'flood-surge': 1.8, 'flood-water-impact': 1.05, 'flood-high-step': .95 };
export function floodSound(id: string, sampleRate = 22050): Float32Array | null {
  const rooftop = rooftopSound(id, sampleRate); if (rooftop) return rooftop;
  const seconds = Object.hasOwn(cueSeconds, id) ? cueSeconds[id] : undefined;
  if (!seconds) return null;
  checkedRate(sampleRate);
  const data = new Float32Array(Math.ceil(seconds * sampleRate)), random = randomSource(id === 'flood-surge' ? 43033 : id === 'flood-water-impact' ? 74471 : 91493);
  const lowAlpha = 1 - Math.exp(-tau * 190 / sampleRate), broadAlpha = 1 - Math.exp(-tau * 1800 / sampleRate);
  let low = 0, broad = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate, n = random(); low += lowAlpha * (n - low); broad += broadAlpha * (n - broad);
    if (id === 'flood-surge') data[i] = (low * 2.5 + broad * .6) * Math.pow(Math.sin(Math.PI * i / (data.length - 1)), 1.1);
    else if (id === 'flood-water-impact') data[i] = (low * 2.2 + broad * .8) * Math.min(1, t / .026) * Math.exp(-t * 3.5);
    else for (const at of [.025, .31, .61]) {
      const q = t - at;
      if (q >= 0 && q < .24) data[i] += (low * .95 + broad * .22 + Math.sin(tau * 125 * q) * .13) * Math.exp(-q * 22) * Math.min(1, q / .008);
    }
  }
  normalise(data, id === 'flood-high-step' ? .13 : .19);
  const fade = Math.round(sampleRate * .015);
  for (let i = 0; i < fade; i++) { const gain = i / fade; data[i] *= gain; data[data.length - 1 - i] *= gain; }
  return data;
}
