# Timeline View and Editor — Implementation Plan

Implement a workspace-level `/timeline` workbench route that renders every block from opted-in documents as a chronological, groupable stream, each editable in a peek view and positioned by a per-block `displayInTimelineAt` timestamp.

## Confirmed Requirements

- **Workspace-level route + sidebar item:** New "Timeline" nav item sits alongside All Pages / Journals.
- **Feature flag:** Gated by `enableTimeline`.
- **Block-level granularity:** Every block inside an opted-in doc appears as a timeline entry.
- **Doc opt-in:** New doc property `includeInTimeline` (boolean); set per document, bulk-appliable to all docs in a folder, and inherited from template documents.
- **Ordering field:** New per-block property `meta:displayInTimelineAt` (timestamp), independent from `meta:createdAt` / `meta:updatedAt`.
- **Default source:** Workspace setting decides whether `meta:displayInTimelineAt` initially mirrors `meta:createdAt` or `meta:updatedAt`.
- **Editing:** Timeline shows read-only excerpts; clicking an entry opens it editable in place (peek view) and offers a button to open the original doc.
- **Display:** Absolute times; group/collapse by date, week, or month.

## Key Findings

- Workbench routing is split by platform:
  - `packages/frontend/core/src/desktop/workbench-router.ts`
  - `packages/frontend/core/src/mobile/workbench-router.ts`
- Workbench view rendering:
  - `packages/frontend/core/src/modules/workbench/view/workbench-root.tsx`
  - `packages/frontend/core/src/modules/workbench/view/route-container.tsx`
- Sidebar navigation: `packages/frontend/core/src/components/root-app-sidebar/index.tsx` adds `AllDocsButton`, `AppSidebarJournalButton`, etc.
- Date-based pages:
  - `packages/frontend/core/src/desktop/pages/workspace/journals/index.tsx`
  - `packages/frontend/core/src/desktop/pages/workspace/all-page/all-page.tsx`
- Doc records and metadata:
  - `packages/frontend/core/src/modules/doc/entities/record.ts` (create/update timestamps, title, trash)
  - `packages/frontend/core/src/modules/doc/entities/doc.ts`
  - `packages/frontend/core/src/modules/doc/services/docs.ts` (`duplicate` / `duplicateFromTemplate` copy doc properties)
  - `packages/frontend/core/src/modules/doc/stores/docs.ts` (`watchNonTrashDocIds()`)
- Doc properties storage:
  - `packages/frontend/core/src/modules/db/schema/schema.ts` defines `docProperties` (add `includeInTimeline` next to `isTemplate`)
  - `packages/frontend/core/src/modules/doc/stores/doc-properties.ts` reads/writes `docProperties` via `WorkspaceDBService`
- Folder bulk-apply:
  - `packages/frontend/core/src/modules/organize/entities/folder-node.ts` (`children$`, recursion over docs)
- Block meta service:
  - `blocksuite/affine/shared/src/services/block-meta-service.ts` already writes `meta:createdAt/createdBy/updatedAt/updatedBy` on supported blocks.
  - `blocksuite/affine/model/src/utils/types.ts` defines `BlockMeta`.
  - `blocksuite/affine/model/src/blocks/paragraph/paragraph-model.ts` (and other block models) include `BlockMeta` keys in schemas.
- Editor / peek integration:
  - `packages/frontend/core/src/modules/peek-view/entities/peek-view.ts` (`DocReferenceInfo` accepts `blockIds`)
  - `packages/frontend/core/src/modules/peek-view/view/doc-preview/doc-peek-view.tsx` renders `BlockSuiteEditor` with `blockIds`
  - `packages/frontend/core/src/modules/peek-view/view/utils.ts` (`useEditor` passes `EditorSelector` with `blockIds`)
  - `packages/frontend/core/src/modules/editor/types.ts` defines `EditorSelector.blockIds`
- Settings pattern:
  - `packages/frontend/core/src/modules/template-doc/entities/setting.ts` and `store/setting.ts` show how to store/retrieve workspace userdata settings.
- Feature flags: `packages/frontend/core/src/modules/feature-flag/constant.ts`.
- i18n: `packages/frontend/i18n/src/resources/en.json` plus generated `i18n.gen.ts`; use `useI18n` with keys under `com.affine.timeline`.

## Proposed Changes

### 1. Block meta extension

