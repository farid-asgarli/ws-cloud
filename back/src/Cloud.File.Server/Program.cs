using System.Text;
using Cloud.File.Server.Data;
using Cloud.File.Server.Data.Entities;
using Cloud.File.Server.Security;
using Cloud.File.Server.WebSockets;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Add CORS with environment-aware configuration
var corsOrigins =
    builder.Configuration.GetSection("Security:CorsOrigins").Get<string[]>()
    ??
    [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    });
});

// Add database context
builder.Services.AddDbContext<CloudFileDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
    options.UseNpgsql(connectionString);
});

// Add ASP.NET Core Identity
builder
    .Services.AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
    {
        // Password settings
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequiredLength = 8;

        // Lockout settings
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.AllowedForNewUsers = true;

        // User settings
        options.User.RequireUniqueEmail = true;
    })
    .AddEntityFrameworkStores<CloudFileDbContext>()
    .AddDefaultTokenProviders();

// Configure JWT Authentication
var jwtSettings = builder.Configuration.GetSection("Jwt");
var secretKey =
    jwtSettings["SecretKey"]
    ?? throw new InvalidOperationException("JWT SecretKey must be configured in appsettings.json");

builder
    .Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSettings["Issuer"] ?? "CloudFile",
            ValidAudience = jwtSettings["Audience"] ?? "CloudFileClient",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey)),
            ClockSkew = TimeSpan.Zero,
        };

        // Enable JWT auth for WebSocket connections via query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;

                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/ws"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization();

// Security services
builder.Services.AddSingleton(
    builder.Configuration.GetSection("Security:FileTypeRestrictions").Get<FileTypeRestrictions>()
        ?? new FileTypeRestrictions()
);
builder.Services.AddSingleton<IFileScanService, NoOpFileScanService>();

// Add services
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddSingleton<IFileSystemService, FileSystemService>();
builder.Services.AddSingleton<IBrowserUploadService, BrowserUploadService>();
builder.Services.AddScoped<IFileSystemRepository, FileSystemRepository>();
builder.Services.AddSingleton<FileSystemWebSocketHandler>();
builder.Services.AddHostedService<UploadSessionCleanupService>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Apply database migrations and seed initial data
await DbSeeder.SeedAsync(app.Services, builder.Configuration);

// Configure pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Security middleware pipeline (order matters)
app.UseMiddleware<InputSanitizationMiddleware>();
app.UseMiddleware<RateLimitingMiddleware>();

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

// WebSocket endpoint
app.Map(
    "/ws",
    async (HttpContext context, FileSystemWebSocketHandler handler) =>
    {
        if (context.WebSockets.IsWebSocketRequest)
        {
            var webSocket = await context.WebSockets.AcceptWebSocketAsync();
            var connectionId = Guid.NewGuid().ToString();
            await handler.HandleAsync(webSocket, connectionId, context.RequestAborted);
        }
        else
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
        }
    }
);

app.MapControllers();

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Serve the Vite SPA from wwwroot (production only)
if (!app.Environment.IsDevelopment())
{
    app.UseStaticFiles();
    app.MapFallbackToFile("index.html");
}

app.Run();
