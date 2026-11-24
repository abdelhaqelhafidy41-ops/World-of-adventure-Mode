import React, { useState } from 'react';
import {
  Box,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Trash2,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuItem,
  useLongPress,
} from '@/src/components/common/ContextMenu';
import { useI18n } from '@/src/i18n';
import { usePlatform } from '@/src/platform';
import { ModFileNode } from '@/src/types/mod';

interface ModStructureExplorerProps {
  modName: string;
  files: ModFileNode[];
  selectedFilePath: string | null;
  onSelectFile: (node: ModFileNode) => void;
  onAddFile: (parentPath: string, fileName: string, kind: 'script' | 'data') => void;
  onDeleteFile: (path: string) => void;
}

const TreeRowWrapper: React.FC<{
  className: string;
  style: React.CSSProperties;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onLongPress: (x: number, y: number) => void;
  children: React.ReactNode;
}> = ({ className, style, onClick, onContextMenu, onLongPress, children }) => {
  const longPressHandlers = useLongPress(onLongPress);
  return (
    <div
      className={className}
      style={style}
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...longPressHandlers}
    >
      {children}
    </div>
  );
};

export const ModStructureExplorer: React.FC<ModStructureExplorerProps> = ({
  modName,
  files,
  selectedFilePath,
  onSelectFile,
  onAddFile,
  onDeleteFile,
}) => {
  const { t } = useI18n();
  const platformInfo = usePlatform();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    assets: true,
    'assets/models': true,
    'assets/textures': true,
    'assets/audio': true,
    scripts: true,
    data: true,
  });
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    node: ModFileNode;
    x: number;
    y: number;
  } | null>(null);

  const toggleFolder = (path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const getIcon = (node: ModFileNode, isOpen: boolean) => {
    if (node.type === 'folder') {
      return isOpen ? (
        <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      ) : (
        <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      );
    }
    if (node.type === 'asset-3d') return <Box className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    if (node.type === 'texture') return <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (node.type === 'script') return <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    if (node.type === 'manifest' || node.type === 'data') {
      return <FileJson className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    }
    if (node.type === 'audio') return <Music className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    return <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  };

  const sortNodes = (nodes: ModFileNode[]) =>
    [...nodes].sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      return a.name.localeCompare(b.name);
    });

  const handleCreateSubmit = (e: React.FormEvent, parentPath: string) => {
    e.preventDefault();
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    const isScript = parentPath === 'scripts' || trimmed.endsWith('.ts') || trimmed.endsWith('.js');
    const normalized =
      trimmed.includes('.') ? trimmed : `${trimmed}.${isScript ? 'ts' : 'json'}`;
    onAddFile(parentPath, normalized, isScript ? 'script' : 'data');
    setNewFileName('');
    setAddingIn(null);
    setExpanded((prev) => ({ ...prev, [parentPath]: true }));
  };

  const buildNodeMenuItems = (node: ModFileNode): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const canAddInside = node.path === 'scripts' || node.path === 'data';
    const isProtected =
      node.path === 'mod.manifest.json' ||
      node.type === 'folder' ||
      node.path === 'scripts/main.ts';

    if (node.type === 'folder') {
      items.push({
        id: 'toggle',
        label: t('ctx.open'),
        icon: <FolderOpen className="w-3.5 h-3.5" />,
        onSelect: () => toggleFolder(node.path),
      });
    } else {
      items.push({
        id: 'open-editor',
        label: t('ctx.openEditor'),
        icon: <FileText className="w-3.5 h-3.5" />,
        onSelect: () => onSelectFile(node),
      });
    }

    if (canAddInside) {
      items.push({
        id: 'new-file',
        label: t('ctx.newFile'),
        icon: <FilePlus className="w-3.5 h-3.5" />,
        onSelect: () => {
          setAddingIn(node.path);
          setNewFileName('');
          setExpanded((prev) => ({ ...prev, [node.path]: true }));
        },
      });
    }

    if (!isProtected) {
      items.push({
        id: 'delete',
        label: t('ctx.delete'),
        icon: <Trash2 className="w-3.5 h-3.5" />,
        danger: true,
        onSelect: () => onDeleteFile(node.path),
      });
    }

    return items;
  };

  const renderTree = (parentPath: string | null, depth: number) => {
    const children = sortNodes(files.filter((f) => f.parentPath === parentPath));
    return children.map((node) => {
      const isFolder = node.type === 'folder';
      const isOpen = !!expanded[node.path];
      const isSelected = node.path === selectedFilePath;
      const canAddInside = node.path === 'scripts' || node.path === 'data';
      const isProtected =
        node.path === 'mod.manifest.json' ||
        node.type === 'folder' ||
        node.path === 'scripts/main.ts';

      return (
        <div key={node.id}>
          <TreeRowWrapper
            className={`group flex items-center justify-between pe-2 py-1.5 text-xs cursor-pointer transition-colors ${
              isSelected
                ? 'bg-blue-600/15 text-blue-600 dark:text-blue-300 font-medium'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
            style={{ paddingInlineStart: `${depth * 12 + 8}px` }}
            onClick={() => {
              if (isFolder) toggleFolder(node.path);
              else onSelectFile(node);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ node, x: e.clientX, y: e.clientY });
            }}
            onLongPress={(x, y) => setContextMenu({ node, x, y })}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isFolder ? (
                isOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 rtl:rotate-180" />
                )
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              {getIcon(node, isOpen)}
              <span dir="ltr" className="truncate font-mono text-[11px]">
                {node.name}
              </span>
            </div>

            <div
              className={`flex items-center gap-1 transition-opacity shrink-0 ${
                isSelected || platformInfo.isTouchPrimary
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              {canAddInside && (
                <button
                  type="button"
                  title={t('explorer.newFile')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddingIn(node.path);
                    setNewFileName('');
                    setExpanded((prev) => ({ ...prev, [node.path]: true }));
                  }}
                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                </button>
              )}
              {!isProtected && (
                <button
                  type="button"
                  title={t('explorer.deleteTooltip')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(node.path);
                  }}
                  className="p-1 rounded hover:bg-red-500/15 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </TreeRowWrapper>

          {isFolder && isOpen && (
            <div>
              {addingIn === node.path && (
                <form
                  onSubmit={(e) => handleCreateSubmit(e, node.path)}
                  className="py-1 pe-2"
                  style={{ paddingInlineStart: `${(depth + 1) * 12 + 24}px` }}
                >
                  <input
                    autoFocus
                    dir="ltr"
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onBlur={() => setAddingIn(null)}
                    placeholder={node.path === 'scripts' ? 'helper.ts' : 'items.json'}
                    className="w-full px-2 py-1 text-[11px] font-mono rounded border border-blue-500 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </form>
              )}
              {renderTree(node.path, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10 flex items-center justify-between shrink-0 gap-2">
        <span dir="auto" className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
          {modName}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
          {t('explorer.filesCount', { count: files.filter((f) => f.type !== 'folder').length })}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1.5">{renderTree(null, 0)}</div>

      <ContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        items={contextMenu ? buildNodeMenuItems(contextMenu.node) : []}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
};
