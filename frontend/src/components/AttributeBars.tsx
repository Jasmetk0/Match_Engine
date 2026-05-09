import type { PlayerAttributes } from '../services/api';

type AttributeBarsProps = {
  attributes: Partial<PlayerAttributes>;
  compact?: boolean;
};

type AttributeKey = keyof PlayerAttributes;

type AttributeGroup = {
  title: string;
  tone: 'blue' | 'gold' | 'red' | 'purple' | 'emerald';
  fields: { key: AttributeKey; label: string }[];
};

const groups: AttributeGroup[] = [
  { title: 'Serve / Return', tone: 'blue', fields: [{ key: 'serve_pressure', label: 'Serve pressure' }, { key: 'return_initiative', label: 'Return initiative' }] },
  { title: 'Court Control', tone: 'blue', fields: [{ key: 'length_quality', label: 'Length quality' }, { key: 'width_control', label: 'Width control' }, { key: 'volley_takeover', label: 'Volley takeover' }] },
  { title: 'Attack', tone: 'red', fields: [{ key: 'front_court_touch', label: 'Front-court touch' }, { key: 'finishing_power', label: 'Finishing power' }, { key: 'deception_creativity', label: 'Deception creativity' }] },
  { title: 'Movement', tone: 'purple', fields: [{ key: 'first_step_cod', label: 'First-step / COD' }, { key: 't_recovery', label: 'T recovery' }, { key: 'anticipation', label: 'Anticipation' }] },
  { title: 'Endurance / Recovery', tone: 'emerald', fields: [{ key: 'aerobic_repeatability', label: 'Aerobic repeatability' }, { key: 'recovery_efficiency', label: 'Recovery efficiency' }, { key: 'durability', label: 'Durability' }] },
  { title: 'Tactical / Mental', tone: 'gold', fields: [{ key: 'shot_selection', label: 'Shot selection' }, { key: 'adaptability', label: 'Adaptability' }, { key: 'composure', label: 'Composure' }, { key: 'error_discipline', label: 'Error discipline' }] },
];

function clamp(value: number | undefined) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? Number(value) : 0));
}

export function AttributeBars({ attributes, compact = false }: AttributeBarsProps) {
  return (
    <div className={compact ? 'attribute-bars attribute-bars--compact' : 'attribute-bars'}>
      {groups.map((group) => (
        <section className={`attribute-bar-group tone-${group.tone}`} key={group.title}>
          <h4>{group.title}</h4>
          <div className="attribute-bar-rows">
            {group.fields.map((field) => {
              const value = clamp(attributes[field.key]);
              return (
                <div className="attribute-bar-row" key={field.key}>
                  <span className="attribute-bar-label">{field.label}</span>
                  <span className="attribute-bar-track"><span className="attribute-bar-fill" style={{ width: `${value}%` }} /></span>
                  <strong>{Math.round(value)}</strong>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
