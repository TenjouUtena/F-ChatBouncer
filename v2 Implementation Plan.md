# F-ChatBouncer v2 Implementation Plan

This plan takes the current codebase to a cleaned-up "v2" that runs on Railway. It is written so that each phase can be done in one sitting, builds green, and is committed on its own. Phases are ordered so that nothing depends on later work.

Ground rules for the whole plan:

- **One backend instance, forever.** Everything in-process (F-Chat connections, ticket cache, profile worker) assumes this. Do not add a second replica.
- **One migration, forever.** The old migrations are deleted. The schema is regenerated as a single `Initial` migration at the end of every phase that changes the model. The production database on Railway is created fresh.
- **Commit at the end of every phase.** Each phase ends with a build and a smoke test. If a phase is half done, do not move on.
- **Delete, don't comment out.** Git has the history.

Phases:

| Phase | Name | Touches schema? |
|---|---|---|
| 0 | Baseline | no |
| 1 | Remove dead code, packages, and build machinery | no |
| 2 | Security fixes | yes |
| 3 | Profile pipeline v2 | yes |
| 4 | Character info broadcast (gender and status without profiles) | no |
| 5 | Client storage consolidation | no |
| 6 | Infrastructure fixes and Railway rebuild | no |
| 7 | Docs | no |

---

## Phase 0: Baseline

Goal: a known-good starting point.

1. Create a branch: `git checkout -b v2`.
2. Confirm the backend builds and the client type-checks before touching anything:

   ```bash
   cd src/FChatBouncer.Server && dotnet build
   cd ../fchat-bouncer-client && npm ci && npx tsc --noEmit && npm run lint
   ```

3. Make sure local Postgres and Redis are running, `source src/FChatBouncer.Server/set-dev-env.sh`, and `dotnet run` starts cleanly. Log in once and open a channel, so you know what "working" looks like.
4. Commit nothing yet. If step 2 or 3 fails, fix that first and commit it as "Phase 0: baseline".

---

## Phase 1: Remove dead code, packages, and build machinery

Goal: delete everything that is unreferenced or belongs to a previous generation. No behaviour changes. This phase does not touch the schema except to delete the migration files, which are regenerated in Phase 2.

### 1.1 Backend deletions

Delete these entirely:

| Path | Why |
|---|---|
| `src/FChatBouncer.Server/TempModels/` (whole folder) | Scaffolded duplicate `DbContext`. Nothing references it. Still maps the dropped `Profiles` table. |
| `src/FChatBouncer.Server/Models/Profile.cs` | Entity for the `Profiles` table dropped by the `RemoveProfileTable` migration. |
| `src/FChatBouncer.Server/Tests/` (whole folder) | Six classes with `Console.WriteLine` runners compiled into the web app and never called. |
| `src/FChatBouncer.Server/Migrations/` (whole folder) | Regenerated as one migration in Phase 2. |
| `src/FChatBouncer.Server/Dockerfile.arm64` | Unused alternative. |
| `scripts/deploy-fresh-database.sql` | Generated from the old migrations. Startup runs `MigrateAsync`, so it is redundant. |
| `railway-migrate.sh` | Same reason. |
| `build-railway.sh`, `scripts/version-manager.sh`, `scripts/test-versioning.sh`, `scripts/test-git-checks.sh`, `build-info.json` | Docker Hub push and commit-on-build machinery. Railway builds from GitHub directly (Phase 6). |
| `.github/workflows/docker-build.yml` | Pushes to Docker Hub. Replaced by Railway's GitHub integration. |
| `package.json`, `package-lock.json` (repo root) | Only dependency is the Vercel CLI. Install it globally if you need it. |

In `ProfileService.cs`, delete these members (the rest of the file is rewritten in Phase 3, but removing these now keeps the diff readable):

- `ConvertCharacterDataToProfileData` (private, duplicate of `FListCharacterDataService.ConvertToProfileData`, never called).
- `GetWebSocketClientAsync` (reads a private field of `FChatService` by reflection, never called).
- The commented-out memo refresh block inside `SaveStructuredProfileAsync`.

In `CharacterController.cs`, delete the whole `#region Diagnostic Endpoints` block and the DTOs that only it uses (`DetailedCharacterDto`, `CharacterDiagnosticResponse`, `CharacterDiagnosticSummary`, `CharacterDiagnosticSearchResponse`, `CharacterStatsResponse`, `RequestProfileRequest`). Then remove the now-unused `ICharacterService` members `GetTotalCharacterCountAsync`, `GetCharactersWithProfilesAsync`, `GetRecentlyUpdatedCharactersAsync`, `GetCharacterConnectionsAsync(string characterName)`, and the single-argument `GetCharacterChannelsAsync(string characterName)`. Check each with grep before deleting; `CleanupOrphanedCharactersAsync` is also unreferenced.

