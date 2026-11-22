import React from 'react';

export default function ChristmasOverlay() {
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" aria-hidden="true">
      {/* Festive top border/garland effect */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-green-500 to-red-500 z-[101] opacity-80"></div>
    </div>
  );
}
