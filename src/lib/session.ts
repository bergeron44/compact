export interface UserSession {
  name: string;
  employeeId: string;
  projectName: string;
  loginTimestamp: string;
}

const SESSION_KEY = "dell_compact_session";

export function saveSession(session: UserSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): UserSession | null {
  const data = localStorage.getItem(SESSION_KEY);
  return data ? JSON.parse(data) : null;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
