import { createRoot } from 'react-dom/client';
import { GameApp } from '../components/game/game-app';

const container = document.getElementById('game-root');
if (!container) throw new Error('离线游戏挂载节点不存在');

createRoot(container).render(<GameApp />);
