import { Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { LoginPage } from "../pages/LoginPage";
import { SignUpPage } from "../pages/SignUpPage";
import { ConfirmSignUpPage } from "../pages/ConfirmSignUpPage";
import { PasswordRecoveryPage } from "../pages/PasswordRecoveryPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { TransactionsPage } from "../pages/TransactionsPage";
import { TransactionFormPage } from "../pages/TransactionFormPage";

export function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/confirm-signup" element={<ConfirmSignUpPage />} />
      <Route path="/forgot-password" element={<PasswordRecoveryPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Navigate to="/transactions" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <TransactionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions/new"
        element={
          <ProtectedRoute>
            <TransactionFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions/edit/:sk"
        element={
          <ProtectedRoute>
            <TransactionFormPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
