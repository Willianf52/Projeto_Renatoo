import { Suspense } from "react";
import LoginPage from "@/components/LoginPage";

export default function Home() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
