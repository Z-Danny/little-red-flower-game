import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huntPacks } from '../app/game/scene-hunt/registry';
import {
  clueLayout,
  sceneCamera,
  phoneFrame,
} from '../app/game/scene-hunt/viewport';
import { camera } from '../app/game/scene-hunt/schema';
for (const pack of huntPacks) {
  for (const [w, h, left, right, top, bottom] of [
    [320, 568, 0, 0, 0, 0],
    [390, 844, 0, 0, 47, 34],
    [844, 390, 44, 44, 0, 21],
    [667, 240, 0, 0, 0, 21],
    [280, 480, 0, 0, 0, 0],
    [300, 450, 0, 0, 0, 0],
    [545, 818, 0, 0, 0, 0],
    [390, 500, 0, 0, 0, 120],
  ]) {
    test(`Clues stay in the mobile safe viewport: ${pack.rules.id} ${w}x${h}`, () => {
      const layout = clueLayout(pack.skin, w, h, 69 + top, {
        left,
        right,
        top,
        bottom,
      });
      const width = layout.column
        ? layout.tileW
        : pack.rules.targets.length * layout.tileW +
          (pack.rules.targets.length - 1) * layout.gap;
      const height = layout.column
        ? pack.rules.targets.length * layout.tileH +
          (pack.rules.targets.length - 1) * layout.gap
        : layout.tileH;
      assert.ok(
        layout.left >= left + 8 &&
          layout.top >= top &&
          layout.left + width <= w - right - 8 &&
          layout.top + height <= h - bottom - 8,
        JSON.stringify({ layout, width, height }),
      );
    });
  }
  for (const [w, h] of [
    [320, 740],
    [390, 844],
    [360, 640],
    [768, 1024],
    [844, 390],
    [1440, 900],
    [816, 1634],
    [430, 932],
    [540, 720],
    [720, 1280],
  ]) {
    test(`Full painting and fixed top row: ${pack.rules.id} ${w}x${h}`, () => {
      const frame = phoneFrame(pack.skin, w, h);
      const l = clueLayout(pack.skin, frame.width, frame.height),
        c = sceneCamera(pack.skin, frame.width, frame.height, true);
      const reference = camera(pack.skin, frame.width, frame.height);
      assert.equal(c.scaleX, c.scaleY);
      assert.ok(c.scaleX >= reference.scale);
      assert.equal(frame.y, 0);
      if (w <= 600 && h >= w) assert.equal(frame.height, h);
      else assert.ok(Math.abs(frame.width / frame.height - 720 / 1280) < 1e-8);
      assert.ok(
        (w <= 600 && h >= w ? frame.width === w : frame.width <= 520) &&
          frame.x >= 0 &&
          frame.y >= 0,
      );
      assert.ok(
        frame.x + frame.width <= w + 1e-8 && frame.y + frame.height <= h + 1e-8,
      );
      const rw = l.column
          ? l.tileW
          : pack.rules.targets.length * l.tileW +
            (pack.rules.targets.length - 1) * l.gap,
        rh = l.column
          ? pack.rules.targets.length * l.tileH +
            (pack.rules.targets.length - 1) * l.gap
          : l.tileH;
      assert.ok(
        l.left >= 0 && l.top >= 69 && l.left + rw <= w && l.top + rh <= h,
      );
      assert.equal(l.column, false);
      assert.ok(Math.abs(l.left + rw / 2 - frame.width / 2) < 1e-8);
      assert.equal(l.top, 79);
      assert.ok(c.x <= 1e-8 && c.y <= 1e-8);
      assert.ok(c.x + pack.skin.width * c.scaleX >= frame.width - 1e-8);
      assert.ok(c.y + pack.skin.height * c.scaleY >= frame.height - 1e-8);
      for (const b of [
        ...Object.values(pack.skin.targets).map((t) => t.bounds),
        pack.skin.familyBox,
      ]) {
        const x = c.x + b.x * c.scaleX,
          y = c.y + b.y * c.scaleY;
        assert.ok(
          x < frame.width &&
            y < frame.height &&
            x + b.w * c.scaleX > 0 &&
            y + b.h * c.scaleY > 0,
          'Target must not be completely cropped',
        );
        assert.ok(Math.abs((x - c.x) / c.scaleX - b.x) < 1e-8);
        assert.ok(Math.abs((y - c.y) / c.scaleY - b.y) < 1e-8);
      }
    });
  }
}
