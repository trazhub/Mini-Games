export function CountdownOverlay({ seconds, game, onCancel }: { seconds: number; game: string; onCancel?: () => void }) {
  return <div className="countdown-overlay" role="alert" aria-live="assertive"><p className="text-sm">Your next friendly rivalry</p><h2 className="mt-4 text-3xl">{game}</h2><p className="countdown-number" key={seconds}>{seconds || 'GO'}</p><p className="text-sm">Get your game face on.</p>{onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}</div>;
}
