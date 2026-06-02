import { decodeJwt } from "jose";

export interface JWTPayload {
  sub: string;
  email: string;
  role: "super_admin" | "admin" | "viewer";
  country_id: number | null;
  password_reset_required: boolean;
  exp: number;
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return decodeJwt(token) as JWTPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return true;
  return payload.exp * 1000 < Date.now();
}

export function getRole(token: string): "super_admin" | "admin" | "viewer" | null {
  const payload = decodeToken(token);
  return payload?.role ?? null;
}
