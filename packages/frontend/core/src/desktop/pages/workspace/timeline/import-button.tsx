import { IconButton, notify } from '@affine/component';
import { OrganizeService } from '@affine/core/modules/organize';
import {
  parseTimelineCSV,
  parseTimelineDataset,
  Timeline,
  type TimelineImportDataset,
  TimelineImportService,
} from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { ImportIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useRef, useState } from 'react';

import {
  ImportOptionsDialog,
  type ImportOptionsResult,
} from './import-options-dialog';

/**
 * Header action that bulk-imports a timeline dataset from a JSON manifest or a
 * CSV/TSV file. JSON imports may ship optional media files; CSV/TSV imports
 * contain only the tabular data. See `modules/timeline/import/schema.ts` and
 * `modules/timeline/import/csv.ts` for the formats.
 */
export const ImportButton = () => {
  const t = useI18n();
  const importService = useService(TimelineImportService);
  const organizeService = useService(OrganizeService);
  const timeline = useService(Timeline);
  const existing = useLiveData(timeline.entries$) ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [pending, setPending] = useState<{
    dataset: TimelineImportDataset;
    mediaFiles: Map<string, File>;
  } | null>(null);
  const existingRef = useRef(existing);
  existingRef.current = existing;

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const files = [...fileList];
      const manifestFile = files.find(f =>
        f.name.toLowerCase().endsWith('.json')
      );
      const csvFile = files.find(f => {
        const name = f.name.toLowerCase();
        return (
          name.endsWith('.csv') ||
          name.endsWith('.tsv') ||
          name.endsWith('.txt')
        );
      });

      if (!manifestFile && !csvFile) {
        notify.error({
          title: t['com.affine.timeline.import.failed'](),
          message: 'Please select a JSON manifest or a CSV/TSV file.',
        });
        return;
      }

      let dataset: TimelineImportDataset | undefined;
      let errors: string[] = [];
      let mediaFiles = new Map<string, File>();

      if (manifestFile) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await manifestFile.text());
        } catch {
          notify.error({
            title: t['com.affine.timeline.import.failed'](),
            message: t['com.affine.timeline.import.invalid-json'](),
          });
          return;
        }
        const result = parseTimelineDataset(parsed);
        dataset = result.dataset;
        errors = result.errors;

        mediaFiles = new Map<string, File>();
        for (const file of files) {
          if (file === manifestFile) continue;
          const key =
            (file as File & { webkitRelativePath?: string })
              .webkitRelativePath || file.name;
          // keys are also matched by base name, see resolveMediaFile
          mediaFiles.set(key, file);
        }
      } else if (csvFile) {
        const source = await csvFile.text();
        const result = parseTimelineCSV(source);
        dataset = result.dataset;
        errors = result.errors;

        if (dataset) {
          dataset.docTitle = csvFile.name.replace(/\.[^.]+$/, '');
        }
      }

      if (!dataset) {
        notify.error({
          title: t['com.affine.timeline.import.failed'](),
          message: errors.slice(0, 5).join('\n'),
        });
        return;
      }

      setPending({ dataset, mediaFiles });
    },
    [t]
  );

  const handleConfirmImport = useCallback(
    async (options: ImportOptionsResult) => {
      if (!pending) return;
      const { dataset, mediaFiles } = pending;

      setImporting(true);
      try {
        const result = await importService.importDataset(dataset, mediaFiles, {
          mode: options.mode,
          existing: existingRef.current,
          docTitle: options.docTitle || undefined,
          category:
            options.category.kind === 'none'
              ? undefined
              : options.category.name,
        });

        if (result.docId && options.folder.kind !== 'none') {
          const rootFolder = organizeService.folderTree.rootFolder;
          const folderNode =
            options.folder.kind === 'existing'
              ? options.folder.node
              : organizeService.folderTree.folderNode$(
                  rootFolder.createFolder(
                    options.folder.name,
                    rootFolder.indexAt('before')
                  )
                ).value;
          folderNode?.createLink(
            'doc',
            result.docId,
            folderNode.indexAt('after')
          );
        }

        const totalImported = result.imported + result.updated;
        if (result.skipped.length > 0) {
          notify.warning({
            title: t.t('com.affine.timeline.import.partial', {
              count: String(totalImported),
              skipped: String(result.skipped.length),
            }),
            message: result.skipped.slice(0, 5).join('\n'),
          });
        } else {
          notify.success({
            title: t.t('com.affine.timeline.import.success', {
              count: String(totalImported),
            }),
          });
        }
      } catch (error) {
        notify.error({
          title: t['com.affine.timeline.import.failed'](),
          message: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setImporting(false);
        setPending(null);
      }
    },
    [importService, organizeService, pending, t]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (fileList?.length) {
        handleFiles(fileList).catch(console.error);
      }
      e.target.value = '';
    },
    [handleFiles]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.csv,.tsv,.txt"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
        data-testid="timeline-import-input"
      />
      <IconButton
        disabled={importing}
        loading={importing}
        tooltip={t['com.affine.timeline.import']()}
        data-testid="timeline-import-button"
        onClick={() => inputRef.current?.click()}
      >
        <ImportIcon />
      </IconButton>
      <ImportOptionsDialog
        open={pending !== null}
        defaultTitle={
          pending?.dataset.docTitle ??
          `Timeline import ${new Date().toISOString().slice(0, 10)}`
        }
        importing={importing}
        onConfirm={options => {
          handleConfirmImport(options).catch(console.error);
        }}
        onCancel={() => {
          if (!importing) setPending(null);
        }}
      />
    </>
  );
};
