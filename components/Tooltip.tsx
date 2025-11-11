import React, { useState } from 'react';

interface TooltipProps {
  children: React.ReactElement;
  text: string;
  className?: string;
}

export function Tooltip({ children, text, className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && text && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs px-3 py-2 bg-zinc-800 text-white text-xs rounded-lg shadow-lg z-10 pointer-events-none">
          {text}
        </div>
      )}
    </div>
  );
}
