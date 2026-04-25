import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
          <p className="text-neutral-600 dark:text-neutral-400">טוען…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
