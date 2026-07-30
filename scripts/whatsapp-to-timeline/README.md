# WhatsApp-to-AFFiNE-timeline

Converts a WhatsApp chat export ZIP into AFFiNE `TimelineImportDataset` JSON files, ready for the in-app timeline importer.

## What it does

- Reads a WhatsApp ZIP export containing `_chat.txt` and media files.
- Parses messages in the format `[dd/MM/yyyy HH:mm:ss] Sender: message`.
- Extracts `<attached: filename.mp4>` references and links them to media files in the ZIP.
- Creates one tag per unique sender.
- Writes one `dataset.json` (plus a `media/` folder) per group.
- Groups can be by **date**, **month/year**, or all in **one document**.

## Requirements

- Python 3.8+ (3.9+ recommended for `--timezone` support)
- No third-party dependencies

## Usage

```bash
python whatsapp_to_timeline.py WhatsApp-Chat-Name.zip --output ./out
```

### Options

| Option             | Description                                         |
| ------------------ | --------------------------------------------------- |
| `-o, --output`     | Output directory (default: `whatsapp-timeline-out`) |
| `--group-by date`  | One document per day (default)                      |
| `--group-by month` | One document per month/year                         |
| `--group-by all`   | Single document for the entire chat                 |
| `--timezone`       | Timezone name, e.g. `Europe/Paris` (default: `UTC`) |
| `--encoding`       | Chat file encoding (default: `utf-8-sig`)           |

## Example

```bash
python scripts/whatsapp-to-timeline/whatsapp_to_timeline.py \
  ~/Downloads/WhatsApp_Chat_Family.zip \
  --output ./family-timeline \
  --group-by month \
  --timezone Europe/London
```

## Output layout

```
family-timeline/
  2026-07/
    dataset.json
    media/
      00061933-AUDIO-2026-07-18-12-31-19.mp3
      00000864-VIDEO-2019-08-04-14-59-55.mp4
  2026-08/
    dataset.json
    media/
      ...
```

## Importing into AFFiNE

1. Open the timeline page.
2. Click the **Import** button in the timeline header.
3. Select the `dataset.json` for the period you want.
4. Select the matching files from the `media/` folder when prompted.
5. AFFiNE will create the doc with tags, timestamps, and embedded media.
