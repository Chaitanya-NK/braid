import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-wrap">
      <section className="flex flex-[1_1_480px] items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-sm flex-col gap-7">
          <Logo />
          {children}
        </div>
      </section>
      <aside className="hidden flex-[1_1_480px] items-center justify-center bg-primary px-10 py-12 text-zinc-100 md:flex">
        <div className="flex max-w-md flex-col gap-6">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Work together, then rewind to any moment.
          </h2>
          <ul className="flex flex-col gap-4 text-zinc-400">
            <li>
              <span className="font-semibold text-zinc-100">A starter board and doc</span> in every
              new workspace.
            </li>
            <li>
              <span className="font-semibold text-zinc-100">Your data, your server.</span> Postgres
              runs right next to the app.
            </li>
            <li>
              <span className="font-semibold text-zinc-100">Free and open source.</span> No seats, no
              subscriptions.
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
