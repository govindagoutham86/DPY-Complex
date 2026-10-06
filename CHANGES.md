# DPY Complex fixes applied

- Renamed the backend/database configuration to DPY Complex.
- Made the website shop directory load directly from SQLite through GET /api/shops.
- Preserved the six original HTML shop entries as the initial database seed.
- Added 15-second shop-directory refresh so database changes appear without editing HTML.
- Added database-backed unit selection to the enquiry form.
- Added stronger backend validation and selected-shop validation.
- Improved enquiry error reporting.
- Made team-email and customer-acknowledgement attempts independent.
- Added same-origin static serving from Express.
- Added .env.example and .gitignore.
- Updated README.
- Fixed the obvious “a floors” wording issue.
- Removed the contradictory “half a million” wording from the location paragraph without inventing a replacement figure.

- Fixed local frontend API detection: direct `file://` opening and VS Code Live Server now automatically use `http://localhost:4000`; production same-origin hosting continues to use relative `/api/...` requests.
