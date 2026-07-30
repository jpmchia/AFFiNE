#!/usr/bin/env python3
"""
Convert a WhatsApp chat export ZIP into AFFiNE timeline import datasets.

WhatsApp exports contain a _chat.txt file with messages like:
    [dd/MM/yyyy HH:mm:ss] Sender: message body
    [dd/MM/yyyy, HH:mm:ss] Sender: message body

Media files embedded in messages look like:
    <attached: 00061933-AUDIO-2026-07-18-12-31-19.mp3>

The script creates one or more AFFiNE timeline import datasets, grouping
messages by date or month/year as requested. Each sender becomes a tag.
"""

import argparse
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def clean_text(text: str) -> str:
    """Strip control marks and surrounding whitespace."""
    # Remove LTR/RTL marks and other zero-width control characters
    return re.sub(r'[\u200e\u200f\u202a-\u202e]', '', text).strip()


# WhatsApp message header patterns. Supports both
#   [18/07/2026 12:31:19] Jean-Paul: ...
#   [18/07/2026, 12:31:19] Jean-Paul: ...
# Accepts 2- or 4-digit years because some iOS exports are ambiguous.
MESSAGE_RE = re.compile(
    r'^\[(?P<day>\d{2})/(?P<month>\d{2})/(?P<year>\d{2,4})\s*,?\s*'
    r'(?P<hour>\d{2}):(?P<minute>\d{2}):(?P<second>\d{2})\]\s*'
    r'(?P<sender>[^:]{1,256}):\s*(?P<body>.*)$',
    re.DOTALL,
)

MEDIA_RE = re.compile(r'<attached:\s*([^>\n]+)>')


def parse_timestamp(
    day: str,
    month: str,
    year: str,
    hour: str,
    minute: str,
    second: str,
    tz: timezone,
) -> datetime:
    y = int(year)
    # 2-digit year: assume > 50 is 1900s, otherwise 2000s
    if y < 100:
        y = 1900 + y if y > 50 else 2000 + y
    return datetime(
        year=y,
        month=int(month),
        day=int(day),
        hour=int(hour),
        minute=int(minute),
        second=int(second),
        tzinfo=tz,
    )


def parse_media(body: str) -> tuple[str | None, str]:
    """Extract an <attached: filename> reference and return (filename, remaining body)."""
    match = MEDIA_RE.search(body)
    if not match:
        return None, body
    filename = match.group(1).strip()
    before = body[: match.start()]
    after = body[match.end() :]
    cleaned = (before + ' ' + after).strip()
    return filename, cleaned


def parse_chat(text: str, tz: timezone) -> list[dict]:
    """Parse _chat.txt content into a list of message dicts."""
    messages: list[dict] = []
    current: dict | None = None

    for line in text.splitlines():
        line = clean_text(line)
        if not line:
            continue

        match = MESSAGE_RE.match(line)
        if match:
            if current:
                messages.append(current)
            try:
                dt = parse_timestamp(
                    match.group('day'),
                    match.group('month'),
                    match.group('year'),
                    match.group('hour'),
                    match.group('minute'),
                    match.group('second'),
                    tz,
                )
            except ValueError:
                # Malformed date line; skip
                current = None
                continue

            sender = match.group('sender').strip()
            body = match.group('body').strip()

            media, text = parse_media(body)

            current = {
                'dt': dt,
                'sender': sender,
                'text': clean_text(text) or None,
                'media': media,
            }
        elif current is not None:
            # Continuation of the previous message
            if current['text']:
                current['text'] += '\n' + line
            else:
                current['text'] = line

    if current:
        messages.append(current)

    return messages


def build_dataset(
    group_name: str,
    messages: list[dict],
    media_folder: Path,
    zip_ref: zipfile.ZipFile,
    zip_names: set[str],
) -> tuple[dict, list[str]]:
    """Create an AFFiNE TimelineImportDataset for one group of messages."""
    senders: set[str] = set()
    entries: list[dict] = []
    skipped: list[str] = []

    # Basename -> full path in zip for media lookup
    zip_basename_map: dict[str, str] = {}
    for name in zip_names:
        zip_basename_map[Path(name).name] = name

    for msg in messages:
        sender = msg['sender']
        senders.add(sender)

        entry: dict = {
            'displayAt': int(msg['dt'].timestamp() * 1000),
            'tags': [sender],
        }
        if msg['text']:
            entry['text'] = msg['text']

        if msg['media']:
            media_name = Path(msg['media']).name
            if media_name in zip_basename_map:
                zip_path = zip_basename_map[media_name]
                # Copy media file into the group's media folder
                out_path = media_folder / media_name
                with zip_ref.open(zip_path) as src, open(out_path, 'wb') as dst:
                    dst.write(src.read())
                entry['media'] = media_name
            else:
                skipped.append(f"Media not found in ZIP: {msg['media']} ({msg['dt']})")
                # Include text if any, otherwise may still be a valid entry without media

        # Skip entries that have neither text nor resolvable media
        if not entry.get('text') and not entry.get('media'):
            skipped.append(f"Empty message skipped: {msg['dt']} {sender}")
            continue

        entries.append(entry)

    dataset = {
        'version': 1,
        'docTitle': f"WhatsApp {group_name}",
        'tags': [{'name': s} for s in sorted(senders)],
        'entries': entries,
    }
    return dataset, skipped


