import { createAuthClient } from 'better-auth/react';

// Same-origin client: talks to /api/auth on the current host.
export const authClient = createAuthClient();
