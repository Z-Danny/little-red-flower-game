import React from 'react';
import { createRoot } from 'react-dom/client';
import StagedResponsePlayer from '@/components/game/staged-response/player';
createRoot(document.getElementById('game-root')!).render(<StagedResponsePlayer />);
