import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductRate = { id: string; title: string; rateCode?: string | null };

export type ProductRates = {
  bokunProductId: string;
  title: string | null;
  rates: ProductRate[];
  defaultRateId: string | null;
  fetchedAt: string;
};

function normalizeRates(raw: unknown): ProductRate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title : "";
      return { id: String(o.id ?? title), title, rateCode: (o.rateCode as string | null) ?? null };
    })
    .filter((r) => r.title.length > 0);
}

/**
 * Cached per-product rate list, populated nightly from Bokun's Activity API.
 * Returns `null` when the product isn't in the cache (caller falls back to the
 * fixed language list + free text).
 */
export function useProductRates(bokunProductId: string | null | undefined) {
  const id = bokunProductId ? String(bokunProductId) : null;

  return useQuery<ProductRates | null>({
    queryKey: ["bokun-product-rates", id],
    enabled: Boolean(id),
    staleTime: 60 * 60 * 1000, // 1h
    gcTime: 6 * 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bokun_product_rates")
        .select("bokun_product_id, title, rates, default_rate_id, fetched_at")
        .eq("bokun_product_id", id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const rates = normalizeRates(data.rates);
      if (rates.length === 0) return null;
      return {
        bokunProductId: String(data.bokun_product_id),
        title: data.title ?? null,
        rates,
        defaultRateId: data.default_rate_id ?? null,
        fetchedAt: data.fetched_at,
      };
    },
  });
}

/** Invalidate every cached product rate list (after a manual refresh). */
export function useInvalidateProductRates() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["bokun-product-rates"] });
}
