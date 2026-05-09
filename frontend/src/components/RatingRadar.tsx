type RatingRadarValue = {
  label: string;
  value: number;
};

type RatingRadarProps = {
  values: RatingRadarValue[];
  size?: number;
  color?: string;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function pointFor(index: number, total: number, radius: number, center: number, scale = 1) {
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
  return {
    x: center + Math.cos(angle) * radius * scale,
    y: center + Math.sin(angle) * radius * scale,
  };
}

function pointsToString(points: { x: number; y: number }[]) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

export function RatingRadar({ values, size = 280, color = 'var(--accent-emerald)' }: RatingRadarProps) {
  const safeValues = values.length > 0 ? values : [{ label: 'Rating', value: 0 }];
  const center = size / 2;
  const radius = size * 0.34;
  const labelRadius = size * 0.43;
  const total = safeValues.length;
  const polygon = safeValues.map((entry, index) => pointFor(index, total, radius, center, clamp(entry.value) / 100));

  return (
    <div className="rating-radar" style={{ width: size, maxWidth: '100%' }}>
      <svg aria-label="Player category radar chart" role="img" viewBox={`0 0 ${size} ${size}`}>
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <polygon className="radar-grid" key={scale} points={pointsToString(safeValues.map((_, index) => pointFor(index, total, radius, center, scale)))} />
        ))}
        {safeValues.map((entry, index) => {
          const end = pointFor(index, total, radius, center, 1);
          const label = pointFor(index, total, labelRadius, center, 1);
          return (
            <g key={entry.label}>
              <line className="radar-axis" x1={center} x2={end.x} y1={center} y2={end.y} />
              <text className="radar-label" textAnchor={label.x < center - 8 ? 'end' : label.x > center + 8 ? 'start' : 'middle'} x={label.x} y={label.y}>{entry.label}</text>
              <text className="radar-value" textAnchor={label.x < center - 8 ? 'end' : label.x > center + 8 ? 'start' : 'middle'} x={label.x} y={label.y + 14}>{Math.round(clamp(entry.value))}</text>
            </g>
          );
        })}
        <polygon className="radar-fill" points={pointsToString(polygon)} style={{ fill: color, stroke: color }} />
        {polygon.map((point, index) => <circle className="radar-dot" cx={point.x} cy={point.y} key={safeValues[index].label} r="3.2" style={{ fill: color }} />)}
      </svg>
    </div>
  );
}
