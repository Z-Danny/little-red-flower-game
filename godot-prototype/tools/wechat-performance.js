export function installPerformance(api, target) {
  target.redFlowerPerformance = {
    setPreferredFps(fps) {
      if (!Number.isInteger(fps) || fps < 1 || fps > 60) return false;
      try {
        if (typeof api.setPreferredFramesPerSecond !== 'function') return false;
        api.setPreferredFramesPerSecond(fps);
        return true;
      } catch {
        return false;
      }
    },
  };
}
