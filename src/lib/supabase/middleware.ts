import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseUrl } from "@/lib/server/supabase-config";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = getSupabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  /* Les rutes API han de respondre 401 JSON, no un redirect HTML */
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?)$/i.test(pathname);

  if (isPublicAsset) {
    return supabaseResponse;
  }

  if (!user && !isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    const next = request.nextUrl.searchParams.get("next")?.trim() || "/";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = safeNext;
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
