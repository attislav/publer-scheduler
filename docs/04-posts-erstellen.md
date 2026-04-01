# Publer API - Posts erstellen (Facebook)

## Endpoints

| Zweck | Endpoint |
|-------|----------|
| Sofort veröffentlichen | `POST /api/v1/posts/schedule/publish` |
| Alles andere (geplant, draft, auto, recurring) | `POST /api/v1/posts/schedule` |

## Basis-Struktur (Bulk-Format)

Alle Post-Requests nutzen das gleiche Bulk-Format:

```json
{
  "bulk": {
    "state": "scheduled",
    "posts": [
      {
        "networks": {
          "facebook": {
            "type": "photo",
            "text": "Mein Post-Text",
            "media": [{ "id": "MEDIA_ID" }]
          }
        },
        "accounts": [
          {
            "id": "ACCOUNT_ID",
            "scheduled_at": "2025-05-15T14:30:00Z"
          }
        ]
      }
    ]
  }
}
```

> **WICHTIG:** `media` gehört ins `facebook`-Netzwerk-Objekt, NICHT auf Post-Ebene!
> Wenn `media` auf Post-Ebene steht, meldet Publer `"complete"` aber mit einem
> versteckten Fehler `"undefined method 'count' for nil"` und der Post wird nicht erstellt.

---

## Publishing-Modi

### 1. Sofort veröffentlichen

**Endpoint:** `POST /api/v1/posts/schedule/publish`

`scheduled_at` weglassen:

```json
{
  "bulk": {
    "state": "scheduled",
    "posts": [{
      "networks": { "facebook": { "type": "photo", "text": "Breaking News!" } },
      "media": [{ "id": "MEDIA_ID", "type": "photo" }],
      "accounts": [{ "id": "ACCOUNT_ID" }]
    }]
  }
}
```

### 2. Geplant (Scheduled)

**Endpoint:** `POST /api/v1/posts/schedule/publish`

`scheduled_at` als ISO 8601 (muss mind. 1 Minute in der Zukunft liegen):

```json
{
  "bulk": {
    "state": "scheduled",
    "posts": [{
      "networks": { "facebook": { "type": "photo", "text": "Geplanter Post" } },
      "media": [{ "id": "MEDIA_ID", "type": "photo" }],
      "accounts": [{
        "id": "ACCOUNT_ID",
        "scheduled_at": "2025-05-15T14:30:00Z"
      }]
    }]
  }
}
```

### 3. Draft

**Endpoint:** `POST /api/v1/posts/schedule`

```json
{
  "bulk": {
    "state": "draft",
    "posts": [{
      "networks": { "facebook": { "type": "photo", "text": "Entwurf" } },
      "media": [{ "id": "MEDIA_ID", "type": "photo" }],
      "accounts": [{ "id": "ACCOUNT_ID" }]
    }]
  }
}
```

State-Optionen: `draft` (sichtbar für alle), `draft_private` (nur Ersteller), `draft_public`

### 4. Auto-Scheduling

**Endpoint:** `POST /api/v1/posts/schedule`

Nutzt den bestehenden Posting-Zeitplan des Accounts. Erfordert, dass in Publer ein Schedule konfiguriert ist.

```json
{
  "bulk": {
    "state": "scheduled",
    "posts": [{
      "networks": { "facebook": { "type": "photo", "text": "Auto-geplant" } },
      "media": [{ "id": "MEDIA_ID", "type": "photo" }],
      "accounts": [{ "id": "ACCOUNT_ID" }],
      "auto": true,
      "share_next": false,
      "range": {
        "start_date": "2025-05-23T07:45:00.000Z",
        "end_date": "2025-05-31T07:45:00.000Z"
      }
    }]
  }
}
```

| Parameter | Pflicht | Beschreibung |
|-----------|---------|-------------|
| `auto` | ja | `true` aktiviert Auto-Scheduling |
| `range.start_date` | ja | Ab wann soll geplant werden (ISO 8601) |
| `range.end_date` | nein | Bis wann (ISO 8601) |
| `share_next` | nein | Nächsten freien Slot nutzen |

---

## Facebook Post-Typen

| Typ | Benötigt |
|-----|----------|
| `status` | `text` |
| `photo` | `text`, `media` Array |
| `video` | `text`, `media` Array |
| `link` | `text`, `url` |
| `carousel` | `text`, `media` Array |
| `story` | `media` Array |
| `reel` | `media` Array |
| `gif` | `text`, `media` Array |

---

## First Comment

Kommentare werden im `accounts`-Array pro Account definiert:

```json
"accounts": [{
  "id": "ACCOUNT_ID",
  "scheduled_at": "2025-05-15T14:30:00Z",
  "comments": [{
    "text": "Erster Kommentar!",
    "delay": {
      "duration": 5,
      "unit": "Minute"
    }
  }]
}]
```

Delay-Einheiten: `Minute`, `Hour`, `Day`

---

## Response (alle Modi)

Alle Post-Erstellungen sind asynchron:

```json
{
  "job_id": "6810dec617eae6d55d7a5e5b"
}
```

### Job-Status pollen

```http
GET /api/v1/job_status/{job_id}
```

```json
{
  "status": "complete",
  "payload": {
    "failures": {}
  }
}
```

- `status: "complete"` + leeres `failures` = Erfolg
- `status: "failed"` = fehlgeschlagen
- `status: "working"` = noch in Arbeit

---

## Vollständiger Ablauf (Zusammenfassung)

1. **Bild hochladen:** `POST /media/from-url` -> `job_id`
2. **Media-Job pollen:** `GET /job_status/{job_id}` -> `media_id`
3. **Post erstellen:** `POST /posts/schedule/publish` oder `/posts/schedule` -> `job_id`
4. **Post-Job pollen:** `GET /job_status/{job_id}` -> Erfolg/Fehler
