import {
  parseTimelineCSV,
  parseTimelineDataset,
  type TimelineImportDataset,
} from '@affine/core/modules/timeline';

export interface TimelineImportSource {
  id: string;
  name: string;
  manifestFile: File | null;
  dataset: TimelineImportDataset;
  mediaFiles: Map<string, File>;
  errors: string[];
}

type FileWithPath = File & { webkitRelativePath?: string };

function getFilePath(file: FileWithPath): string {
  return file.webkitRelativePath || file.name;
}

function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

function getParentPath(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash > 0 ? path.slice(0, slash) : '.';
}

function getBaseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function isManifest(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.json') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.tsv') ||
    lower.endsWith('.txt')
  );
}

function pickManifest(
  files: FileWithPath[]
): { manifest: FileWithPath; rest: FileWithPath[] } | null {
  const manifests = files.filter(f => isManifest(f.name));
  if (manifests.length === 0) return null;
  const manifest = manifests[0];
  return { manifest, rest: files.filter(f => f !== manifest) };
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Groups a `FileList` into one or more import sources.
 *
 * - When a folder is selected (`webkitRelativePath` is present) the files are
 *   grouped by the deepest directory that contains a manifest. This turns
 *   a structure like `WhatsApp/Chat/2024-01/_chat.json` + media into one
 *   import source named after that month folder.
 * - When files are selected without a directory, every manifest is treated as
 *   its own source and all other selected files are attached as media.
 */
export async function buildTimelineImportSources(
  fileList: FileList
): Promise<TimelineImportSource[]> {
  const files = Array.from(fileList) as FileWithPath[];
  const byParent = new Map<string, FileWithPath[]>();

  for (const file of files) {
    const path = getFilePath(file);
    const parent = getParentPath(path);
    const list = byParent.get(parent) ?? [];
    list.push(file);
    byParent.set(parent, list);
  }

  const manifestParents = new Set<string>();
  for (const [parent, items] of byParent) {
    if (items.some(f => isManifest(f.name))) {
      manifestParents.add(parent);
    }
  }

  const parentToFiles = new Map<string, FileWithPath[]>();

  if (manifestParents.size === 0) {
    // Flat file selection with no obvious nesting.
    parentToFiles.set('.', files);
  } else {
    for (const file of files) {
      const path = getFilePath(file);
      const parent = getParentPath(path);
      let matched = '';
      for (const mp of manifestParents) {
        if (parent === mp || parent.startsWith(`${mp}/`)) {
          if (mp.length > matched.length) matched = mp;
        }
      }
      if (matched) {
        const list = parentToFiles.get(matched) ?? [];
        list.push(file);
        parentToFiles.set(matched, list);
      }
    }
  }

  const sources: TimelineImportSource[] = [];

  for (const [parent, items] of parentToFiles) {
    const picked = pickManifest(items);
    if (!picked) continue;

    const { manifest, rest } = picked;
    const path = getFilePath(manifest);
    const name =
      parent === '.'
        ? getBaseName(getFileName(path))
        : getBaseName(getFileName(parent));

    const mediaFiles = new Map<string, File>();
    for (const f of rest) {
      mediaFiles.set(getFilePath(f), f);
    }

    const source: TimelineImportSource = {
      id: newId(),
      name,
      manifestFile: manifest,
      dataset: { version: 1, entries: [] },
      mediaFiles,
      errors: [],
    };

    const lower = manifest.name.toLowerCase();

    if (lower.endsWith('.json')) {
      try {
        const text = await manifest.text();
        const parsed = JSON.parse(text) as unknown;
        const result = parseTimelineDataset(parsed);
        if (result.dataset) {
          source.dataset = result.dataset;
          source.dataset.docTitle ??= name;
        }
        source.errors.push(...result.errors);
      } catch {
        source.errors.push(`Failed to parse ${manifest.name}`);
      }
    } else {
      const text = await manifest.text();
      const result = parseTimelineCSV(text);
      if (result.dataset) {
        source.dataset = result.dataset;
        source.dataset.docTitle ??= name;
      }
      source.errors.push(...result.errors);
    }

    if (source.dataset.entries.length === 0 && source.errors.length === 0) {
      source.errors.push('No importable entries found');
    }

    sources.push(source);
  }

  return sources.sort((a, b) => a.name.localeCompare(b.name));
}
