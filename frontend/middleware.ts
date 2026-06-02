import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];
const SUPER_ADMIN_PATHS = ["/users", "/countries"];
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    if (payload.password_reset_required && pathname !== "/change-password") {
      return NextResponse.redirect(new URL("/change-password", request.url));
    }

    const role = payload.role as string;

    if (SUPER_ADMIN_PATHS.some((p) => pathname.startsWith(p)) && role !== "super_admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
