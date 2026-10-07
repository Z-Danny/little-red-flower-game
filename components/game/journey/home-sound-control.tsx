import { useEffect, useId, useRef, useState } from 'react';
import { Music2, MousePointer2, Volume2, VolumeX, X } from 'lucide-react';

type Props = {
  muted: boolean;
  onMute: () => void;
  musicMuted: boolean;
  onMusicMute: () => void;
  disabled?: boolean;
};

/** Public-page audio controls share the map preferences; level audio stays independent. */
export function HomeSoundControl({ muted, onMute, musicMuted, onMusicMute, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstControl = useRef<HTMLButtonElement>(null);
  const allMuted = muted && musicMuted;
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    firstControl.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div
      className="title-sound-control"
      ref={root}
      data-ui-sound="off"
      onBlur={event => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="title-sound-trigger"
        ref={trigger}
        data-home-sound
        data-muted={allMuted}
        aria-label={allMuted ? '声音设置，已静音' : '声音设置'}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        title="声音设置"
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
      >
        {allMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        <span aria-hidden="true">{allMuted ? '静音' : '声音'}</span>
      </button>
      {open && (
        <dialog
          open
          className="title-sound-panel"
          id={id}
          aria-labelledby={`${id}-heading`}
          data-home-sound-panel
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="title-sound-heading">
            <h2 id={`${id}-heading`}>声音设置</h2>
            <button type="button" className="title-sound-close" aria-label="关闭声音设置" onClick={close}>
              <X aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="title-sound-option" ref={firstControl} data-home-music-toggle onClick={onMusicMute} aria-pressed={!musicMuted} aria-label={musicMuted ? '打开首页和地图音乐' : '关闭首页和地图音乐'}>
            <Music2 aria-hidden="true" />
            <span className="title-sound-copy"><strong>背景音乐</strong><small>首页与地图</small></span>
            <span className="title-sound-switch" aria-hidden="true"><span />{musicMuted ? '关' : '开'}</span>
          </button>
          <button type="button" className="title-sound-option" data-home-effects-toggle onClick={onMute} aria-pressed={!muted} aria-label={muted ? '打开按钮和奖励音效' : '关闭按钮和奖励音效'}>
            <MousePointer2 aria-hidden="true" />
            <span className="title-sound-copy"><strong>互动音效</strong><small>按钮与奖励</small></span>
            <span className="title-sound-switch" aria-hidden="true"><span />{muted ? '关' : '开'}</span>
          </button>
          <p className="title-sound-note">设置自动记住 · 关卡声音在暂停菜单调整</p>
        </dialog>
      )}
    </div>
  );
}