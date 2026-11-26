import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  Folder,
  Layers,
  Lock,
  MoreVertical,
} from 'lucide-react';
import { useLongPress } from '@/src/components/common/ContextMenu';
import { useI18n } from '@/src/i18n';
import { SceneHierarchyNode } from '@/src/types/mod';

interface SceneHierarchyPanelProps {
  assetName: string | null;
  assetLocked?: boolean;
  assetHidden?: boolean;
  assetCollection?: string;
  hierarchy: SceneHierarchyNode[];
  selectedNodeId: string | null;
  selectedNodeIds?: string[];
  selectionCleared?: boolean;
  renamingNodeId?: string | null;
  onSelectNodes: (
    nodeIds: string[],
    primaryId: string | null,
    cleared?: boolean
  ) => void;
  onToggleVisibility: (nodeId: string, visible: boolean) => void;
  onShowAll?: () => void;
  onFocusNode: (nodeId: string | null) => void;
  onNodeContextMenu?: (
    clientX: number,
    clientY: number,
    nodeId: string | null
  ) => void;
  onRenameNode?: (nodeId: string | null, newName: string) => void;
  onCancelRename?: () => void;
}

interface HierarchyRowProps {
  node: SceneHierarchyNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  isRenaming: boolean;
  renameDraft: string;
  onChangeRenameDraft: (val: string) => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onToggleExpand: () => void;
  onRowClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onLongPressOpen: (x: number, y: number) => void;
  onFocus: () => void;
  onToggleVisibility: () => void;
}

const HierarchyRow: React.FC<HierarchyRowProps> = ({
  node,
  depth,
  hasChildren,
  isExpanded,
  isSelected,
  isRenaming,
  renameDraft,
  onChangeRenameDraft,
  onSubmitRename,
  onCancelRename,
  onToggleExpand,
  onRowClick,
  onDoubleClick,
  onContextMenu,
  onLongPressOpen,
  onFocus,
  onToggleVisibility,
}) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressHandlers = useLongPress((cx, cy) => onLongPressOpen(cx, cy));

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  return (
    <div
      onClick={onRowClick}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e);
      }}
      {...longPressHandlers}
      className={`group flex items-center justify-between pe-2 py-1 text-xs cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-600/15 text-blue-600 dark:text-blue-300 font-medium'
          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
      }`}
      style={{ paddingInlineStart: `${depth * 12 + 8}px` }}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3 rtl:rotate-180" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {node.type === 'Mesh' ? (
          <Box className="w-3.5 h-3.5 text-blue-400 shrink-0" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        )}

        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            dir="auto"
            value={renameDraft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChangeRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                onSubmitRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onCancelRename();
              }
            }}
            onBlur={onSubmitRename}
            className="w-full min-w-0 px-1.5 py-0.5 text-[11px] font-mono rounded border border-blue-500 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white focus:outline-none"
          />
        ) : (
          <span dir="auto" className="truncate text-[11px] font-mono">
            {node.name || node.type}
          </span>
        )}

        {node.collection && !isRenaming && (
          <span
            dir="auto"
            className="px-1 py-0.2 text-[9px] rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 truncate max-w-[64px] shrink-0"
          >
            {node.collection}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {node.locked && (
          <span title={t('hierarchy.lockedNode')} className="text-amber-500">
            <Lock className="w-3 h-3" />
          </span>
        )}

        {node.triangleCount > 0 && (
          <span
            dir="ltr"
            className="text-[10px] font-mono tabular-nums text-slate-400 hidden sm:inline"
          >
            {node.triangleCount}
          </span>
        )}

        <button
          type="button"
          title={t('hierarchy.soloNode')}
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 transition-opacity"
        >
          <Crosshair className="w-3 h-3" />
        </button>

        <button
          type="button"
          title={node.visible ? t('hierarchy.hideNode') : t('hierarchy.showNode')}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility();
          }}
          className={`p-0.5 rounded transition-colors ${
            node.visible
              ? 'text-slate-400 hover:text-slate-800 dark:hover:text-white'
              : 'text-amber-500'
          }`}
        >
          {node.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
        </button>

        <button
          type="button"
          title={t('ctx.moreActions')}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onLongPressOpen(rect.right, rect.bottom);
          }}
          className="p-0.5 rounded opacity-60 group-hover:opacity-100 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-opacity"
        >
          <MoreVertical className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

function hasAnyHiddenNode(nodes: SceneHierarchyNode[]): boolean {
  return nodes.some((n) => !n.visible || hasAnyHiddenNode(n.children));
}

