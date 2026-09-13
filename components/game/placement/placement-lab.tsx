'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as Pointer,
} from 'react';
import { createRun, enabled, reduceRun } from '@/app/game/runtime/engine';
import { localPoint, pickObject, scenePoses } from '@/app/game/runtime/scene';
import type { Box, Input, Point, Pose } from '@/app/game/runtime/schema';
import { flowPack, stageState } from '@/app/game/placement/flow';
import {
  buildBatch,
  parseBatch,
  type PlacementBatch,
} from '@/app/game/placement/production';
import { examplePlan } from '@/app/game/placement/example-plan';
import { readDraft, writeDraft } from '@/app/game/placement/draft-store';
import {
  clone,
  compileProject,
  dropInput,
  explainInput,
  inspectProject,
  parseProject,
  simulateProject,
  type PlacementProject,
  type Simulation,
} from '@/app/game/placement/model';
import { kitchenProject } from '@/app/game/placement/sample';
import { alphaAt, loadArt, type Art } from '../configured/art';
import { render, type Drag } from '../configured/renderer';
import { usePlacementAudio } from './use-placement-audio';

const SAVE_KEY = 'little-red-flower-placement-lab-v1';
type Trace = { time: number; status: string; text: string };
type Layer = 'home' | 'zone' | 'snap';
const round = (v: number) => Math.round(v * 10) / 10;
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function Numeric({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="pl-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber))
            onChange(e.target.valueAsNumber);
        }}
      />
    </label>
  );
}
export function PlacementLab({
  onBack,
  initialBatch,
}: {
  onBack?: () => void;
  initialBatch?: PlacementBatch;
}) {
  const [batch, setBatch] = useState(
    () => initialBatch ?? buildBatch(examplePlan),
  );
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      batch.results.findIndex((r) => r.status === 'ready'),
    ),
  );
  const [message, setMessage] = useState(
    '导入策划案生产卡后，可逐关检查与试玩。',
  );
  const [revision, setRevision] = useState(0);
  const firstMount = useRef(true);
  useEffect(() => {
    firstMount.current = false;
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const result = batch.results[index];
  return (
    <>
      <section className="pl-batch-bar">
        <b>关卡工作台</b>
        <label>
          当前关卡{' '}
          <select
            aria-label="批量关卡"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {batch.results.map((r, i) => (
              <option key={`${i}-${r.id}`} value={i}>
                {r.status === 'ready' ? '✓' : '需补充'} {r.title}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => input.current?.click()}>
          导入策划案 / 批量包
        </button>
        <button onClick={() => download(`${batch.id}.batch.json`, batch)}>
          导出当前批量包
        </button>
        <small>
          {batch.results.filter((r) => r.status === 'ready').length}/
          {batch.results.length} 关可试玩 · {message}
        </small>
        <input
          ref={input}
          type="file"
          hidden
          accept=".json"
          aria-label="策划案文件"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const next = parseBatch(await file.text());
              setBatch(next);
              setRevision((r) => r + 1);
              setIndex(
                Math.max(
                  0,
                  next.results.findIndex((r) => r.status === 'ready'),
                ),
              );
              setMessage('已逐关编译并检查，待补充项可从列表查看。');
            } catch (error) {
              setMessage(`导入失败：${String(error)}`);
            }
            e.target.value = '';
          }}
        />
      </section>
      {result?.project ? (
        <PlacementEditor
          key={`${batch.id}-${revision}-${index}`}
          restoreDraft={firstMount.current && revision === 0}
          initialProject={result.project}
          onBack={onBack}
          onProjectChange={(project) => {
            const issues = inspectProject(project);
            const status =
              project.audio && !issues.some((i) => i.severity === 'error')
                ? ('ready' as const)
                : ('blocked' as const);
            setBatch((previous) => ({
              ...previous,
              results: previous.results.map((r, i) =>
                i === index
                  ? {
                      ...r,
                      project,
                      status,
                      issues,
                      id: project.pack.rules.id,
                      title: project.pack.rules.title,
                    }
                  : r,
              ),
            }));
          }}
        />
      ) : (
        <section className="pl-blocked">
          <h1>{result?.title} · 需要补充</h1>
          {result?.issues.map((i, n) => (
            <p key={n}>
              {i.path}：{i.message}
            </p>
          ))}
          <p>修正生产卡后重新导入，本关不会被标记为可试玩。</p>
          {onBack && <button onClick={onBack}>返回游戏</button>}
        </section>
      )}
    </>
  );
}
function PlacementEditor({
  onBack,
  initialProject,
  onProjectChange,
  restoreDraft,
}: {
  onBack?: () => void;
  initialProject: PlacementProject;
  onProjectChange: (p: PlacementProject) => void;
  restoreDraft: boolean;
}) {
  const saveKey = `${SAVE_KEY}:${initialProject.pack.rules.id}`;
  const [project, setProject] = useState<PlacementProject>(() =>
    clone(initialProject),
  );
  const [mode, setMode] = useState<'play' | 'edit'>('play'),
    [tab, setTab] = useState('placement');
  const [objectId, setObjectId] = useState('lid'),
    [layer, setLayer] = useState<Layer>('home');
  const [paused, setPaused] = useState(true),
    [guides, setGuides] = useState(false),
    [ready, setReady] = useState(false);
  const [notice, setNotice] = useState(
      '点击“开始试玩”，也可以先进入摆放编辑。',
    ),
    [error, setError] = useState('');
  const [json, setJson] = useState<string | null>(null),
    [jsonError, setJsonError] = useState('');
  const [results, setResults] = useState<Simulation[]>([]),
    [trace, setTrace] = useState<Trace[]>([]),
    [selected, setSelected] = useState<string | null>(null);
  const [disabledObjects, setDisabledObjects] = useState<string[]>([]);
  const [undo, setUndo] = useState<PlacementProject[]>([]),
    [redo, setRedo] = useState<PlacementProject[]>([]);
  const [saved, setSaved] = useState('尚未保存'),
    [mounted, setMounted] = useState(false);
  const issues = useMemo(() => inspectProject(project), [project]);
  const valid = !issues.some((i) => i.severity === 'error');
  const pack = useMemo(() => compileProject(project), [project]);
  const [run, setRun] = useState(() => createRun(pack));
  const canvas = useRef<HTMLCanvasElement>(null),
    art = useRef<Art | null>(null),
    drag = useRef<Drag | null>(null);
  const editDrag = useRef<{
    object: string;
    pointerId: number;
    start: Point;
    box: Box;
    project: PlacementProject;
  } | null>(null);
  const file = useRef<HTMLInputElement>(null),
    imageFile = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const current = useRef({
    project,
    pack,
    run,
    paused,
    mode,
    guides,
    objectId,
    layer,
    selected,
    ready,
    disabledObjects,
  });
  current.current = {
    project,
    pack,
    run,
    paused,
    mode,
    guides,
    objectId,
    layer,
    selected,
    ready,
    disabledObjects,
  };
  const action = project.pack.rules.interactions.find(
    (r) => r.source === objectId && r.outcome === 'correct',
  );
  const placement = action && project.placements[action.id];
  const zone = action?.target && project.pack.skin.zones[action.target];
  const activeBox =
    (layer === 'snap' && placement
      ? placement.snap
      : layer === 'zone' && zone
        ? zone
        : project.pack.skin.poses[objectId]) ??
    Object.values(project.pack.skin.poses)[0];
  useEffect(() => {
    if (!project.pack.skin.poses[objectId]) {
      setObjectId(Object.keys(project.pack.skin.poses)[0]);
      setLayer('home');
    }
  }, [project, objectId]);
  const stage = stageState(project.flow, run);
  const runtimePack = flowPack(project, pack, run);
  const audio = usePlacementAudio(
    project,
    pack,
    run,
    ready && mode === 'play' && !paused && !stage?.missed,
  );
  const hold = useRef<{ source: string; started: number; ms: number } | null>(
    null,
  );
  const [holdProgress, setHoldProgress] = useState(0);
  const releaseHold = () => {
    if (hold.current) audio.cancel(hold.current.source);
    hold.current = null;
    setHoldProgress(0);
  };
  const stopHold = useRef(releaseHold);
  stopHold.current = releaseHold;
  const interaction = useRef<(input: Input) => void>(() => undefined);
  useEffect(() => {
    onProjectChange(project);
  }, [project]);
  useEffect(() => {
    if (paused || mode !== 'play' || stage?.missed) releaseHold();
  }, [paused, mode, stage?.missed]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stopHold.current();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  const append = (row: Trace) => setTrace((v) => [row, ...v].slice(0, 120));
  const reset = (start = false) => {
    releaseHold();
    setDisabledObjects([]);
    drag.current = null;
    setSelected(null);
    setRun(createRun(pack));
    setTrace([]);
    setPaused(!start);
    audio.reset();
    setNotice(
      start ? (pack.rules.briefing ?? '开始试玩') : '已重置，点击开始试玩。',
    );
  };
  const commit = (next: PlacementProject, history = true) => {
    setDisabledObjects([]);
    if (history) {
      setUndo((v) => [...v.slice(-29), clone(project)]);
      setRedo([]);
    }
    setProject(next);
    setPaused(true);
    setSelected(null);
    drag.current = null;
    setResults([]);
    setRun(createRun(compileProject(next)));
    audio.reset();
  };
  const change = (edit: (p: PlacementProject) => void) => {
    const next = clone(project);
    edit(next);
    commit(next);
  };
  useEffect(() => {
    if (!restoreDraft) {
      setMounted(true);
      return;
    }
    let alive = true;
    readDraft(saveKey)
      .then((stored) => {
        if (!alive) return;
        if (stored) {
          const next = parseProject(JSON.stringify(stored));
          setProject(next);
          setRun(createRun(compileProject(next)));
          setNotice('已恢复上次保存的测试配置。');
          setSaved('已恢复本机草稿');
        }
      })
      .catch(() => {
        if (!alive) return;
        setSaved('草稿读取失败，已载入厨房样例');
      })
      .finally(() => {
        if (alive) setMounted(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!mounted) return;
    if (!valid) {
      setSaved('存在错误，草稿未覆盖');
      return;
    }
    const timer = setTimeout(async () => {
      try {
        await writeDraft(saveKey, project);
        setSaved('已保存到本机');
      } catch {
        setSaved('本机空间不足，请导出 JSON 保存');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [project, mounted, valid]);
  // Only the manifest changes decoded artwork; geometry edits must not reload every sprite.
  const manifestKey = JSON.stringify(pack.skin.assets);
  useEffect(() => {
    let active = true;
    setReady(false);
    setError('');
    loadArt(pack.skin)
      .then((a) => {
        if (active) {
          art.current = a;
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(String(e.message));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifestKey]);
  useEffect(() => {
    let frame = 0,
      last = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = (now: number) => {
      const c = current.current,
        ms = Math.min(100, now - last);
      last = now;
      if (
        c.ready &&
        !c.paused &&
        c.mode === 'play' &&
        !document.hidden &&
        !stageState(c.project.flow, c.run)?.missed
      ) {
        if (hold.current) {
          const progress = Math.min(
            1,
            (c.run.elapsed - hold.current.started) / hold.current.ms,
          );
          setHoldProgress(progress);
          if (progress >= 1) {
            const source = hold.current.source;
            hold.current = null;
            setHoldProgress(0);
            interaction.current({ source, mode: 'tap' });
          }
        }
        setRun((r) =>
          reduceRun(flowPack(c.project, c.pack, r, reduced), r, {
            type: 'tick',
            ms,
          }),
        );
      }
      const node = canvas.current,
        ctx = node?.getContext('2d');
      if (node && ctx && art.current && c.ready) {
        const rect = node.getBoundingClientRect(),
          dpr = Math.min(devicePixelRatio || 1, 2);
        const w = Math.round(rect.width * dpr),
          h = Math.round(rect.height * dpr);
        if (node.width !== w || node.height !== h) {
          node.width = w;
          node.height = h;
        }
        ctx.setTransform(
          w / c.pack.skin.world.width,
          0,
          0,
          h / c.pack.skin.world.height,
          0,
          0,
        );
        let drawing = flowPack(c.project, c.pack, c.run, reduced),
          state = c.run;
        if (c.mode === 'edit') {
          state = createRun(c.pack);
          drawing = {
            ...c.pack,
            skin: {
              ...c.pack.skin,
              states: [],
              effects: [],
              response: undefined,
              poses: { ...c.pack.skin.poses },
            },
          };
          const rule = c.pack.rules.interactions.find(
            (r) => r.source === c.objectId && r.outcome === 'correct',
          );
          const snap = rule && c.project.placements[rule.id]?.snap;
          if (c.layer === 'snap' && snap) drawing.skin.poses[c.objectId] = snap;
        }
        if (c.mode === 'play' && c.project.flow?.attachments?.length) {
          const actual = scenePoses(drawing, state, reduced);
          const attachments = c.project.flow.attachments.filter(
            (a) =>
              a.when.every((g) => state.resolved.includes(g)) &&
              !(a.unless ?? []).some((g) => state.resolved.includes(g)),
          );
          drawing = {
            ...drawing,
            skin: {
              ...drawing.skin,
              states: [
                ...drawing.skin.states,
                ...attachments.map((a) => {
                  const parent = actual.find((p) => p.id === a.follows)!;
                  return {
                    object: a.object,
                    when: { all: a.when },
                    pose: {
                      x: parent.x + parent.w * a.offset.x,
                      y: parent.y + parent.h * a.offset.y,
                      w: parent.w * a.offset.w,
                      h: parent.h * a.offset.h,
                    },
                  };
                }),
              ],
            },
          };
        }
        render(
          ctx,
          drawing,
          art.current,
          state,
          c.mode === 'play' ? drag.current : null,
          c.mode === 'play' ? c.selected : c.objectId,
          reduced,
        );
        if (c.mode === 'play' && c.run.phase === 'playing') {
          for (const id of c.disabledObjects) {
            const b = c.pack.skin.poses[id];
            ctx.save();
            ctx.fillStyle = '#9e3e3e';
            ctx.strokeStyle = '#fff2dd';
            ctx.lineWidth = 4;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.beginPath();
            ctx.moveTo(b.x + 12, b.y + 12);
            ctx.lineTo(b.x + b.w - 12, b.y + b.h - 12);
            ctx.moveTo(b.x + b.w - 12, b.y + 12);
            ctx.lineTo(b.x + 12, b.y + b.h - 12);
            ctx.stroke();
            ctx.restore();
          }
          const flowState = stageState(c.project.flow, c.run);
          if (flowState && (flowState.index > 0 || flowState.missed)) {
            ctx.save();
            ctx.globalAlpha = 0.65;
            ctx.fillStyle = '#b6c4ca';
            ctx.strokeStyle = '#65717d';
            ctx.lineWidth = 1.5;
            for (const d of c.project.flow?.debris ?? []) {
              ctx.beginPath();
              ctx.moveTo(d.x, d.y);
              ctx.lineTo(d.x + d.w, d.y + d.h * 0.5);
              ctx.lineTo(d.x + d.w * 0.3, d.y + d.h);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
            }
            ctx.restore();
          }
          const dangerRule =
            c.run.action &&
            drawing.rules.interactions.find(
              (r) => r.id === c.run.action?.rule && r.outcome === 'danger',
            );
          if (dangerRule) {
            const b = dangerRule.target
              ? drawing.skin.zones[dangerRule.target]
              : drawing.skin.poses[dangerRule.source];
            ctx.save();
            ctx.fillStyle = '#a3434338';
            ctx.strokeStyle = '#d17661';
            ctx.lineWidth = 4;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            ctx.font = 'bold 21px sans-serif';
            ctx.fillStyle = '#702c29';
            ctx.fillText(
              '风险预览 · 已中断',
              Math.min(b.x, 510),
              b.y + b.h + 24,
            );
            ctx.restore();
          }
        }
        if (c.guides || c.mode === 'edit') {
          ctx.save();
          ctx.lineWidth = 2;
          ctx.font = '18px sans-serif';
          ctx.textBaseline = 'top';
          const mark = (b: Box, color: string, text: string) => {
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            ctx.fillText(text, b.x + 3, Math.max(2, b.y - 24));
          };
          for (const [id, b] of Object.entries(c.pack.skin.zones))
            mark(b, '#66ebd0', `接收区 · ${id}`);
          const rule = c.pack.rules.interactions.find(
              (r) => r.source === c.objectId && r.outcome === 'correct',
            ),
            p = rule && c.project.placements[rule.id];
          if (p) {
            mark(p.snap, '#ffcb72', '最终落位');
            const b =
              c.mode === 'edit' && c.layer === 'snap'
                ? p.snap
                : c.pack.skin.poses[c.objectId];
            ctx.setLineDash([]);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(
              b.x + b.w * p.anchor.x,
              b.y + b.h * p.anchor.y,
              6,
              0,
              Math.PI * 2,
            );
            ctx.fill();
            const home = c.pack.skin.poses[c.objectId];
            ctx.strokeStyle = '#ffcb72';
            ctx.beginPath();
            ctx.moveTo(home.x + home.w / 2, home.y + home.h / 2);
            p.via.forEach((v) =>
              ctx.lineTo(v.x + home.w / 2, v.y + home.h / 2),
            );
            ctx.lineTo(p.snap.x + p.snap.w / 2, p.snap.y + p.snap.h / 2);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
  const previousResolved = useRef('');
  useEffect(() => {
    const key = run.resolved.join('|');
    if (key && key !== previousResolved.current)
      append({
        time: run.elapsed,
        status: 'commit',
        text: `动画结束 → 已完成：${run.resolved.map((g) => pack.rules.goals.find((x) => x.id === g)?.label).join('、')}`,
      });
    previousResolved.current = key;
  }, [run.resolved, run.elapsed, pack.rules.goals]);
  useEffect(() => {
    if (json !== null) dialog.current?.showModal();
    else dialog.current?.close();
  }, [json !== null]);
  const point = (e: Pointer<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * pack.skin.world.width) / rect.width,
      y: ((e.clientY - rect.top) * pack.skin.world.height) / rect.height,
    };
  };
  const interact = (input: Input) => {
    if (
      paused ||
      mode !== 'play' ||
      !ready ||
      run.action ||
      run.phase !== 'playing' ||
      stage?.missed ||
      disabledObjects.includes(input.source)
    )
      return;
    const result = explainInput(runtimePack, run, input);
    if (result.rule && project.flow?.disableAfter?.[result.rule])
      setDisabledObjects((v) => [
        ...new Set([...v, ...project.flow!.disableAfter![result.rule]]),
      ]);
    if (
      result.status === 'miss' &&
      stage &&
      pack.rules.interactions.some(
        (r) =>
          r.source === input.source &&
          r.target === input.target &&
          !stage.stage.actions.includes(r.id),
      )
    )
      result.message = `当前是“${stage.stage.title}”，请先按本阶段提示避险。`;
    audio.interact(input, runtimePack);
    setNotice(result.message);
    append({
      time: run.elapsed,
      status: result.status,
      text: `${input.source} → ${input.target ?? '点击'}：${result.message}`,
    });
    setRun((r) => reduceRun(runtimePack, r, { type: 'interact', input }));
    setSelected(null);
  };
  interaction.current = interact;
  const press = (source: string) => {
    const rule = runtimePack.rules.interactions.find(
      (r) =>
        r.source === source && r.mode === 'tap' && project.flow?.holds[r.id],
    );
    const spec = rule && project.flow?.holds[rule.id];
    if (
      !spec ||
      !enabled(
        pack.rules.objects.find((o) => o.id === source)!,
        run,
      ) ||
      paused ||
      run.action ||
      stage?.missed ||
      run.phase !== 'playing'
    )
      return false;
    const result = explainInput(runtimePack, run, { source, mode: 'tap' });
    if (result.status !== 'correct') {
      interact({ source, mode: 'tap' });
      return true;
    }
    audio.unlock();
    audio.pickup(source);
    hold.current = { source, started: run.elapsed, ms: spec.ms };
    setNotice(spec.instruction);
    return true;
  };
  const down = (e: Pointer<HTMLCanvasElement>) => {
    if (!ready || !art.current) return;
    audio.unlock();
    const p = point(e);
    if (mode === 'edit') {
      if (editDrag.current) return;
      let id = objectId,
        b = activeBox;
      if (layer === 'home') {
        const hit = [...Object.entries(pack.skin.poses)]
          .sort((a, b) => b[1].depth - a[1].depth)
          .find(([, b]) => alphaAt(art.current!, b.asset, localPoint(b, p)));
        if (hit) {
          id = hit[0];
          b = project.pack.skin.poses[id];
          setObjectId(id);
        }
      }
      if (!b || p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h)
        return;
      editDrag.current = {
        object: id,
        pointerId: e.pointerId,
        start: p,
        box: { ...b },
        project: clone(project),
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (
      paused ||
      run.action ||
      run.phase !== 'playing' ||
      drag.current ||
      stage?.missed
    )
      return;
    const id = pickObject(runtimePack, run, p, (asset, local) =>
      alphaAt(art.current!, asset, local),
    );
    if (!id || disabledObjects.includes(id)) return;
    setObjectId(id);
    const o = pack.rules.objects.find((o) => o.id === id)!;
    if (o.input === 'tap') {
      if (press(id)) {
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      audio.pickup(id);
      interact({ source: id, mode: 'tap' });
      return;
    }
    const b = scenePoses(pack, run).find((b) => b.id === id)!;
    drag.current = {
      id,
      point: p,
      offset: { x: p.x - b.x, y: p.y - b.y },
      start: p,
      pointerId: e.pointerId,
      moved: false,
    };
    setSelected(id);
    audio.pickup(id);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const changeBox = (
    next: PlacementProject,
    patch: Partial<Pose>,
    id = objectId,
  ) => {
    const r = next.pack.rules.interactions.find(
        (r) => r.source === id && r.outcome === 'correct',
      ),
      p = r && next.placements[r.id];
    const target =
      layer === 'snap' && p
        ? p.snap
        : layer === 'zone' && r?.target
          ? next.pack.skin.zones[r.target]
          : next.pack.skin.poses[id];
    Object.assign(target, patch);
  };
  const move = (e: Pointer<HTMLCanvasElement>) => {
    const p = point(e),
      d = drag.current,
      ed = editDrag.current;
    if (hold.current) {
      const b = pack.skin.poses[hold.current.source];
      if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h)
        releaseHold();
      return;
    }
    if (ed && ed.pointerId === e.pointerId) {
      const next = clone(ed.project),
        b = ed.box,
        world = project.pack.skin.world;
      changeBox(
        next,
        {
          x: round(
            Math.max(0, Math.min(world.width - b.w, b.x + p.x - ed.start.x)),
          ),
          y: round(
            Math.max(0, Math.min(world.height - b.h, b.y + p.y - ed.start.y)),
          ),
        },
        ed.object,
      );
      setProject(next);
      return;
    }
    if (!d || d.pointerId !== e.pointerId) return;
    d.point = p;
    if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 5) d.moved = true;
  };
  const end = (e: Pointer<HTMLCanvasElement>, cancel = false) => {
    releaseHold();
    const ed = editDrag.current,
      d = drag.current;
    if (ed?.pointerId === e.pointerId) {
      editDrag.current = null;
      if (cancel) setProject(ed.project);
      else {
        setUndo((v) => [...v.slice(-29), ed.project]);
        setRedo([]);
        setResults([]);
      }
    }
    if (d?.pointerId === e.pointerId) {
      drag.current = null;
      if (!cancel && d.moved) {
        const b = scenePoses(pack, run).find((p) => p.id === d.id)!;
        const p = point(e);
        interact(
          dropInput(project, d.id, {
            ...b,
            x: p.x - d.offset.x,
            y: p.y - d.offset.y,
          }),
        );
      } else audio.cancel(d.id);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const modeTo = (value: 'edit' | 'play') => {
    setMode(value);
    setPaused(true);
    drag.current = null;
    editDrag.current = null;
    setSelected(null);
    setRun(createRun(pack));
    audio.reset();
    setNotice(
      value === 'edit'
        ? '选择初始位置、接收区或最终落位；可直接拖动画面中的选中区域。'
        : '点击开始试玩，配置改动已生效。',
    );
  };
  const importText = (text: string) => {
    const next = parseProject(text);
    commit(next);
    setObjectId(Object.keys(next.pack.skin.poses)[0]);
    setLayer('home');
    setMode('edit');
    setNotice('配置已载入，检查通过后可以开始试玩。');
  };
  const uploadImage = async (f: File) => {
    if (
      !['image/png', 'image/webp'].includes(f.type) ||
      f.size > 8 * 1024 * 1024
    )
      throw new Error('请使用 8 MB 以内的 PNG 或 WebP');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('图片无法解码'));
      img.src = data;
    });
    if (img.width * img.height > 16_000_000)
      throw new Error('图片超过 1600 万像素，请缩小后导入');
    const asset = project.pack.skin.poses[objectId].asset;
    change((p) => {
      p.pack.skin.assets[asset].src = data;
    });
    setNotice(`已替换 ${asset} 素材，请检查透明边缘、风格和落位。`);
  };
  const errors = issues.filter((i) => i.severity === 'error');
  return (
    <main
      className="pl-app"
      data-placement-engine="v2"
      data-phase={run.phase}
      data-resolved={run.resolved.join(',')}
      data-ready={ready}
      data-stage={stage?.stage.id ?? 'single'}
      data-audio-log={JSON.stringify(
        audio.status.objectAudio.log.map((e) => ({
          object: e.object,
          event: e.event,
          played: e.played,
        })),
      )}
      data-object-audio={audio.status.objectAudio.loaded}
      data-elapsed={Math.floor(run.elapsed)}
    >
      <header className="pl-header">
        <div className="pl-brand">
          <span className="pl-mark">✳</span>
          <div>
            <h1>
              放置测试引擎{' '}
              <small>
                {project.pack.rules.id === 'placement-kitchen-test'
                  ? '01 / 厨房样例'
                  : '自定义关卡'}
              </small>
            </h1>
            <p>把逻辑、位置与演出放到同一张画布上验证</p>
          </div>
        </div>
        <div className="pl-header-actions">
          <span className="pl-save">{saved}</span>
          <button onClick={() => file.current?.click()}>导入配置</button>
          <button
            onClick={() =>
              download(`${project.pack.rules.id}.placement.json`, project)
            }
          >
            导出配置
          </button>
          {onBack && <button onClick={onBack}>返回游戏</button>}
        </div>
      </header>
      <input
        ref={file}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            importText(await f.text());
          } catch (error) {
            setNotice(`导入失败：${String(error)}`);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={imageFile}
        hidden
        type="file"
        accept="image/png,image/webp"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            await uploadImage(f);
          } catch (error) {
            setNotice(String(error));
          }
          e.target.value = '';
        }}
      />
      {stage && (
        <div className={`pl-phase ${stage.missed ? 'missed' : ''}`}>
          <b>
            {stage.index + 1}. {stage.stage.title}
          </b>
          <span>
            {stage.missed
              ? '本轮未完成避险动作，请重新练习'
              : stage.stage.durationMs
                ? `剩余 ${Math.max(0, Math.ceil((stage.stage.durationMs - stage.age) / 1000))} 秒`
                : `已用 ${Math.floor(stage.age / 1000)} 秒 · 建议 ${(stage.stage.recommendedMs ?? 45000) / 1000} 秒`}
          </span>
          <p>
            {stage.missed
              ? '晃动已停止。本训练未达标；点击重新练习后再试，现实中仍应按现场情况避险。'
              : stage.stage.instruction}
          </p>
          {stage.missed && (
            <button onClick={() => reset(true)}>重新练习震时避险</button>
          )}
          {holdProgress > 0 && (
            <progress aria-label="抓牢进度" value={holdProgress} max={1} />
          )}
        </div>
      )}
      <div className="pl-toolbar">
        <div className="pl-segment">
          <button aria-pressed={mode === 'play'} onClick={() => modeTo('play')}>
            ▷ 试玩
          </button>
          <button aria-pressed={mode === 'edit'} onClick={() => modeTo('edit')}>
            ⊞ 摆放编辑
          </button>
        </div>
        <span className="pl-toolbar-note">
          {mode === 'play'
            ? '支持直接拖拽，也可用下方按钮选择物品与目标'
            : '位置修改会同步动画终点和完成状态'}
        </span>
        <label className="pl-check">
          <input
            type="checkbox"
            checked={guides}
            onChange={(e) => setGuides(e.target.checked)}
          />
          显示辅助线
        </label>
      </div>
      <div className="pl-layout">
        <aside className="pl-card pl-overview">
          <div className="pl-eyebrow">样例 / SAMPLE</div>
          <h2>{project.pack.rules.title}</h2>
          <p>{project.pack.rules.description}</p>
          <ol className="pl-goals">
            {pack.rules.goals.map((g, i) => (
              <li key={g.id} data-done={run.resolved.includes(g.id)}>
                <span>{run.resolved.includes(g.id) ? '✓' : `0${i + 1}`}</span>
                {g.label}
              </li>
            ))}
          </ol>
          <div className="pl-note">{project.pack.rules.briefing}</div>
          <h3>这一轮重点检查</h3>
          <p>{project.review.spatial}</p>
          <div className="pl-style">
            <b>{project.style.name}</b>
            <p>{project.style.notes}</p>
          </div>
          <details>
            <summary>训练说明与常理要求</summary>
            {Object.values(project.review).map((text, i) => (
              <p key={i}>{text}</p>
            ))}
            <p>{pack.rules.safety}</p>
          </details>
          <button
            className="pl-link"
            onClick={() => {
              commit(clone(kitchenProject));
              setObjectId('lid');
              setLayer('home');
              setNotice('已恢复厨房样例，可用撤销返回。');
            }}
          >
            恢复厨房样例
          </button>
        </aside>
        <section className="pl-stage-column">
          <div className="pl-scene-heading">
            <b>{mode === 'play' ? '实时试玩' : '摆放画布'}</b>
            <span>
              {pack.skin.world.width} × {pack.skin.world.height} · 逻辑坐标
            </span>
          </div>
          <div className="pl-scene-wrap">
            <canvas
              ref={canvas}
              aria-label={`${project.pack.rules.title} 放置测试画布`}
              style={{
                aspectRatio: `${pack.skin.world.width}/${pack.skin.world.height}`,
                width: `min(100%, calc(var(--pl-canvas-height) * ${pack.skin.world.width / pack.skin.world.height}))`,
                height: 'auto',
                minHeight: 0,
                transform:
                  !paused &&
                  mode === 'play' &&
                  stage?.stage.shake &&
                  !stage.missed &&
                  !matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? `translateX(${Math.sin(run.elapsed / 60) * stage.stage.shake.pixels}px)`
                    : undefined,
              }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={(e) => end(e)}
              onPointerCancel={(e) => end(e, true)}
            />
            {(!ready || error) && (
              <div className="pl-loading">{error || '正在载入绘本素材…'}</div>
            )}
            {run.phase === 'complete' && mode === 'play' && (
              <div className="pl-complete">
                <span>✓</span>
                <h2>本轮测试完成</h2>
                <p>
                  {run.mistakes
                    ? `记录了 ${run.mistakes} 次错误，之后成功恢复。`
                    : '全部目标已完成。'}
                </p>
                <button onClick={() => reset(true)}>再测一次</button>
              </div>
            )}
          </div>
          <div className="pl-play-controls">
            {mode === 'play' ? (
              <>
                <button
                  className="pl-primary"
                  disabled={
                    !ready ||
                    !valid ||
                    run.phase === 'complete' ||
                    stage?.missed
                  }
                  onClick={() => {
                    audio.unlock();
                    setPaused(!paused);
                    setNotice(
                      paused
                        ? '试玩进行中，拖动物品或使用下面的选择按钮。'
                        : '已暂停，时间和动作停在当前状态。',
                    );
                  }}
                >
                  {paused
                    ? run.elapsed > 0
                      ? '继续试玩'
                      : '开始试玩'
                    : '暂停'}
                </button>
                <button onClick={() => reset(false)}>重置本轮</button>
                <button
                  aria-pressed={audio.settings.muted}
                  onClick={() => {
                    audio.unlock();
                    audio.setSettings((s) => ({ ...s, muted: !s.muted }));
                  }}
                >
                  {audio.settings.muted ? '打开声音' : '静音'}
                </button>
                <span className="pl-pressure">
                  风险 {Math.round(run.risk)} / 100 · 错误 {run.mistakes}
                </span>
              </>
            ) : (
              <>
                <button
                  disabled={!undo.length}
                  onClick={() => {
                    const previous = undo.at(-1)!;
                    setRedo((v) => [...v, clone(project)]);
                    setUndo((v) => v.slice(0, -1));
                    commit(previous, false);
                  }}
                >
                  ↶ 撤销
                </button>
                <button
                  disabled={!redo.length}
                  onClick={() => {
                    const next = redo.at(-1)!;
                    setUndo((v) => [...v, clone(project)]);
                    setRedo((v) => v.slice(0, -1));
                    commit(next, false);
                  }}
                >
                  ↷ 重做
                </button>
                <span>青绿：接收区　金色：落位　白点：判定锚点</span>
              </>
            )}
          </div>
          <output className="pl-notice" aria-live="polite">
            {run.phase === 'complete' ? pack.rules.completion.summary : notice}
          </output>
          {mode === 'play' && (
            <div className="pl-accessible">
              <span>点选操作</span>
              <div>
                {pack.rules.objects
                  .filter((o) => o.input !== 'none')
                  .map((o) => (
                    <button
                      key={o.id}
                      aria-pressed={selected === o.id}
                      disabled={
                        paused ||
                        !ready ||
                        !!run.action ||
                        run.phase !== 'playing' ||
                        !enabled(
                          runtimePack.rules.objects.find(
                            (x) => x.id === o.id,
                          ) ?? o,
                          run,
                        ) ||
                        stage?.missed ||
                        disabledObjects.includes(o.id)
                      }
                      onClick={() => {
                        audio.unlock();
                        setObjectId(o.id);
                        if (
                          project.flow &&
                          Object.keys(project.flow.holds).some(
                            (id) =>
                              pack.rules.interactions.find((r) => r.id === id)
                                ?.source === o.id,
                          )
                        )
                          return;
                        audio.pickup(o.id);
                        if (o.input === 'tap')
                          interact({ source: o.id, mode: 'tap' });
                        else setSelected(o.id);
                      }}
                      onPointerDown={(e) => {
                        if (press(o.id))
                          e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        if (!hold.current) return;
                        const b = e.currentTarget.getBoundingClientRect();
                        if (
                          e.clientX < b.left ||
                          e.clientX > b.right ||
                          e.clientY < b.top ||
                          e.clientY > b.bottom
                        )
                          releaseHold();
                      }}
                      onPointerUp={releaseHold}
                      onPointerCancel={releaseHold}
                      onKeyDown={(e) => {
                        if (
                          (e.key === ' ' || e.key === 'Enter') &&
                          !e.repeat &&
                          project.flow &&
                          Object.keys(project.flow.holds).some(
                            (id) =>
                              pack.rules.interactions.find((r) => r.id === id)
                                ?.source === o.id,
                          )
                        ) {
                          e.preventDefault();
                          press(o.id);
                        }
                      }}
                      onKeyUp={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') releaseHold();
                      }}
                      onBlur={releaseHold}
                    >
                      {o.label}
                    </button>
                  ))}
              </div>
              {selected && (
                <div className="pl-targets">
                  放到：
                  {Object.entries(pack.skin.zones).map(([id, z]) => (
                    <button
                      key={id}
                      disabled={paused || !!run.action}
                      onClick={() => {
                        const b = scenePoses(pack, run).find(
                          (b) => b.id === selected,
                        )!;
                        const a = Object.entries(project.placements).find(
                          ([id]) =>
                            pack.rules.interactions.find((r) => r.id === id)
                              ?.source === selected,
                        )?.[1].anchor ?? { x: 0.5, y: 0.5 };
                        interact(
                          dropInput(project, selected, {
                            ...b,
                            x: z.x + z.w / 2 - b.w * a.x,
                            y: z.y + z.h / 2 - b.h * a.y,
                          }),
                        );
                      }}
                    >
                      {pack.skin.zoneLabels?.[id] ?? id}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      audio.cancel(selected);
                      setSelected(null);
                    }}
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
        <aside className="pl-inspector pl-card">
          <nav className="pl-tabs">
            {[
              ['placement', '位置'],
              ['rules', '规则'],
              ['checks', '检查'],
              ['trace', '记录'],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
                {id === 'checks' && errors.length > 0 && <i>{errors.length}</i>}
              </button>
            ))}
          </nav>
          {tab === 'placement' && (
            <div className="pl-panel">
              <h2>位置与落位</h2>
              <p>三个区域独立编辑，修改后切换试玩立即生效。</p>
              <label className="pl-field">
                <span>选中对象</span>
                <select
                  aria-label="选中对象"
                  value={objectId}
                  onChange={(e) => {
                    setObjectId(e.target.value);
                    setLayer('home');
                  }}
                >
                  {Object.keys(project.pack.skin.poses).map((id) => (
                    <option key={id} value={id}>
                      {project.pack.rules.objects.find((o) => o.id === id)
                        ?.label ?? id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pl-segment pl-layers">
                {(['home', 'zone', 'snap'] as const).map((v, i) => (
                  <button
                    key={v}
                    disabled={
                      v === 'zone' ? !zone : v === 'snap' ? !placement : false
                    }
                    aria-pressed={layer === v}
                    onClick={() => {
                      setLayer(v);
                      if (mode === 'play') modeTo('edit');
                    }}
                  >
                    {['初始位置', '接收区', '最终落位'][i]}
                  </button>
                ))}
              </div>
              <fieldset disabled={mode !== 'edit'}>
                <div className="pl-grid2">
                  {(['x', 'y', 'w', 'h'] as const).map((k) => (
                    <Numeric
                      key={k}
                      label={
                        { x: 'X 坐标', y: 'Y 坐标', w: '宽度', h: '高度' }[k]
                      }
                      value={activeBox[k]}
                      min={k === 'w' || k === 'h' ? 1 : 0}
                      onChange={(v) => change((p) => changeBox(p, { [k]: v }))}
                    />
                  ))}
                  {layer !== 'zone' && (
                    <Numeric
                      label="绘制层级"
                      value={(activeBox as Pose).depth}
                      onChange={(v) =>
                        change((p) => changeBox(p, { depth: v }))
                      }
                    />
                  )}
                </div>
                {placement && (
                  <>
                    <h3>拖拽判定锚点</h3>
                    <p>0～1 相对物品尺寸；以这个点进入接收区为命中。</p>
                    <div className="pl-grid2">
                      {(['x', 'y'] as const).map((k) => (
                        <Numeric
                          key={k}
                          label={`锚点 ${k.toUpperCase()}`}
                          value={placement.anchor[k]}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(v) =>
                            change((p) => {
                              p.placements[action!.id].anchor[k] = v;
                            })
                          }
                        />
                      ))}
                    </div>
                    <Numeric
                      label="动作时长（毫秒）"
                      value={
                        project.pack.skin.animations[action!.animation]
                          .durationMs
                      }
                      min={500}
                      max={1500}
                      step={50}
                      onChange={(v) =>
                        change((p) => {
                          p.pack.skin.animations[action!.animation].durationMs =
                            v;
                        })
                      }
                    />
                    <label className="pl-field">
                      <span>路径中点（x,y；每行一个，物品左上角）</span>
                      <textarea
                        key={action!.id + ':' + JSON.stringify(placement.via)}
                        defaultValue={placement.via
                          .map((p) => `${p.x},${p.y}`)
                          .join('\n')}
                        placeholder="留空使用直线路径"
                        onBlur={(e) => {
                          try {
                            const via = e.target.value.trim()
                              ? e.target.value
                                  .trim()
                                  .split('\n')
                                  .map((line) => {
                                    const a = line.split(',').map(Number);
                                    if (
                                      a.length !== 2 ||
                                      a.some((n) => !Number.isFinite(n))
                                    )
                                      throw new Error('每行格式为 x,y');
                                    return { x: a[0], y: a[1] };
                                  })
                              : [];
                            change((p) => {
                              p.placements[action!.id].via = via;
                            });
                          } catch (error) {
                            setNotice(String(error));
                          }
                        }}
                      />
                    </label>
                  </>
                )}
                <button onClick={() => imageFile.current?.click()}>
                  替换当前物品素材
                </button>
              </fieldset>
              {mode === 'play' && (
                <button
                  className="pl-primary pl-full"
                  onClick={() => modeTo('edit')}
                >
                  进入摆放编辑
                </button>
              )}
              <p className="pl-muted">
                素材须为透明 PNG / WebP。新背景和更多物件可从 JSON 编辑器添加。
              </p>
              <button
                className="pl-full"
                onClick={() => {
                  setJson(JSON.stringify(project, null, 2));
                  setJsonError('');
                }}
              >
                打开完整 JSON 编辑器
              </button>
            </div>
          )}
          {tab === 'rules' && (
            <div className="pl-panel">
              <h2>动作与前置条件</h2>
              <p>正确动作结束后才提交目标。没有命中或条件不足会回位。</p>
              {project.pack.rules.interactions.map((r) => (
                <article className="pl-rule" key={r.id}>
                  <div>
                    <b>{r.id}</b>
                    <span className={`pl-badge ${r.outcome}`}>
                      {r.outcome === 'correct'
                        ? '正确'
                        : r.outcome === 'danger'
                          ? '危险'
                          : '无关'}
                    </span>
                  </div>
                  <p>
                    {r.source} → {r.target ?? '原位点击'}
                  </p>
                  <fieldset disabled={mode !== 'edit'}>
                    <label className="pl-field">
                      <span>前置目标（逗号分隔）</span>
                      <input
                        aria-label={`${r.id} 前置目标`}
                        value={(r.requires ?? []).join(',')}
                        onChange={(e) =>
                          change((p) => {
                            p.pack.rules.interactions.find(
                              (x) => x.id === r.id,
                            )!.requires = e.target.value
                              ? e.target.value.split(',').map((s) => s.trim())
                              : [];
                          })
                        }
                      />
                    </label>
                    <label className="pl-field">
                      <span>操作反馈</span>
                      <textarea
                        value={r.feedback ?? ''}
                        onChange={(e) =>
                          change((p) => {
                            p.pack.rules.interactions.find(
                              (x) => x.id === r.id,
                            )!.feedback = e.target.value;
                          })
                        }
                      />
                    </label>
                  </fieldset>
                  <small>
                    完成目标：{r.grants.join(', ') || '不发放'} · 音效：
                    {project.audio?.actions[r.id]
                      ?.map(
                        (c) =>
                          `${c.sound.description} @${Math.round(c.at * 100)}%`,
                      )
                      .join('；') ??
                      pack.skin.response?.cues.actions[r.id]?.sound ??
                      '未配置'}
                  </small>
                </article>
              ))}
              <p>
                完整的声音触发点、前置条件、禁止条件和演出可在 JSON 编辑器修改。
              </p>
            </div>
          )}
          {tab === 'checks' && (
            <div className="pl-panel">
              <h2>运行前检查</h2>
              <div className={`pl-health ${valid ? 'ok' : 'bad'}`}>
                <b>{valid ? '配置检查通过' : `${errors.length} 项需要修正`}</b>
                <p>
                  {valid
                    ? '可以开始试玩；视觉和常理仍需人工确认。'
                    : '修正后才能开始试玩，仍可导出草稿。'}
                </p>
              </div>
              {issues.map((i, index) => (
                <article
                  className="pl-issue"
                  key={index}
                  data-severity={i.severity}
                >
                  <b>{i.severity === 'error' ? '需修正' : '人工复核'}</b>
                  <p>{i.message}</p>
                  <code>{i.path}</code>
                </article>
              ))}
              <button
                className="pl-primary pl-full"
                onClick={() => {
                  setResults(simulateProject(project));
                  setNotice('规则仿真已完成；这不替代拖拽、画面和听音验收。');
                }}
              >
                运行规则仿真
              </button>
              {results.map((r, i) => (
                <div className="pl-case" key={i}>
                  <b>
                    {r.passed ? '✓' : '×'} {r.name}
                  </b>
                  <p>{r.detail}</p>
                </div>
              ))}
              <button
                className="pl-full"
                onClick={() =>
                  download(`${project.pack.rules.id}.report.json`, {
                    createdAt: new Date().toISOString(),
                    projectId: project.pack.rules.id,
                    issues,
                    ruleSimulation: results,
                    session: {
                      phase: run.phase,
                      resolved: run.resolved,
                      mistakes: run.mistakes,
                      trace,
                    },
                    manual: {
                      visual: 'not_run',
                      physicalDevice: 'not_run',
                      listening: 'not_run',
                    },
                    audio: audio.status,
                  })
                }
              >
                导出检查报告
              </button>
              <p className="pl-muted">
                自动检查覆盖字段、引用、状态可达性、区域重叠、落位尺寸、前后层级。实际像素遮挡和常理需要人工看图。
              </p>
            </div>
          )}
          {tab === 'trace' && (
            <div className="pl-panel">
              <h2>本轮操作记录</h2>
              <p>最近 120 条，记录命中、阻止、错误和动画提交。</p>
              <div className="pl-audio-status">
                声音：{audio.status.state} · 最近音效{' '}
                {audio.status.lastCue || '—'}
                <p>
                  物品音效：{audio.status.objectAudio.state} ·{' '}
                  {audio.status.objectAudio.loaded} 条已载入 · 缺失{' '}
                  {audio.status.objectAudio.missing.length}
                </p>
                {audio.status.objectAudio.missing.map((name) => (
                  <p key={name}>无法播放：{name}</p>
                ))}
              </div>
              {audio.status.objectAudio.log
                .slice(-16)
                .reverse()
                .map((e, i) => (
                  <p className="pl-sound-event" key={i}>
                    {e.object} · {e.event} → {e.sound.description}
                  </p>
                ))}
              {!trace.length && (
                <div className="pl-empty">
                  开始试玩后，操作记录会出现在这里。
                </div>
              )}
              {trace.map((t, i) => (
                <article className="pl-trace" key={i}>
                  <small>
                    {(t.time / 1000).toFixed(1)}s · {t.status}
                  </small>
                  <p>{t.text}</p>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
      <footer className="pl-footer">
        配置 → 摆放 → 规则检查 → 试玩 → 导出　
        <span>独立测试存档 · 不发放小红花</span>
      </footer>
      <dialog className="pl-json" ref={dialog} onCancel={() => setJson(null)}>
        <h2>完整配置编辑器</h2>
        <p>
          可粘贴 AI
          输出的完整配置；应用前检查字段、引用、前置条件和坐标。素材引用使用
          builtin:名称 或内嵌图片。
        </p>
        <textarea
          aria-label="完整配置 JSON"
          value={json ?? ''}
          spellCheck={false}
          onChange={(e) => setJson(e.target.value)}
        />
        {jsonError && <pre role="alert">{jsonError}</pre>}
        <div>
          <button onClick={() => setJson(null)}>取消</button>
          <button
            className="pl-primary"
            onClick={() => {
              try {
                importText(json ?? '');
                setJson(null);
              } catch (error) {
                setJsonError(String(error));
              }
            }}
          >
            检查并应用
          </button>
        </div>
      </dialog>
    </main>
  );
}
