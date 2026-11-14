import { AVATAR_IDS, type AvatarId } from '@minigamehub/shared';
import { Avatar } from './Avatar';

export function AvatarPicker({ value, onChange }: { value: AvatarId; onChange: (a: AvatarId) => void }) {
  return (
    <div role="radiogroup" aria-label="Avatar" className="avatar-picker grid grid-cols-6 gap-2">
      {AVATAR_IDS.map((id) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={id}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(e) => {
              const step = { ArrowRight: 1, ArrowDown: 6, ArrowLeft: -1, ArrowUp: -6 }[e.key];
              if (step === undefined && e.key !== 'Home' && e.key !== 'End') return;
              e.preventDefault();
              const index = e.key === 'Home' ? 0 : e.key === 'End' ? AVATAR_IDS.length - 1 : (AVATAR_IDS.indexOf(id) + step! + AVATAR_IDS.length) % AVATAR_IDS.length;
              onChange(AVATAR_IDS[index]!);
              const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=radio]');
              buttons?.[index]?.focus();
            }}
            className={`flex aspect-square items-center justify-center rounded-2xl p-1 transition ${selected ? 'bg-pulse/25 ring-2 ring-pulse' : 'bg-midnight ring-1 ring-edge hover:ring-mist/50'}`}
          >
            <Avatar id={id} size={40} />
          </button>
        );
      })}
    </div>
  );
}
