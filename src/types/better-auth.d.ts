import type { DefaultUser } from 'better-auth';

declare module 'better-auth' {
  interface User extends DefaultUser {
    login?: string;
    role?: string;
  }
}