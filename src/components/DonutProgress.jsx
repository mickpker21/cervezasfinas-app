import React from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

export default function DonutProgress({ value, text, color = '#22c55e', textSize = '1.6em', onClick }) {
  return (
    <div style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, cursor: onClick ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }} onClick={onClick}>
      <CircularProgressbar
        value={value}
        text={text}
        styles={buildStyles({
          pathColor: color,
          textColor: '#fff',
          trailColor: '#222',
          backgroundColor: '#222',
          textSize: textSize,
        })}
      />
      <style>{`
        .CircularProgressbar-text {
          dominant-baseline: middle;
          text-anchor: middle;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
}
