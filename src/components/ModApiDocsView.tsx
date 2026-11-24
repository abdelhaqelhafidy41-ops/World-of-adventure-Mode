import React, { useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import {
  WOA_COMPATIBLE_PACKAGE_FORMATS,
  WOA_MOD_API_SCHEMA,
  WOA_MOD_API_VERSION,
  WOA_PACKAGE_FORMAT_VERSION,
  buildModApiSpecJson,
  getWoaCompatibilityMatrix,
  getWoaModApiDomains,
} from '@/src/core/api/woaModApiSpec';
import { triggerBlobDownload } from '@/src/core/builder/modBuilder';
import { useI18n } from '@/src/i18n';

export const ModApiDocsView: React.FC = () => {
  const { t } = useI18n();
  const domains = getWoaModApiDomains();
  const compatibilityMatrix = getWoaCompatibilityMatrix();

  const [selectedDomainId, setSelectedDomainId] = useState<string>(
    domains[0]?.id ?? 'manifest'
  );
  const [copiedSpec, setCopiedSpec] = useState(false);

  const activeDomain =
    domains.find((d) => d.id === selectedDomainId) ?? domains[0];

  const handleCopySpec = async () => {
    try {
      await navigator.clipboard.writeText(buildModApiSpecJson());
      setCopiedSpec(true);
      setTimeout(() => setCopiedSpec(false), 1600);
    } catch {
      // clipboard fallback
    }
  };

  const handleDownloadSpec = () => {
    const blob = new Blob([buildModApiSpecJson()], {
      type: 'application/json',
    });
    triggerBlobDownload(blob, 'woa-mod-api.v1.json');
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 pb-20 md:pb-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <section className="pb-6 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
              {t('apiDocs.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t('apiDocs.subtitle')} (
              <span dir="ltr" className="font-mono">
                {WOA_MOD_API_SCHEMA} · v{WOA_MOD_API_VERSION}
              </span>
              )
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopySpec()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-[#121823] dark:text-slate-200 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedSpec ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  {t('apiDocs.copiedSpecBtn')}
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  {t('apiDocs.copySpecBtn')}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadSpec}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {t('apiDocs.downloadSpec')}
            </button>
          </div>
        </section>

        {/* Core Architecture Guarantees */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823]">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              {t('apiDocs.zeroNativeTitle')}
            </div>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('apiDocs.zeroNativeDesc')}
            </p>
          </div>

          <div className="p-4 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823]">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <Layers className="w-4 h-4 text-blue-500 shrink-0" />
              {t('apiDocs.versionedTitle', { ver: WOA_PACKAGE_FORMAT_VERSION })}
            </div>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('apiDocs.versionedDesc', {
                formats: WOA_COMPATIBLE_PACKAGE_FORMATS.join(' & '),
              })}
            </p>
          </div>

          <div className="p-4 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823]">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
              {t('apiDocs.loadOrderTitle')}
            </div>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('apiDocs.loadOrderDesc')}
            </p>
          </div>
        </section>

        {/* Two-Column API Domain Browser */}
        <section className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-e border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] p-3 space-y-1">
            <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {t('apiDocs.schemaDomains')} ({domains.length})
            </div>
            {domains.map((domain) => {
              const active = domain.id === activeDomain.id;
              return (
                <button
                  key={domain.id}
                  type="button"
                  onClick={() => setSelectedDomainId(domain.id)}
                  className={`w-full text-start px-3 py-2.5 rounded-md border transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-600/10 text-slate-900 dark:text-white'
                      : 'border-transparent hover:bg-slate-200/60 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-semibold">{domain.title}</div>
                  <div dir="ltr" className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {domain.schemaId} · v{domain.sinceApiVersion}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8 p-6 space-y-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {activeDomain.title}
                </h2>
                <span dir="ltr" className="font-mono text-xs text-blue-600 dark:text-blue-400">
                  {activeDomain.schemaId}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                <span dir="ltr" className="font-mono">
                  {t('apiDocs.archiveTarget', { file: activeDomain.file })}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {activeDomain.summary}
              </p>
            </div>

            <div className="border border-slate-200 dark:border-white/10 rounded-md overflow-hidden">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E131D] text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3 font-medium">{t('apiDocs.fieldColName')}</th>
                    <th className="py-2 px-3 font-medium">{t('apiDocs.fieldColType')}</th>
                    <th className="py-2 px-3 font-medium">{t('apiDocs.fieldColReq')}</th>
                    <th className="py-2 px-3 font-medium">{t('apiDocs.fieldColDesc')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                  {activeDomain.fields.map((f) => (
                    <tr key={f.name}>
                      <td dir="ltr" className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {f.name}
                      </td>
                      <td dir="ltr" className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">
                        {f.type}
                      </td>
                      <td className="py-2 px-3">
                        {f.required ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {t('common.yes')}
                          </span>
                        ) : (
                          <span className="text-slate-400">{t('apiDocs.optionalShort')}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                        {f.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                {t('apiDocs.examplePayload')}
              </div>
              <pre
                dir="ltr"
                className="p-4 rounded-md border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0F17] text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed"
              >
                {activeDomain.exampleJson}
              </pre>
            </div>
          </div>
        </section>

        {/* Backward Compatibility Matrix */}
        <section className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t('apiDocs.compatMatrix')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {compatibilityMatrix.map((rule) => (
              <div
                key={rule.formatVersion}
                className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121823] p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {rule.label}
                  </div>
                  <span dir="ltr" className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    WoA {rule.gameVersions}
                  </span>
                </div>
                <ul dir="ltr" className="space-y-1 text-xs font-mono text-slate-600 dark:text-slate-300">
                  {rule.supportedFiles.map((fileLine) => (
                    <li key={fileLine}>· {fileLine}</li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-2 border-t border-slate-200 dark:border-white/10">
                  {rule.migrationBehavior}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
