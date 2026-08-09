import {
  Button,
  Input,
  Menu,
  MenuItem,
  Modal,
  RadioGroup,
  type RadioItem,
} from '@affine/component';
import {
  type FolderNode,
  OrganizeService,
} from '@affine/core/modules/organize';
import {
  type ImportMode,
  TimelineSetting,
} from '@affine/core/modules/timeline';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

export type ImportFolderSelection =
  | { kind: 'none' }
  | { kind: 'existing'; node: FolderNode; name: string }
  | { kind: 'new'; name: string };

export type ImportCategorySelection =
  | { kind: 'none' }
  | { kind: 'existing'; name: string }
  | { kind: 'new'; name: string };

export interface ImportOptionsResult {
  mode: ImportMode;
  docTitle: string;
  folder: ImportFolderSelection;
  category: ImportCategorySelection;
}

const MODE_ITEMS: RadioItem[] = [
  { value: 'import', label: 'Import all' },
  { value: 'skip', label: 'Skip duplicates' },
  { value: 'update', label: 'Update duplicates' },
];

const FolderMenuItem = ({
  node,
  depth,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  onSelect: (node: FolderNode, name: string) => void;
}) => {
  const type = useLiveData(node.type$);
  const name = useLiveData(node.name$);
  const children = useLiveData(node.sortedChildren$);
  if (type !== 'folder') return null;
  return (
    <>
      <MenuItem
        onSelect={() => onSelect(node, name || 'Unnamed folder')}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {name || 'Unnamed folder'}
      </MenuItem>
      {children.map(child => (
        <FolderMenuItem
          key={child.id}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </>
  );
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 12,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  opacity: 0.7,
};

/**
 * Dialog shown before a timeline import runs. Lets the user set the target
 * document name, choose or create a destination folder, and choose or create
 * a category applied to entries that do not define their own.
 */
export const ImportOptionsDialog = ({
  open,
  defaultTitle,
  importing,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  defaultTitle: string;
  importing: boolean;
  onConfirm: (result: ImportOptionsResult) => void;
  onCancel: () => void;
}) => {
  const organizeService = useService(OrganizeService);
  const timelineSetting = useService(TimelineSetting);
  const rootFolder = organizeService.folderTree.rootFolder;
  const rootFolders = useLiveData(rootFolder.sortedChildren$);
  const categories = useLiveData(timelineSetting.categories$) ?? [];

  const [mode, setMode] = useState<ImportMode>('import');
  const [docTitle, setDocTitle] = useState(defaultTitle);
  const [folder, setFolder] = useState<ImportFolderSelection>({
    kind: 'none',
  });
  const [newFolderName, setNewFolderName] = useState('');
  const [category, setCategory] = useState<ImportCategorySelection>({
    kind: 'none',
  });
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (open) {
      setMode('import');
      setDocTitle(defaultTitle);
      setFolder({ kind: 'none' });
      setNewFolderName('');
      setCategory({ kind: 'none' });
      setNewCategoryName('');
    }
  }, [open, defaultTitle]);

  const handleSelectFolder = useCallback((node: FolderNode, name: string) => {
    setFolder({ kind: 'existing', node, name });
    setNewFolderName('');
  }, []);

  const handleConfirm = useCallback(() => {
    const trimmedFolder = newFolderName.trim();
    const trimmedCategory = newCategoryName.trim();
    onConfirm({
      mode,
      docTitle: docTitle.trim(),
      folder: trimmedFolder ? { kind: 'new', name: trimmedFolder } : folder,
      category: trimmedCategory
        ? { kind: 'new', name: trimmedCategory }
        : category,
    });
  }, [
    onConfirm,
    mode,
    docTitle,
    folder,
    newFolderName,
    category,
    newCategoryName,
  ]);

  const folderLabel =
    newFolderName.trim() !== ''
      ? `New folder: ${newFolderName.trim()}`
      : folder.kind === 'existing'
        ? folder.name
        : 'No folder';

  const categoryLabel =
    newCategoryName.trim() !== ''
      ? `New category: ${newCategoryName.trim()}`
      : category.kind === 'existing'
        ? category.name
        : 'No category';

  return (
    <Modal
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) onCancel();
      }}
      title="Import timeline"
      description="Choose where the imported entries should go."
      width={420}
      persistent={importing}
    >
      <div style={rowStyle}>
        <span style={labelStyle}>Duplicates</span>
        <RadioGroup
          items={MODE_ITEMS}
          value={mode}
          onChange={setMode}
          width="100%"
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Document name</span>
        <Input
          value={docTitle}
          onChange={setDocTitle}
          placeholder="Document name"
          data-testid="timeline-import-doc-title"
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Folder</span>
        <Menu
          items={
            <>
              <MenuItem onSelect={() => setFolder({ kind: 'none' })}>
                No folder
              </MenuItem>
              {rootFolders.map(child => (
                <FolderMenuItem
                  key={child.id}
                  node={child}
                  depth={0}
                  onSelect={handleSelectFolder}
                />
              ))}
            </>
          }
        >
          <Button style={{ justifyContent: 'flex-start' }}>
            {folderLabel}
          </Button>
        </Menu>
        <Input
          value={newFolderName}
          onChange={setNewFolderName}
          placeholder="Or create a new folder…"
          data-testid="timeline-import-new-folder"
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Category</span>
        <Menu
          items={
            <>
              <MenuItem onSelect={() => setCategory({ kind: 'none' })}>
                No category
              </MenuItem>
              {categories.map(cat => (
                <MenuItem
                  key={cat.id}
                  onSelect={() => {
                    setCategory({ kind: 'existing', name: cat.name });
                    setNewCategoryName('');
                  }}
                >
                  {cat.name}
                </MenuItem>
              ))}
            </>
          }
        >
          <Button style={{ justifyContent: 'flex-start' }}>
            {categoryLabel}
          </Button>
        </Menu>
        <Input
          value={newCategoryName}
          onChange={setNewCategoryName}
          placeholder="Or create a new category…"
          data-testid="timeline-import-new-category"
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 8,
        }}
      >
        <Button onClick={onCancel} disabled={importing}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          loading={importing}
          disabled={importing}
          data-testid="timeline-import-confirm"
        >
          Import
        </Button>
      </div>
    </Modal>
  );
};
