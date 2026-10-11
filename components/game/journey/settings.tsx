/* oxlint-disable next/no-img-element -- Local artwork is embedded in the offline build. */
import { Music2, RotateCcw, Volume2 } from 'lucide-react';
import { GardenDialog } from './dialog';

export function JourneySettings({
  onClose,
  muted,
  onMute,
  musicMuted,
  onMusicMute,
  onReset,
  onManageSave,
  navigationLocked,
}: {
  onClose: () => void;
  muted: boolean;
  onMute: () => void;
  musicMuted: boolean;
  onMusicMute: () => void;
  onReset: () => void;
  onManageSave?: () => void;
  navigationLocked: boolean;
}) {
  return (
    <GardenDialog
      title="游戏设置"
      onClose={onClose}
      className="garden-settings painted-settings"
    >
      <div className="settings-card">
        <img
          className="settings-panel-art"
          src="/ui/painted-settings-v1/panel.png"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <img
          className="settings-toolbox"
          src="/ui/map-corner-garden-v2/settings-blue.png"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <h2 className="settings-title" aria-hidden="true">
          游戏设置
        </h2>
        <div className="settings-content">
          <h3 className="settings-section-title">
            <span>声音设置</span>
          </h3>
          <div className="settings-sound-options">
            <div className="settings-sound-row">
              <Music2 className="settings-sound-icon" aria-hidden="true" />
              <div className="settings-sound-label">
                <strong>背景音乐</strong>
                <small>首页与地图</small>
              </div>
              <button
                type="button"
                role="switch"
                className="settings-switch garden-music-toggle"
                data-ui-sound="off"
                aria-label="背景音乐：首页与地图"
                aria-checked={!musicMuted}
                onClick={onMusicMute}
              >
                <span className="settings-switch-state" aria-hidden="true">
                  {musicMuted ? '关' : '开'}
                </span>
                <span className="settings-switch-knob" aria-hidden="true" />
              </button>
            </div>
            <div className="settings-sound-row">
              <Volume2 className="settings-sound-icon" aria-hidden="true" />
              <div className="settings-sound-label">
                <strong>游戏音效</strong>
                <small>按钮与奖励</small>
              </div>
              <button
                type="button"
                role="switch"
                className="settings-switch"
                data-ui-sound="off"
                aria-label="游戏音效：按钮与奖励"
                aria-checked={!muted}
                onClick={onMute}
              >
                <span className="settings-switch-state" aria-hidden="true">
                  {muted ? '关' : '开'}
                </span>
                <span className="settings-switch-knob" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="settings-save-actions">
            {onManageSave && <button type="button" className="settings-reset" disabled={navigationLocked} onClick={onManageSave}>存档管理 / 导入导出</button>}
            <button
              type="button"
              className="settings-reset"
              aria-describedby="settings-reset-note"
              disabled={navigationLocked}
              onClick={() => {
                if (!navigationLocked) onReset();
              }}
            >
              <RotateCcw aria-hidden="true" />
              <span>重置当前玩家记录</span>
            </button>
            <p id="settings-reset-note" className="settings-reset-note">
              {navigationLocked
                ? '正在记录本次进度，请稍候'
                : '此操作需要再次确认'}
            </p>
          </div>
          <button type="button" className="settings-return" onClick={onClose}>
            返回游戏
          </button>
        </div>
      </div>
    </GardenDialog>
  );
}
