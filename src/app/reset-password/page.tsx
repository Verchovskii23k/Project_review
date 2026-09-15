import { Suspense } from "react";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">Загрузка...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}