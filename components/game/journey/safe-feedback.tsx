export function SafeFeedback({
  label = '这一处，更安心了',
}: {
  label?: string;
}) {
  return (
    <output className="journey-safe-feedback">
      <span aria-hidden="true">· ✧ ·</span>
      <strong>{label}</strong>
    </output>
  );
}
