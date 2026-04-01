# Publer API - Authentifizierung

## Base URL

```
https://app.publer.com/api/v1/
```

## Required Headers (bei jedem Request)

```http
Authorization: Bearer-API DEIN_API_KEY
Publer-Workspace-Id: DEIN_WORKSPACE_ID
Content-Type: application/json
```

- **API Key** wird unter **Publer Dashboard > Settings > Access & Login > API Keys** erstellt
- Key wird nur **einmal** bei Erstellung angezeigt - sofort sicher speichern
- In unserem Projekt liegt der Key in `.env.local` als `PUBLER_API_KEY`

## Permission Scopes

API Keys haben 6 Scope-Kategorien:
- `users`, `posts`, `media`, `workspaces`, `accounts`, `job_status`

Jeder Scope gibt Zugriff auf die entsprechenden Endpoints.

## Fehler-Codes

| Code | Bedeutung |
|------|-----------|
| 401  | Fehlender/ungültiger Authorization Header oder Key widerrufen |
| 403  | Unzureichende Berechtigungen oder fehlender Workspace-Header |

## Hinweis

Die Publer API ist **nur für Publer Business-Nutzer** verfügbar.
