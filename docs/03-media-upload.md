# Publer API - Media Upload

Medien müssen **vor dem Erstellen eines Posts** hochgeladen werden. Posts referenzieren Medien dann per ID.

## Bild von URL hochladen

```http
POST /api/v1/media/from-url
```

### Request Body

```json
{
  "media": [
    {
      "url": "https://example.com/bild.jpg",
      "name": "post-image"
    }
  ],
  "type": "single"
}
```

### Response (asynchron!)

```json
{
  "job_id": "6810dec617eae6d55d7a5e5b"
}
```

Der Upload läuft asynchron. Man bekommt nur eine `job_id` zurück und muss den Status pollen.

---

## Job-Status abfragen

```http
GET /api/v1/job_status/{job_id}
```

### Polling-Strategie

1. **3 Sekunden warten** nach dem Upload-Request
2. Job-Status pollen (max. 15 Versuche, 2 Sek. Pause zwischen Versuchen)
3. Auf `status: "complete"` warten

### Response (in Arbeit)

```json
{
  "status": "working"
}
```

### Response (fertig)

```json
{
  "status": "complete",
  "payload": [
    {
      "id": "66fba4234e299e531f5dc100"
    }
  ]
}
```

### Response (fehlgeschlagen)

```json
{
  "status": "failed"
}
```

### Status-Werte

| Status     | Bedeutung |
|------------|-----------|
| `working`  | Wird noch verarbeitet |
| `complete` | Fertig - `payload` enthält Media-ID(s) |
| `failed`   | Upload fehlgeschlagen |

### Wichtig

- Die `payload`-Struktur kann variieren: manchmal Array `payload[0].id`, manchmal Objekt `payload.id`
- Manchmal ist die Response in `data` gewrappt: `statusData.data.status` statt `statusData.status`
- Die **Media-ID** aus dem Payload wird dann beim Post-Erstellen verwendet

## Media-Objekt im Post

Nach erfolgreichem Upload wird das Medium so referenziert:

```json
{
  "id": "66fba4234e299e531f5dc100",
  "type": "image"
}
```

Gültige Typen: `image`, `video`, `document`, `gif`, `photo`
