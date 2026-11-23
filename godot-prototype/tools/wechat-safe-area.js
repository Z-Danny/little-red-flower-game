// Coordinates from WeChat are in window points; Godot converts the fractions to its viewport units.
export function installSafeArea(api, target) {
  function windowInfo() {
    return api.getWindowInfo?.() ?? api.getSystemInfoSync?.() ?? {};
  }

  target.redFlowerSafeArea = {
    topFraction() {
      try {
        const info = windowInfo();
        const top = Math.max(info.safeArea?.top || 0, info.statusBarHeight || 0);
        return info.windowHeight > 0 ? top / info.windowHeight : 0;
      } catch {
        return 0;
      }
    },
    capsuleLeftFraction() {
      try {
        const width = windowInfo().windowWidth;
        const left = api.getMenuButtonBoundingClientRect?.()?.left;
        return width > 0 && left > 0 ? Math.min(1, left / width) : 1;
      } catch {
        return 1;
      }
    },
    capsuleBottomFraction() {
      try {
        const height = windowInfo().windowHeight;
        const bottom = api.getMenuButtonBoundingClientRect?.()?.bottom;
        return height > 0 && bottom > 0 ? Math.min(1, bottom / height) : 0;
      } catch {
        return 0;
      }
    },
    bottomFraction() {
      try {
        const info = windowInfo();
        const bottom = info.safeArea?.bottom ?? info.windowHeight;
        return info.windowHeight > 0 ? Math.max(0, info.windowHeight - bottom) / info.windowHeight : 0;
      } catch {
        return 0;
      }
    },
  };
}
