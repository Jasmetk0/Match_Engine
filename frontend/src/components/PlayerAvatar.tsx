type PlayerAvatarProps = {
  name: string;
  subtitle?: string | null;
  handedness?: string | null;
  playStyle?: string | null;
  size?: 'sm' | 'md' | 'lg';
};

const styleTones = ['emerald', 'gold', 'blue', 'purple', 'red'] as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SML';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function toneFor(value: string | null | undefined) {
  const source = value || 'all-rounder';
  const index = [...source].reduce((sum, char) => sum + char.charCodeAt(0), 0) % styleTones.length;
  return styleTones[index];
}

export function PlayerAvatar({ name, subtitle, handedness, playStyle, size = 'md' }: PlayerAvatarProps) {
  return (
    <div className={`player-avatar player-avatar--${size} tone-${toneFor(playStyle)}`}>
      <div className="player-avatar__mark" aria-hidden="true">{initials(name)}</div>
      <div className="player-avatar__meta">
        <strong>{name}</strong>
        {subtitle && <span>{subtitle}</span>}
        {(handedness || playStyle) && <em>{[handedness ? `${handedness} hand` : null, playStyle].filter(Boolean).join(' · ')}</em>}
      </div>
    </div>
  );
}
