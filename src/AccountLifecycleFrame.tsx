export function AccountLifecycleFrame({ children, description }: { children: React.ReactNode; description: string }) {
  return <main className="accountActivationShell" aria-labelledby="account-lifecycle-app-title">
    <header className="activationHeader">
      <p className="eyebrow">Employee account access</p>
      <h1 id="account-lifecycle-app-title">ExitPass</h1>
      <p>{description}</p>
    </header>
    <section className="activationWorkspace">{children}</section>
  </main>;
}
