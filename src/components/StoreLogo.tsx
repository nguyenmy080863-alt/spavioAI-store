import spavioLogo from "@/assets/brand/spavioai-logo.png";
import { cn } from "@/lib/utils";

interface StoreLogoProps {
  className?: string;
  /** Tailwind height class for the logo image, e.g. "h-8". */
  heightClass?: string;
  alt?: string;
  /** Extra classes for the "Store" badge, e.g. to hide it on small screens. */
  badgeClassName?: string;
}

/** Official Spavio AI logo with the "Store" badge. */
const StoreLogo = ({ className, heightClass = "h-8", alt = "Spavio AI Store", badgeClassName }: StoreLogoProps) => (
  <span className={cn("inline-flex items-center gap-1.5 select-none", className)}>
    <img
      src={spavioLogo}
      alt={alt}
      width={917}
      height={192}
      className={cn("w-auto object-contain transition-all duration-300", heightClass)}
    />
    <span className={cn("self-center rounded-full bg-brand-gradient px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] leading-none text-white", badgeClassName)}>
      Store
    </span>
  </span>
);

export default StoreLogo;
