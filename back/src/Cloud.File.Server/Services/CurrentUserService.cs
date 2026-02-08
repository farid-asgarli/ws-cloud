using System.Security.Claims;

namespace Cloud.File.Server.Services;

/// <summary>
/// Interface to get current authenticated user information.
/// </summary>
public interface ICurrentUserService
{
    /// <summary>
    /// Gets the current user's ID.
    /// </summary>
    Guid? UserId { get; }

    /// <summary>
    /// Gets the current user's ID or throws if not authenticated.
    /// </summary>
    Guid RequireUserId();

    /// <summary>
    /// Gets whether the user is authenticated.
    /// </summary>
    bool IsAuthenticated { get; }
}

/// <summary>
/// Implementation of current user service using HttpContext.
/// </summary>
public sealed class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? UserId
    {
        get
        {
            var userIdClaim = _httpContextAccessor.HttpContext?.User?.FindFirstValue(
                ClaimTypes.NameIdentifier
            );
            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                return null;
            }
            return userId;
        }
    }

    public Guid RequireUserId()
    {
        return UserId ?? throw new UnauthorizedAccessException("User is not authenticated");
    }

    public bool IsAuthenticated => UserId.HasValue;
}