- In `blocksuite/affine/model/src/utils/types.ts`, add `meta:displayInTimelineAt?: number` to `BlockMeta`.
- Update every `BlockMeta`-using block schema under `blocksuite/affine/model/src/blocks/*/X-model.ts` and `helper.ts` (`EmbedProps`) to include `'meta:displayInTimelineAt': undefined`.
- In `blocksuite/affine/shared/src/services/block-meta-service.ts`:
  - On block creation, if block meta is enabled, initialize `meta:displayInTimelineAt` to `meta:createdAt` or `meta:updatedAt` based on the workspace setting.
  - When an existing doc is toggled to `includeInTimeline`, immediately backfill `meta:displayInTimelineAt` on all of its existing blocks from their current `meta:createdAt` or `meta:updatedAt` (per the workspace setting), or from `Date.now()` as a fallback.
  - User edits to `meta:displayInTimelineAt` are preserved; the service only sets the property when it is missing.

### 2. Workspace setting for default date source

- New module `packages/frontend/core/src/modules/timeline-settings/` mirroring `template-doc`:
  - `store/setting.ts`: stores `{ timelineDefaultDateSource: 'createdAt' | 'updatedAt' }` in `WorkspaceDBService` userdata `settings`.
  - `entities/setting.ts`: exposes `timelineDefaultDateSource$` and `updateDefaultDateSource(...)`.
  - `index.ts`: register in `framework`.
- UI: add a new "Timeline" section in `Settings > Workspace`. Add a tab entry in `packages/frontend/core/src/desktop/dialogs/setting/workspace-setting/index.tsx` (e.g., `workspace:timeline`) and implement `packages/frontend/core/src/desktop/dialogs/setting/workspace-setting/timeline/index.tsx` containing a `<SettingRow>` with a radio/select for `createdAt` vs `updatedAt`.

### 3. Doc opt-in property (`includeInTimeline`)

- In `packages/frontend/core/src/modules/db/schema/schema.ts` `docProperties`, add `includeInTimeline: f.boolean().optional()` next to `isTemplate`.
- In `DocProperties` type, the field is now available automatically.
- Add UI to toggle it:
  - Create `packages/frontend/core/src/components/workspace-property-types/include-in-timeline.tsx` mirroring `workspace-property-types/template.tsx`.
  - Register the property renderer in `workspace-property-types/index.tsx` (or wherever the property-type map is defined).
  - Add it to the doc info/properties panel (search for `isTemplate` usage, e.g., `desktop/pages/workspace/detail-page/detail-page-header.tsx` or `modules/doc-info/`).
- Folder bulk-apply:
  - Add an "Include in timeline" action to the existing folder context menu in the organizer/explorer.
  - The action calls a service method that recursively walks `FolderNode.children$` from `packages/frontend/core/src/modules/organize/entities/folder-node.ts` and calls `DocPropertiesStore.updateDocProperties(child.id, { includeInTimeline: true })` for each child that is a doc.

### 4. Template inheritance

- `DocsService.duplicateFromTemplate` / `duplicate` already copies properties except `['id', 'isTemplate', 'journal']` (`packages/frontend/core/src/modules/doc/services/docs.ts`).
- Since `includeInTimeline` is not in that list, the property copies automatically.
- Ensure docs created from a template with `includeInTimeline: true` are picked up by `TimelineService`.

### 5. New `modules/timeline`

- `packages/frontend/core/src/modules/timeline/entities/timeline.ts`:
  - `items$`: array of `{ docId, blockId, flavour, displayInTimelineAt, createdAt, updatedAt, title?, snippet }` sorted by `displayInTimelineAt` desc.
- `packages/frontend/core/src/modules/timeline/services/timeline.ts`:
  - Watch `DocsService.allNonTrashDocIds$` and `DocPropertiesStore.watchPropertyAllValues('includeInTimeline')`.
  - For each opted-in doc, call `DocsService.open(docId)` and traverse `blockSuiteDoc.getAllModels()` (or `root.children` recursively) to collect blocks.
  - Filter to only blocks whose schema includes `BlockMeta` (the same set supported by `BlockMetaService`).
  - Watch `meta:displayInTimelineAt`/`createdAt`/`updatedAt` on each block and re-emit the sorted list.
  - Group items by day, week, or month (default: day) based on a view preference.
- `packages/frontend/core/src/modules/timeline/index.ts`: register entity + service under `WorkspaceScope`.

### 6. New timeline page and route

- `packages/frontend/core/src/desktop/pages/workspace/timeline/timeline-page.tsx`:
  - Uses `RouteContainer` / `Workbench` view layout.
  - Renders `<TimelineList />` with grouping controls.
- Add route `{ path: '/timeline', lazy: () => import('./pages/workspace/timeline/timeline-page') }` to `packages/frontend/core/src/desktop/workbench-router.ts`.
- Add equivalent mobile route to `packages/frontend/core/src/mobile/workbench-router.ts` and a mobile page.

### 7. Sidebar / mobile navigation

