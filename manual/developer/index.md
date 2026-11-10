# Developer reference

Technical documentation for engineers deploying and extending FEC-OS lives in the repository `docs/` folder. This site focuses on **operators and managers**; use the links below when you need architecture or API detail.

| Repository file | Description |
| --- | --- |
| `docs/ARCHITECTURE.md` | App Router flow, RBAC, query cores |
| `docs/DEPLOYMENT.md` | Environment variables and build |
| `docs/DATABASE.md` | Migrations and schema |
| `docs/BOOKINGQUBE.md` | Revenue API integration |
| `docs/API.md` | REST surface overview |
| `docs/hr-admin-guide.md` | HR configuration |
| `docs/procurement-control.md` | In-app PR rules |

Developer markdown stays in `docs/` (not bundled into this MkDocs `site/` output). Open those paths from your FEC-OS git checkout or IDE.

## Running this manual locally

```bash
python -m venv .venv-docs
.venv-docs\Scripts\activate          # Windows
pip install -r requirements-docs.txt
mkdocs serve
```

Default URL: [http://127.0.0.1:8000](http://127.0.0.1:8000)

Set `NEXT_PUBLIC_OPS_MANUAL_URL` in FEC-OS `.env.local` so the in-app **Ops manual** link opens your deployed or local manual URL.
