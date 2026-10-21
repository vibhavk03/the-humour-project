"use client";

import Link from "next/link";
import { AccountMenu } from "./auth/account-menu";
import { AuthControls } from "./auth/auth-controls";
import { HeaderWidth } from "./header-width";
import { useAccount } from "./profile/account-provider";

export function Header() {
  const account = useAccount();
  const name = account ? [account.firstName, account.lastName].filter(Boolean).join(" ") : "Your account";

  return (
    <header className="comic-header px-6 text-ink">
      <HeaderWidth>
        <Link href="/" className="comic-brand"><span className="block">The Humour Project</span><span className="mt-1 block font-mono text-[0.6rem] font-medium tracking-[0.15em] text-muted">FOR THE LOVE OF LAUGHS.</span></Link>
        {account ? <AccountMenu key={account.id} name={name} email={account.email} photoUrl={account.photoUrl} /> : <AuthControls isSignedIn={false} />}
      </HeaderWidth>
    </header>
  );
}
