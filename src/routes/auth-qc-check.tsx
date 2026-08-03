import { createFileRoute } from "@tanstack/react-router";
import { useProductRates } from "@/lib/bokun-product-rates";

export const Route = createFileRoute("/auth-qc-check")({
  component: QcCheck,
});

function QcCheck() {
  const { isLoading } = useProductRates("969081");
  return <div data-testid="qc">query-client-ok loading={String(isLoading)}</div>;
}