In `FChatBouncer.Server.csproj` remove:

- `Microsoft.AspNetCore.SignalR.StackExchangeRedis` (never wired; single instance, no backplane needed).
- `Microsoft.AspNetCore.DataProtection.StackExchangeRedis` is **kept**; Phase 2 wires it.

Fix the Dockerfile's final stage while you are here. It currently uses the SDK image as the runtime, which makes the image about four times larger than needed:

```dockerfile
# Final stage
FROM base AS final
```

### 1.2 Client deletions

| Path | Why |
|---|---|
| `src/app/characters/page.tsx` | Debug page. |
| `src/app/test-bbcode/page.tsx` | Debug page. |
| `src/components/BackendCharacterLookup.tsx` | Only used by the debug page. |
| `src/components/FrontendCharacterInspection.tsx` | Same. |
| `src/components/ManualProfileRequest.tsx` | Same. |
| `src/components/StorageManagement.tsx` | Its "5MB localStorage" warnings predate IndexedDB. Check where it is mounted (`CharacterSettings.tsx` or `ChatInterface.tsx`) and remove the mount. |
| `src/lib/indexeddb-utils.ts` | Opens and deletes a throwaway database on every boot. |

In `src/components/StorageInitializer.tsx`:

- Remove the `checkIndexedDBSupport`, `isPrivateMode`, and `logIndexedDBStatus` calls and their imports.
- Remove the block that writes, reads, and deletes a test message on every page load.

In `src/lib/api.ts` remove `requestProfileManually` (it called the deleted diagnostic endpoint).

In `package.json` remove these dependencies, which have zero imports in `src/`:

- `next-auth`
- `@auth/core`
- `@tanstack/react-query`
- `react-hook-form`

Run `npm install` to refresh the lockfile. Note there is both a `yarn.lock` and a `package-lock.json` in the client folder; delete `yarn.lock`, the Dockerfile uses `npm ci`.

### 1.3 Verify and commit

```bash
cd src/FChatBouncer.Server && dotnet build          # must be 0 errors; warnings about unused usings are fine
cd ../fchat-bouncer-client && npx tsc --noEmit && npm run lint && npm run build
```

The backend will not **start** yet because the migrations folder is gone. That is expected; Phase 2 regenerates it.

Commit: `Phase 1: remove dead code, debug surface, unused packages, build scripts`.

---

## Phase 2: Security fixes

Goal: stop storing plaintext passwords, make OAuth survive redeploys, and reduce to one encryption key. Ends with the first regenerated migration.

### 2.1 Stop persisting the F-Chat password on `CharacterConnection`

The hub method `ConnectCharacter(characterName, fchatUsername, fchatPassword)` passes the plaintext password through `FChatService.ConnectCharacterAsync` into `CharacterService.CreateOrUpdateCharacterConnectionAsync`, which writes it unchanged into the column named `FChatPasswordEncrypted` (there is a `// TODO: Encrypt password` beside it). The properly encrypted copy already lives in `UserSettings.FChatCredentialsEncrypted`.

1. In `Models/CharacterConnection.cs` delete the `FChatPasswordEncrypted` property.
2. In `CharacterService.CreateOrUpdateCharacterConnectionAsync` drop the `fchatPassword` parameter and the two assignments. Update `ICharacterService` and the one caller in `FChatService.UpdateCharacterConnectionStatus`.
3. The password still flows in memory to the F-Chat login (`FChatWebSocketClient`), which is fine. It must not be written anywhere.
4. Grep for `FChatPasswordEncrypted` across the repo; the only remaining hits should be none.

### 2.2 Persist Data Protection keys in Redis

Without this, the key ring lives on the container filesystem and is lost on every Railway deploy, which breaks in-flight Google OAuth state cookies.

In `Program.cs`, replace:

```csharp
builder.Services.AddDataProtection();
```

with:

```csharp
builder.Services.AddDataProtection()
    .SetApplicationName("FChatBouncer")
    .PersistKeysToStackExchangeRedis(
        sp => sp.GetRequiredService<IConnectionMultiplexer>().GetDatabase(),
        "FChatBouncer:DataProtection-Keys");
```

The package is already referenced. `IConnectionMultiplexer` is already registered as a singleton earlier in the file.

### 2.3 One encryption key

Today there are two: `ENCRYPTION_KEY` (AES-GCM via `EncryptionService`, used for credentials) and `CREDENTIAL_ENCRYPTION_KEY` (AES-CBC with an all-zero IV in `TicketManager`, used for short-lived F-Chat tickets).

