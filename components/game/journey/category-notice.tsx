import { GardenDialog } from './dialog';
import type { JourneyCategory } from '@/app/game/journey/categories';
export function CategoryNotice({
  category,
  onClose,
}: {
  category: JourneyCategory | null;
  onClose: () => void;
}) {
  if (!category) return null;
  return (
    <GardenDialog title={`${category.name} · 待开放`} onClose={onClose}>
      <small className="garden-overline">{category.name}</small>
      <h2>这一站尚未开放</h2>
      <p className="garden-category-scope">{category.scope}</p>
      <p className="garden-footnote">先沿着已开放的地图，继续你的安全旅程。</p>
      <button className="garden-primary" onClick={onClose}>
        回到当前地图
      </button>
    </GardenDialog>
  );
}
