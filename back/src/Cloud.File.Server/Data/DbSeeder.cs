using Cloud.File.Server.Data.Entities;
using Microsoft.AspNetCore.Identity;

namespace Cloud.File.Server.Data;

/// <summary>
/// Database seeder for initial data, including the admin user.
/// </summary>
public static class DbSeeder
{
    /// <summary>
    /// Seeds the database with initial data.
    /// </summary>
    public static async Task SeedAsync(IServiceProvider services, IConfiguration configuration)
    {
        using var scope = services.CreateScope();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<CloudFileDbContext>>();

        try
        {
            var db = scope.ServiceProvider.GetRequiredService<CloudFileDbContext>();
            await db.Database.EnsureCreatedAsync();

            await SeedAdminUserAsync(scope.ServiceProvider, configuration, logger);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "An error occurred while seeding the database");
            throw;
        }
    }

    private static async Task SeedAdminUserAsync(
        IServiceProvider services,
        IConfiguration configuration,
        ILogger logger
    )
    {
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();

        var adminSettings = configuration.GetSection("AdminUser");
        var adminEmail =
            adminSettings["Email"]
            ?? throw new InvalidOperationException(
                "AdminUser:Email must be configured in appsettings.json"
            );
        var adminPassword =
            adminSettings["Password"]
            ?? throw new InvalidOperationException(
                "AdminUser:Password must be configured in appsettings.json"
            );
        var adminDisplayName = adminSettings["DisplayName"] ?? "Administrator";

        var existingAdmin = await userManager.FindByEmailAsync(adminEmail);
        if (existingAdmin != null)
        {
            logger.LogInformation("Admin user already exists: {Email}", adminEmail);
            return;
        }

        var adminUser = new ApplicationUser
        {
            UserName = adminEmail,
            Email = adminEmail,
            EmailConfirmed = true,
            DisplayName = adminDisplayName,
            CreatedAt = DateTimeOffset.UtcNow,
        };

        var result = await userManager.CreateAsync(adminUser, adminPassword);

        if (result.Succeeded)
        {
            logger.LogInformation("Admin user created successfully: {Email}", adminEmail);
        }
        else
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            logger.LogError("Failed to create admin user: {Errors}", errors);
            throw new InvalidOperationException($"Failed to create admin user: {errors}");
        }
    }
}