1. In `Services/TicketManager.cs` remove the constructor's key lookup, `EncryptTicket`, and `DecryptTicket`. Inject `IEncryptionService` and call `Encrypt` / `Decrypt` instead. Both services are singletons, so this is a constructor change only.
2. In `Program.cs` delete the startup block that logs whether `CREDENTIAL_ENCRYPTION_KEY` is set.
3. In `Services/EncryptionService.cs` make a missing `ENCRYPTION_KEY` a **fatal** error instead of generating a temporary key and logging it. A generated key means every stored credential becomes unreadable after a restart.
4. Remove `CREDENTIAL_ENCRYPTION_KEY` from `set-dev-env.sh` and from `Environment.md` (Phase 7 rewrites that file anyway). Add `ENCRYPTION_KEY` to `set-dev-env.sh`: `export ENCRYPTION_KEY="$(openssl rand -base64 32)"` is fine for dev, but note that changing it invalidates stored credentials.

### 2.4 Regenerate the migration

```bash
cd src/FChatBouncer.Server
dotnet ef migrations add Initial
dotnet ef database drop --force
dotnet run     # MigrateAsync creates the schema
```

Keep `Data/BouncerDbContextFactory.cs`; `dotnet ef` needs it.

### 2.5 Verify and commit

- Log in with Google. Restart the backend mid-way through the OAuth redirect; it should still complete.
- Connect a character. Inspect `CharacterConnections` in psql; there is no password column.
- Disconnect and reconnect a character; ticket encrypt/decrypt round-trips.

Commit: `Phase 2: drop plaintext password column, persist DP keys, single encryption key`.

---

## Phase 3: Profile pipeline v2

Goal: one representation of a character on the server, profiles fetched on demand only, an in-process worker instead of a database queue, and per-user data out of the shared row.

### 3.1 Target model

```csharp
public class Character
{
    public int Id { get; set; }
    public string Name { get; set; }              // unique index, max 100
    public string Gender { get; set; } = "None";  // from LIS/NLN or profile
    public string Status { get; set; } = "offline";
    public string? StatusMessage { get; set; }
    public bool IsOnline { get; set; }
    public DateTime FirstSeen { get; set; }
    public DateTime LastSeen { get; set; }

    // Profile cache. One column, jsonb, nullable.
    public string? ProfileJson { get; set; }      // HasColumnType("jsonb")
    public DateTime? ProfileFetchedAt { get; set; }

    [NotMapped]
    public ProfileData? Profile
    {
        get => ProfileJson is null ? null : JsonSerializer.Deserialize<ProfileData>(ProfileJson);
        set { ProfileJson = value is null ? null : JsonSerializer.Serialize(value); }
    }

    public ICollection<CharacterConnection> Connections { get; set; }
    public ICollection<CharacterChannel> Channels { get; set; }
}

public class UserCharacterNote
{
    public string UserId { get; set; }        // composite PK with CharacterId
    public int CharacterId { get; set; }
    public string? Memo { get; set; }         // max 1000
    public DateTime UpdatedAt { get; set; }
}
```

Removed from `Character`: `ProfileData`, `StructuredProfileData`, `RawProData`, `LastUpdated`, `Memo`, `MemoLastUpdated`, `GetStructuredProfile`, `SetStructuredProfile`, `GetSummary`. Keep `UpdateStatus`.

Removed entirely: `Models/ProfileQueueItem.cs` and its three enums, the `ProfileQueueItems` `DbSet` and its three indexes in `BouncerDbContext`.

Added to `BouncerDbContext`:

```csharp
public DbSet<UserCharacterNote> UserCharacterNotes { get; set; }

builder.Entity<Character>().Property(c => c.ProfileJson).HasColumnType("jsonb");
builder.Entity<UserCharacterNote>().HasKey(n => new { n.UserId, n.CharacterId });
```

`ProfileFetchedAt` is a real column so staleness is a `WHERE` clause and never requires deserializing JSON. The `Timestamp` property inside `ProfileData` can stay for the client's benefit but the server must not read it.

### 3.2 Clean up `ProfileData`

In `FListCharacterDataService.ConvertToProfileData`, stop writing magic keys into `Info`: `"View Count"`, `"Images"`, `"Inlines"`, and every `"Image_{id}"` pipe-delimited string. Replace with a proper `ViewCount` int property on `ProfileData`. `Images` and `Inlines` already have structured properties. Before removing, grep the client for `View Count`, `Image_`, and `"Images"` to confirm nothing reads them; `ProfileModal.tsx` uses `profileData.images` and `profileData.inlines`, which stay.

Also delete `GetCharacterDataWithMappingAsync` (unused; only the ticket-renewal variant is called) and the matching interface member.

### 3.3 Fix the mapping cache

`FListMappingService` is registered **scoped** but caches in an instance field, so it refetches F-List's kink and infotag mapping on every profile. Make it a singleton that uses `IHttpClientFactory`:

