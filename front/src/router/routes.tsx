import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { AppLayout } from "../components/AppLayout";
import { LoginPage } from "../pages/LoginPage";
import { SignUpPage } from "../pages/SignUpPage";
import { ConfirmSignUpPage } from "../pages/ConfirmSignUpPage";
import { PasswordRecoveryPage } from "../pages/PasswordRecoveryPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { AuthCallbackPage } from "../pages/AuthCallbackPage";
import { DashboardPage } from "../pages/DashboardPage";
import { TransactionsPage } from "../pages/TransactionsPage";
import { IncomeFormPage } from "../pages/IncomeFormPage";
import { ExpenseFormPage } from "../pages/ExpenseFormPage";
import { StatementImportPage } from "../pages/StatementImportPage";

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/confirm-signup" element={<ConfirmSignUpPage />} />
      <Route path="/forgot-password" element={<PasswordRecoveryPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Protected routes wrapped in AppLayout */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/transactions/income/new" element={<IncomeFormPage />} />
        <Route path="/transactions/income/edit/:sk" element={<IncomeFormPage />} />
        <Route path="/transactions/expense/new" element={<ExpenseFormPage />} />
        <Route path="/transactions/expense/edit/:sk" element={<ExpenseFormPage />} />
        <Route path="/statements/import" element={<StatementImportPage />} />
      </Route>
    </Routes>
  );
}
