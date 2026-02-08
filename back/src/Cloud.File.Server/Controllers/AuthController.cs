using System.Security.Claims;
using Cloud.File.Server.Data.Dtos;
using Cloud.File.Server.Data.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Cloud.File.Server.Controllers;

/// <summary>
/// Authentication controller for user registration, login, and profile management.
/// </summary>
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IJwtTokenService jwtTokenService,
        ILogger<AuthController> logger
    )
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _jwtTokenService = jwtTokenService;
        _logger = logger;
    }

    /// <summary>
    /// Login with email and password.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<AuthErrorResponse>(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.Email);

        if (user == null)
        {
            _logger.LogWarning("Login attempt for non-existent user: {Email}", request.Email);
            return Unauthorized(new AuthErrorResponse { Message = "Invalid email or password" });
        }

        var result = await _signInManager.CheckPasswordSignInAsync(
            user,
            request.Password,
            lockoutOnFailure: true
        );

        if (!result.Succeeded)
        {
            _logger.LogWarning("Failed login attempt for user: {Email}", request.Email);

            if (result.IsLockedOut)
            {
                return Unauthorized(
                    new AuthErrorResponse { Message = "Account is locked. Please try again later." }
                );
            }

            return Unauthorized(new AuthErrorResponse { Message = "Invalid email or password" });
        }

        // Update last login time
        user.LastLoginAt = DateTimeOffset.UtcNow;
        await _userManager.UpdateAsync(user);

        _logger.LogInformation("User {Email} logged in successfully", request.Email);

        var (token, expiresAt) = _jwtTokenService.GenerateToken(user);

        return Ok(
            new AuthResponse
            {
                Token = token,
                ExpiresAt = expiresAt,
                User = new UserDto
                {
                    Id = user.Id,
                    Email = user.Email!,
                    DisplayName = user.DisplayName,
                    CreatedAt = user.CreatedAt,
                },
            }
        );
    }

    /// <summary>
    /// Get current authenticated user information.
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType<UserDto>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetCurrentUser()
    {
        var userId = User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier);

        if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var userGuid))
        {
            return Unauthorized();
        }

        var user = await _userManager.FindByIdAsync(userId);

        if (user == null)
        {
            return Unauthorized();
        }

        return Ok(
            new UserDto
            {
                Id = user.Id,
                Email = user.Email!,
                DisplayName = user.DisplayName,
                CreatedAt = user.CreatedAt,
            }
        );
    }

    /// <summary>
    /// Logout (client should discard token).
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult Logout()
    {
        // JWT tokens are stateless - client should discard the token
        // For enhanced security, you could implement token blacklisting with Redis
        _logger.LogInformation(
            "User {UserId} logged out",
            User.FindFirstValue(System.Security.Claims.ClaimTypes.NameIdentifier)
        );
        return Ok(new { message = "Logged out successfully" });
    }
}
