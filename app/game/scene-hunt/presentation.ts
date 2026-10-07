/** Presentation profiles are independent of the recognition/reward state machine. */
export type HuntPresentation = {
  location: string;
  environment: 'storm' | 'none';
  characters: 'storm' | 'breathing' | 'static';
  audio: 'storm' | 'quiet_electric';
  timer: 'countdown' | 'elapsed' | 'pressure-bar';
  /** Opt-in controls: omitted values preserve the other levels' presentation. */
  clues?: 'always' | 'on-demand';
  characterAudio?: 'none' | 'nonverbal-fear';
  opening: string;
  reveal: string;
  completeTitle: string;
  pauseNote: string;
  endingNote: string;
  preview: string;
  warnings: string[];
  celebration: boolean;
};
export const typhoonPresentation: HuntPresentation = {
  location: '客厅 · 阳台',
  environment: 'storm', characters: 'storm', audio: 'storm', timer: 'countdown',
  opening: '对照剪影，圈出五处隐患。红圈只表示“已发现”。',
  reveal: '五处已识别 · 正在展示规范处置后的情景',
  completeTitle: '做好准备，家更安心',
  pauseNote: '这是识别训练。现实中应提前准备；风雨猛烈或电器周围潮湿时，不要冒险操作。',
  endingNote: '画面为规范处置后的效果示意',
  preview: '风雨正在靠近。观察整幅场景，圈出 5 处隐患，再看看处理后的家。',
  warnings: ['风正在增强，还有隐患没有找到。', '雨开始飘入室内，风声更强了。', '风雨已经很强，仍可继续找。现实中优先保证人身安全。'],
  celebration: true,
};
export const presentationOf = (pack: {presentation?: HuntPresentation}) => pack.presentation ?? typhoonPresentation;
export const endingFade = (phase: string, age: number) =>
  phase === 'reveal' || phase === 'complete' ? Math.max(0, Math.min(1, (age - 800) / 1800)) : 0;
export function timerLabel(elapsed: number) {
  const seconds = Math.floor(Math.max(0, elapsed) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
