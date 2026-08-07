import { IconButton, Menu, MenuItem, notify } from '@affine/component';
import {
  type ImportMode,
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

/**
 * Header action that bulk-imports a timeline dataset from a JSON manifest or a
 * CSV/TSV file. JSON imports may ship optional media files; CSV/TSV imports
 * contain only the tabular data. See `modules/timeline/import/schema.ts` and
 * `modules/timeline/import/csv.ts` for the formats.
 */
export const ImportButton = () => {
  const t = useI18n();
  const importService = useService(TimelineImportService);
  const timeline = useService(Timeline);
  const existing = useLiveData(timeline.entries$) ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<ImportMode>('import');
  const modeRef = useRef<ImportMode>(mode);
  modeRef.current = mode;
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

      setImporting(true);
      try {
        const result = await importService.importDataset(dataset, mediaFiles, {
          mode: modeRef.current,
          existing: existingRef.current,
        });
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
      }
    },
    [importService, t]
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

  const menuItems = (
    <>
      <MenuItem
        checked={mode === 'import'}
        onSelect={() => {
          setMode('import');
          modeRef.current = 'import';
          inputRef.current?.click();
        }}
      >
        Import all
      </MenuItem>
      <MenuItem
        checked={mode === 'skip'}
        onSelect={() => {
          setMode('skip');
          modeRef.current = 'skip';
          inputRef.current?.click();
        }}
      >
        Skip duplicates
      </MenuItem>
      <MenuItem
        checked={mode === 'update'}
        onSelect={() => {
          setMode('update');
          modeRef.current = 'update';
          inputRef.current?.click();
        }}
      >
        Update duplicates
      </MenuItem>
    </>
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
      <Menu items={menuItems}>
        <IconButton
          disabled={importing}
          loading={importing}
          tooltip={t['com.affine.timeline.import']()}
          data-testid="timeline-import-button"
        >
          <ImportIcon />
        </IconButton>
      </Menu>
    </>
  );
};
