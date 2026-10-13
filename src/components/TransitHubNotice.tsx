import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import type { OfficeRec } from "@/lib/mock-data";
import { findOfficeByToken } from "@/lib/mock-data";
import {
  DEFAULT_TRANSIT_POLICY,
  loadTransitHubPolicy,
  resolveProvinceTransit,
  type TransitHubPolicy,
} from "@/lib/transit-hub";

/** Cảnh báo đơn tỉnh đi tỉnh phải qua VP trung chuyển. */
export function TransitHubNotice({
  fromOffice,
  toOffice,
  offices,
}: {
  fromOffice?: string | null;
  toOffice?: string | null;
  offices: OfficeRec[];
}) {
  const [policy, setPolicy] = useState<TransitHubPolicy>(DEFAULT_TRANSIT_POLICY);
  useEffect(() => {
    void loadTransitHubPolicy().then(setPolicy);
  }, []);
  const from = findOfficeByToken(fromOffice, offices);
  const to = findOfficeByToken(toOffice, offices);
  const hit = resolveProvinceTransit(from, to, offices, policy);
  if (!hit) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <div className="font-semibold">Đơn hàng trung chuyển</div>
          <p className="text-amber-900/90">
            Tuyến tỉnh đi tỉnh cần trung chuyển qua văn phòng {hit.hubName} trước khi đến VP nhận.
          </p>
        </div>
      </div>
      <div className="shrink-0 text-xs font-medium leading-relaxed sm:text-right">
        {hit.fromName} → {hit.hubName} → {hit.toName}
      </div>
    </div>
  );
}
