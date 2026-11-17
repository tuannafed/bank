import type {
  AdminUserView,
  CreateTransactionsRequest,
  MeResponse,
  MemberView,
  DashboardResponse,
  Debt,
  FxRates,
  NewDebtDraft,
  ParseResponse,
  PayoffSchedule,
  TransactionDraft,
  TransactionView,
} from '@bank/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

// --- current workspace (per device) ----------------------------------------------
const WS_KEY = 'bank:workspace';
let currentWorkspace: string | null = (() => {
  try {
    return localStorage.getItem(WS_KEY);
  } catch {
    return null;
  }
})();

export const getWorkspaceId = () => currentWorkspace;

const wsListeners = new Set<() => void>();
export function subscribeWorkspace(fn: () => void) {
  wsListeners.add(fn);
  return () => wsListeners.delete(fn);
}

export function setWorkspaceId(id: string | null) {
  currentWorkspace = id;
  wsListeners.forEach((fn) => fn());
  try {
    if (id) localStorage.setItem(WS_KEY, id);
    else localStorage.removeItem(WS_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Cloudflare Access answers an expired session with a redirect to its login page
 * on another origin. fetch() sees that as a CORS failure (TypeError) or as a
 * redirected / non-JSON response. Either way: do one full page load so Access can
 * show its login. The sessionStorage flag stops a reload loop.
 */
function reauthenticate(): never {
  const KEY = 'bank:reauth-at';
  const last = Number(sessionStorage.getItem(KEY) ?? 0);
  if (Date.now() - last > 15_000) {
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
  }
  throw new ApiError(401, 'Phiên đăng nhập đã hết hạn. Tải lại trang để đăng nhập.');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(currentWorkspace ? { 'x-workspace-id': currentWorkspace } : {}),
        ...init?.headers,
      },
      credentials: 'same-origin', // Cloudflare Access cookie
    });
  } catch (e) {
    if (navigator.onLine) reauthenticate();
    throw new ApiError(0, 'Không có mạng');
  }
  if (res.status === 204) return undefined as T;
  if (res.redirected || !res.headers.get('content-type')?.includes('application/json')) reauthenticate();
  if (res.status === 401) reauthenticate();
  const body = (await res.json()) as T & { error?: string; code?: string };
  // Stored workspace no longer accessible (removed from group): fall back to personal.
  if (res.status === 403 && body.code === 'not_member' && currentWorkspace) {
    setWorkspaceId(null);
    window.location.reload();
  }
  if (!res.ok) throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`, body.code);
  return body;
}

export const queryKeys = {
  me: ['me'] as const,
  members: ['members'] as const,
  adminUsers: ['admin-users'] as const,
  dashboard: ['dashboard'] as const,
  schedule: ['schedule'] as const,
  transactions: ['transactions'] as const,
  debts: ['debts'] as const,
  settings: ['settings'] as const,
};

export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: () => request<DashboardResponse>('/dashboard') });
}

export function useSchedule() {
  return useQuery({ queryKey: queryKeys.schedule, queryFn: () => request<PayoffSchedule>('/schedule') });
}

export function useTransactions() {
  return useQuery({ queryKey: queryKeys.transactions, queryFn: () => request<TransactionView[]>('/transactions?limit=100') });
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => Promise.all(Object.values(queryKeys).map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export function useDebts() {
  return useQuery({ queryKey: queryKeys.debts, queryFn: () => request<Debt[]>('/debts') });
}

export interface Settings {
  monthlyDebtBudgetVnd: number;
  rates: FxRates;
  emergencyFundTargetVnd: number;
  emergencyFundMonthlyVnd: number | null;
}

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => request<MeResponse>('/me'), retry: false, staleTime: 60_000 });
}

export function useMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.members, workspaceId],
    queryFn: () => request<MemberView[]>(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  });
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.adminUsers, queryFn: () => request<AdminUserView[]>('/admin/users'), enabled });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => request<Settings>('/settings') });
}

export function useParse() {
  return useMutation({
    mutationFn: (input: { text: string; imageDataUrl?: string }) =>
      request<ParseResponse>('/parse', { method: 'POST', body: JSON.stringify(input) }),
  });
}

/** Generic JSON mutation that refreshes every screen on success. */
function useWrite<TVars, TRes>(fn: (v: TVars) => Promise<TRes>) {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const useCreateDebts = () => useWrite((debts: NewDebtDraft[]) => request<{ ids: string[] }>('/debts', json('POST', { debts })));
export const usePatchDebt = () =>
  useWrite(({ id, ...patch }: { id: string } & Partial<Omit<Debt, 'id' | 'type' | 'currency'>>) =>
    request(`/debts/${id}`, json('PATCH', patch)),
  );
export const useArchiveDebt = () => useWrite((id: string) => request(`/debts/${id}/archive`, json('POST')));
export const useDeleteDebt = () => useWrite((id: string) => request(`/debts/${id}`, json('DELETE')));
export const usePatchBudget = () =>
  useWrite(({ id, ...patch }: { id: string; monthlyLimitVnd?: number | null; name?: string }) =>
    request(`/budgets/${id}`, json('PATCH', patch)),
  );
export const useSaveSettings = () =>
  useWrite((s: Partial<Omit<Settings, 'rates'>>) => request('/settings', json('PUT', s)));
export const useUpdateProfile = () => useWrite((p: { name: string }) => request('/me', json('PATCH', p)));
export const useCreateWorkspace = () =>
  useWrite((p: { name: string }) => request<{ id: string; name: string }>('/workspaces', json('POST', p)));
export const useRenameWorkspace = () =>
  useWrite(({ id, name }: { id: string; name: string }) => request(`/workspaces/${id}`, json('PATCH', { name })));
export const useDeleteWorkspace = () => useWrite((id: string) => request(`/workspaces/${id}`, json('DELETE')));
export const useAddMember = () =>
  useWrite(({ id, email }: { id: string; email: string }) => request(`/workspaces/${id}/members`, json('POST', { email })));
export const useRemoveMember = () =>
  useWrite(({ id, userId }: { id: string; userId: string }) => request(`/workspaces/${id}/members/${userId}`, json('DELETE')));
export const useInviteUser = () =>
  useWrite((p: { email: string; name: string; isAdmin?: boolean }) => request<AdminUserView>('/admin/users', json('POST', p)));
export const usePatchUser = () =>
  useWrite(({ id, ...p }: { id: string; isAdmin?: boolean; disabled?: boolean; name?: string }) =>
    request(`/admin/users/${id}`, json('PATCH', p)),
  );
export const useSetFx = () =>
  useWrite(({ currency, rateVnd }: { currency: 'USD' | 'USDT'; rateVnd: number }) =>
    request(`/fx/${currency}`, json('PUT', { rateVnd })),
  );

export function useCreateTransactions() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (drafts: TransactionDraft[]) => {
      const body: CreateTransactionsRequest = {
        transactions: drafts.map(({ amountVnd: _a, debtAmountMinor: _d, ...t }) => t),
      };
      return request<{ inserted: number }>('/transactions', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
