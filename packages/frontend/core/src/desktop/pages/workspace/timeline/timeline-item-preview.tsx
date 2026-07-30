import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import {
  AttachmentIcon,
  BookmarkIcon,
  CheckBoxCheckSolidIcon,
  CheckBoxUnIcon,
} from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import bytesFormat from 'bytes';
import { useEffect, useMemo, useState } from 'react';

import type { TimelineBlockPreview } from '../../../../modules/timeline';
import { stripParsedPrefixes } from '../../../../modules/timeline';
import * as styles from './index.css';

function useBlobUrl(sourceId: string | undefined) {
  const workspaceService = useService(WorkspaceService);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    workspaceService.workspace.docCollection.blobSync
      .get(sourceId)
      .then(blob => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sourceId, workspaceService]);

  return url;
}

const TextPreview = ({ text }: { text: string }) => (
  <div className={styles.itemExcerpt}>{text}</div>
);

const ListPreview = ({
  preview,
}: {
  preview: Extract<TimelineBlockPreview, { kind: 'list' }>;
}) => (
  <div className={styles.previewRow}>
    {preview.listType === 'todo' ? (
      preview.checked ? (
        <CheckBoxCheckSolidIcon className={styles.listCheckedIcon} />
      ) : (
        <CheckBoxUnIcon className={styles.listIcon} />
      )
    ) : null}
    <span className={styles.itemExcerpt}>{preview.text}</span>
  </div>
);

const CodePreview = ({
  preview,
}: {
  preview: Extract<TimelineBlockPreview, { kind: 'code' }>;
}) => (
  <div className={styles.codeExcerpt}>
    {preview.language ? (
      <span className={styles.codeLanguage}>{preview.language}</span>
    ) : null}
    <code>{preview.text}</code>
  </div>
);

const CalloutPreview = ({
  preview,
}: {
  preview: Extract<TimelineBlockPreview, { kind: 'callout' }>;
}) => (
  <div className={styles.previewRow}>
    {preview.emoji ? <span>{preview.emoji}</span> : null}
    <span className={styles.itemExcerpt}>{preview.text}</span>
  </div>
);

const ImagePreview = ({
  preview,
}: {
  preview: Extract<TimelineBlockPreview, { kind: 'image' }>;
}) => {
  const url = useBlobUrl(preview.sourceId);
  return (
    <div className={styles.imageExcerpt}>
      {url ? (
        <img src={url} alt={preview.caption ?? ''} className={styles.image} />
      ) : null}
      {preview.caption ? (
        <span className={styles.itemExcerpt}>{preview.caption}</span>
      ) : null}
    </div>
  );
};

const AttachmentPreview = ({
  preview,
}: {
  preview: Extract<TimelineBlockPreview, { kind: 'attachment' }>;
}) => (
  <div className={styles.previewRow}>
    <AttachmentIcon />
    <span>{preview.name || preview.type}</span>
    {preview.size ? (
      <span className={styles.attachmentSize}>
        {bytesFormat.format(preview.size)}
      </span>
    ) : null}
  </div>
);

const BookmarkPreview = ({
  preview,
}: {
  preview: Extract<TimelineBlockPreview, { kind: 'bookmark' }>;
}) => (
  <div className={styles.bookmarkExcerpt}>
    <BookmarkIcon />
    <div className={styles.bookmarkText}>
      <span className={styles.bookmarkTitle}>
        {preview.title || preview.url}
      </span>
      {preview.description ? (
        <span className={styles.itemExcerpt}>{preview.description}</span>
      ) : null}
    </div>
  </div>
);

const TablePreview = ({
  preview,
}: {
  preview: Extract<TimelineBlockPreview, { kind: 'table' }>;
}) => {
  const t = useI18n();
  return (
    <div className={styles.itemExcerpt}>
      {t['com.affine.timeline.preview.table']({
        rows: String(preview.rowCount),
        columns: String(preview.columnCount),
      })}
    </div>
  );
};

export const TimelineItemPreview = ({
  preview: rawPreview,
  hidePrefix,
  hideTagPrefix,
}: {
  preview: TimelineBlockPreview;
  /** a parsed date/time prefix to hide from the content text */
  hidePrefix?: string;
  /** a parsed tag prefix to hide from the content text */
  hideTagPrefix?: string;
}) => {
  const preview = useMemo(() => {
    if (!hidePrefix && !hideTagPrefix) return rawPreview;
    if (
      rawPreview.kind === 'text' ||
      rawPreview.kind === 'list' ||
      rawPreview.kind === 'code' ||
      rawPreview.kind === 'callout'
    ) {
      return {
        ...rawPreview,
        text: stripParsedPrefixes(rawPreview.text, [hidePrefix, hideTagPrefix]),
      };
    }
    return rawPreview;
  }, [rawPreview, hidePrefix, hideTagPrefix]);

  switch (preview.kind) {
    case 'text':
      return <TextPreview text={preview.text} />;
    case 'list':
      return <ListPreview preview={preview} />;
    case 'code':
      return <CodePreview preview={preview} />;
    case 'callout':
      return <CalloutPreview preview={preview} />;
    case 'image':
      return <ImagePreview preview={preview} />;
    case 'attachment':
      return <AttachmentPreview preview={preview} />;
    case 'bookmark':
      return <BookmarkPreview preview={preview} />;
    case 'table':
      return <TablePreview preview={preview} />;
    default:
      return <TextPreview text={preview.excerpt} />;
  }
};
