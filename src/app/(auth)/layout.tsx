import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-7 flex flex-col items-center gap-3">
        <Image
          src="/logo.png"
          alt="Yeshiva Gedolah Meor Yitzchok of Elkins Park"
          width={509}
          height={466}
          priority
          className="h-20 w-auto"
        />
        <span className="text-center text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
          Car Rental
        </span>
      </Link>
      <div className="w-full max-w-xl">{children}</div>
      <p className="mt-8 text-center text-xs text-ink-soft">
        Yeshiva Gedolah Meor Yitzchok of Elkins Park
      </p>
    </div>
  );
}
