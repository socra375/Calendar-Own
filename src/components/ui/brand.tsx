import Image from "next/image";
import { cn } from "@/lib/cn";

/** Logo como "tile" de app: el PNG tiene fondo oscuro opaco, así que va recortado en un contenedor redondeado. */
export function BrandMark({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-block size-10 shrink-0 overflow-hidden rounded-[22%] bg-[#0f0d0c] shadow-[0_1px_2px_rgb(74_48_20/0.25),0_8px_20px_-8px_rgb(74_48_20/0.45)] ring-1 ring-black/10 dark:ring-white/15",
        className,
      )}
    >
      <Image src="/brand/logo-square-512.png" alt="Personal Calendar" width={512} height={512} priority={priority} sizes="72px" className="size-full object-cover" />
    </span>
  );
}
