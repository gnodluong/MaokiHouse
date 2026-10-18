import { createContext, useContext } from 'react';
import type { WorkspaceSnapshot, ResourceName, ResourceRecord } from '../../shared/workspace';

export type Values = Record<string, string | number | boolean | string[]>;
export interface WorkspaceContextValue {
  data: WorkspaceSnapshot | null; loading: boolean; error: string;
  reload: () => Promise<void>;
  save: (resource: ResourceName, input: Values, id?: string) => Promise<void>;
  remove: (resource: ResourceName, id: string) => Promise<void>;
  request: <T>(path: string, body?: unknown, method?: 'POST' | 'PUT' | 'PATCH') => Promise<T>;
}
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('Workspace provider is required');
  return context;
}
export const EditorContext = createContext<{ open: (resource: ResourceName, record?: ResourceRecord, defaults?: Values) => void; confirmDelete: (resource: ResourceName, record: ResourceRecord) => void } | null>(null);
export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) throw new Error('Editor provider is required');
  return context;
}
