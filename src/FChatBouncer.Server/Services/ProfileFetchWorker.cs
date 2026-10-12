using System.Collections.Concurrent;
using System.Threading.Channels;

namespace FChatBouncer.Server.Services;

public enum ProfilePriority { High, Normal }

public sealed record ProfileFetchRequest(string UserId, string CharacterName, ProfilePriority Priority);

public interface IProfileFetchQueue
{
    /// <summary>
    /// Returns true if queued, false if already in flight or dropped.
    /// </summary>
    bool TryEnqueue(ProfileFetchRequest request);

    int PendingCount { get; }
}

/// <summary>
/// In-process profile fetch queue. Fetches one profile at a time from F-List, high priority first,
/// with a fixed gap between fetches. Relies on there being exactly one backend instance.
/// </summary>
public sealed class ProfileFetchWorker : BackgroundService, IProfileFetchQueue
{
    private static readonly TimeSpan MinGapBetweenFetches = TimeSpan.FromSeconds(2);

    private readonly Channel<ProfileFetchRequest> _high =
        Channel.CreateBounded<ProfileFetchRequest>(new BoundedChannelOptions(200) { FullMode = BoundedChannelFullMode.DropWrite });
    private readonly Channel<ProfileFetchRequest> _normal =
        Channel.CreateBounded<ProfileFetchRequest>(new BoundedChannelOptions(2000) { FullMode = BoundedChannelFullMode.DropWrite });

    // Dedupe by character name. Profiles are global, so two users asking for the
    // same character share one fetch.
    private readonly ConcurrentDictionary<string, byte> _inFlight = new(StringComparer.OrdinalIgnoreCase);

    private readonly IServiceProvider _services;
    private readonly ILogger<ProfileFetchWorker> _logger;

    public ProfileFetchWorker(IServiceProvider services, ILogger<ProfileFetchWorker> logger)
    {
        _services = services;
        _logger = logger;
    }

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
                try
                {
                    var highWait = _high.Reader.WaitToReadAsync(ct).AsTask();
                    var normalWait = _normal.Reader.WaitToReadAsync(ct).AsTask();
                    await Task.WhenAny(highWait, normalWait);
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
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
            {
                try { await Task.Delay(MinGapBetweenFetches - elapsed, ct); }
                catch (OperationCanceledException) { break; }
            }
        }
    }
}
