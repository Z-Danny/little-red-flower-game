'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Input, LevelPackage, Run } from '@/app/game/runtime/schema';
import type { PlacementProject } from '@/app/game/placement/model';
import {
  PlacementSoundTimeline,
  synthesize,
  type Sound,
  type SoundEvent,
  type PlacementSounds,
} from '@/app/game/placement/sound';
import { configuredAudioFrame } from '@/app/game/runtime/response';
import { audioBytes } from '@/app/game/response/audio';
import { useResponseAudio } from '../response/use-response-audio';
import { stageState } from '@/app/game/placement/flow';

class ObjectAudio {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  private pending: SoundEvent[] = [];
  private loading: Promise<void> | null = null;
  private active = false;
  private muted = false;
  private disposed = false;
  missing: string[] = [];
  log: (SoundEvent & { played: boolean })[] = [];
  constructor(private audio: PlacementSounds) {}
  async unlock() {
    if (this.disposed) return;
    try {
      if (!this.ctx) {
        const ctx = (this.ctx = new AudioContext());
        this.gain = ctx.createGain();
        this.gain.gain.value = 0.7;
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.ratio.value = 8;
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.gain.connect(compressor);
        compressor.connect(this.analyser);
        this.analyser.connect(ctx.destination);
        const sounds = [
          ...Object.values(this.audio.objects).flatMap(Object.values),
          ...Object.values(this.audio.actions)
            .flat()
            .map((c) => c.sound),
          ...Object.values(this.audio.stages ?? {}),
        ];
        this.loading = Promise.all(
          sounds.map(async (sound) => {
            const key = JSON.stringify(sound);
            try {
              if (sound.src) {
                const decoded = await ctx.decodeAudioData(
                  await audioBytes(sound.src),
                );
                if (decoded.duration > 5 || decoded.duration < 0.02)
                  throw new Error('音效须为 0.02～5 秒');
                let peak = 0;
                for (let ch = 0; ch < decoded.numberOfChannels; ch++)
                  for (const v of decoded.getChannelData(ch))
                    peak = Math.max(peak, Math.abs(v));
                if (peak < 0.001) throw new Error('音频为空白');
                if (!this.disposed) this.buffers.set(key, decoded);
              } else {
                const samples = synthesize(sound),
                  buffer = ctx.createBuffer(1, samples.length, 22050);
                buffer.copyToChannel(samples, 0);
                this.buffers.set(key, buffer);
              }
            } catch {
              this.missing.push(sound.description);
            }
          }),
        ).then(() => undefined);
      }
      await this.ctx.resume();
      await this.loading;
      if (!this.disposed && this.active) {
        const pending = this.pending;
        this.pending = [];
        pending.forEach((e) => this.play(e));
      }
    } catch {
      this.missing = [...new Set([...this.missing, '音频设备不可用'])];
    }
  }
  state(active: boolean, muted: boolean, gain: number) {
    this.active = active;
    this.muted = muted;
    if (this.gain && this.ctx)
      this.gain.gain.setValueAtTime(
        muted ? 0 : gain * 0.8,
        this.ctx.currentTime,
      );
    if (!active || muted) {
      this.stop();
      this.pending = [];
    }
    if (this.ctx && !active && this.ctx.state === 'running')
      void this.ctx.suspend().catch(() => undefined);
    if (this.ctx && active && this.ctx.state === 'suspended')
      void this.ctx.resume().catch(() => undefined);
  }
  play(event: SoundEvent) {
    if (this.disposed || !this.active || this.muted) return;
    const buffer = this.buffers.get(JSON.stringify(event.sound));
    if (!this.ctx || !buffer) {
      if (!this.missing.length)
        this.pending = [...this.pending, event].slice(-8);
      return;
    }
    if (this.sources.size >= 6) {
      const source = this.sources.values().next().value!;
      source.stop();
      this.sources.delete(source);
    }
    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = event.sound.gain;
    source.connect(gain);
    gain.connect(this.gain!);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start();
    this.log = [...this.log, { ...event, played: true }].slice(-300);
  }
  status() {
    const data = new Float32Array(256);
    this.analyser?.getFloatTimeDomainData(data);
    return {
      state: this.ctx?.state ?? 'locked',
      loaded: this.buffers.size,
      missing: [...this.missing],
      playing: this.sources.size,
      log: this.log,
      rms: Math.sqrt(data.reduce((v, n) => v + n * n, 0) / data.length),
    };
  }
  stop() {
    for (const s of this.sources) s.stop();
    this.sources.clear();
  }
  reset() {
    this.stop();
    this.pending = [];
    this.log = [];
  }
  dispose() {
    this.disposed = true;
    this.reset();
    void this.ctx?.close().catch(() => undefined);
  }
}

