import { useCallback, useEffect, useMemo, useState } from "react";
import { asArray, fetchBranches, fetchItineraries, type BranchDTO, type ItineraryDTO } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";

/** Fallback when API off / empty — aligned with seed branch names (not office Route). */
export const FALLBACK_BRANCHES = [
  "Nam Định",
  "Ninh Bình",
  "Phú Thọ",
  "Thái Bình",
  "Việt Trì",
  "Yên Bái",
];

/**
 * Shared Branch (Tuyến) → Itinerary (Lộ trình) master for comboboxes.
 * Values use branch/itinerary **name** for UI compatibility with existing order fields.
 */
export function useBranchItineraryMaster() {
  const [branches, setBranches] = useState<BranchDTO[]>([]);
  const [itineraries, setItineraries] = useState<ItineraryDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!isApiEnabled()) {
      setBranches([]);
      setItineraries([]);
      return;
    }
    setLoading(true);
    try {
      const [b, i] = await Promise.all([fetchBranches(true), fetchItineraries({ activeOnly: true })]);
      setBranches(asArray(b));
      setItineraries(asArray(i));
    } catch {
      setBranches([]);
      setItineraries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const branchNames = useMemo(() => {
    if (branches.length) return branches.map((b) => b.name);
    return FALLBACK_BRANCHES;
  }, [branches]);

  const branchByName = useMemo(() => {
    const m = new Map<string, BranchDTO>();
    for (const b of branches) m.set(b.name, b);
    return m;
  }, [branches]);

  const itinerariesForBranchName = useCallback(
    (branchName: string | undefined | null): string[] => {
      if (!branchName) return [];
      const branch = branchByName.get(branchName);
      if (branch) {
        return itineraries
          .filter((it) => it.branch?.id === branch.id || it.branch?.name === branchName)
          .map((it) => it.name);
      }
      // API empty / offline: no invented itineraries
      return itineraries.filter((it) => it.branch?.name === branchName).map((it) => it.name);
    },
    [branchByName, itineraries],
  );

  const branchCodeOf = useCallback(
    (branchName: string) => branchByName.get(branchName)?.code ?? branchName,
    [branchByName],
  );

  return {
    loading,
    reload,
    branches,
    itineraries,
    branchNames,
    itinerariesForBranchName,
    branchCodeOf,
  };
}
