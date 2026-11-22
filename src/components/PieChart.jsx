import React from 'react';

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = (angleDeg - 90) * Math.PI / 180.0;
  return { x: cx + (r * Math.cos(a)), y: cy + (r * Math.sin(a)) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export default function PieChart({ data = [], size = 96, innerRadiusPct = 0.6, centerText, explodeIndex = 0, legendPosition = 'bottom', showPercent = true, responsive = false, onSegmentClick }) {
  const total = data.reduce((s, d) => s + Math.max(0, Number(d.value) || 0), 0);
  // when responsive, use a fixed viewBox of 200 and scale SVG to container
  const viewSize = responsive ? 200 : size;
  const cx = viewSize / 2;
  const cy = viewSize / 2;
  const r = viewSize / 2;
  let angle = 0;

  // helper to compute mid-angle
  const midAngle = (start, end) => start + (end - start) / 2;

  // build legend layout: right -> row with svg + legend column
  const legend = (
    <div className={`space-y-1 text-sm ${legendPosition === 'right' ? 'ml-4' : 'mt-2'}`}>
      {data.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-white/90">
          <span style={{ background: s.color, width: 12, height: 12 }} className="inline-block rounded-sm" />
          <span className="text-xs">{s.label}: <strong className="ml-1">{s.value}</strong>{showPercent && total > 0 ? ` (${Math.round((s.value/total)*100)}%)` : ''}</span>
        </div>
      ))}
    </div>
  );

  const svgContent = (
    <svg width={responsive ? '100%' : size} height={responsive ? '100%' : size} viewBox={`0 0 ${viewSize} ${viewSize}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="pc-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={total === 0 ? undefined : 'url(#pc-shadow)'}>
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={r} fill="#0f1724" />
        ) : (
          data.map((segment, idx) => {
            const value = Math.max(0, Number(segment.value) || 0);
            const sweep = total === 0 ? 0 : (value / total) * 360;
            const start = angle;
            const end = angle + sweep;
            const mid = midAngle(start, end);
            // exploded translation
            const explode = idx === explodeIndex ? 8 : 0;
            const dx = explode * Math.cos((mid - 90) * Math.PI / 180);
            const dy = explode * Math.sin((mid - 90) * Math.PI / 180);
            angle = end;
            const pathD = describeArc(cx, cy, r, start, end) + ` L ${cx} ${cy}`;
            // percentage label position
            const labelR = r * (innerRadiusPct + 0.5) / 2 + explode;
            const labelPos = polarToCartesian(cx + dx, cy + dy, labelR, mid);
            return (
              <g key={idx} transform={`translate(${dx},${dy})`}>
                <path
                  d={pathD}
                  fill={segment.color || '#6b7280'}
                  stroke="#00000000"
                />
                {/* clickable overlay for accessibility */}
                <g
                  role={onSegmentClick ? 'button' : undefined}
                  tabIndex={onSegmentClick ? 0 : undefined}
                  onClick={onSegmentClick ? (() => onSegmentClick(segment, idx)) : undefined}
                  onKeyDown={onSegmentClick ? ((e) => { if (e.key === 'Enter' || e.key === ' ') onSegmentClick(segment, idx); }) : undefined}
                  style={{ cursor: onSegmentClick ? 'pointer' : 'default' }}
                >
                  {showPercent && total > 0 && (
                    <text x={labelPos.x} y={labelPos.y} textAnchor="middle" dominantBaseline="central" style={{ fill: '#fff', fontSize: Math.max(10, size * 0.08), fontWeight: 700 }}>
                      {Math.round((value / total) * 100)}%
                    </text>
                  )}
                </g>
              </g>
            );
          })
        )}
  {/* inner circle (if innerRadiusPct > 0) */}
  {innerRadiusPct > 0 && <circle cx={cx} cy={cy} r={r * innerRadiusPct} fill="#071025" />}
        {centerText && (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" style={{ fill: '#fff', fontSize: Math.max(10, size * 0.12), fontWeight: 700 }}>
            {centerText}
          </text>
        )}
      </g>
    </svg>
  );

  if (legendPosition === 'right') {
    return (
      <div className="flex items-center">
        {svgContent}
        {legend}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {svgContent}
      {legend}
    </div>
  );
}
