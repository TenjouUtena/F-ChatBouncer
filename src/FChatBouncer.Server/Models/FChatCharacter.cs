namespace FChatBouncer.Server.Models;

public class FChatCharacter
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = "online";
    public string? StatusMessage { get; set; }
    public string Gender { get; set; } = string.Empty;
    public DateTime LastSeen { get; set; } = DateTime.UtcNow;
}