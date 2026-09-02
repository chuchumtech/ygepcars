import Image from "next/image";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex flex-col items-center gap-3">
        <Image src="/logo.png" alt="" width={64} height={64} className="h-16 w-auto" />
        <span className="text-lg font-bold tracking-tight text-navy-800">
          YGEP Car Rental
        </span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-center text-xs text-muted">
        Yeshiva Gedolah of Elkins Park
      </p>
    </div>
  );
}