export function usePlacementAudio(
  project: PlacementProject,
  pack: LevelPackage,
  run: Run,
  active: boolean,
) {
  // Fire ambience remains opt-in. Object effects are played exactly once by the generic layer.
  const ambienceCues = useMemo(
    () =>
      project.audio
        ? {
            ...pack.skin.response?.cues,
            milestones: pack.skin.response?.cues.milestones ?? {},
            actions: {},
          }
        : pack.skin.response?.cues,
    [project.audio, pack],
  );
  const ambience = useResponseAudio(
    configuredAudioFrame(pack, run, active),
    ambienceCues,
  );
  const director = useRef<ObjectAudio | null>(null),
    timeline = useRef<PlacementSoundTimeline | null>(null);
  const stageCue = useRef('');
  const [status, setStatus] = useState({
    state: 'locked',
    loaded: 0,
    missing: [] as string[],
    playing: 0,
    log: [] as (SoundEvent & { played: boolean })[],
    rms: 0,
  });
  const latest = useRef({ active, settings: ambience.settings });
  latest.current = { active, settings: ambience.settings };
  useEffect(() => {
    if (!project.audio) return;
    const d = new ObjectAudio(project.audio);
    director.current = d;
    timeline.current = new PlacementSoundTimeline(pack, project.audio);
    const sync = () => {
      const c = latest.current;
      d.state(c.active && !document.hidden, c.settings.muted, c.settings.sfx);
    };
    document.addEventListener('visibilitychange', sync);
    sync();
    const timer = setInterval(() => setStatus(d.status()), 120);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
      d.dispose();
      director.current = null;
      timeline.current = null;
    };
  }, [project.audio, pack]);
  useEffect(() => {
    director.current?.state(
      active && !document.hidden,
      ambience.settings.muted,
      ambience.settings.sfx,
    );
  }, [active, ambience.settings]);
  useEffect(() => {
    if (active)
      timeline.current
        ?.advance(run.elapsed)
        .forEach((e) => director.current?.play(e));
  }, [run.elapsed, active]);
  useEffect(() => {
    const state = stageState(project.flow, run),
      cue = state && project.audio?.stages?.[state.stage.id];
    if (!active || !state || !cue) return;
    const key = `${state.stage.id}-${state.stage.shake ? Math.floor(state.age / 850) : 0}`;
    if (key !== stageCue.current) {
      stageCue.current = key;
      director.current?.play({
        object: 'scene',
        event: state.stage.id,
        sound: cue,
        time: run.elapsed,
      });
    }
  }, [project, run.elapsed, active]);
  const object = (id: string, event: 'pickup' | 'return') => {
    const cue = timeline.current?.object(id, event, run.elapsed);
    if (cue) director.current?.play(cue);
    else if (event === 'pickup') ambience.pickup();
  };
  return {
    ...ambience,
    status: { ...ambience.status, objectAudio: status },
    unlock: () => {
      ambience.unlock();
      void director.current?.unlock();
    },
    pickup: (id: string) => object(id, 'pickup'),
    cancel: (id: string) => object(id, 'return'),
    interact: (input: Input, currentPack = pack) =>
      timeline.current
        ?.begin(run, input, currentPack)
        .forEach((e) => director.current?.play(e)),
    reset: () => {
      ambience.reset();
      timeline.current?.reset();
      director.current?.reset();
      stageCue.current = '';
      setStatus((s) => ({ ...s, log: [] }));
    },
  };
}
