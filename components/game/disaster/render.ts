import type { Box, DisasterPack, Point } from '@/app/game/disaster/schema';
import { canvasLabelFont } from '@/app/game/typography';
import { objectPose, center, targetBox } from '@/app/game/disaster/scene';
import { pressure, type DisasterRun } from '@/app/game/disaster/model';
import type { DisasterArt, Raster } from './art';
export type DragView = { id: string; point: Point; offset: Point } | null;
function image(c: CanvasRenderingContext2D, a: Raster, b: Box, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.drawImage(a.image, b.x, b.y, b.w, b.h);
  c.restore();
}
function ring(c: CanvasRenderingContext2D, b: Box, t = 1, color = '#ed5041') {
  c.save();
  c.lineWidth = 7;
  c.strokeStyle = '#fff1d8';
  c.beginPath();
  c.ellipse(
    b.x + b.w / 2,
    b.y + b.h / 2,
    b.w / 2 + 10,
    b.h / 2 + 10,
    -0.035,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * t,
  );
  c.stroke();
  c.lineWidth = 4;
  c.strokeStyle = color;
  c.stroke();
  c.restore();
}
function badge(
  c: CanvasRenderingContext2D,
  text: string,
  p: Point,
  color = '#284b43',
) {
  c.save();
  c.font = canvasLabelFont(17);
  const w = c.measureText(text).width + 24;
  c.fillStyle = color;
  c.beginPath();
  c.roundRect(p.x - w / 2, p.y - 16, w, 32, 10);
  c.fill();
  c.fillStyle = '#fff3d9';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, p.x, p.y);
  c.restore();
}
function weather(
  c: CanvasRenderingContext2D,
  p: DisasterPack,
  a: DisasterArt,
  r: DisasterRun,
  reduced: boolean,
) {
  const risk = pressure(p.rules, r),
    t = r.elapsed / 1000;
  c.save();
  c.beginPath();
  for (const poly of p.skin.weather) {
    poly.forEach((v, i) => (i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y)));
    c.closePath();
  }
  if (p.rules.kind === 'prevention') {
    // Subtract a generous region around the person: added weather never crosses her face or clothing.
    const b = p.skin.sprites.person.box;
    c.rect(b.x - 9, b.y - 9, b.w + 18, b.h + 18);
  }
  c.clip('evenodd');
  c.fillStyle = `rgba(22,39,51,${risk * 0.2})`;
  c.fillRect(0, 0, 720, 1280);
  if (p.rules.kind === 'response' && risk > 0.2) {
    const y = 650 - risk * 220;
    c.save();
    c.fillStyle = `rgba(100,120,108,${0.12 + risk * 0.38})`;
    c.beginPath();
    c.moveTo(0, 1280);
    c.lineTo(0, y);
    for (let x = 0; x <= 190; x += 8)
      c.lineTo(x, y + (reduced ? 0 : Math.sin(x / 18 + t * 3) * 5));
    c.lineTo(190, 1280);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(223,232,212,.45)';
    c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x <= 180; x += 6) {
      const yy = y + (reduced ? 0 : Math.sin(x / 18 + t * 3) * 5);
      x ? c.lineTo(x, yy) : c.moveTo(x, yy);
    }
    c.stroke();
    c.restore();
  }
  if (!reduced) {
    c.strokeStyle = `rgba(221,236,240,${0.14 + risk * 0.22})`;
    c.lineWidth = 1.3;
    const count = 60 + Math.floor(risk * 100);
    c.beginPath();
    for (let i = 0; i < count; i++) {
      const x =
          ((((i * 173.39 - t * (32 + risk * 44)) % 760) + 760) % 760) - 20,
        y = ((i * 83.27 + t * (440 + risk * 300)) % 1340) - 30;
      c.moveTo(x, y);
      c.lineTo(x - 7, y + 18 + risk * 13);
    }
    c.stroke();
    if (risk > 0.6) {
      c.strokeStyle = 'rgba(215,230,229,.14)';
      for (let i = 0; i < 8; i++) {
        c.beginPath();
        c.ellipse(
          (i * 109) % 720,
          600 + ((i * 91) % 470),
          12 + ((t * 17 + i * 5) % 18),
          3,
          0,
          0,
          Math.PI * 2,
        );
        c.stroke();
      }
    }
  }
  c.restore();
}
export function drawDisaster(
  c: CanvasRenderingContext2D,
  p: DisasterPack,
  a: DisasterArt,
  r: DisasterRun,
  drag: DragView,
  selected: string | null,
  hint: string | null,
  reduced: boolean,
) {
  const full = { x: 0, y: 0, w: p.skin.width, h: p.skin.height },
    risk = pressure(p.rules, r),
    street = p.rules.kind === 'prevention';
  if (a.backdrop && p.skin.framing) image(c, a.backdrop, p.skin.framing.sceneBounds);
  image(c, a.scene, full);
  if (!street) {
    const activeObjects = new Set<string>();
    for (const [id, s] of Object.entries(p.skin.sprites)) {
      if (s.fixed) continue;
      const pose = objectPose(p, r, id);
      if (
        drag?.id === id ||
        pose.alpha < 1 ||
        JSON.stringify(pose.box) !== JSON.stringify(s.box) ||
        (id === 'person' && risk > 0.45)
      )
        activeObjects.add(id);
    }
    // Leave every untouched object in the original complete painting. Only moved objects reveal a feathered clean plate.
    for (const id of activeObjects) {
      const repair = p.skin.sprites[id].repair;
      if (repair && a.repairs[id]) image(c, a.repairs[id], repair.box);
    }
    for (const [id, s] of Object.entries(p.skin.sprites)) {
      if (s.fixed) continue;
      if (!activeObjects.has(id)) continue;
      let { box, alpha } = objectPose(p, r, id);
      if (drag?.id === id) {
        box = {
          ...box,
          x: drag.point.x - drag.offset.x,
          y: drag.point.y - drag.offset.y,
        };
        alpha = 0.93;
      }
      if (alpha <= 0) continue;
      c.save();
      if (
        id === 'person' &&
        !drag &&
        !r.pending &&
        !reduced &&
        r.phase === 'playing'
      ) {
        const cx = box.x + box.w / 2,
          cy = box.y + box.h;
        c.translate(cx, cy);
        c.rotate(
          Math.sin(r.elapsed / (650 - risk * 220)) * (0.002 + risk * 0.006),
        );
        c.scale(1, 1 + Math.sin(r.elapsed / 300) * (0.001 + risk * 0.002));
        c.translate(-cx, -cy);
      }
      if (selected === id || hint === id) {
        c.shadowColor = '#ffe18b';
        c.shadowBlur = 15;
      }
      if (
        r.notice.tone === 'neutral' &&
        r.notice.seq > 1 &&
        r.effectAge < 350 &&
        id === selected &&
        !reduced
      )
        box = {
          ...box,
          x: box.x + Math.sin(r.effectAge / 30) * 5 * (1 - r.effectAge / 350),
        };
      const asset =
        id === 'person' &&
        a.faces.alert &&
        (risk > 0.52 || r.phase === 'failed')
          ? a.faces.alert
          : a.sprites[id];
      image(c, asset, box, alpha);
      c.restore();
    }
    const b = p.skin.sprites.breaker.box;
    const on = r.goals.includes('power'),
      pending =
        r.pending &&
        p.rules.actions.find((a) => a.id === r.pending!.id)?.motion ===
          'switch';
    if (on || pending) {
      const v = on ? 1 : Math.min(1, r.pending!.age / 700);
      c.save();
      c.translate(b.x + b.w * 0.49, b.y + b.h * 0.5);
      c.fillStyle = '#263a37';
      c.fillRect(-27, -6, 48, 17);
      c.translate(0, 4 + v * 6);
      c.fillStyle = '#b2aaa0';
      for (let i = 0; i < 5; i++) c.fillRect(-25 + i * 10, -4, 7, 6);
      c.restore();
      if (on) badge(c, '断电', { x: b.x + b.w / 2, y: b.y + b.h + 16 });
    }
    if (r.goals.includes('rescue')) {
      const person = objectPose(p, r, 'person').box;
      badge(c, '已发送位置', { x: person.x + person.w / 2, y: person.y - 20 });
    }
    if (r.goals.includes('drinking') || r.goals.includes('lighting')) {
      const bag = p.skin.sprites.bag.box;
      const label = [
        r.goals.includes('drinking') ? '饮水' : '',
        r.goals.includes('lighting') ? '照明' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      badge(c, label, { x: bag.x + bag.w / 2, y: bag.y + bag.h + 18 });
    }
  }
  weather(c, p, a, r, reduced);
  if (!street && hint) ring(c, objectPose(p, r, hint).box, 1, '#f4cf79');
  if (street) {
    for (const id of r.goals) {
      const b = p.skin.sprites[id].box;
      ring(c, b);
      const q = { x: b.x + b.w * 0.82, y: b.y + 10 };
      c.fillStyle = '#e85343';
      c.beginPath();
      c.arc(q.x, q.y, 12, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff8e5';
      c.font = canvasLabelFont(19, 700);
      c.textAlign = 'center';
      c.fillText('✓', q.x, q.y + 7);
    }
    if (r.pending) {
      const act = p.rules.actions.find((a) => a.id === r.pending!.id)!;
      ring(c, p.skin.sprites[act.source].box, r.pending.age / act.duration);
    }
    if (hint) ring(c, p.skin.sprites[hint].box, 1, '#edc971');
    if (r.lastAction === 'mark-pool' && r.effectAge < 1500) {
      c.save();
      c.strokeStyle = '#f9e7b5';
      c.lineWidth = 6;
      c.setLineDash([10, 10]);
      c.beginPath();
      c.moveTo(365, 555);
      c.lineTo(325, 476);
      c.lineTo(202, 277);
      c.stroke();
      c.restore();
    }
  } else if (drag || selected) {
    const id = drag?.id ?? selected!;
    // Highlight only destinations while holding something; no permanent answer checklist.
    const names = new Set(
      p.rules.actions.filter((a) => a.source === id).map((a) => a.target),
    );
    for (const name of names) {
      const z = p.skin.zones[name];
      if (z?.danger) continue;
      const b = targetBox(p, r, name);
      if (!b) continue;
      c.save();
      c.strokeStyle = '#f9e5a6';
      c.lineWidth = 3;
      c.setLineDash([9, 7]);
      c.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      c.restore();
      badge(c, z?.label ?? p.skin.sprites[name]?.label ?? name, {
        x: b.x + b.w / 2,
        y: b.y - 19,
      });
    }
  }
  if (r.phase === 'playing' && risk > 0.67) {
    const g = c.createRadialGradient(360, 650, 230, 360, 650, 830);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, `rgba(82,24,17,${0.15 + risk * 0.18})`);
    c.fillStyle = g;
    c.fillRect(0, 0, 720, 1280);
  }
  if (r.phase === 'failed') {
    c.fillStyle = 'rgba(48,18,16,.27)';
    c.fillRect(0, 0, 720, 1280);
    // No injury shown: the red edge and rising external water communicate the consequence.
    c.strokeStyle = '#e25746';
    c.lineWidth = 12;
    c.strokeRect(8, 8, 704, 1264);
  }
  if (r.phase === 'reveal' || r.phase === 'complete') {
    const fade = r.phase === 'complete' ? 1 : Math.min(1, r.revealAge / 1100);
    image(c, a.ending, full, fade);
    if (!reduced && r.phase === 'reveal') {
      c.save();
      c.globalAlpha =
        Math.sin(Math.min(1, r.revealAge / p.rules.revealMs) * Math.PI) * 0.8;
      c.fillStyle = '#ffe0a1';
      for (let i = 0; i < 18; i++) {
        const x = 60 + ((i * 71) % 600),
          y = 450 + ((i * 151) % 650) - r.revealAge * 0.08;
        c.beginPath();
        c.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  }
}