export const SceneHierarchyPanel: React.FC<SceneHierarchyPanelProps> = ({
  assetName,
  assetLocked,
  assetHidden,
  assetCollection,
  hierarchy,
  selectedNodeId,
  selectedNodeIds = [],
  selectionCleared = false,
  renamingNodeId = null,
  onSelectNodes,
  onToggleVisibility,
  onShowAll,
  onFocusNode,
  onNodeContextMenu,
  onRenameNode,
  onCancelRename,
}) => {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [localRenameId, setLocalRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const effectiveRenameId = renamingNodeId ?? localRenameId;
  const activeSelection =
    selectedNodeIds.length > 0
      ? selectedNodeIds
      : selectedNodeId
        ? [selectedNodeId]
        : [];
  const anyHidden = Boolean(assetHidden) || hasAnyHiddenNode(hierarchy);

  const rootLongPress = useLongPress((cx, cy) => {
    onSelectNodes([], null, false);
    onNodeContextMenu?.(cx, cy, null);
  });

  const beginInlineRename = (id: string, currentName: string) => {
    setLocalRenameId(id);
    setRenameDraft(currentName);
  };

  const commitInlineRename = (id: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed && onRenameNode) {
      onRenameNode(id, trimmed);
    }
    setLocalRenameId(null);
    onCancelRename?.();
  };

  const cancelInlineRename = () => {
    setLocalRenameId(null);
    onCancelRename?.();
  };

  const toggleExpand = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRowSelect = (e: React.MouseEvent, nodeId: string) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const exists = activeSelection.includes(nodeId);
      const next = exists
        ? activeSelection.filter((id) => id !== nodeId)
        : [...activeSelection, nodeId];
      const primary = next[next.length - 1] ?? null;
      onSelectNodes(next, primary, next.length === 0);
    } else {
      onSelectNodes([nodeId], nodeId, false);
    }
  };

  const renderNodes = (nodes: SceneHierarchyNode[], depth: number) => {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = !collapsed[node.id];
      const isSelected = !selectionCleared && activeSelection.includes(node.id);
      const isRenaming = effectiveRenameId === node.id;

      return (
        <div key={node.id}>
          <HierarchyRow
            node={node}
            depth={depth}
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            isSelected={isSelected}
            isRenaming={isRenaming}
            renameDraft={isRenaming ? renameDraft : node.name}
            onChangeRenameDraft={setRenameDraft}
            onSubmitRename={() => commitInlineRename(node.id)}
            onCancelRename={cancelInlineRename}
            onToggleExpand={() => toggleExpand(node.id)}
            onRowClick={(e) => handleRowSelect(e, node.id)}
            onDoubleClick={() => beginInlineRename(node.id, node.name)}
            onContextMenu={(e) => {
              if (!activeSelection.includes(node.id)) {
                onSelectNodes([node.id], node.id, false);
              }
              onNodeContextMenu?.(e.clientX, e.clientY, node.id);
            }}
            onLongPressOpen={(cx, cy) => {
              if (!activeSelection.includes(node.id)) {
                onSelectNodes([node.id], node.id, false);
              }
              onNodeContextMenu?.(cx, cy, node.id);
            }}
            onFocus={() => {
              onSelectNodes([node.id], node.id, false);
              onFocusNode(node.id);
            }}
            onToggleVisibility={() => onToggleVisibility(node.id, !node.visible)}
          />

          {hasChildren && isExpanded && renderNodes(node.children, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Layers className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
            {t('hierarchy.title')}
          </span>
          {activeSelection.length > 1 && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-blue-600/15 text-blue-600 dark:text-blue-300 shrink-0">
              {t('hierarchy.multiHint', { count: activeSelection.length })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {anyHidden && onShowAll && (
            <button
              type="button"
              onClick={onShowAll}
              className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline shrink-0"
            >
              {t('hierarchy.showAll')}
            </button>
          )}
          {(activeSelection.length > 0 || selectionCleared) && (
            <button
              type="button"
              onClick={() => onSelectNodes([], null, false)}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline shrink-0"
            >
              {t('hierarchy.selectRoot')}
            </button>
          )}
        </div>
      </div>

      {!assetName || hierarchy.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-slate-500 dark:text-slate-400">
          {t('hierarchy.empty')}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1.5">
          {/* Scene Root Row */}
          <div
            onClick={() => onSelectNodes([], null, false)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectNodes([], null, false);
              onNodeContextMenu?.(e.clientX, e.clientY, null);
            }}
            {...rootLongPress}
            className={`group flex items-center justify-between px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
              !selectionCleared && activeSelection.length === 0
                ? 'bg-blue-600/15 text-blue-600 dark:text-blue-300 font-medium'
                : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <span dir="auto" className="truncate font-semibold">
                {t('hierarchy.rootSuffix', { name: assetName })}
              </span>
              {assetCollection && (
                <span
                  dir="auto"
                  className="px-1 py-0.2 text-[9px] rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 truncate max-w-[70px]"
                >
                  {assetCollection}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {assetLocked && <Lock className="w-3 h-3 text-amber-500" />}
              {assetHidden && <EyeOff className="w-3 h-3 text-amber-500" />}
              <button
                type="button"
                title={t('hierarchy.focusRoot')}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNodes([], null, false);
                  onFocusNode(null);
                }}
                className="p-0.5 text-slate-400 hover:text-blue-500"
              >
                <Crosshair className="w-3 h-3" />
              </button>
              <button
                type="button"
                title={t('ctx.moreActions')}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  onSelectNodes([], null, false);
                  onNodeContextMenu?.(rect.right, rect.bottom, null);
                }}
                className="p-0.5 opacity-60 group-hover:opacity-100 text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <MoreVertical className="w-3 h-3" />
              </button>
            </div>
          </div>
          {renderNodes(hierarchy, 1)}
        </div>
      )}
    </div>
  );
};
