using Cloud.File.Server.Data.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Cloud.File.Server.Data;

/// <summary>
/// Database context for the Cloud.File application.
/// </summary>
public sealed class CloudFileDbContext
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    public CloudFileDbContext(DbContextOptions<CloudFileDbContext> options)
        : base(options) { }

    /// <summary>
    /// File system nodes (files and folders).
    /// </summary>
    public DbSet<FileSystemNode> FileSystemNodes => Set<FileSystemNode>();

    /// <summary>
    /// File access logs for tracking recently accessed files.
    /// </summary>
    public DbSet<FileAccessLog> FileAccessLogs => Set<FileAccessLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<FileSystemNode>(entity =>
        {
            // Table name
            entity.ToTable("file_system_nodes");

            // Primary key
            entity.HasKey(e => e.Id);

            // Indexes for efficient queries
            // Virtual path must be unique per user (not globally)
            entity
                .HasIndex(e => new { e.UserId, e.VirtualPath })
                .IsUnique()
                .HasFilter("\"IsDeleted\" = false")
                .HasDatabaseName("ix_file_system_nodes_user_virtual_path");

            entity.HasIndex(e => e.ParentId).HasDatabaseName("ix_file_system_nodes_parent_id");

            entity
                .HasIndex(e => new { e.ParentId, e.Name })
                .HasFilter("\"IsDeleted\" = false")
                .HasDatabaseName("ix_file_system_nodes_parent_name");

            entity
                .HasIndex(e => e.ContentHash)
                .HasDatabaseName("ix_file_system_nodes_content_hash");

            entity.HasIndex(e => e.IsDeleted).HasDatabaseName("ix_file_system_nodes_is_deleted");

            entity.HasIndex(e => e.UserId).HasDatabaseName("ix_file_system_nodes_user_id");

            // Self-referencing relationship for parent-child
            entity
                .HasOne(e => e.Parent)
                .WithMany(e => e.Children)
                .HasForeignKey(e => e.ParentId)
                .OnDelete(DeleteBehavior.Restrict);

            // User ownership relationship
            entity
                .HasOne(e => e.User)
                .WithMany(e => e.FileSystemNodes)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            // Column configurations
            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(e => e.Name).IsRequired().HasMaxLength(255);
            entity.Property(e => e.VirtualPath).IsRequired().HasMaxLength(2048);
            entity.Property(e => e.StoragePath).HasMaxLength(1024);
            entity.Property(e => e.MimeType).HasMaxLength(256);
            entity.Property(e => e.ContentHash).HasMaxLength(64);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.ModifiedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
        });

        modelBuilder.Entity<FileAccessLog>(entity =>
        {
            entity.ToTable("file_access_logs");

            entity.HasKey(e => e.Id);

            // Index for efficient recent files query: by user, ordered by access time
            entity
                .HasIndex(e => new { e.UserId, e.AccessedAt })
                .IsDescending(false, true)
                .HasDatabaseName("ix_file_access_logs_user_accessed");

            // Index for deduplication: latest access per file per user
            entity
                .HasIndex(e => new { e.UserId, e.FileId })
                .HasDatabaseName("ix_file_access_logs_user_file");

            entity
                .HasOne(e => e.File)
                .WithMany()
                .HasForeignKey(e => e.FileId)
                .OnDelete(DeleteBehavior.Cascade);

            entity
                .HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(e => e.AccessedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            entity.Property(e => e.AccessType).IsRequired().HasMaxLength(50);
        });
    }
}
