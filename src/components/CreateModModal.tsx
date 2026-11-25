import React, { useEffect, useState } from 'react';
import { FolderTree, X } from 'lucide-react';
import {
  MOD_CATEGORIES,
  suggestModId,
  validateModId,
  validateSemver,
  validateSupportedGameVersion,
} from '@/src/core/project/modScaffolder';
import { getLocalizedModTemplates } from '@/src/core/project/modTemplates';
import { useI18n } from '@/src/i18n';
import { CreateModInput, ModCategory, ModTemplateId } from '@/src/types/mod';

interface CreateModModalProps {
  open: boolean;
  defaultAuthor: string;
  defaultGameVersion: string;
  existingModIds: string[];
  onClose: () => void;
  onCreate: (input: CreateModInput) => void;
}

export const CreateModModal: React.FC<CreateModModalProps> = ({
  open,
  defaultAuthor,
  defaultGameVersion,
  existingModIds,
  onClose,
  onCreate,
}) => {
  const { t, language } = useI18n();
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [modId, setModId] = useState('');
  const [idEditedManually, setIdEditedManually] = useState(false);
  const [version, setVersion] = useState('0.1.0');
  const [author, setAuthor] = useState(defaultAuthor);
  const [description, setDescription] = useState('');
  const [descriptionAr, setDescriptionAr] = useState('');
  const [supportedGameVersion, setSupportedGameVersion] = useState(defaultGameVersion);
  const [categories, setCategories] = useState<ModCategory[]>(['Items']);
  const [templateId, setTemplateId] = useState<ModTemplateId>('blank');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setNameAr('');
      setModId('');
      setIdEditedManually(false);
      setVersion('0.1.0');
      setAuthor(defaultAuthor);
      setDescription('');
      setDescriptionAr('');
      setSupportedGameVersion(defaultGameVersion);
      setCategories(['Items']);
      setTemplateId('blank');
      setError(null);
    }
  }, [open, defaultAuthor, defaultGameVersion]);

  useEffect(() => {
    if (!idEditedManually && name.trim()) {
      setModId(suggestModId(name, author));
    }
  }, [name, author, idEditedManually]);

  if (!open) return null;

  const localizedTemplates = getLocalizedModTemplates();

  const toggleCategory = (cat: ModCategory) => {
    setCategories((prev) =>
      prev.includes(cat)
        ? prev.length > 1
          ? prev.filter((c) => c !== cat)
          : prev
        : [...prev, cat]
    );
  };

  const gameVersionValidation = validateSupportedGameVersion(supportedGameVersion);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('createMod.errNameRequired'));
      return;
    }
    const idValidation = validateModId(modId);
    if (idValidation) {
      setError(idValidation);
      return;
    }
    if (existingModIds.includes(modId.trim())) {
      setError(t('createMod.errDuplicateId', { modId: modId.trim() }));
      return;
    }
    const verValidation = validateSemver(version);
    if (verValidation) {
      setError(verValidation);
      return;
    }
    if (!gameVersionValidation.valid) {
      setError(gameVersionValidation.error ?? t('createMod.errGameVersionFormat'));
      return;
    }

    onCreate({
      modId: modId.trim(),
      name: name.trim(),
      nameAr: nameAr.trim() || undefined,
      version: version.trim(),
      author: author.trim() || t('createMod.defaultAuthorFallback'),
      description: description.trim(),
      descriptionAr: descriptionAr.trim() || undefined,
      supportedGameVersion: supportedGameVersion.trim(),
      categories,
      templateId,
    });
  };

  const selectedTemplate =
    localizedTemplates.find((tpl) => tpl.id === templateId) ?? localizedTemplates[0];

  const previewStructure = [
    'mod.manifest.json',
    'assets/',
    '  models/',
    '  textures/',
    '  audio/',
    'localization/',
    '  en.json',
    ...(nameAr.trim() || descriptionAr.trim() ? ['  ar.json'] : []),
    'scripts/',
    '  main.ts',
    'data/',
    '  registry.json',
    '  load_order.json',
    'README.md',
  ];

  const translateCategory = (cat: ModCategory): string => {
    const key = `cat.${cat}` as Parameters<typeof t>[0];
    const translated = t(key);
    return translated === key ? cat : translated;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-mod-title"
    >
      <div className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-[#121823] shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
          <div>
            <h2
              id="create-mod-title"
              className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {t('createMod.title')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('createMod.subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-8 p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="px-3 py-2.5 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('createMod.stepTemplate')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {localizedTemplates.map((tpl) => {
                  const selected = templateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        setTemplateId(tpl.id);
                        setCategories(tpl.recommendedCategories);
                      }}
                      className={`text-start p-2.5 rounded-md border transition-colors ${
                        selected
                          ? 'border-blue-600 bg-blue-600/10'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-white/10 dark:bg-[#0B0F17] dark:hover:border-white/20'
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {tpl.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {tpl.tagline}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                {selectedTemplate.description}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('createMod.modNameLabel')}
                </label>
                <input
                  type="text"
                  required
                  dir="auto"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('createMod.modNamePlaceholder')}
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('createMod.modNameArLabel')}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder={t('createMod.modNameArPlaceholder')}
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('createMod.modIdLabel')}
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={modId}
                  onChange={(e) => {
                    setIdEditedManually(true);
                    setModId(e.target.value);
                  }}
                  placeholder="com.author.emberforge"
                  className="w-full px-3 py-2 text-sm font-mono rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {t('createMod.modIdHint')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('createMod.authorLabel')}
                </label>
                <input
                  type="text"
                  required
                  dir="auto"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder={t('createMod.authorPlaceholder')}
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('createMod.versionLabel')}
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="0.1.0"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="create-mod-game-version"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  {t('createMod.gameVersionLabel')}
                </label>
                <input
                  id="create-mod-game-version"
                  type="text"
                  inputMode="decimal"
                  required
                  dir="ltr"
                  value={supportedGameVersion}
                  onChange={(e) => setSupportedGameVersion(e.target.value)}
                  placeholder={t('createMod.gameVersionPlaceholder')}
                  aria-invalid={!gameVersionValidation.valid}
                  aria-describedby={
                    !gameVersionValidation.valid
                      ? 'create-mod-game-version-error'
                      : undefined
                  }
                  className={`w-full px-3 py-2 text-sm font-mono tabular-nums rounded-md border bg-white text-slate-900 focus:outline-none focus:ring-2 dark:bg-[#0B0F17] dark:text-slate-100 ${
                    gameVersionValidation.valid
                      ? 'border-slate-300 focus:ring-blue-500 dark:border-white/10'
                      : 'border-red-500 focus:ring-red-500 dark:border-red-500/70'
                  }`}
                />
                {!gameVersionValidation.valid && (
                  <p
                    id="create-mod-game-version-error"
                    className="mt-1 text-[11px] text-red-600 dark:text-red-400"
                  >
                    {gameVersionValidation.error}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('createMod.descriptionLabel')}
                </label>
                <textarea
                  rows={2}
                  dir={language === 'ar' ? 'auto' : 'ltr'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('createMod.descriptionPlaceholder')}
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('createMod.descriptionArLabel')}
                </label>
                <textarea
                  rows={2}
                  dir="rtl"
                  value={descriptionAr}
                  onChange={(e) => setDescriptionAr(e.target.value)}
                  placeholder={t('createMod.descriptionArPlaceholder')}
                  className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#0B0F17] dark:text-slate-100 resize-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('createMod.categoriesLabel')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MOD_CATEGORIES.map((cat) => {
                  const selected = categories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                        selected
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 dark:bg-[#0B0F17] dark:text-slate-300 dark:border-white/10 dark:hover:border-white/20'
                      }`}
                    >
                      {translateCategory(cat)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-s border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <FolderTree className="w-4 h-4 text-blue-500" />
                {t('createMod.previewTreeTitle')}
              </div>
              <pre
                dir="ltr"
                className="mt-3 p-3 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B0F17] text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed overflow-x-auto text-start"
              >
                {previewStructure.join('\n')}
              </pre>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!gameVersionValidation.valid}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
              >
                {t('createMod.createBtn')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