```csharp
public class FListMappingService : IFListMappingService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);
    private MappingResponse? _cached;
    private DateTime _cachedAt;
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    public async Task<MappingResponse> GetMappingAsync(CancellationToken ct = default)
    {
        if (_cached is not null && DateTime.UtcNow - _cachedAt < Ttl) return _cached;
        await _refreshLock.WaitAsync(ct);
        try
        {
            if (_cached is not null && DateTime.UtcNow - _cachedAt < Ttl) return _cached;
            var client = _httpClientFactory.CreateClient();
            // ... existing fetch and deserialize ...
            _cached = mapping; _cachedAt = DateTime.UtcNow;
            return mapping;
        }
        finally { _refreshLock.Release(); }
    }
}
```

In `Program.cs`: `builder.Services.AddHttpClient();` once, `builder.Services.AddSingleton<IFListMappingService, FListMappingService>();`, and remove `AddHttpClient<FListMappingService>()`. Apply the same `IHttpClientFactory` pattern to `FListTicketManager`, which is also a singleton holding a typed `HttpClient`.

### 3.4 The worker

New file `Services/ProfileFetchWorker.cs`. This replaces `ProfileQueueService`, `IProfileQueueService`, `ProfileQueueProcessor`, `ProfileQueueController`, `ProfileRateLimiter`, `IProfileRateLimiter`, and the `_pendingRequests` dictionary in `ProfileService`. Delete all of those and their registrations in `Program.cs`.

```csharp
using System.Collections.Concurrent;
using System.Threading.Channels;

namespace FChatBouncer.Server.Services;

public enum ProfilePriority { High, Normal }

public sealed record ProfileFetchRequest(string UserId, string CharacterName, ProfilePriority Priority);

public interface IProfileFetchQueue
{
    /// Returns true if queued, false if already in flight or dropped.
    bool TryEnqueue(ProfileFetchRequest request);
    int PendingCount { get; }
}

public sealed class ProfileFetchWorker : BackgroundService, IProfileFetchQueue
{
    private readonly Channel<ProfileFetchRequest> _high =
        Channel.CreateBounded<ProfileFetchRequest>(new BoundedChannelOptions(200) { FullMode = BoundedChannelFullMode.DropWrite });
    private readonly Channel<ProfileFetchRequest> _normal =
        Channel.CreateBounded<ProfileFetchRequest>(new BoundedChannelOptions(2000) { FullMode = BoundedChannelFullMode.DropWrite });

    // Dedupe by character name. Profiles are global, so two users asking for the
    // same character share one fetch.
    private readonly ConcurrentDictionary<string, byte> _inFlight = new(StringComparer.OrdinalIgnoreCase);

    private readonly IServiceProvider _services;
    private readonly ILogger<ProfileFetchWorker> _logger;
    private static readonly TimeSpan MinGapBetweenFetches = TimeSpan.FromSeconds(2);

    public ProfileFetchWorker(IServiceProvider services, ILogger<ProfileFetchWorker> logger)
    { _services = services; _logger = logger; }

    public int PendingCount => _high.Reader.Count + _normal.Reader.Count;

    public bool TryEnqueue(ProfileFetchRequest request)
    {
        if (!_inFlight.TryAdd(request.CharacterName, 0)) return false;
        var channel = request.Priority == ProfilePriority.High ? _high : _normal;
        if (channel.Writer.TryWrite(request)) return true;
        _inFlight.TryRemove(request.CharacterName, out _);
        _logger.LogWarning("Profile queue full, dropped {Character}", request.CharacterName);
        return false;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            ProfileFetchRequest request;
            if (_high.Reader.TryRead(out var hi)) request = hi;
            else if (_normal.Reader.TryRead(out var lo)) request = lo;
            else
            {
                // Wait for either channel to have data.
                var highWait = _high.Reader.WaitToReadAsync(ct).AsTask();
                var normalWait = _normal.Reader.WaitToReadAsync(ct).AsTask();
                await Task.WhenAny(highWait, normalWait);
                continue;
            }

            var started = DateTime.UtcNow;
            try
            {
                using var scope = _services.CreateScope();
                var fetcher = scope.ServiceProvider.GetRequiredService<IProfileService>();
                await fetcher.FetchAndStoreAsync(request.UserId, request.CharacterName, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Profile fetch failed for {Character}", request.CharacterName);
            }
            finally
            {
                _inFlight.TryRemove(request.CharacterName, out _);
            }

            var elapsed = DateTime.UtcNow - started;
            if (elapsed < MinGapBetweenFetches)
                await Task.Delay(MinGapBetweenFetches - elapsed, ct);
        }
    }
}
```

Registration:

```csharp
builder.Services.AddSingleton<ProfileFetchWorker>();
builder.Services.AddSingleton<IProfileFetchQueue>(sp => sp.GetRequiredService<ProfileFetchWorker>());
builder.Services.AddHostedService(sp => sp.GetRequiredService<ProfileFetchWorker>());
```

