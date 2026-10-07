'use client';
import { useState } from 'react';
import type { Lesson } from '@/app/game/journey/knowledge';
import type { HuntPack } from '@/app/game/scene-hunt/schema';

/** Optional review only: never saves progress, blocks leaving or changes rewards. */
export function LearningReview({ lesson, pack }: { lesson: Lesson; pack?: HuntPack }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [before, setBefore] = useState(false);
  const question = lesson.question;
  const answer = question?.options.find(option => option.id === choice);
  return <>
    {pack?.presentation?.compareEnding && <details className="learning-review" data-testid="ending-comparison">
      <summary>看看准备前后，哪里变了？</summary>
      <div className="learning-review-options" role="group" aria-label="准备前后对照">
        <button type="button" aria-pressed={before} onClick={() => setBefore(true)}>准备前</button>
        <button type="button" aria-pressed={!before} onClick={() => setBefore(false)}>准备后</button>
      </div>
      <figure><img src={before ? pack.skin.scene : pack.skin.safe} alt={before ? '准备前：高柜连接脱开、高处重物、床上方镜框、门口和桌下堆物' : '准备后：柜子固定、重物移低、床上方移空、通道与桌下清空'} draggable={false} />
        <figcaption>{before ? '准备前：对照五处隐患' : '准备后：由成人在平时完成调整'}</figcaption>
      </figure>
    </details>}
    {question && <section className="learning-review" data-testid="settlement-question" aria-labelledby="learning-question-title">
      <h3 id="learning-question-title">再想一想</h3>
      <p>{question.question}</p>
      <div className="learning-review-options" role="group" aria-label={question.question}>
        {question.options.map(option => <button type="button" key={option.id} data-answer={option.id} aria-pressed={choice === option.id} onClick={() => setChoice(option.id)}>{option.text}</button>)}
      </div>
      <p role="status" aria-live="polite" data-testid="question-feedback" data-correct={answer?.correct}>{answer?.explanation ?? '不计分的小复习，不影响已获得的小红花。'}</p>
    </section>}
  </>;
}
