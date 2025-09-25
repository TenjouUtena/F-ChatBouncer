using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;

namespace FChatBouncer.Server.TempModels;

public partial class FchatBouncerContext : DbContext
{
    public FchatBouncerContext(DbContextOptions<FchatBouncerContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AspNetRole> AspNetRoles { get; set; }

    public virtual DbSet<AspNetRoleClaim> AspNetRoleClaims { get; set; }

    public virtual DbSet<AspNetUser> AspNetUsers { get; set; }

    public virtual DbSet<AspNetUserClaim> AspNetUserClaims { get; set; }

    public virtual DbSet<AspNetUserLogin> AspNetUserLogins { get; set; }

    public virtual DbSet<AspNetUserToken> AspNetUserTokens { get; set; }

    public virtual DbSet<Channel> Channels { get; set; }

    public virtual DbSet<Character> Characters { get; set; }

    public virtual DbSet<CharacterChannel> CharacterChannels { get; set; }

    public virtual DbSet<CharacterConnection> CharacterConnections { get; set; }

    public virtual DbSet<Message> Messages { get; set; }

    public virtual DbSet<Profile> Profiles { get; set; }

    public virtual DbSet<QueuedMessage> QueuedMessages { get; set; }

    public virtual DbSet<UserSession> UserSessions { get; set; }

    public virtual DbSet<UserSetting> UserSettings { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AspNetRole>(entity =>
        {
            entity.HasIndex(e => e.NormalizedName, "RoleNameIndex").IsUnique();

            entity.Property(e => e.Name).HasMaxLength(256);
            entity.Property(e => e.NormalizedName).HasMaxLength(256);
        });

        modelBuilder.Entity<AspNetRoleClaim>(entity =>
        {
            entity.HasIndex(e => e.RoleId, "IX_AspNetRoleClaims_RoleId");

            entity.HasOne(d => d.Role).WithMany(p => p.AspNetRoleClaims).HasForeignKey(d => d.RoleId);
        });

        modelBuilder.Entity<AspNetUser>(entity =>
        {
            entity.HasIndex(e => e.NormalizedEmail, "EmailIndex");

            entity.HasIndex(e => e.NormalizedUserName, "UserNameIndex").IsUnique();

            entity.Property(e => e.Email).HasMaxLength(256);
            entity.Property(e => e.NormalizedEmail).HasMaxLength(256);
            entity.Property(e => e.NormalizedUserName).HasMaxLength(256);
            entity.Property(e => e.UserName).HasMaxLength(256);

            entity.HasMany(d => d.Roles).WithMany(p => p.Users)
                .UsingEntity<Dictionary<string, object>>(
                    "AspNetUserRole",
                    r => r.HasOne<AspNetRole>().WithMany().HasForeignKey("RoleId"),
                    l => l.HasOne<AspNetUser>().WithMany().HasForeignKey("UserId"),
                    j =>
                    {
                        j.HasKey("UserId", "RoleId");
                        j.ToTable("AspNetUserRoles");
                        j.HasIndex(new[] { "RoleId" }, "IX_AspNetUserRoles_RoleId");
                    });
        });

        modelBuilder.Entity<AspNetUserClaim>(entity =>
        {
            entity.HasIndex(e => e.UserId, "IX_AspNetUserClaims_UserId");

            entity.HasOne(d => d.User).WithMany(p => p.AspNetUserClaims).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<AspNetUserLogin>(entity =>
        {
            entity.HasKey(e => new { e.LoginProvider, e.ProviderKey });

            entity.HasIndex(e => e.UserId, "IX_AspNetUserLogins_UserId");

            entity.HasOne(d => d.User).WithMany(p => p.AspNetUserLogins).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<AspNetUserToken>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.LoginProvider, e.Name });

            entity.HasOne(d => d.User).WithMany(p => p.AspNetUserTokens).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<Channel>(entity =>
        {
            entity.HasIndex(e => new { e.UserId, e.FchatChannelName }, "IX_Channels_User_FChatChannel_Unique").IsUnique();

            entity.Property(e => e.DisplayName).HasMaxLength(100);
            entity.Property(e => e.FchatChannelName)
                .HasMaxLength(100)
                .HasColumnName("FChatChannelName");

            entity.HasOne(d => d.User).WithMany(p => p.Channels).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<Character>(entity =>
        {
            entity.HasIndex(e => e.IsOnline, "IX_Characters_IsOnline");

            entity.HasIndex(e => e.Name, "IX_Characters_Name_Unique").IsUnique();

            entity.HasIndex(e => e.Status, "IX_Characters_Status");

            entity.Property(e => e.Gender).HasMaxLength(50);
            entity.Property(e => e.Name).HasMaxLength(100);
            entity.Property(e => e.Status).HasMaxLength(50);
            entity.Property(e => e.StatusMessage).HasMaxLength(500);
        });

        modelBuilder.Entity<CharacterChannel>(entity =>
        {
            entity.HasIndex(e => e.BouncerUserId, "IX_CharacterChannels_BouncerUserId");

            entity.HasIndex(e => e.CharacterId, "IX_CharacterChannels_CharacterId");

            entity.HasIndex(e => new { e.CharacterConnectionId, e.ChannelId }, "IX_CharacterChannels_Connection_Channel_Unique").IsUnique();

            entity.Property(e => e.ChannelId).HasMaxLength(100);
            entity.Property(e => e.CharacterConnectionId).HasDefaultValue(0);

            entity.HasOne(d => d.BouncerUser).WithMany(p => p.CharacterChannels).HasForeignKey(d => d.BouncerUserId);

            entity.HasOne(d => d.CharacterConnection).WithMany(p => p.CharacterChannels).HasForeignKey(d => d.CharacterConnectionId);

            entity.HasOne(d => d.Character).WithMany(p => p.CharacterChannels).HasForeignKey(d => d.CharacterId);
        });

        modelBuilder.Entity<CharacterConnection>(entity =>
        {
            entity.HasIndex(e => e.CharacterId, "IX_CharacterConnections_CharacterId");

            entity.HasIndex(e => e.IsActive, "IX_CharacterConnections_IsActive");

            entity.HasIndex(e => e.IsConnected, "IX_CharacterConnections_IsConnected");

            entity.HasIndex(e => new { e.UserId, e.CharacterId }, "IX_CharacterConnections_User_Character_Unique").IsUnique();

            entity.Property(e => e.FchatPasswordEncrypted)
                .HasMaxLength(500)
                .HasColumnName("FChatPasswordEncrypted");
            entity.Property(e => e.FchatUsername)
                .HasMaxLength(100)
                .HasColumnName("FChatUsername");
            entity.Property(e => e.UserId).HasMaxLength(450);

            entity.HasOne(d => d.Character).WithMany(p => p.CharacterConnections).HasForeignKey(d => d.CharacterId);

            entity.HasOne(d => d.User).WithMany(p => p.CharacterConnections).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<Message>(entity =>
        {
            entity.HasIndex(e => e.Timestamp, "IX_Messages_Timestamp");

            entity.HasIndex(e => new { e.UserId, e.ChannelName, e.Timestamp }, "IX_Messages_User_Channel_Timestamp");

            entity.HasIndex(e => new { e.UserId, e.Timestamp }, "IX_Messages_User_Timestamp");

            entity.Property(e => e.ChannelName).HasMaxLength(100);
            entity.Property(e => e.CharacterName)
                .HasMaxLength(50)
                .HasDefaultValueSql("''::character varying");
            entity.Property(e => e.FchatMessageId)
                .HasMaxLength(100)
                .HasColumnName("FChatMessageId");
            entity.Property(e => e.Sender).HasMaxLength(50);

            entity.HasOne(d => d.User).WithMany(p => p.Messages).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<Profile>(entity =>
        {
            entity.HasIndex(e => e.UserId, "IX_Profiles_UserId");

            entity.Property(e => e.CharacterName).HasMaxLength(100);

            entity.HasOne(d => d.User).WithMany(p => p.Profiles).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<QueuedMessage>(entity =>
        {
            entity.HasIndex(e => e.UserId, "IX_QueuedMessages_UserId");

            entity.Property(e => e.ChannelName).HasMaxLength(100);
            entity.Property(e => e.SenderCharacter).HasMaxLength(50);

            entity.HasOne(d => d.User).WithMany(p => p.QueuedMessages).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.HasIndex(e => e.UserId, "IX_UserSessions_UserId");

            entity.Property(e => e.FchatSessionId)
                .HasMaxLength(100)
                .HasColumnName("FChatSessionId");

            entity.HasOne(d => d.User).WithMany(p => p.UserSessions).HasForeignKey(d => d.UserId);
        });

        modelBuilder.Entity<UserSetting>(entity =>
        {
            entity.HasKey(e => e.UserId);

            entity.Property(e => e.FchatCredentialsEncrypted).HasColumnName("FChatCredentialsEncrypted");

            entity.HasOne(d => d.User).WithOne(p => p.UserSetting).HasForeignKey<UserSetting>(d => d.UserId);
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
