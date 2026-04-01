# Publer API - Workspaces & Accounts

## Workspaces auflisten

```http
GET /api/v1/workspaces
```

Gibt alle verfügbaren Workspaces zurück.

### Response

```json
[
  {
    "id": "workspace_id",
    "name": "Mein Workspace"
  }
]
```

---

## Accounts auflisten

```http
GET /api/v1/accounts
```

Gibt alle verbundenen Social-Media-Accounts im Workspace zurück.

### Response

```json
[
  {
    "id": "66db83154e299efa19a2d8eb",
    "provider": "facebook",
    "name": "Meine Facebook-Seite",
    "social_id": "123456789",
    "picture": "https://...",
    "type": "page"
  }
]
```

### Account-Felder

| Feld       | Typ    | Beschreibung |
|------------|--------|-------------|
| `id`       | string | Publer-interne Account-ID (wird beim Posten verwendet) |
| `provider` | string | facebook, instagram, twitter, linkedin, etc. |
| `name`     | string | Anzeigename |
| `social_id`| string | Account-ID auf der Plattform |
| `picture`  | string | Avatar-URL |
| `type`     | string | page, profile, group, business, channel, etc. |

### Facebook-Accounts filtern

Für unser Tool filtern wir nach:
```typescript
account.provider === 'facebook'
// oder
account.type === 'fb_page'
account.type?.includes('facebook')
```
