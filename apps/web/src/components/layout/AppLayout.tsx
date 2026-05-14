import { Outlet, ScrollRestoration } from "react-router";
import { Header } from "./Header";

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
