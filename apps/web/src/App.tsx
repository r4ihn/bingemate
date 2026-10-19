import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import { AuthProvider } from './auth/AuthContext.js';
import { ProtectedRoute } from './auth/ProtectedRoute.js';
import { MainLayout } from './layouts/MainLayout.js';
import { Home } from './pages/Home.js';
import { Browse } from './pages/Browse.js';
import { TitleDetail } from './pages/TitleDetail.js';
import { Login } from './pages/Login.js';
import { Register } from './pages/Register.js';
import { MyLists } from './pages/MyLists.js';
import { Forbidden } from './pages/Forbidden.js';
import { NotFound } from './pages/NotFound.js';
import { CreatorDashboard } from './pages/creator/CreatorDashboard.js';
import { CreatorStats } from './pages/creator/CreatorStats.js';
import { SubmissionForm } from './pages/creator/SubmissionForm.js';
import { AdminDashboard } from './pages/admin/AdminDashboard.js';
import { ApprovalQueue } from './pages/admin/ApprovalQueue.js';
import { Moderation } from './pages/admin/Moderation.js';
import { UsersTable } from './pages/admin/UsersTable.js';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<Home />} />
            <Route path="browse" element={<Browse />} />
            <Route path="titles/:id" element={<TitleDetail />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forbidden" element={<Forbidden />} />

            <Route element={<ProtectedRoute />}>
              <Route path="me/lists" element={<MyLists />} />
            </Route>
            <Route element={<ProtectedRoute roles={[Role.CREATOR, Role.ADMIN]} />}>
              <Route path="creator">
                <Route index element={<CreatorDashboard />} />
                <Route path="new" element={<SubmissionForm />} />
                <Route path=":id/edit" element={<SubmissionForm />} />
                <Route path="stats" element={<CreatorStats />} />
              </Route>
            </Route>
            <Route element={<ProtectedRoute roles={[Role.ADMIN]} />}>
              <Route path="admin" element={<AdminDashboard />}>
                <Route index element={<Navigate to="queue" replace />} />
                <Route path="queue" element={<ApprovalQueue />} />
                <Route path="users" element={<UsersTable />} />
                <Route path="moderation" element={<Moderation />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
