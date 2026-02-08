# Cloud.File - File Storage System

A modern file storage and management system with PostgreSQL persistence, WebSocket support, and a Google Drive-like UI.

## Features

- **PostgreSQL Persistence**: File metadata, folder hierarchy, and soft-delete support
- **Folder-based Organization**: Hierarchical folder structure with breadcrumb navigation
- **Real-time Updates**: WebSocket with MessagePack binary protocol
- **Modern UI**: React-based file browser with grid/list views, context menus, and drag-drop uploads
- **REST API**: Full CRUD operations for files and folders

## Architecture

```
┌─────────────────┐     REST/WebSocket      ┌──────────────────┐
│   React UI      │ ◄─────────────────────► │  ASP.NET Core    │
│   (Vite + TS)   │                         │  Server          │
└─────────────────┘                         └──────────────────┘
                                                     │
                                    ┌────────────────┴────────────────┐
                                    ▼                                 ▼
                           ┌──────────────────┐            ┌──────────────────┐
                           │  PostgreSQL      │            │  File Storage    │
                           │  (Metadata)      │            │  (Disk)          │
                           └──────────────────┘            └──────────────────┘
```

## Quick Start

### Prerequisites

- .NET 10 SDK
- PostgreSQL 15+
- Node.js 20+

### Database Setup

1. Create a PostgreSQL database:

```sql
CREATE DATABASE cloudfile;
```

2. Update connection string in `appsettings.json`:

```json
{
    "ConnectionStrings": {
        "DefaultConnection": "Host=localhost;Port=5432;Database=cloudfile;Username=postgres;Password=yourpassword"
    }
}
```

The database schema is created automatically on first run.

### Backend

```bash
cd back/src/Cloud.File.Server
dotnet run
```

Server runs at:

- REST API: `http://localhost:5000`
- WebSocket: `ws://localhost:5000/ws`
- Swagger: `http://localhost:5000/swagger`

### Frontend

```bash
cd front
npm install
npm run dev
```

UI runs at: `http://localhost:5173`

## Browser API

New database-backed file browser endpoints:

```
GET    /api/browser/list              - List directory with breadcrumbs
GET    /api/browser/{id}              - Get file/folder by ID
POST   /api/browser/folder            - Create folder
POST   /api/browser/upload            - Upload file to folder
POST   /api/browser/upload/batch      - Upload multiple files
GET    /api/browser/download/{id}     - Download file
PATCH  /api/browser/{id}/rename       - Rename file/folder
POST   /api/browser/move              - Move items
POST   /api/browser/copy              - Copy items
POST   /api/browser/delete            - Delete items (soft delete)
GET    /api/browser/stats             - Storage statistics
```

## WebSocket Protocol
