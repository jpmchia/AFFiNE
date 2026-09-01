# Timeline import file formats

The AFFiNE Timeline can bulk-import chronological entries from a CSV/TSV file or from a JSON manifest. Both are parsed into the same `TimelineImportDataset` shape, then loaded into the workspace by `TimelineImportService`.

Relevant source files:

- `packages/frontend/core/src/modules/timeline/import/csv.ts` — CSV/TSV parser
- `packages/frontend/core/src/modules/timeline/import/schema.ts` — JSON schema, validation, and media resolution
- `packages/frontend/core/src/modules/timeline/import/import.ts` — loader that writes entries into the workspace
- `packages/frontend/core/src/desktop/pages/workspace/timeline/import-button.tsx` — UI entry point and file picker

## Accepted files

The file picker accepts `.json`, `.csv`, `.tsv`, or `.txt`:

- **JSON manifest** — a single `.json` file. Optional media files can be selected alongside it.
- **CSV/TSV** — a single tabular file. It cannot carry its own media.

## CSV/TSV format

The first row is the header. Column names are case-insensitive and columns can appear in any order. Any missing optional column is treated as empty.

| Column          | Required | Description                                                                                               |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `StartDateTime` | Yes      | `dd/mm/yyyy` optionally with `hh:mm` or `hh:mm:ss`. Parsed as UTC.                                        |
| `EndDateTime`   | No       | Same format as `StartDateTime`. If present, it must be later than the start time.                         |
| `Duration`      | No       | `hh:mm:ss` or `mm:ss`. Only used when `EndDateTime` is empty.                                             |
| `Category`      | No       | A single category name for the row.                                                                       |
| `Tags`          | No       | Tag names separated by commas inside the cell. Use quotes if a tag name itself contains a comma.          |
| `Title`         | No       | Short header. At least one of `Title` or `Content` must be provided.                                      |
| `Content`       | No       | Body text. At least one of `Title` or `Content` must be provided.                                         |
| `Colour`        | No       | Hex colour applied to the row's tag/category label definitions. First colour seen for a given label wins. |

Delimiter is auto-detected from the header row (comma or tab). Quoted fields are supported, including multi-line quoted fields, and doubled quotes (`""`) are unescaped to a single quote.

The `Title` and `Content` fields absorb extra columns up to the next recognized header so that unquoted commas in the text are rejoined as well as possible.

### Example

```csv
StartDateTime,EndDateTime,Duration,Category,Tags,Title,Content,Colour
09/08/2026 09:00,09/08/2026 10:00,,Work,"meeting,planning",Stand-up,Reviewed the roadmap,#F5A623
09/08/2026 14:00,,01:30:00,Focus,deep-work,Focused work,Wrote documentation,
```

## JSON manifest format

The JSON format is versioned and self-describing.

```json
{
  "version": 1,
  "docTitle": "Imported dataset",
  "tags": [{ "name": "work", "color": "#F5A623" }],
  "categories": [{ "name": "Meetings" }],
  "entries": [
    {
      "displayAt": "2026-08-09T09:00:00Z",
      "endAt": "2026-08-09T10:00:00Z",
      "title": "Stand-up",
      "text": "Reviewed the roadmap",
      "media": "photos/img1.jpg",
      "tags": ["work"],
      "category": "Meetings"
    }
  ]
}
```

### Top-level fields

| Field        | Required | Description                                                                  |
| ------------ | -------- | ---------------------------------------------------------------------------- |
| `version`    | Yes      | Must be `1`.                                                                 |
| `docTitle`   | No       | Target document title.                                                       |
| `tags`       | No       | Array of label definitions. Each can be a string name or `{ name, color? }`. |
| `categories` | No       | Same shape as `tags`.                                                        |
| `entries`    | Yes      | Non-empty array of entry objects.                                            |

### Entry fields

| Field       | Required                 | Description                                                 |
| ----------- | ------------------------ | ----------------------------------------------------------- |
| `displayAt` | Yes                      | ISO 8601 string or epoch milliseconds.                      |
| `endAt`     | No                       | Optional end time; must be later than `displayAt`.          |
| `text`      | One of `text` or `media` | Paragraph content.                                          |
| `media`     | One of `text` or `media` | Path or file name of a media file shipped with the dataset. |
| `title`     | No                       | Optional header shown in document view.                     |
| `tags`      | No                       | Array of tag name strings.                                  |
| `category`  | No                       | Single category name string.                                |

## Parsing and validation

- `parseTimelineCSV` in `csv.ts` converts the tabular file into `TimelineImportDataset` and returns all row-level errors (e.g. invalid dates, missing title/content) without throwing.
- `parseTimelineDataset` in `schema.ts` validates a parsed JSON value the same way, returning `{ dataset, errors }`.
- The first colour encountered for a tag or category in CSV is recorded and used as the label colour for that tag/category across the whole import.

## Loading process

`TimelineImportService.importDataset` performs the actual workspace write:

1. **Prepare labels** — `ensureLabels` resolves every tag and category referenced by the dataset, plus explicit label definitions, into existing or newly created timeline labels. Matching is case-insensitive; missing labels are created and assigned a colour from a default palette or from the supplied colour.
2. **Sort chronologically** — entries are sorted by `displayAt` before being written.
3. **Deduplicate / merge** — if the import mode is `skip` or `update`, an import key is built from `displayAt`, `endAt`, and the first 150 characters of the content and matched against existing timeline entries.
4. **Create or open the target doc** — if any new entries are needed, a new doc is created with the resolved title and the `includeInTimeline` property set to `true`.
5. **Write blocks** — for each new entry:
   - A header paragraph is added with the formatted date/time and tags.
   - If `media` is present, the matching file is uploaded to the workspace blob store and an `affine:image` or `affine:attachment` block is created.
   - If `text` is present, an `affine:paragraph` block is created.
   - Each block is stamped with `meta:displayInTimelineAt` and, when present, `meta:displayInTimelineEndAt`.
6. **Update existing entries** — in `update` mode, tag, category, and colour changes are batched through `TimelineSetting`.
7. **Assign labels** — tag and category assignments are applied in batches through the timeline settings.

## Media file resolution

For JSON imports, media files are passed in as a `Map<string, File>`. `resolveMediaFile` first looks for an exact key match (the `webkitRelativePath` if the user chose a folder, otherwise the file name), then falls back to matching by base name. Missing media files are reported in the `skipped` array rather than aborting the import.

## Import modes

The UI offers three modes, passed to `importDataset`:

- `import` — always create new blocks.
- `skip` — skip rows whose import key already matches an existing timeline entry.
- `update` — for matching existing entries, update their tags, category, and colour instead of creating new blocks.

## Return value

`importDataset` returns:

- `docId` — the id of the created or updated doc, or `null` if nothing was imported.
- `imported` — number of new blocks created.
- `updated` — number of existing entries updated in `update` mode.
- `skipped` — human-readable messages for entries that could not be imported.
