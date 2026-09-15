import { Volume2, VolumeX } from 'lucide-react';
import { GardenDialog } from './dialog';

export function JourneySettings({
  onClose,
  muted,
  onMute,
  musicMuted,
  onMusicMute,
  onReset,
  navigationLocked,
}: {
  onClose: () => void;
  muted: boolean;
  onMute: () => void;
  musicMuted: boolean;
  onMusicMute: () => void;
  onReset: () => void;
  navigationLocked: boolean;
}) {
  return (
    <GardenDialog
      title="游戏设置"
      onClose={onClose}
      className="garden-settings"
    >
      <h2>游戏设置</h2>
      <div className="garden-archive-actions garden-settings-actions">
        <button
          type="button"
          data-ui-sound="off"
          onClick={onMute}
          aria-label={muted ? '打开按钮和奖励音效' : '关闭按钮和奖励音效'}
          aria-pressed={!muted}
        >
          {muted ? <VolumeX /> : <Volume2 />}
          {muted ? '按钮／奖励音效已关' : '按钮／奖励音效已开'}
        </button>
        <button
          type="button"
          data-ui-sound="off"
          onClick={onMusicMute}
          className="garden-music-toggle"
          aria-label={musicMuted ? '打开首页和地图音乐' : '关闭首页和地图音乐'}
          aria-pressed={!musicMuted}
        >
          {musicMuted ? <VolumeX /> : <Volume2 />}
          {musicMuted ? '首页／地图音乐已关' : '首页／地图音乐已开'}
        </button>
      </div>
      <button
        type="button"
        className="garden-reset"
        disabled={navigationLocked}
        onClick={() => {
          if (!navigationLocked) onReset();
        }}
      >
        重置当前玩家记录
      </button>
    </GardenDialog>
  );
}
