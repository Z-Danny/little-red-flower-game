'use client';
import { useEffect, useRef, useState } from 'react';
import type { Conversation, Input, LevelPackage, Run } from '@/app/game/runtime/schema';

export function CoachingProgress({ pack, run, disabled }: { pack: LevelPackage; run: Run; disabled: boolean }) {
  const coaching = pack.rules.coaching!;
  return <aside className="configured-coaching" aria-label="练习进度" inert={disabled}>
    <ol>{coaching.tasks.map((id, index) => <li key={id} data-done={run.resolved.includes(id)}>
      <span aria-hidden="true">{run.resolved.includes(id) ? '✓' : index + 1}</span>
      {pack.rules.goals.find(goal => goal.id === id)?.label}
      <span className="sr-only">{run.resolved.includes(id) ? '，已完成' : '，未完成'}</span>
    </li>)}</ol>
    <details><summary>{coaching.context ? '现场信息 · 操作提示' : '查看操作提示'}</summary><div>{coaching.context && <p className="configured-context">{coaching.context}</p>}{coaching.reminders.map(line => <p key={line}>{line}</p>)}</div></details>
  </aside>;
}

/** A short text exchange, not a voice track or simulated rescue countdown. */
export function ConversationCard({ card, pack, run, onChoose }: {
  card: Conversation; pack: LevelPackage; run: Run; onChoose: (input: Input) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [feedback, setFeedback] = useState('');
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (run.notice?.text) setFeedback(run.notice.text);
  }, [run.notice?.text]);
  return <section className="configured-conversation" aria-labelledby={`conversation-${card.id}`} data-conversation={card.id}>
    <div className="configured-conversation-paper">
      <small>{card.caption ?? '应急演练 · 文字对讲'}</small>
      <h2 ref={heading} tabIndex={-1} id={`conversation-${card.id}`}>{card.title}</h2>
      <p className="configured-conversation-reference">{card.reference}</p>
      <p>{card.prompt}</p>
      <div className="configured-conversation-choices">{card.choices.map(id => {
        const rule = pack.rules.interactions.find(rule => rule.id === id)!;
        return <button key={id} type="button" disabled={!!run.action} onClick={() => onChoose({ source: rule.source, mode: 'tap', choice: id })}>{rule.choice}</button>;
      })}</div>
      <p className="configured-conversation-feedback" role="status">{run.action ? '正在确认…' : feedback || '请根据场景中的信息回应。选错后可以重新判断。'}</p>
    </div>
  </section>;
}