Design notes:

- **Dedupe key is the character name**, not user plus character, because the cached profile is global. The user id travels with the request only so the worker knows whose F-List credentials to use.
- **Bounded with `DropWrite`.** If something ever floods the queue, requests are dropped and logged instead of growing memory. The client re-requests on the next modal open anyway.
- **Two seconds between fetches** is the pacing. The old 30-second gap was chosen when every message sender triggered a fetch; after Phase 4 that no longer happens. Adjust if F-List complains.
- **No retries.** A failed fetch leaves `ProfileFetchedAt` unchanged; the next request for that character tries again. If you later want retries, add a `Attempt` field to the record and re-enqueue once with a delay, but do not add it now.
- **Metrics.** `MetricsCollectionService` reads `ProfileQueueItems` for the queue-depth gauge. Replace that query with `IProfileFetchQueue.PendingCount`.

### 3.5 Rewrite `ProfileService`

Shrink `IProfileService` to four members:

```csharp
public interface IProfileService
{
    /// Returns the cached profile (possibly stale) and whether a refresh was queued.
    Task<(ProfileData? Profile, DateTime? FetchedAt, bool RefreshQueued)> GetAsync(string userId, string characterName, bool queueIfStale = true);

    /// Force a refresh regardless of age. Used by the modal's refresh button.
    Task<bool> RequestRefreshAsync(string userId, string characterName);

    /// Called only by ProfileFetchWorker.
    Task FetchAndStoreAsync(string userId, string characterName, CancellationToken ct);

    Task NotifyProfileAvailableAsync(string userId, string characterName);
}
```

Behaviour:

- `GetAsync` loads the `Character` row by name. If `ProfileJson` is null, enqueue `High` and return `(null, null, true)`. If `ProfileFetchedAt` is older than `ProfileStaleAfter` (make it a config value, default 24 hours), enqueue `Normal` and return the stale profile with `RefreshQueued = true`. Otherwise return it with `false`.
- `RequestRefreshAsync` enqueues `High` and returns whether it was accepted.
- `FetchAndStoreAsync` decrypts the user's credentials from `UserSettings`, calls `GetCharacterDataWithMappingAndTicketRenewalAsync`, converts, sets `character.Profile` and `ProfileFetchedAt = UtcNow`, updates `Gender` if the profile has one, saves, then calls `NotifyProfileAvailableAsync`. If the user has no stored credentials, log and return; there is no PRD fallback (see 3.7).
- `NotifyProfileAvailableAsync` is unchanged: sends `ProfileAvailable` to `user-{userId}`.

Delete `SaveProfileAsync`, `SaveStructuredProfileAsync`, `GetStructuredProfileAsync`, `GetCachedProfileAsync`, `RequestProfileAsync`, `ProcessProfileRequestAsync`, `GetCharacterDataAsync`.

Update callers:

- `FChatController.GetProfile`: call `GetAsync`, return `{ characterName, profileData, fetchedAt, isStale, refreshQueued }`. Drop the 429 handling; there is no rate limiter.
- `FChatController.RequestProfile`: call `RequestRefreshAsync`. Keep the `[EnableRateLimiting(RateLimitPolicies.ProfileRequest)]` attribute; that is the HTTP-level limiter in `RateLimitPolicies.cs` and is unrelated to the deleted in-memory one.
- `BouncerHub.RequestProfile`: call `RequestRefreshAsync`.
- `BouncerHub.GetBasicInfo`: read gender and status from the `Character` row via `ICharacterService.GetCharacterAsync`, not from the profile. Phase 4 replaces this method anyway.

### 3.6 `CharacterService` changes

- Delete `UpdateCharacterProfileAsync` (both overloads) and `GetCharacterProfileAsync`. `ProfileService.FetchAndStoreAsync` writes the row directly through `GetOrCreateCharacterAsync`.
- Delete `UpdateCharacterFromChannelDataAsync` and `UpdateCharacterFromFChatDataAsync` if, after grep, only one of them is called; keep one and route both callers through it. They are near-identical.
- `GetOrCreateCharacterAsync`: keep the `ON CONFLICT DO NOTHING` insert. Delete the "fallback to the original approach with retry logic" block below it; the raw insert is the retry strategy.
- Every method has a `catch (DbUpdateException) when (... "23505")` that swallows unique violations. With `ON CONFLICT` in place these cannot occur on `Characters`. Remove them from the methods that only touch `Characters`; keep the one in `CreateOrUpdateCharacterConnectionAsync`, which can legitimately race on `(UserId, CharacterId)`.

### 3.7 Memo and the PRD fallback

Memo:

