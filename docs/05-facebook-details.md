# Publer API - Facebook-spezifische Details

## Vollständige Facebook Network-Struktur

```json
"facebook": {
  "type": "photo",
  "text": "Post-Text",
  "title": "Video-Titel (max 255 Zeichen)",
  "excerpt": "Post-Excerpt",
  "url": "Link-URL",
  "media": [],
  "link": {
    "url": "https://example.com",
    "title": "Link-Titel",
    "description": "Link-Beschreibung",
    "image_id": "media_id"
  },
  "tags": ["tag1", "tag2"],
  "categories": ["cat_id"],
  "details": {
    "type": "reel",
    "feed": true,
    "promotional": false,
    "paid": false
  }
}
```

## Carousel-Posts (Link-Previews)

```json
"sublinks": [
  {
    "url": "https://example.com/seite",
    "title": "Titel",
    "description": "Beschreibung",
    "images": ["https://example.com/bild.jpg"],
    "default_image": 0,
    "call_to_action": "SHOP_NOW"
  }
]
```

Call-to-Action Optionen: `SHOP_NOW`, `LEARN_MORE`, `SIGN_UP`, `BUY_NOW`

## Erweiterte Account-Optionen

```json
"accounts": [{
  "id": "ACCOUNT_ID",
  "scheduled_at": "2025-05-15T14:30:00Z",
  "labels": ["label1"],
  "comments": [{
    "text": "Follow-up Kommentar",
    "delay": { "duration": 5, "unit": "Minute" }
  }],
  "share": {
    "text": "Custom Share-Text",
    "account_ids": ["andere_account_id"],
    "after": { "duration": 2, "unit": "Hour" },
    "delay": { "duration": 30, "unit": "Minute" }
  },
  "delete": {
    "hide": false,
    "delay": { "duration": 24, "unit": "Hour" }
  }
}]
```

## Recurring Posts (Wiederkehrend)

```json
{
  "bulk": {
    "state": "recurring",
    "posts": [{
      "networks": { "facebook": { "type": "photo", "text": "Wöchentliches Update" } },
      "media": [{ "id": "MEDIA_ID", "type": "photo" }],
      "accounts": [{ "id": "ACCOUNT_ID" }],
      "recurring": {
        "start_date": "2025-05-01T10:00:00Z",
        "end_date": "2025-06-01T10:00:00Z",
        "repeat": "weekly",
        "days_of_week": [1, 5],
        "repeat_rate": 1,
        "time": "10:00"
      }
    }]
  }
}
```

| Parameter | Werte |
|-----------|-------|
| `repeat` | `daily`, `weekly`, `monthly` |
| `days_of_week` | 1=Montag ... 7=Sonntag |
| `repeat_rate` | 1=jede Woche, 2=alle 2 Wochen, etc. |

## Recycling (Content wiederverwenden)

```json
"recycling": {
  "solo": true,
  "gap": 2,
  "gap_freq": "Week",
  "start_date": "2025-06-01",
  "expire_count": "3",
  "expire_date": "2025-07-15"
}
```

| Parameter | Beschreibung |
|-----------|-------------|
| `solo` | Einzeln (true) oder gruppiert (false) |
| `gap` | Frequenz-Wert |
| `gap_freq` | `Day`, `Week`, `Month` |
| `expire_count` | Max. Anzahl Wiederholungen |
| `expire_date` | Enddatum |
