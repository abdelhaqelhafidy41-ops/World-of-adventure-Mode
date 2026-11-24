import React, { useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  Folder,
  Layers,
} from 'lucide-react';
import { useI18n } from '@/src/i18n';
import { SceneHierarchyNode } from '@/src/types/mod';

interface SceneHierarchyPanelProps {
  assetName: string | null;
  hierarchy: SceneHierarchyNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onToggleVisibility: (nodeId: string, visible: boolean) => void;
  onFocusNode: (nodeId: string | null) => void;
}

export const SceneHierarchyPanel: React.FC<SceneHierarchyPanelProps> = ({
  assetName,
  hierarchy,
  selectedNodeId,
  onSelectNode,
  onToggleVisibility,
  onFocusNode,
}) => {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNodes = (nodes: SceneHierarchyNode[], depth: number) => {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = !collapsed[node.id];
      const isSelected = selectedNodeId === node.id;

      return (
        <div key={node.id}>
          <div
            onClick={() => onSelectNode(node.id)}
            className={`group flex items-center justify-between pe-2 py-1 text-xs cursor-pointer transition-colors ${
              isSelected
                ? 'bg-blue-600/15 text-blue-600 dark:text-blue-300 font-medium'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
            style={{ paddingInlineStart: `${depth * 12 + 8}px` }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(node.id);
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

              <span dir="ltr" className="truncate text-[11px] font-mono">
                {node.name || node.type}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
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
                  onSelectNode(node.id);
                  onFocusNode(node.id);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 transition-opacity"
              >
                <Crosshair className="w-3 h-3" />
              </button>

              <button
                type="button"
                title={
                  node.visible ? t('hierarchy.hideNode') : t('hierarchy.showNode')
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(node.id, !node.visible);
                }}
                className={`p-0.5 rounded transition-colors ${
                  node.visible
                    ? 'text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    : 'text-amber-500'
                }`}
              >
                {node.visible ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>

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
        </div>
        {selectedNodeId && (
          <button
            type="button"
            onClick={() => onSelectNode(null)}
            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline shrink-0"
          >
            {t('hierarchy.selectRoot')}
          </button>
        )}
      </div>

      {!assetName || hierarchy.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-xs text-slate-500 dark:text-slate-400">
          {t('hierarchy.empty')}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1.5">
          {/* Scene Root Row */}
          <div
            onClick={() => onSelectNode(null)}
            className={`flex items-center justify-between px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
              selectedNodeId === null
                ? 'bg-blue-600/15 text-blue-600 dark:text-blue-300 font-medium'
                : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            <span dir="auto" className="truncate font-semibold">
              {t('hierarchy.rootSuffix', { name: assetName })}
            </span>
            <button
              type="button"
              title={t('hierarchy.focusRoot')}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(null);
                onFocusNode(null);
              }}
              className="p-0.5 text-slate-400 hover:text-blue-500"
            >
              <Crosshair className="w-3 h-3" />
            </button>
          </div>
          {renderNodes(hierarchy, 1)}
        </div>
      )}
    </div>
  );
};