- `MemoService.GetMemoAsync` is `return null;` followed by unreachable code that logged into F-List with a cookie it never receives. Delete `GetMemoAsync`, `RefreshMemoAsync`, `GetSessionCookiesAsync`, and the `HttpClient` dependency.
- `UpdateMemoAsync(userId, characterName, memo)` upserts a `UserCharacterNote` row. Add `GetMemoAsync(userId, characterName)` that reads it.
- Wherever the friends list is assembled with memos (grep `Memo` in `FChatService` and `BouncerHub`), join on `UserCharacterNotes` for the requesting user instead of reading `Character.Memo`.

PRD fallback (recommended, optional):

The F-Chat `PRO`/`PRD` path only fires when the user has no stored credentials, which cannot happen for a connected user because connecting requires those credentials. Delete `HandlePRDCommandAsync`, the `_buildingProfiles`, `_profileBuildInProgress`, and `_lastRequestedCharacter` fields, the `ProfileReceived` event, `RequestProfileAsync` on `FChatWebSocketClient`, `FChatService.RequestProfileAsync` (both overloads), `FChatService.OnProfileReceived`, `BouncerHub.RequestProfileFromCharacter`, and the client's `requestProfileFromCharacter` and `onProfileReceived` in `signalr.ts`. `UpdateBookmarkFromProfile` is called from `OnProfileReceived`; its job (marking a bookmark online when a profile arrives) is already done by LIS/NLN handling, so it goes too. The "request profile for newly bookmarked character" call in `FChatService.AddBookmarkAsync` is replaced by nothing; the bookmark's status arrives via NLN.

If you decide to keep PRD for now, it must write through `FetchAndStoreAsync`'s storage path so there is still only one place that writes `ProfileJson`.

### 3.8 Regenerate the migration, verify, commit

```bash
cd src/FChatBouncer.Server
rm -rf Migrations
dotnet ef migrations add Initial
dotnet ef database drop --force
dotnet run
```

Verify:

- Open a profile in the modal for a character you have never seen. The response has `profileData: null, refreshQueued: true`; within a few seconds `ProfileAvailable` arrives and the modal fills.
- Open the same profile from a second browser or account. No second F-List call is logged (dedupe).
- Click refresh in the modal. One F-List call is logged.
- Set `ProfileStaleAfter` to 1 minute in `appsettings.Development.json`, wait, reopen. Stale profile is returned immediately and a `Normal` fetch follows.
- `psql`: `\d "Characters"` shows `ProfileJson jsonb` and `ProfileFetchedAt`; no `ProfileQueueItems` table; `UserCharacterNotes` exists.

Commit: `Phase 3: profile pipeline v2 (single jsonb column, in-process fetch worker, per-user notes)`.

---

## Phase 4: Character info broadcast

Goal: the client learns gender and status for every character it sees from data the backend already has, so it never fetches a profile just to colour a name.

### 4.1 Backend

The backend already updates `Characters.Gender`, `Status`, `IsOnline` from `LIS` (bulk on connect), `NLN` (online), `STA` (status change), and `FLN` (offline) via `FChatService.BatchUpdateCharacterStatus`. Add a broadcast at the point where the batch is flushed to the database:

```csharp
public sealed record CharacterInfoDto(string Name, string Gender, string Status, string? StatusMessage, bool IsOnline);

// after the batch is saved:
await _hubContext.Clients.Group($"user-{userId}").SendAsync("CharacterInfo", batch.Select(ToDto).ToArray());
```

Batch size matters: `LIS` on connect can be tens of thousands of characters. Send the `LIS` set in chunks of 500 and only for characters that are in a channel the user has joined or on their friends/bookmarks list; the `_channelCharacters` and friends caches in `FChatWebSocketClient` already know this. For `NLN`/`STA`/`FLN`, send single-item arrays as they happen, but only for characters the user shares a channel with or has bookmarked. Everything else is noise the client would discard.

Add a hub method for on-demand lookup:

```csharp
public async Task<CharacterInfoDto[]> GetCharacterInfo(string[] names)
{
    var characters = await _characterService.GetCharactersAsync(names);   // already exists
    return characters.Select(ToDto).ToArray();
}
```

Delete `BouncerHub.GetBasicInfo`; this replaces it.

### 4.2 Client

- In `signalr.ts` add `onCharacterInfo(callback: (infos: CharacterInfo[]) => void)` and `getCharacterInfo(names: string[]): Promise<CharacterInfo[]>`.
- In the character store (consolidated in Phase 5, but wire it now against the existing `lightweightCharacterIndexedDBStore`): on `CharacterInfo`, upsert each record.
- In `chatStore.addMessage` (around the "Only request profile if we don't know the sender's gender" block): **delete the profile request**. Replace with: if the sender is not in the character store, add the name to a pending set and schedule a debounced (100 ms) `getCharacterInfo` call for the pending set. Upsert the results.
- `getCharacterGender` and `getCharacterSpecies` in `chatStore`: read the character store first; only fall back to a full profile if present, never request one.
- `ProfileModal` is now the only place that calls `requestProfileForCharacter` / `refreshProfile`.

