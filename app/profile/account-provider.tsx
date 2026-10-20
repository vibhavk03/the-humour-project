"use client";

import { createContext, useContext, type ReactNode } from "react";

export type AccountProfile = { id: string; email: string; firstName: string; lastName: string; photoUrl: string | null };
const AccountContext = createContext<AccountProfile | null>(null);

// The root layout persists on navigation. A router.refresh after profile edits
// supplies new server props directly, without a stale copy in local state.
export function AccountProvider({ account, children }: { account: AccountProfile | null; children: ReactNode }) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  return useContext(AccountContext);
}
