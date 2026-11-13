import { AVATAR_IDS, type AvatarId } from '@minigamehub/shared';
import { Avatar } from './Avatar';

export function AvatarPicker({ value, onChange }: { value: AvatarId; onChange: (a: AvatarId) => void }) {
  return (
    <div role="radiogroup" aria-label="Avatar" className="grid grid-cols-6 gap-2">
      {AVATAR_IDS.map((id) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={id}
            onClick={() => onChange(id)}
            className={`flex aspect-square items-center justify-center rounded-2xl p-1 transition ${selected ? 'bg-pulse/25 ring-2 ring-pulse' : 'bg-midnight ring-1 ring-edge hover:ring-mist/50'}`}
          >
            <Avatar id={id} size={40} />
          </button>
        );
      })}
    </div>
  );
}
