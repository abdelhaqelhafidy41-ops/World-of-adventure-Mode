import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';

export interface ContextMenuItem {
  type?: 'item';
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  children?: ContextMenuEntry[];
  onSelect?: () => void;
}

export interface ContextMenuSeparator {
  type: 'separator';
  id: string;
}

export interface ContextMenuLabel {
  type: 'label';
  id: string;
  label: string;
}

export type ContextMenuEntry =
  | ContextMenuItem
  | ContextMenuSeparator
  | ContextMenuLabel;

export interface ContextMenuHeader {
  title: string;
  subtitle?: string;
  badge?: string;
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuEntry[];
  header?: ContextMenuHeader;
  onClose: () => void;
}

interface SubmenuPanelProps {
  entries: ContextMenuEntry[];
  parentRect: DOMRect;
  isRtl: boolean;
  onClose: () => void;
}

const SubmenuPanel: React.FC<SubmenuPanelProps> = ({
  entries,
  parentRect,
  isRtl,
  onClose,
}) => {
  const subRef = useRef<HTMLDivElement>(null);
  const [nestedOpenId, setNestedOpenId] = useState<string | null>(null);
  const [nestedRect, setNestedRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: isRtl ? parentRect.left - 220 : parentRect.right - 2,
    top: parentRect.top,
  });

  useLayoutEffect(() => {
    const el = subRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? entries.length * 36 + 12;

    let left: number;
    if (isRtl) {
      const preferredLeft = parentRect.left - w + 4;
      left =
        preferredLeft >= 8
          ? preferredLeft
          : Math.min(vw - w - 8, parentRect.right - 4);
    } else {
      const preferredRight = parentRect.right - 4;
      left =
        preferredRight + w <= vw - 8
          ? preferredRight
          : Math.max(8, parentRect.left - w + 4);
    }
    const top = Math.max(8, Math.min(parentRect.top - 4, vh - h - 8));
    setPos({ left, top });
  }, [parentRect, entries.length, isRtl]);

  return (
    <div
      ref={subRef}
      role="menu"
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[75] min-w-[210px] max-w-[280px] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 dark:border-white/15 dark:bg-[#141B29] dark:ring-white/5"
    >
      {entries.map((entry) => {
        if (entry.type === 'separator') {
          return (
            <div
              key={entry.id}
              className="my-1 h-px bg-slate-200/80 dark:bg-white/10"
            />
          );
        }
        if (entry.type === 'label') {
          return (
            <div
              key={entry.id}
              className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none"
            >
              {entry.label}
            </div>
          );
        }

        const hasChildren = Boolean(entry.children && entry.children.length > 0);
        const isNestedOpen = hasChildren && nestedOpenId === entry.id;

        return (
          <div
            key={entry.id}
            className="relative"
            onMouseEnter={(e) => {
              if (hasChildren && !entry.disabled) {
                setNestedOpenId(entry.id);
                setNestedRect(e.currentTarget.getBoundingClientRect());
              } else {
                setNestedOpenId(null);
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              aria-haspopup={hasChildren ? 'menu' : undefined}
              aria-expanded={hasChildren ? isNestedOpen : undefined}
              disabled={entry.disabled}
              onClick={(e) => {
                if (entry.disabled) return;
                if (hasChildren) {
                  e.stopPropagation();
                  if (isNestedOpen) {
                    setNestedOpenId(null);
                  } else {
                    setNestedOpenId(entry.id);
                    setNestedRect(e.currentTarget.getBoundingClientRect());
                  }
                  return;
                }
                onClose();
                entry.onSelect?.();
              }}
              className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs font-medium rounded-md text-start transition-colors min-h-[34px] touch-target ${
                entry.disabled
                  ? 'opacity-40 cursor-not-allowed text-slate-400'
                  : isNestedOpen
                    ? 'bg-blue-600/15 text-blue-600 dark:text-blue-300'
                    : entry.danger
                      ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-85">
                  {entry.checked ? (
                    <Check className="w-3.5 h-3.5 text-blue-500" />
                  ) : (
                    entry.icon ?? null
                  )}
                </span>
                <span className="truncate">{entry.label}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                {entry.shortcut && (
                  <span
                    dir="ltr"
                    className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500"
                  >
                    {entry.shortcut}
                  </span>
                )}
                {hasChildren && (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 rtl:rotate-180" />
                )}
              </span>
            </button>

            {isNestedOpen && entry.children && nestedRect && (
              <SubmenuPanel
                entries={entry.children}
                parentRect={nestedRect}
                isRtl={isRtl}
                onClose={onClose}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ContextMenu: React.FC<ContextMenuProps> = ({
  open,
  x,
  y,
  items,
  header,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: x, top: y });
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const [activeSubmenuRect, setActiveSubmenuRect] = useState<DOMRect | null>(null);

  const isRtl =
    typeof document !== 'undefined' &&
    document.documentElement.dir === 'rtl';

  useEffect(() => {
    if (!open) {
      setActiveSubmenuId(null);
      setActiveSubmenuRect(null);
    }
  }, [open, x, y]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = el?.offsetWidth ?? 232;
    const height = el?.offsetHeight ?? items.length * 36 + (header ? 44 : 12);
    const preferredLeft = isRtl ? x - width : x;
    const clampedLeft = Math.max(8, Math.min(preferredLeft, vw - width - 8));
    const clampedTop = Math.max(8, Math.min(y, vh - height - 8));
    setCoords({ left: clampedLeft, top: clampedTop });
  }, [open, x, y, items.length, header, isRtl]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[role="menu"]')) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const handleResize = () => onClose();

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, onClose]);

  if (!open || items.length === 0) return null;

  const activeSubmenuEntry = items.find(
    (entry): entry is ContextMenuItem =>
      entry.type !== 'separator' &&
      entry.type !== 'label' &&
      entry.id === activeSubmenuId &&
      Boolean(entry.children && entry.children.length > 0)
  );

  return (
    <>
      <div
        ref={menuRef}
        role="menu"
        style={{ left: coords.left, top: coords.top }}
        className="fixed z-[70] min-w-[224px] max-w-[290px] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 dark:border-white/15 dark:bg-[#141B29] dark:ring-white/5"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {header && (
          <div className="px-2.5 py-2 mb-1 border-b border-slate-200/80 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <span
                dir="auto"
                className="text-xs font-semibold text-slate-900 dark:text-white truncate"
              >
                {header.title}
              </span>
              {header.badge && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-blue-600/15 text-blue-600 dark:text-blue-300 shrink-0">
                  {header.badge}
                </span>
              )}
            </div>
            {header.subtitle && (
              <div
                dir="auto"
                className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5"
              >
                {header.subtitle}
              </div>
            )}
          </div>
        )}

        {items.map((entry) => {
          if (entry.type === 'separator') {
            return (
              <div
                key={entry.id}
                className="my-1 h-px bg-slate-200/80 dark:bg-white/10"
              />
            );
          }

          if (entry.type === 'label') {
            return (
              <div
                key={entry.id}
                className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none"
              >
                {entry.label}
              </div>
            );
          }

          const hasChildren = Boolean(entry.children && entry.children.length > 0);
          const isSubOpen = hasChildren && activeSubmenuId === entry.id;

          return (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              aria-haspopup={hasChildren ? 'menu' : undefined}
              aria-expanded={hasChildren ? isSubOpen : undefined}
              disabled={entry.disabled}
              onMouseEnter={(e) => {
                if (hasChildren && !entry.disabled) {
                  setActiveSubmenuId(entry.id);
                  setActiveSubmenuRect(e.currentTarget.getBoundingClientRect());
                } else {
                  setActiveSubmenuId(null);
                  setActiveSubmenuRect(null);
                }
              }}
              onClick={(e) => {
                if (entry.disabled) return;
                if (hasChildren) {
                  e.stopPropagation();
                  if (isSubOpen) {
                    setActiveSubmenuId(null);
                    setActiveSubmenuRect(null);
                  } else {
                    setActiveSubmenuId(entry.id);
                    setActiveSubmenuRect(e.currentTarget.getBoundingClientRect());
                  }
                  return;
                }
                onClose();
                entry.onSelect?.();
              }}
              className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs font-medium rounded-md text-start transition-colors min-h-[36px] touch-target ${
                entry.disabled
                  ? 'opacity-40 cursor-not-allowed text-slate-400'
                  : isSubOpen
                    ? 'bg-blue-600/15 text-blue-600 dark:text-blue-300'
                    : entry.danger
                      ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="w-4 h-4 flex items-center justify-center shrink-0 opacity-85">
                  {entry.checked ? (
                    <Check className="w-3.5 h-3.5 text-blue-500" />
                  ) : (
                    entry.icon ?? null
                  )}
                </span>
                <span className="truncate">{entry.label}</span>
              </span>

              <span className="flex items-center gap-1.5 shrink-0">
                {entry.shortcut && (
                  <span
                    dir="ltr"
                    className="text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500"
                  >
                    {entry.shortcut}
                  </span>
                )}
                {hasChildren && (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 rtl:rotate-180" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {activeSubmenuEntry?.children && activeSubmenuRect && (
        <SubmenuPanel
          entries={activeSubmenuEntry.children}
          parentRect={activeSubmenuRect}
          isRtl={isRtl}
          onClose={onClose}
        />
      )}
    </>
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
