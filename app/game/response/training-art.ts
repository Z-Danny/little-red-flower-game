/** Literal URLs participate in the self-contained HTML export manifest. */
export const responseTrainingArt = {
  phone: '/ui/response-training-v1/phone.svg',
  aed: '/ui/response-training-v1/aed.svg',
  hands: '/ui/response-training-v1/hands.svg',
  kneel: '/ui/response-training-v1/kneel.svg',
  rhythm: '/ui/response-training-v1/rhythm.svg',
  relay: '/ui/response-training-v1/relay.svg',
  next: '/ui/response-training-v1/next.svg',
  check: '/ui/response-training-v1/check.svg',
  retry: '/ui/response-training-v1/retry.svg',
  slow: '/ui/response-training-v1/slow.svg',
  fast: '/ui/response-training-v1/fast.svg',
  posture: '/ui/response-training-v1/posture.svg',
  chest: '/ui/response-training-v1/hands-chest.svg',
  abdomen: '/ui/response-training-v1/hands-abdomen.svg',
  straight: '/ui/response-training-v1/posture-straight.svg',
  bent: '/ui/response-training-v1/posture-bent.svg',
} as const;
export type ResponseTrainingIcon = keyof typeof responseTrainingArt;
