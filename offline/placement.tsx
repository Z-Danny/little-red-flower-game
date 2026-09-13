import { createRoot } from 'react-dom/client';
import { PlacementLab } from '../components/game/placement/placement-lab';
import type { PlacementBatch } from '../app/game/placement/production';
const container = document.getElementById('placement-root');
if (!container) throw new Error('放置测试引擎挂载节点不存在');
const initialBatch = (
  globalThis as typeof globalThis & { __PLACEMENT_BATCH__?: PlacementBatch }
).__PLACEMENT_BATCH__;
createRoot(container).render(<PlacementLab initialBatch={initialBatch} />);
