namespace FChatBouncer.Server.Models;

public class FChatChannel
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Title { get; set; }
    public int UserCount { get; set; }
    public ChannelMode Mode { get; set; } = ChannelMode.Chat;
}

public enum ChannelMode
{
    Ads,
    Chat,
    Both
}