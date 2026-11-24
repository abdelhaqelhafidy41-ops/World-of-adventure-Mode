import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  open,
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = el?.offsetWidth ?? 210;
    const height = el?.offsetHeight ?? items.length * 38 + 12;
    const clampedLeft = Math.max(8, Math.min(x, vw - width - 8));
    const clampedTop = Math.max(8, Math.min(y, vh - height - 8));
    setCoords({ left: clampedLeft, top: clampedTop });
  }, [open, x, y, items.length]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const handleScroll = () => onClose();

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScroll);
    };
  }, [open, onClose]);

  if (!open || items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: coords.left, top: coords.top }}
      className="fixed z-50 min-w-[190px] max-w-[260px] rounded-lg border border-slate-200 bg-white/98 backdrop-blur-md p-1.5 shadow-2xl dark:border-white/15 dark:bg-[#141B29]/98"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            onClose();
            item.onSelect();
          }}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-medium rounded-md text-start transition-colors min-h-[36px] touch-target ${
            item.disabled
              ? 'opacity-40 cursor-not-allowed text-slate-400'
              : item.danger
                ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
          }`}
        >
          {item.icon && <span className="shrink-0 opacity-85">{item.icon}</span>}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
};

export function useLongPress(
  onLongPress: (clientX: number, clientY: number) => void,
  delayMs = 520
) {
  const timerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    clear();
    const cx = e.clientX;
    const cy = e.clientY;
    startPosRef.current = { x: cx, y: cy };
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onLongPress(cx, cy);
    }, delayMs);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startPosRef.current || timerRef.current === null) return;
    const dist = Math.hypot(
      e.clientX - startPosRef.current.x,
      e.clientY - startPosRef.current.y
    );
    if (dist > 10) {
      clear();
    }
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
  };
}
