import type { Credentials } from '@pang-daily/contracts';

export type AuthIdentity = { userId: string; username: string };
export interface AuthenticationStrategy {
  readonly name: string;
  register(credentials: Credentials): Promise<AuthIdentity>;
  authenticate(credentials: Credentials): Promise<AuthIdentity>;
}
export const AUTHENTICATION_STRATEGY = Symbol('AUTHENTICATION_STRATEGY');
