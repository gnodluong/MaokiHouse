import type { ResourceName, WorkspaceSnapshot } from '../../shared/workspace';
export function canEdit(data: WorkspaceSnapshot | null, resource?: ResourceName) {
  if (!data || data.capabilities.localDemo) return true;
  const role = data.capabilities.role;
  return role === 'owner' || role === 'manager' || role === 'agent' && Boolean(resource && ['bookings','contacts','conversations','tasks'].includes(resource));
}
