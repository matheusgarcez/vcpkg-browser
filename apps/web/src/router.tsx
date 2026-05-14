import { createBrowserRouter } from "react-router";
import { AppLayout } from "./components/layout/AppLayout";
import { Home } from "./routes/home";
import { PortsIndex } from "./routes/ports.index";
import { PortDetail } from "./routes/ports.detail";
import { PopularPorts } from "./routes/popular";
import { RecentlyAdded } from "./routes/recently-added";
import { RecentlyUpdated } from "./routes/recently-updated";
import { Triplets } from "./routes/triplets";
import { Releases } from "./routes/releases";
import { DataAbout } from "./routes/data-about";
import { NotFound } from "./routes/not-found";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppLayout,
    ErrorBoundary: NotFound,
    children: [
      { index: true, Component: Home },
      { path: "ports", Component: PortsIndex },
      { path: "ports/popular", Component: PopularPorts },
      { path: "ports/recently-added", Component: RecentlyAdded },
      { path: "ports/recently-updated", Component: RecentlyUpdated },
      { path: "ports/:name/v/:version/:portVersion", Component: PortDetail },
      { path: "ports/:name/v/:version", Component: PortDetail },
      { path: "ports/:name", Component: PortDetail },
      { path: "triplets", Component: Triplets },
      { path: "releases", Component: Releases },
      { path: "about/data", Component: DataAbout },
      { path: "*", Component: NotFound },
    ],
  },
]);
