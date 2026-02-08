/**
 * Main App component with React Router configuration.
 * Provides routing for the file browser application.
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { Layout } from "@/components/Layout";
import { FileBrowser } from "@/components/FileBrowser";

function RecentPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">Recent files coming soon...</p>
    </div>
  );
}

function TrashPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">Trash view coming soon...</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/files" replace />} />
          <Route path="files" element={<FileBrowser />} />
          <Route path="files/:folderId" element={<FileBrowser />} />
          <Route path="recent" element={<RecentPage />} />
          <Route path="trash" element={<TrashPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
