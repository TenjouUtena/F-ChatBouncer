# F-ChatBouncer

Ground rules. Do not undo these without the owner's say-so.

- **One backend instance, forever.** F-Chat connections, the F-List ticket cache and the profile fetch worker (`ProfileFetchWorker`) are in-process. Do not add a SignalR backplane, distributed locks, or anything else that assumes a second replica.
- **One migration, forever.** `src/FChatBouncer.Server/Migrations/` holds a single `Initial` migration. When the model changes, delete the folder and regenerate `Initial`; never add a second migration. The production database is recreated, not migrated.
- **No database-backed queues.** Profile fetches go through the in-memory `Channel<T>` in `ProfileFetchWorker`. Do not reintroduce a `ProfileQueueItems`-style table.
- **Profiles are fetched only on demand.** Only opening the profile modal requests one. Name colouring uses `CharacterInfo` (gender/status from LIS/NLN/STA/FLN), never a profile fetch.
- **`ProfileService.FetchAndStoreAsync` is the only writer of `Characters.ProfileJson`.**
- **Never persist F-Chat passwords** outside `UserSettings.FChatCredentialsEncrypted` (AES-GCM via `ENCRYPTION_KEY`).
- **Delete, don't comment out.** Git has the history.

Build checks:

```bash
cd src/FChatBouncer.Server && dotnet build
cd src/fchat-bouncer-client && npx tsc --noEmit && npm run lint && npm run build
```
