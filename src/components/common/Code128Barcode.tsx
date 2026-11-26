import React, { useMemo } from 'react';
import { encodeCode128B } from '../../utils/barcode';

interface Props {
  value: string;
  height?: number;
  showLabel?: boolean;
  className?: string;
}

export const Code128Barcode: React.FC<Props> = ({
  value,
  height = 46,
  showLabel = true,
  className = ''
}) => {
  const encoded = useMemo(() => encodeCode128B(value), [value]);

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <svg
        viewBox={`0 0 ${encoded.totalWidth} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Barcode ${encoded.text}`}
        className="w-full max-w-[260px] bg-white"
        style={{ height }}
      >
        <rect x={0} y={0} width={encoded.totalWidth} height={height} fill="#ffffff" />
        {encoded.bars.map((bar, idx) => (
          <rect
            key={idx}
            x={bar.x}
            y={0}
            width={bar.width}
            height={height}
            fill="#0f172a"
          />
        ))}
      </svg>
      {showLabel && (
        <div
          dir="ltr"
          className="mt-1 font-mono text-[11px] font-bold tracking-[0.16em] text-slate-900 tabular-nums select-all"
        >
          {encoded.text}
        </div>
      )}
    </div>
  );
};
