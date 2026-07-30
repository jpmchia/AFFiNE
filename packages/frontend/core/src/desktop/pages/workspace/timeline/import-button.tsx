import { IconButton, notify } from '@affine/component';
import {
  parseTimelineDataset,
  TimelineImportService,
} from '@affine/core/modules/timeline';
import { useI18n } from '@affine/i18n';
import { ImportIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback, useRef, useState } from 'react';

/**
 * Header action that bulk-imports a timeline dataset: a JSON manifest plus
 * optional media files (images become image blocks, everything else becomes
 * attachment blocks). See `modules/timeline/import/schema.ts` for the format.
 */
export const ImportButton = () => {
  const t = useI18n();
  const importService = useService(TimelineImportService);
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const files = [...fileList];
      const manifestFile = files.find(f =>
        f.name.toLowerCase().endsWith('.json')
      );
      if (!manifestFile) {
        notify.error({
          title: t['com.affine.timeline.import.failed'](),
          message: t['com.affine.timeline.import.no-manifest'](),
        });
        return;
      }

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

      const { dataset, errors } = parseTimelineDataset(parsed);
      if (!dataset) {
        notify.error({
          title: t['com.affine.timeline.import.failed'](),
          message: errors.slice(0, 5).join('\n'),
        });
        return;
      }

      const mediaFiles = new Map<string, File>();
      for (const file of files) {
        if (file === manifestFile) continue;
        const key =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
          file.name;
        // keys are also matched by base name, see resolveMediaFile
        mediaFiles.set(key, file);
      }

      setImporting(true);
      try {
        const result = await importService.importDataset(dataset, mediaFiles);
        if (result.skipped.length > 0) {
          notify.warning({
            title: t.t('com.affine.timeline.import.partial', {
              count: String(result.imported),
              skipped: String(result.skipped.length),
            }),
            message: result.skipped.slice(0, 5).join('\n'),
          });
        } else {
          notify.success({
            title: t.t('com.affine.timeline.import.success', {
              count: String(result.imported),
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

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleChange}
        data-testid="timeline-import-input"
      />
      <IconButton
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        loading={importing}
        tooltip={t['com.affine.timeline.import']()}
        data-testid="timeline-import-button"
      >
        <ImportIcon />
      </IconButton>
    </>
  );
};
