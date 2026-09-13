import type { ObjectSounds, Sound } from './sound';
export const sound = (
  material: Sound['material'],
  gesture: Sound['gesture'],
  description: string,
  gain = 0.7,
): Sound => ({ material, gesture, description, gain });
export function objectSounds(
  material: Sound['material'],
  label: string,
): ObjectSounds {
  return {
    pickup: sound(material, 'lift', `${label}：拿起或按下的接触声`, 0.5),
    miss: sound(material, 'reject', `${label}：未命中，短促退回提示`, 0.45),
    blocked: sound(
      material,
      'reject',
      `${label}：条件未满足，低音阻止提示`,
      0.5,
    ),
    return: sound(material, 'return', `${label}：松手回位的材质接触声`, 0.5),
  };
}
