import { useEffect, useState } from 'react';
import {
  journeyMap,
  nodeStatus,
  regionFor,
  type Planting,
} from '@/app/game/journey/progress';
import { journeyEntryFor } from '@/app/game/journey/entry';
import { getLevel } from '@/app/game/levels';
import { firstAidPreview } from '@/app/game/journey/first-aid';
import { LevelEntry } from './journey/level-entry';

type Props = {
  completed: Record<string, number>;
  focusId: string | null;
  planting: Planting | null;
  allLevelsUnlocked: boolean;
  playerName: string;
  flowers: number;
  canContinue: boolean;
  busy: boolean;
  onNew: () => Promise<boolean>;
  onContinue: () => boolean;
  onStart: (id: string) => void;
  onManageSave: () => void;
  onJournal: () => void;
  onUnlockAll: () => void;
  onMute: () => void;
  muted: boolean;
  onMusicMute: () => void;
  musicMuted: boolean;
};

const chapters = journeyMap.regions;
const sceneNames: Record<string, string> = {
  nature: '海风与山川',
  public: '街巷与桥梁',
  home: '万家灯火',
  'first-aid': '生命守护',
};
const scenes: Record<string, string> = {
  nature: '01',
  public: '02',
  home: '03',
  'first-aid': '04',
};
const mapImages: Record<string, string> = {
  nature: '/landscape/map-storybook-v2.png',
  public: '/landscape/map-public-v2.png',
  home: '/landscape/map-home-v2.png',
  'first-aid': '/landscape/map-first-aid-v2.png',
};
const flowerCounterArt = '/ui/map-corner-garden-v2/flower-counter.png';
const roadFlowerArt = '/levels/journey-map/flower.png';
// Positions are calibrated to the four landscape paintings, not the portrait map.
const roadFlowers: Record<string, readonly (readonly [number, number])[]> = {
  nature: [
    [21, 91],
    [40, 88],
    [57, 87],
    [77, 87],
    [35, 60],
    [10, 46],
    [47, 41],
    [69, 42],
    [90, 44],
    [68, 22],
    [88, 22],
  ],
  public: [
    [16, 48],
    [33, 37],
    [58, 57],
    [77, 55],
    [27, 86],
    [56, 84],
    [82, 84],
  ],
  home: [
    [20, 88],
    [46, 85],
    [79, 83],
    [24, 43],
    [50, 38],
    [78, 38],
  ],
  'first-aid': [
    [18, 85],
    [38, 87],
    [57, 86],
    [81, 88],
    [15, 44],
    [39, 45],
    [62, 44],
    [83, 45],
  ],
};
export function LandscapeShell(props: Props) {
  const [page, setPage] = useState<'home' | 'map'>(() =>
    props.focusId ? 'map' : 'home',
  );
  const [message, setMessage] = useState('');
  const [chapter, setChapter] = useState(() =>
    Math.max(
      0,
      chapters.findIndex(
        (region) => region.id === regionFor(props.focusId ?? '')?.id,
      ),
    ),
  );
  const [inspect, setInspect] = useState<string | null>(null);
  const current = chapters[chapter];
  const available = current.nodes.filter(
    (node) =>
      nodeStatus(node.id, props.completed, props.allLevelsUnlocked) ===
      'available',
  ).length;
  const done = current.nodes.filter(
    (node) =>
      nodeStatus(node.id, props.completed, props.allLevelsUnlocked) ===
      'complete',
  ).length;
  const changeChapter = (next: number) => {
    setInspect(null);
    setChapter(Math.min(chapters.length - 1, Math.max(0, next)));
  };
  useEffect(() => {
    if (!props.focusId) return;
    const region = regionFor(props.focusId);
    if (region) setChapter(chapters.findIndex((item) => item.id === region.id));
    setPage('map');
  }, [props.focusId]);
  const newlyCompleted = props.planting?.levelId;
  const earnedFlowers = current.nodes.reduce(
    (count, node) => count + (props.completed[node.id] > 0 ? 1 : 0),
    0,
  );
  const flowerPositions = roadFlowers[current.id] ?? [];
  return (
    <section className="landscape-game" data-landscape-page={page}>
      {page === 'home' ? (
        <div className="landscape-home">
          <div className="landscape-masthead">
            <img
              className="brand-mark"
              src={flowerCounterArt}
              alt=""
              draggable={false}
            />
            <span>小红花 · 应急行动</span>
            <span className="masthead-right">横屏篇 · 独立版本</span>
          </div>
          <div className="landscape-home-content">
            <div className="home-eyebrow">
              <span className="short-line" /> 一段关于勇气与正确选择的旅程
            </div>
            <h1>
              这片儿
              <br />
              <em>没我不行</em>
            </h1>
            <p>
              跟随海风走过群岛，在每一次选择里，
              <br />
              让危险的角落重新开出小红花。
            </p>
            <div className="landscape-home-actions">
              <button
                type="button"
                className="landscape-action primary"
                disabled={props.busy}
                onClick={() => {
                  void props.onNew().then((ok) => {
                    if (ok) {
                      setMessage('');
                      setPage('map');
                    } else setMessage('无法开始新旅程，请先检查玩家存档。');
                  });
                }}
              >
                开始新旅程 <span>↗</span>
              </button>
              {props.canContinue && (
                <button
                  type="button"
                  className="landscape-action secondary"
                  disabled={props.busy}
                  onClick={() => {
                    if (props.onContinue()) {
                      setMessage('');
                      setPage('map');
                    } else setMessage('暂时无法继续，请先检查玩家存档。');
                  }}
                >
                  继续旅程 <span>→</span>
                </button>
              )}
            </div>
            {message && (
              <output role="status" className="landscape-message">
                {message}
              </output>
            )}
            <div className="home-meta">
              <span>四大章节</span>
              <i /> <span>互动应急练习</span>
              <i /> <span>把安全种进生活</span>
            </div>
          </div>
          <div className="home-bottom">
            <span>01 / 04　从海风吹起的地方出发</span>
            <div>
              <button onClick={props.onManageSave}>存档管理</button>
              <button onClick={props.onMute}>
                {props.muted ? '开启音效' : '关闭音效'}
              </button>
              <button onClick={props.onMusicMute}>
                {props.musicMuted ? '开启音乐' : '关闭音乐'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="landscape-map">
          <header className="landscape-map-header">
            <button className="back-home" onClick={() => setPage('home')}>
              ← 返回首页
            </button>
            <div className="chapter-heading">
              <span className="chapter-kicker">THE JOURNEY / 关卡地图</span>
              <h2>
                选择你的下一站
                <img
                  className="heading-flower"
                  src={flowerCounterArt}
                  alt=""
                  draggable={false}
                />
              </h2>
            </div>
            <div className="map-account">
              <span>守护者 · {props.playerName}</span>
              <strong
                className="landscape-flower-count"
                aria-label={`累计${props.flowers}朵小红花`}
              >
                <span className="landscape-flower-icon">
                  <img src={flowerCounterArt} alt="" draggable={false} />
                  <span aria-hidden="true">{props.flowers}</span>
                </span>
                <span className="landscape-flower-unit">朵</span>
              </strong>
              <button onClick={props.onJournal}>我的进度</button>
            </div>
          </header>
          <nav className="chapter-nav" aria-label="章节">
            <span className="nav-caption">探索章节</span>
            {chapters.map((region, i) => (
              <button
                key={region.id}
                className={chapter === i ? 'active' : ''}
                onClick={() => changeChapter(i)}
                aria-current={chapter === i ? 'step' : undefined}
              >
                <small>{scenes[region.id]}</small>
                {region.name}
              </button>
            ))}
            <button
              className="unlock-preview"
              onClick={props.onUnlockAll}
              disabled={props.allLevelsUnlocked}
            >
              {props.allLevelsUnlocked ? '本次已解锁' : '体验全部关卡'}
            </button>
          </nav>
          <div className="map-stage" data-map-chapter={current.id}>
            <div className="map-stage-top">
              <span>
                第 {scenes[current.id]} 章 <b>/</b> {sceneNames[current.id]}
              </span>
              <span>
                {done} / {current.nodes.length} 已完成 · {available} 站可出发
              </span>
            </div>
            <div className="map-panel" aria-label={`${current.name}关卡地图`}>
              <img
                className="map-panel-art"
                src={mapImages[current.id]}
                alt=""
                draggable={false}
              />
              {current.nodes.map((node, i) =>
                props.completed[node.id] > 0 && flowerPositions[i] ? (
                  <img
                    key={`road-flower-${node.id}`}
                    className={`landscape-road-flower${node.id === newlyCompleted && !props.planting?.before[node.id] ? ' just-planted' : ''}`}
                    src={roadFlowerArt}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    style={{
                      left: `${flowerPositions[i][0]}%`,
                      top: `${flowerPositions[i][1]}%`,
                    }}
                  />
                ) : null,
              )}
              {current.nodes.map((node, i) => {
                const entry = journeyEntryFor(
                  node.id,
                  props.completed,
                  props.allLevelsUnlocked,
                );
                const status = nodeStatus(
                  node.id,
                  props.completed,
                  props.allLevelsUnlocked,
                );
                const title =
                  entry?.title ??
                  getLevel(node.id)?.title ??
                  firstAidPreview(node.id)?.title ??
                  node.id;
                return (
                  <button
                    key={node.id}
                    className={`trail-card map-stop map-stop-${i + 1} ${status}`}
                    aria-label={`${String(i + 1).padStart(2, '0')} ${title}，${status === 'complete' ? '已完成' : status === 'locked' ? '尚未解锁' : '可出发'}`}
                    onClick={() => setInspect(node.id)}
                  >
                    <span className="map-stop-number">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <strong>{title}</strong>
                    <span className="map-stop-state">
                      {status === 'complete' ? (
                        <img
                          className="map-stop-flower"
                          src={flowerCounterArt}
                          alt="已守护"
                          draggable={false}
                        />
                      ) : status === 'locked' ? (
                        '◆'
                      ) : (
                        '➜'
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="trail-footer">
              <span>点击地图上的木牌，查看这一站</span>
              <span className="trail-track">
                一章一图 · 石板路上已种下 {earnedFlowers} 朵小红花
              </span>
              <span>
                {current.name} · {current.nodes.length} 个关卡
              </span>
            </div>
          </div>
          <div className="landscape-map-footer">
            <span>小红花应急行动 · LANDSCAPE EDITION</span>
            <span>用勇气守护每一个日常</span>
          </div>
          <LevelEntry
            inspect={inspect}
            setInspect={setInspect}
            completed={props.completed}
            allLevelsUnlocked={props.allLevelsUnlocked}
            onStart={(id) => {
              props.onStart(id);
              setInspect(null);
            }}
          />
        </div>
      )}
    </section>
  );
}
