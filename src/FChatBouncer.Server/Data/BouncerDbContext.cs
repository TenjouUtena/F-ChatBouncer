using FChatBouncer.Server.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FChatBouncer.Server.Data;

public class BouncerDbContext : IdentityDbContext<BouncerUser>
{
    public BouncerDbContext(DbContextOptions<BouncerDbContext> options) : base(options)
    {
    }

    public DbSet<UserSettings> UserSettings { get; set; }
    public DbSet<UserSession> UserSessions { get; set; }
    public DbSet<Message> Messages { get; set; }
    public DbSet<Channel> Channels { get; set; }
    public DbSet<QueuedMessage> QueuedMessages { get; set; }
    public DbSet<Profile> Profiles { get; set; }
    
    // New unified character models
    public DbSet<Character> Characters { get; set; }
    public DbSet<CharacterConnection> CharacterConnections { get; set; }
    public DbSet<CharacterChannel> CharacterChannels { get; set; }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // UserSettings relationship
        builder.Entity<UserSettings>()
            .HasOne(us => us.User)
            .WithOne(u => u.Settings)
            .HasForeignKey<UserSettings>(us => us.UserId);

        // UserSession relationship
        builder.Entity<UserSession>()
            .HasOne(us => us.User)
            .WithMany(u => u.Sessions)
            .HasForeignKey(us => us.UserId);

        // Message relationship
        builder.Entity<Message>()
            .HasOne(m => m.User)
            .WithMany(u => u.Messages)
            .HasForeignKey(m => m.UserId);

        // Channel relationship
        builder.Entity<Channel>()
            .HasOne(c => c.User)
            .WithMany(u => u.Channels)
            .HasForeignKey(c => c.UserId);

        // QueuedMessage relationship
        builder.Entity<QueuedMessage>()
            .HasOne(qm => qm.User)
            .WithMany(u => u.QueuedMessages)
            .HasForeignKey(qm => qm.UserId);

        // Profile relationship
        builder.Entity<Profile>()
            .HasOne(p => p.User)
            .WithMany(u => u.Profiles)
            .HasForeignKey(p => p.UserId);

        // Character relationships
        builder.Entity<Character>()
            .HasIndex(c => c.Name)
            .IsUnique()
            .HasDatabaseName("IX_Characters_Name_Unique");

        // CharacterConnection relationships
        builder.Entity<CharacterConnection>()
            .HasOne(cc => cc.User)
            .WithMany(u => u.CharacterConnections)
            .HasForeignKey(cc => cc.UserId);

        builder.Entity<CharacterConnection>()
            .HasOne(cc => cc.Character)
            .WithMany(c => c.Connections)
            .HasForeignKey(cc => cc.CharacterId);

        // CharacterChannel relationships
        builder.Entity<CharacterChannel>()
            .HasOne(cc => cc.CharacterConnection)
            .WithMany(cc => cc.CharacterChannels)
            .HasForeignKey(cc => cc.CharacterConnectionId);

        // Indexes for performance
        builder.Entity<Message>()
            .HasIndex(m => new { m.UserId, m.ChannelName, m.Timestamp })
            .HasDatabaseName("IX_Messages_User_Channel_Timestamp");

        builder.Entity<Message>()
            .HasIndex(m => new { m.UserId, m.Timestamp })
            .HasDatabaseName("IX_Messages_User_Timestamp");

        builder.Entity<Message>()
            .HasIndex(m => m.Timestamp)
            .HasDatabaseName("IX_Messages_Timestamp");

        // Unique constraints
        builder.Entity<Channel>()
            .HasIndex(c => new { c.UserId, c.FChatChannelName })
            .IsUnique()
            .HasDatabaseName("IX_Channels_User_FChatChannel_Unique");

        builder.Entity<CharacterConnection>()
            .HasIndex(cc => new { cc.UserId, cc.CharacterId })
            .IsUnique()
            .HasDatabaseName("IX_CharacterConnections_User_Character_Unique");

        builder.Entity<CharacterChannel>()
            .HasIndex(cc => new { cc.CharacterConnectionId, cc.ChannelId })
            .IsUnique()
            .HasDatabaseName("IX_CharacterChannels_Connection_Channel_Unique");

        // Additional indexes for performance
        builder.Entity<Character>()
            .HasIndex(c => c.IsOnline)
            .HasDatabaseName("IX_Characters_IsOnline");

        builder.Entity<Character>()
            .HasIndex(c => c.Status)
            .HasDatabaseName("IX_Characters_Status");

        builder.Entity<CharacterConnection>()
            .HasIndex(cc => cc.IsActive)
            .HasDatabaseName("IX_CharacterConnections_IsActive");

        builder.Entity<CharacterConnection>()
            .HasIndex(cc => cc.IsConnected)
            .HasDatabaseName("IX_CharacterConnections_IsConnected");
    }
}