### 4.3 Verify and commit

- Join a busy public channel. The backend log shows zero F-List `character-data.php` calls. Names are coloured within a second of appearing.
- Receive a PM from someone not in any channel. Their name is coloured after one `GetCharacterInfo` round trip.
- Open a profile. Exactly one F-List call.

Commit: `Phase 4: broadcast character gender/status from LIS/NLN; stop fetching profiles for colouring`.

---

## Phase 5: Client storage consolidation

Goal: one IndexedDB database, one store per concept, one zustand store per concept. Messages are left alone in this phase (`messageIndexedDB.ts` is separate and works).

### 5.1 Target

```
IndexedDB "fchat-bouncer" (version 1)
  objectStore "characters"   keyPath "name"   { name, gender, status, statusMessage, isOnline, lastSeen }
  objectStore "profiles"     keyPath "name"   { name, profile, fetchedAt }
  objectStore "connections"  keyPath "name"   { name, isActive, isConnected, status, lastActivity, connectedAt, fchatUsername }
```

One file `src/lib/db.ts` exporting `openDb()` and typed `get/put/delete/getAll/clear` helpers per store. About 120 lines. Consider the `idb` package (small, well maintained) to avoid writing the Promise wrappers by hand; if you add it, pin the version.

Zustand stores:

- `characterStore.ts`: `characters: Record<string, CharacterInfo>`; `upsertMany`, `get`, `has`, `load()` from IndexedDB on init. Replaces `lightweightCharacterStore.ts` and `lightweightCharacterIndexedDBStore.ts`.
- `profileStore.ts`: keep, but point it at `db.ts`. Drop `isProfileStale` (the server reports staleness now) and the `profileLastRequested` map. Keep `profileRequestStatus` for the modal spinner.
- `connectionStore.ts`: rename of `characterIndexedDBStore.ts`, pointed at `db.ts`.

Delete: `lib/indexeddb.ts`, `lib/characterIndexedDB.ts`, `stores/lightweightCharacterStore.ts`, `stores/lightweightCharacterIndexedDBStore.ts`. `lib/indexeddbReady.ts` stays; `StorageInitializer` calls `openDb()` once and marks ready.

### 5.2 Migration of existing browser data

There is none. The database name changes, so old data is simply ignored. Add a one-time `indexedDB.deleteDatabase('FChatBouncerProfiles')` and `deleteDatabase('FChatBouncerCharacters')` in `StorageInitializer` so returning users do not keep dead data around, and remove it again a release later.

### 5.3 Verify and commit

- Fresh browser: log in, join channels, open profiles. DevTools Application tab shows one `fchat-bouncer` database with three stores.
- Reload: characters and profiles are still there; no network calls for them.
- `npx tsc --noEmit && npm run lint && npm run build` pass.

Commit: `Phase 5: single IndexedDB with character/profile/connection stores`.

---

## Phase 6: Infrastructure fixes and Railway rebuild

### 6.1 Small backend fixes

**CORS.** `Program.cs` reads only `CORS__AllowedOrigins__0` by hand. ASP.NET configuration already maps `CORS__AllowedOrigins__0`, `__1`, and so on onto `Cors:AllowedOrigins`. Delete the manual environment-variable branch and keep only:

```csharp
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? throw new InvalidOperationException("Cors:AllowedOrigins must be configured");
```

**Database health check.** The `"database"` check calls `builder.Services.BuildServiceProvider()` on every probe, which builds a second container each time. Add the package `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore` and replace the lambda with `.AddDbContextCheck<BouncerDbContext>("database")`.

**Logging.** The Serilog file sink writes to `logs/` inside the container, which Railway discards. Remove the `File` sink from `appsettings.json` and set the Console sink's `restrictedToMinimumLevel` to `Information`. Railway captures stdout.

**Port.** Add `ENV ASPNETCORE_HTTP_PORTS=8080` to the Dockerfile's final stage so the listen port does not depend on the base image default.

**Startup validation.** `Program.cs` already throws if `JWT__SecretKey` is missing. Do the same for `ENCRYPTION_KEY` (done in 2.3) and for the Redis connection string, so a misconfigured deploy fails at boot instead of at first use.

### 6.2 Railway project layout

Create a new Railway project with these services:

| Service | Source | Settings |
|---|---|---|
| `postgres` | Railway Postgres plugin | Default. Note the generated `DATABASE_URL`. |
| `redis` | Railway Redis plugin | Default. Note the generated `REDIS_URL`. |
| `backend` | GitHub repo, branch `main` | Root directory `src/FChatBouncer.Server`. Builder: Dockerfile (auto-detected). Health check path `/health`. Replicas: **1**. |
| `frontend` | Vercel (keep) **or** GitHub repo on Railway | If Railway: root directory `src/fchat-bouncer-client`, Dockerfile builder, build arg `NEXT_PUBLIC_API_URL`. |

