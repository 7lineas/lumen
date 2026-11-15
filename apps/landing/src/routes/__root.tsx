import type { ReactNode } from "react";
import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import logoLight from "../../../../landing/assets/logo-light.png?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "description",
        content:
          "Descargue Lumen para Windows. Proyecte versículos en el videobeam sin internet. Gratis para iglesias.",
      },
      { name: "theme-color", content: "#2b1a12" },
      { title: "Lumen — Descargar para Windows" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "1254x1254", href: logoLight },
      { rel: "apple-touch-icon", href: logoLight },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>{children}</body>
    </html>
  );
}
