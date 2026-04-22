# CDC Event-Log Schema (v2)

All CDC kinds (`poll`, `pg_wal`, `mongo_change_stream`) can emit to a shared
event-log format when `output_format="event-jsonl"`. Each S3 object is a
UTF-8 JSONL file (one JSON object per line).

## Location

```
<s3_bucket>/<s3_prefix>/<table>/year=YYYY/month=MM/day=DD/<batch_id>.jsonl
```

`<batch_id>` is an 8-character hex string unique per batch.

## Event shape

```json
{
  "_op":      "insert" | "update" | "delete" | "replace" | "upsert",
  "_table":   "<schema>.<table>",
  "_ts":      "2026-04-19T14:22:01.234Z",
  "_position": "<lsn|resume_token|tracking_value>",
  "_kind":    "pg_wal" | "mongo_change_stream" | "poll",
  "before":   { ... } | null,
  "after":    { ... } | null,
  "updated_fields": [ "col1", "col2" ] | null
}
```

### Field reference

| Field | Type | Description |
|---|---|---|
| `_op` | string | One of `insert`, `update`, `delete`, `replace`, `upsert` |
| `_table` | string | Fully-qualified table/collection name |
| `_ts` | ISO-8601 | Event capture timestamp (UTC, millisecond precision) |
| `_position` | string | Source-native position: WAL LSN (`"0/3D3F490"`), Mongo BSON resume token (hex), or poll tracking-column value |
| `_kind` | string | Which CDC mechanism produced this event |
| `before` | object\|null | Row state before the change (null for `insert`, may be null for `update`/`delete` if unavailable) |
| `after` | object\|null | Row state after the change (null for `delete`) |
| `updated_fields` | array\|null | Names of fields that changed; present only when the source reports it (PG `REPLICA IDENTITY FULL`, Mongo `updateDescription`) |

### Rules per op

| `_op` | `before` | `after` | Emitted by |
|---|---|---|---|
| `insert` | `null` | row | `pg_wal`, `mongo_change_stream` |
| `update` | pre-image or `null` | post-image | `pg_wal`, `mongo_change_stream` |
| `replace` | pre-image or `null` | full replacement document | `mongo_change_stream` only |
| `delete` | pre-image or `null` | `null` | `pg_wal`, `mongo_change_stream` |
| `upsert` | `null` | observed row | `poll` only |

### Value serialization rules

- `datetime` → ISO-8601 string
- `bytes` → lowercase hex
- nested `dict`/`list` → pass through as JSON (consumers receive structured data)
- `null` → JSON `null`

## Relation to legacy row-snapshot format

Jobs with `output_format="jsonl"` or `output_format="csv"` continue to emit
the legacy row-snapshot format (one serialized row per object, no `_op`
discriminator). Existing poll jobs are not migrated; they keep the legacy
format until a user opts into `"event-jsonl"`.

WAL and Mongo kinds must use `"event-jsonl"` — they cannot emit legacy
row-snapshots because their semantics don't map cleanly.

## Downstream consumer hint

For `pg_wal` and `mongo_change_stream` kinds, treat consecutive events
with the same `_table` and `_position` as the same logical change
(deduplication hedge against replay). For `poll` kind, each emission is
idempotent over its `_position` (a given tracking value is only seen once
across syncs).