Keeping the frontend on Vercel is simpler and already works; the only reason to move it is to have one dashboard. Either way the backend must know the frontend origin.

### 6.3 Backend variables on Railway

| Variable | Value |
|---|---|
| `DATABASE_URL` | Reference the Postgres service variable: `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `JWT__SecretKey` | `openssl rand -hex 48` |
| `JWT__Issuer` | `F-ChatBouncer` |
| `JWT__Audience` | `F-ChatBouncer-Users` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` (exactly 32 bytes when decoded). **Back this up.** Losing it loses every stored F-Chat credential. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `CORS__AllowedOrigins__0` | `https://fchat.proactiveapathy.com` (or your Vercel URL) |
| `FRONTEND_BASE_URL` | Same value as above |
| `ASPNETCORE_ENVIRONMENT` | `Production` |

Delete the following from your old Railway project and from any notes; they no longer exist: `CREDENTIAL_ENCRYPTION_KEY`, `REDIS_CONNECTION_STRING`, `REDIS_HOST`, `PGHOST` and friends. `RedisEnvironmentConfiguration.cs` can keep supporting the host/port form for local dev, but `REDIS_URL` is the only one used in production.

### 6.4 Domains and OAuth

1. Add the custom domain `api.fchat.proactiveapathy.com` to the backend service and point DNS at the Railway-provided CNAME.
2. In Google Cloud Console the authorized redirect URI is `https://api.fchat.proactiveapathy.com/api/auth/google-callback`. Unchanged if the hostname is unchanged.
3. On Vercel (or the Railway frontend), set `NEXT_PUBLIC_API_URL=https://api.fchat.proactiveapathy.com`.

### 6.5 Deploy and verify

1. Push `v2` to GitHub, merge to `main`. Railway builds the backend. Watch the deploy log for `Database migration completed successfully`.
2. `curl https://api.fchat.proactiveapathy.com/health` returns `Healthy` with four checks.
3. Log in via Google from the frontend. Add F-Chat credentials. Connect a character. Join a channel. Open a profile.
4. Redeploy the backend (empty commit). Log in again; OAuth completes (Data Protection keys survived in Redis). Stored credentials still decrypt (same `ENCRYPTION_KEY`).

Commit: `Phase 6: CORS from config, EF health check, stdout logging, Railway port`.

---

## Phase 7: Docs

- Rewrite `README.md`: what it is, the two services, local dev (Postgres + Redis via a new `docker-compose.yml` with just those two containers, `set-dev-env.sh`, `dotnet run`, `npm run dev`), deploy summary pointing at this plan's Phase 6.
- Rewrite `Environment.md` to match 6.3 exactly.
- Delete `backend.md`, `PROFILES.md`, `FRIENDS_LIST.md`, `MessageQueueing.md`, `Status_Planning.md`, `CHANNEL_LIST_FIX.md`, `friend_status_arch.md`, `docs/VERCEL_DEPLOY.md`. Anything in them that is still true is now in the code or in this plan. If one of them documents a protocol detail you cannot rederive (for example the Redis stream key layout in `MessageQueueing.md`), move that section into a short `docs/` file and delete the rest.
- Add a `CLAUDE.md` at the root with the ground rules at the top of this plan, so future agent sessions do not reintroduce a second instance, a migration history, or a DB queue.

Commit: `Phase 7: docs`.

---

## Not in scope for v2

Listed so they are not accidentally picked up:

- The Redis stream message queue (`MessageQueue/`, `MessageQueueService`, the three stream background services). It works and is independent of profiles.
- The Postgres `Messages` and `QueuedMessages` tables. There are three message stores (Postgres, Redis streams, client IndexedDB); collapsing them is a v3 question.
- `FChatWebSocketClient.cs` (3300 lines) and `FChatService.cs` (2600 lines) beyond the specific deletions above. Splitting them is worthwhile but is its own project.
- Audit log, metrics, and rate-limit middleware.
- The BBCode parser and editor.

## Definition of done

- `git log` on `v2` shows one commit per phase.
- `src/FChatBouncer.Server/Migrations/` contains exactly one migration plus the snapshot.
- Grep returns nothing for: `ProfileQueueItem`, `ProfileRateLimiter`, `StructuredProfileData`, `RawProData`, `FChatPasswordEncrypted`, `CREDENTIAL_ENCRYPTION_KEY`, `TempModels`, `lightweightCharacter`, `FChatBouncerProfiles`.
- Joining a busy channel produces no F-List `character-data.php` calls.
- A backend redeploy on Railway does not log anyone out and does not invalidate stored credentials.