- In `packages/frontend/core/src/components/root-app-sidebar/index.tsx`, add a `TimelineButton` (e.g., between `AppSidebarJournalButton` and `AIChatButton`).
- Use `useLiveData(useService(FeatureFlagService).flags.enableTimeline.$)` to gate rendering.
- Add i18n key `com.affine.workspaceSubPath.timeline` and an icon from `@blocksuite/icons/rc`.
- For mobile, add a home-screen shortcut in `packages/frontend/core/src/mobile/pages/workspace/home/index.tsx` (or equivalent) when the flag is on.

### 8. Timeline UI components

- `packages/frontend/core/src/components/timeline/timeline-list.tsx`:
  - Virtualized list (reuse `@affine/component` virtualization or `react-window` as used in `page-list`).
  - Group headers with day/week/month labels.
  - Toolbar to switch grouping and sort direction.
- `packages/frontend/core/src/components/timeline/timeline-item.tsx`:
  - Render a block-specific preview (text snippet for paragraphs/lists, thumbnail for images/attachments, code preview for code, etc.).
  - Show absolute `displayInTimelineAt` time.
  - On desktop: click opens the block in a peek view.
  - On mobile: click pushes the full detail route using `workbench.openDoc({ docId, blockIds: [blockId] })` so the editor focuses the block.
  - "Open in doc" button/link navigates to `workbench.openDoc({ docId, blockIds: [blockId] })` and closes the peek.

### 9. Editing (peek view + block date)

- On item click, open `peekView.open({ docRef: { docId, blockIds: [blockId] } })`.
  - `DocPeekPreview` (`packages/frontend/core/src/modules/peek-view/view/doc-preview/doc-peek-view.tsx`) will load the doc and focus the block via `EditorSelector.blockIds`.
  - Edits in the peek editor update the block in its source doc.
- Add a small inline date editor in the timeline item (or inside the peek header) to change `meta:displayInTimelineAt` directly:
  - `blockModel.props['meta:displayInTimelineAt'] = newTimestamp` through `Doc.blockSuiteDoc`.
  - Re-sorting is handled reactively by `TimelineService`.

### 10. Feature flag

- In `packages/frontend/core/src/modules/feature-flag/constant.ts`, add `enableTimeline`:
  - category: `'affine'`
  - `displayName` / `description` keys in i18n
  - `configurable: true`
  - `defaultState: false`

### 11. i18n & icons

- `packages/frontend/i18n/src/resources/en.json`:
  - `com.affine.workspaceSubPath.timeline`
  - `com.affine.timeline.*` (title, empty, group labels, date editor labels)
  - `com.affine.doc-properties.includeInTimeline`
  - `com.affine.settings.workspace.experimental-features.enable-timeline.*`
- Add keys to `i18n.gen.ts` if required by build.
- Sidebar icon: pick a `@blocksuite/icons/rc` icon (e.g., `HistoryIcon` or `TodayIcon`) or add an SVG.

## Confirmed Decisions

1. **Folder bulk-apply UI:** Context menu on the folder in the organizer/explorer.
2. **Default date source setting UI:** `Settings > Workspace` with a new "Timeline" section.
3. **Block types shown:** Only blocks whose schemas support `BlockMeta` (paragraph, list, image, attachment, bookmark, callout, code, table).
4. **Preview rendering:** Block-specific miniature renderers (text, thumbnail, code, etc.).
5. **Mobile editing:** Clicking an entry on mobile pushes the full detail route with `blockIds`.
6. **Retroactive backfill:** When a doc is toggled to `includeInTimeline`, initialize `meta:displayInTimelineAt` immediately on all existing blocks.

## Risks & Blockers

- `BlockMetaService` only supports a fixed set of block flavours; unsupported blocks won't have `meta:createdAt/updatedAt/displayInTimelineAt`.
- Workspace-wide block traversal is expensive: every opted-in doc must be loaded and all its blocks observed. Needs virtualization and incremental/idle loading.
- Adding `meta:displayInTimelineAt` to the shared `BlockMeta` type and all block schemas is a cross-cutting BlockSuite change.
- Template inheritance and folder bulk-apply can produce large batches of property writes; ensure they are transactional.

## Implementation Order

1. **Data model:** `includeInTimeline` doc property + `displayInTimelineAt` block property + workspace default-source setting.
2. **Opt-in UI:** doc toggle + folder bulk action.
3. **Timeline module/service:** aggregate and sort blocks reactively.
4. **Timeline page + route + sidebar + feature flag.**
5. **Timeline UI components:** list, group headers, item previews.
6. **Peek editing + date editing.**
7. **Mobile parity + i18n + tests.**
