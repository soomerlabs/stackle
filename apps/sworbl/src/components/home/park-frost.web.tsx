// THE PARKED FROST — WEB: the same progressive dissolve as the native
// masked blurs, in the browser's own language: CSS backdrop-filter masked
// by a vertical gradient. A raw <div> guarantees the styles reach the DOM
// (RNW's style whitelist can't drop them). NATIVE SIBLING: park-frost.tsx.
import React from 'react';

const fill: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
};

export function ParkFrost({ mode }: { mode: 'light' | 'dark' }) {
  const tint = mode === 'dark' ? 'rgba(16,16,20,0.18)' : 'rgba(237,239,247,0.2)';
  const haze: React.CSSProperties = {
    ...fill,
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    maskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.7) 38%, #000 75%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.7) 38%, #000 75%)',
  };
  const frost: React.CSSProperties = {
    ...fill,
    backgroundColor: tint,
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    maskImage: 'linear-gradient(to bottom, transparent, transparent 42%, #000 82%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent, transparent 42%, #000 82%)',
  };
  return (
    <>
      <div style={haze} />
      <div style={frost} />
    </>
  );
}
