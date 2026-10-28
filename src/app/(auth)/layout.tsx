import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="QuerySide home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm space-y-6">{children}</div>
      </main>

      <footer className="text-muted-foreground pb-6 text-center text-xs">
        <Link href="/" className="underline-offset-4 hover:underline">
          ← Back to home
        </Link>
      </footer>
    </div>
  );
}
