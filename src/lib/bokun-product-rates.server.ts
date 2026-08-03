/**
 * Syncs the real per-product rate options from Bokun into
 * `public.bokun_product_rates`.
 *
 * Why the Activity API and not booking payloads: booking payloads return rate
 * titles localised to the *booking's* language (so the same rate shows up as
 * "Public tour in English" on one booking and "Tour pubblico in inglese" on
 * another). `/activity.json/{id}` with `Accept-Language: en` returns one
 * canonical English list per product.
 */
import { bokunFetch } from "./bokun-import.server";

export type ProductRate = { id: string; title: string; rateCode?: string | null };

type BokunActivity = {
  id?: number | string;
  title?: string;
  rates?: Array<{ id?: number | string; title?: string; rateCode?: string | null; index?: number }>;
  defaultRate?: { id?: number | string } | null;
};

/** Product ids currently referenced by any shift (that's the set the dropdown needs). */
export async function distinctBokunProductIds(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("shifts")
    .select("bokun_product_id")
    .not("bokun_product_id", "is", null)
    .limit(20000);
  if (error) throw new Error(error.message);
  return Array.from(
    new Set((data ?? []).map((r) => String(r.bokun_product_id)).filter(Boolean)),
  );
}

export async function fetchProductRates(productId: string) {
  const activity = (await bokunFetch("GET", `/activity.json/${productId}`, undefined, {
    "Accept-Language": "en",
  })) as BokunActivity;

  const rates: ProductRate[] = (activity.rates ?? [])
    .filter((r) => r?.title)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((r) => ({
      id: String(r.id ?? r.title),
      title: String(r.title),
      rateCode: r.rateCode ?? null,
    }));

  return {
    title: activity.title ?? null,
    rates,
    default_rate_id: activity.defaultRate?.id != null ? String(activity.defaultRate.id) : null,
  };
}

export async function syncBokunProductRates(productIds?: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ids = productIds?.length ? productIds : await distinctBokunProductIds();

  let synced = 0;
  let rateCount = 0;
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const { title, rates, default_rate_id } = await fetchProductRates(id);
      if (rates.length === 0) {
        // Never wipe a good cached list with an empty one.
        errors.push(`${id}: no rates returned`);
        continue;
      }
      const { error } = await supabaseAdmin.from("bokun_product_rates").upsert(
        {
          bokun_product_id: id,
          title,
          rates,
          default_rate_id,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "bokun_product_id" },
      );
      if (error) throw new Error(error.message);
      synced++;
      rateCount += rates.length;
    } catch (e) {
      errors.push(`${id}: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  return { total: ids.length, synced, rateCount, errors };
}
