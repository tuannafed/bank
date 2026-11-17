import type { WorkspaceSummary } from '@bank/core';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { getWorkspaceId, queryKeys, setWorkspaceId, subscribeWorkspace, useMe } from './api';

/** Current workspace (shared by every component) and a way to switch it. */
export function useWorkspace() {
  const me = useMe();
  const qc = useQueryClient();
  const id = useSyncExternalStore(subscribeWorkspace, getWorkspaceId, getWorkspaceId);
  const list: WorkspaceSummary[] = me.data?.workspaces ?? [];
  const current = list.find((w) => w.id === id) ?? list[0];

  function switchTo(next: string) {
    if (next === current?.id) return;
    setWorkspaceId(next);
    // Drop every cached screen of the previous workspace; keep "me".
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] });
  }

  return { me, current, list, switchTo, isOwner: current?.role === 'owner', isShared: current?.kind === 'shared' };
}
