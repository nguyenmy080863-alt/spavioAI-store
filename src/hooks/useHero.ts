import { useQuery } from "@tanstack/react-query";
import { fetchHeroBanner } from "@/lib/hero";

export const useHeroBanner = () =>
  useQuery({
    queryKey: ["hero-banner"],
    queryFn: fetchHeroBanner,
    staleTime: 60_000,
  });
