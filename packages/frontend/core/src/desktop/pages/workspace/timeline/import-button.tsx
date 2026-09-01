import { IconButton, notify } from '@affine/component';
import { OrganizeService } from '@affine/core/modules/organize';
import { Timeline, TimelineImportService } from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { ImportIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useRef, useState } from 'react';

import {
  ImportOptionsDialog,
  type ImportOptionsResult,
} from './import-options-dialog';
import {
  buildTimelineImportSources,
  type TimelineImportSource,
} from './import-source';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<TimelineImportSource[]>([]);
  const existingRef = useRef(existing);
  existingRef.current = existing;

  const handleAddFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAddFolder = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList) return;
      setImporting(true);
      try {
        const built = await buildTimelineImportSources(fileList);
        if (built.length === 0) {
          notify.error({
            title: t['com.affine.timeline.import.failed'](),
            message: 'No valid dataset files were found.',
          });
        }
        setSources(prev => [...prev, ...built]);
      } finally {
        setImporting(false);
      }
    },
    [t]
  );

  const handleConfirmImport = useCallback(
    async (options: ImportOptionsResult) => {
      const validSources = sources.filter(
        s => s.dataset.entries.length > 0 && s.errors.length === 0
      );
      if (validSources.length === 0) return;

      setImporting(true);
      try {
        const rootFolder = organizeService.folderTree.rootFolder;
        let folderNode: any = null;
        if (options.folder.kind === 'existing') {
          folderNode = options.folder.node;
        } else if (options.folder.kind === 'new') {
          const id = rootFolder.createFolder(
            options.folder.name,
            rootFolder.indexAt('before')
          );
          folderNode = organizeService.folderTree.folderNode$(id).value;
        }

        const prefix = options.docTitle.trim();

        let imported = 0;
        let updated = 0;
        const skipped: string[] = [];

        for (const source of validSources) {
          const docTitle = prefix ? `${prefix} — ${source.name}` : source.name;

          const result = await importService.importDataset(
            source.dataset,
            source.mediaFiles,
            {
              mode: options.mode,
              existing: existingRef.current,
              docTitle,
              category:
                options.category.kind === 'none'
                  ? undefined
                  : options.category.name,
            }
          );

          if (folderNode && result.docId) {
            folderNode.createLink(
              'doc',
              result.docId,
              folderNode.indexAt('after')
            );
          }

          imported += result.imported;
          updated += result.updated;
          skipped.push(...result.skipped);
        }

        const total = imported + updated;
        if (skipped.length > 0) {
          notify.warning({
            title: t.t('com.affine.timeline.import.partial', {
              count: String(total),
              skipped: String(skipped.length),
            }),
            message: skipped.slice(0, 5).join('\n'),
          });
        } else {
          notify.success({
            title: t['com.affine.timeline.import.success']({
              count: String(total),
            }),
          });
        }

        setOpen(false);
        setSources([]);
      } catch (error) {
        notify.error({
          title: t['com.affine.timeline.import.failed'](),
          message: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setImporting(false);
      }
    },
    [importService, organizeService, sources, t]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (fileList?.length) {
        handleFilesSelected(fileList).catch(console.error);
      }
      e.target.value = '';
    },
    [handleFilesSelected]
  );

  const handleCancel = useCallback(() => {
    setOpen(false);
    setSources([]);
  }, []);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv,.tsv,.txt"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        data-testid="timeline-import-input"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error non-standard directory attributes
        webkitdirectory="true"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
        data-testid="timeline-import-folder-input"
      />
      <IconButton
        disabled={importing}
        loading={importing}
        tooltip={t['com.affine.timeline.import']()}
        data-testid="timeline-import-button"
        onClick={() => setOpen(true)}
      >
        <ImportIcon />
      </IconButton>
      <ImportOptionsDialog
        open={open}
        defaultTitle=""
        importing={importing}
        sources={sources}
        onAddFiles={handleAddFiles}
        onAddFolder={handleAddFolder}
        onRemoveSource={index =>
          setSources(prev => prev.filter((_, i) => i !== index))
        }
        onConfirm={options => {
          handleConfirmImport(options).catch(console.error);
        }}
        onCancel={handleCancel}
      />
    </>
  );
};
