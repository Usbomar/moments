export interface SessionUser {
  id: string;
  email: string;
}

export async function getSessionUser(): Promise<SessionUser> {
  return { id: "u-1", email: "demo@moments.app" };
}
