using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace FChatBouncer.Server.Data;

/// <summary>
/// Design-time factory for creating DbContext instances for EF Core migrations
/// </summary>
public class BouncerDbContextFactory : IDesignTimeDbContextFactory<BouncerDbContext>
{
    public BouncerDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<BouncerDbContext>();
        
        // Use a default connection string for migrations
        // This won't be used at runtime, only for generating migrations
        optionsBuilder.UseNpgsql("Host=localhost;Database=fchat_bouncer;Username=postgres;Password=postgres");
        
        return new BouncerDbContext(optionsBuilder.Options);
    }
}

