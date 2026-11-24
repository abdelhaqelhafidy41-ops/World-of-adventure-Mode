import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useI18n } from '@/src/i18n';
import { ModFileNode } from '@/src/types/mod';

interface FileEditorPanelProps {
  file: ModFileNode | null;
  onSaveFile: (path: string, content: string) => void;
}

export const FileEditorPanel: React.FC<FileEditorPanelProps> = ({
  file,
  onSaveFile,
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState(file?.content ?? '');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(file?.content ?? '');
    setJsonError(null);
  }, [file?.path, file?.content]);

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-center bg-slate-50 dark:bg-[#0B0F17] text-xs text-slate-500 dark:text-slate-400">
        {t('fileEditor.noFile')}
      </div>
    );
  }

  const isDirty = draft !== (file.content ?? '');
  const isJson = file.name.endsWith('.json') || file.name.endsWith('.woa3d');

  const handleChange = (val: string) => {
    setDraft(val);
    if (isJson) {
      try {
        JSON.parse(val);
        setJsonError(null);
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : 'Invalid JSON syntax');
      }
    } else {
      setJsonError(null);
    }
  };

  const handleSave = () => {
    if (jsonError) return;
    onSaveFile(file.path, draft);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0B0F17]">
      <div className="h-10 shrink-0 px-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121823] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            dir="ltr"
            className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate"
          >
            {file.path}
          </span>
          {isDirty && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 shrink-0">
              {t('fileEditor.unsavedBadge')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline text-[11px] text-slate-400">
            {t('fileEditor.readOnlyHint')}
          </span>
          <button
            type="button"
            disabled={!isDirty || Boolean(jsonError)}
            onClick={handleSave}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              !isDirty || jsonError
                ? 'text-slate-400 bg-slate-200/60 dark:bg-white/5 dark:text-slate-600 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            {t('fileEditor.saveBtn')}
          </button>
        </div>
      </div>

      {jsonError && (
        <div
          dir="auto"
          className="px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-[11px] font-mono text-red-600 dark:text-red-300"
        >
          {t('fileEditor.jsonErrorPrefix', { error: jsonError })}
        </div>
      )}

      <textarea
        dir="ltr"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        className="flex-1 w-full p-4 font-mono text-xs leading-relaxed bg-white text-slate-900 dark:bg-[#0B0F17] dark:text-slate-200 focus:outline-none resize-none text-left"
      />
    </div>
  );
};
