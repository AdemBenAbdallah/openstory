/**
 * Authorization and Permission Utilities for RBAC
 * Provides role-based access control functions for team resources
 */

import { getUserTeamMembership } from '@/platform/server/db/scoped';

// Role hierarchy (higher number = more permissions)
const ROLE_HIERARCHY = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
} as const;

export type TeamRole = keyof typeof ROLE_HIERARCHY;

/**
 * Get user's role for a specific team
 * Returns null if user is not a member of the team
 */
export async function getUserRole(
  userId: string,
  teamId: string
): Promise<TeamRole | null> {
  const membership = await getUserTeamMembership(userId, teamId);

  if (!membership) {
    return null;
  }

  return membership.role;
}
