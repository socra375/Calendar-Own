import { NextResponse, type NextRequest } from "next/server";

// Next 16: `proxy.ts` sustituye a `middleware.ts`. Solo comprueba la PRESENCIA de la cookie;
// la validación real de la sesión ocurre en el servidor ((app)/layout.tsx y apiHandler).
export function proxy(req: NextRequest) {
  if (!req.cookies.get("pc_session")?.value) {
    const url = req.nextUrl.clone();
    const next = req.nextUrl.pathname + req.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Excluye API, estáticos, login y /docs (Swagger público).
  matcher: ["/((?!api|_next|login|docs|favicon.ico|robots.txt|.*\\.[a-zA-Z0-9]+$).*)"],
};
