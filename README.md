# Civic Vote
Real things governments are voting on (U.S. Congress, ~270 cities/counties/agencies on Legistar, UK Parliament), with a free public yes/no vote shared over Nostr relays. No accounts, no server.
- Data refreshes every 6 hours via `.github/workflows/refresh.yml` → `data/items.json`.
- Optional: add a free api.data.gov key as repo secret `CONGRESS_API_KEY` (otherwise uses `DEMO_KEY`).
- `scripts/discover.mjs` re-checks which Legistar clients answer; `scripts/places.json` maps them to names/states.
- Add `?ns=test` to the URL to use a separate test vote space.
