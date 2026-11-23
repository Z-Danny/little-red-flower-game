// WeChat plays packaged sounds through its own audio session. No DOM or eval.
export function installJourneyAudio(api, target) {
  const root = "audio/red-flower/";
  const effects = new Map();
  const reported = new Set();
  let music;
  let musicError;
  let wanted = false;
  let musicStarted = false;
  let visible = true;
  let effectsMuted = false;

  try {
    if (typeof api.setInnerAudioOption === "function") api.setInnerAudioOption({obeyMuteSwitch: false, mixWithOther: true});
  } catch (error) {
    console.warn("[RedFlowerAudio] unable to set audio session", String(error));
  }

  function createPlayer(file, loop, volume, label, onError) {
    const player = api.createInnerAudioContext();
    player.loop = loop;
    player.volume = volume;
    player.onPlay(() => {
      // A native play callback can arrive after navigation has paused the track.
      if (loop && (!wanted || !visible)) {
        player.pause();
        return;
      }
      if (reported.has(label)) return;
      reported.add(label);
      console.info("[RedFlowerAudio] playing", label);
    });
    player.onError(error => {
      console.warn("[RedFlowerAudio]", label, error.errCode, error.errMsg);
      onError();
    });
    player.src = root + file;
    return player;
  }

  function stopEffect(channel) {
    const player = effects.get(channel);
    if (!player) return;
    effects.delete(channel);
    player.destroy();
  }

  function stopEffects() {
    for (const channel of effects.keys()) stopEffect(channel);
  }

  function syncMusic() {
    if (!wanted || !visible) {
      if (musicStarted) {
        musicStarted = false;
        music.pause();
      }
      return;
    }
    if (musicStarted) return;
    try {
      if (!music) {
        music = createPlayer("journey-music.mp3", true, 0.65, "music", failMusic);
      }
      musicStarted = true;
      music.play();
    } catch (error) {
      console.warn("[RedFlowerAudio] music", String(error));
      failMusic();
    }
  }

  function failMusic() {
    musicStarted = false;
    wanted = false;
    if (music) music.destroy();
    music = null;
    if (musicError) musicError();
  }

  function hide() {
    visible = false;
    stopEffects();
    syncMusic();
  }

  function show() {
    visible = true;
    syncMusic();
  }

  target.redFlowerWechatAudio = {
    onError(callback) { musicError = callback; },
    update(navigating, musicMuted, fxMuted) {
      wanted = navigating && !musicMuted;
      effectsMuted = fxMuted;
      if (effectsMuted) stopEffects();
      syncMusic();
    },
    playEffect(cue, channel, fallback) {
      if (!visible || effectsMuted) return true;
      stopEffect(channel);
      let player;
      try {
        player = createPlayer(cue + ".wav", false, 1, cue, () => {
          if (effects.get(channel) !== player) return;
          stopEffect(channel);
          if (fallback) fallback(cue, channel);
        });
        effects.set(channel, player);
        player.onEnded(() => {
          if (effects.get(channel) === player) stopEffect(channel);
        });
        player.play();
        return true;
      } catch (error) {
        stopEffect(channel);
        console.warn("[RedFlowerAudio]", cue, String(error));
        return false;
      }
    },
    stopEffect,
    dispose() {
      stopEffects();
      if (music) music.destroy();
      music = null;
      musicStarted = false;
      wanted = false;
      if (typeof api.offHide === "function") api.offHide(hide);
      if (typeof api.offShow === "function") api.offShow(show);
    },
  };
  if (typeof api.onHide === "function") api.onHide(hide);
  if (typeof api.onShow === "function") api.onShow(show);
}