def group_key(group_by: str, dt: datetime) -> tuple[str, str]:
    """Return a (folder_name, human_label) for a message datetime."""
    if group_by == 'date':
        key = dt.strftime('%Y-%m-%d')
        label = dt.strftime('%d %B %Y')
    elif group_by == 'month':
        key = dt.strftime('%Y-%m')
        label = dt.strftime('%B %Y')
    else:
        key = 'all'
        label = 'all messages'
    return key, label


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Convert a WhatsApp export ZIP into AFFiNE timeline import datasets.',
    )
    parser.add_argument('zip', help='Path to the WhatsApp export ZIP file')
    parser.add_argument(
        '-o', '--output', default='whatsapp-timeline-out', help='Output directory'
    )
    parser.add_argument(
        '--group-by',
        choices=['date', 'month', 'all'],
        default='date',
        help='How to split messages into documents',
    )
    parser.add_argument(
        '--timezone',
        default='UTC',
        help='IANA timezone name or "UTC" to use for timestamps (default: UTC)',
    )
    parser.add_argument(
        '--encoding',
        default='utf-8-sig',
        help='Encoding used by _chat.txt (default: utf-8-sig)',
    )
    args = parser.parse_args()

    try:
        from zoneinfo import ZoneInfo  # type: ignore

        tz = ZoneInfo(args.timezone)
    except ImportError:
        # Python < 3.9 fallback
        tz = timezone.utc  # type: ignore
        if args.timezone != 'UTC':
            print(
                'Warning: zoneinfo not available, using UTC. Use Python 3.9+ for timezones.',
                file=sys.stderr,
            )

    output_root = Path(args.output)
    output_root.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.zip, 'r') as zf:
        zip_names = set(zf.namelist())

        # Find _chat.txt (case-insensitive). WhatsApp usually puts it at the root.
        chat_names = [n for n in zip_names if n.lower().endswith('_chat.txt')]
        if not chat_names:
            print('No _chat.txt found in ZIP', file=sys.stderr)
            return 1
        if len(chat_names) > 1:
            print(
                f"Multiple _chat.txt files found: {chat_names}. Using {chat_names[0]}.",
                file=sys.stderr,
            )

        chat_name = chat_names[0]
        try:
            raw = zf.read(chat_name)
            text = raw.decode(args.encoding)
        except UnicodeDecodeError:
            text = raw.decode('utf-8', errors='replace')

        messages = parse_chat(text, tz)

        # Group messages
        groups: dict[str, list[dict]] = {}
        for msg in messages:
            key, _ = group_key(args.group_by, msg['dt'])
            groups.setdefault(key, []).append(msg)

        total_imported = 0
        all_skipped: list[str] = []
        for key in sorted(groups):
            group_dir = output_root / key
            group_dir.mkdir(parents=True, exist_ok=True)
            media_dir = group_dir / 'media'
            media_dir.mkdir(exist_ok=True)

            _, label = group_key(args.group_by, groups[key][0]['dt'])
            dataset, skipped = build_dataset(
                label, groups[key], media_dir, zf, zip_names
            )
            all_skipped.extend(skipped)

            if not dataset['entries']:
                continue

            out_path = group_dir / 'dataset.json'
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(dataset, f, ensure_ascii=False, indent=2)
            total_imported += len(dataset['entries'])
            print(f"Wrote {out_path} ({len(dataset['entries'])} entries)")

    if all_skipped:
        print('\nSkipped items:', file=sys.stderr)
        for item in all_skipped[:50]:
            print(f'  - {item}', file=sys.stderr)
        if len(all_skipped) > 50:
            print(f'  ... and {len(all_skipped) - 50} more', file=sys.stderr)

    print(f'\nDone: {total_imported} entries written to {output_root}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
