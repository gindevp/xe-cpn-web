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

/** Active itineraries by branch — same as Liquibase seed (used when API 404/empty). */
export const FALLBACK_ITINERARIES: Record<string, string[]> = {
  "Nam Định": ["GA - NĐ", "NĐ - GA", "NĐ - HĐ", "HĐ - NĐ", "NĐ - BC", "BC - NĐ"],
  "Ninh Bình": ["NB - GA", "BC - NB", "HĐ - NB", "GA - NB", "NB - HĐ", "PHOCO - TC", "TC - PHOCO", "NB - BC"],
  "Phú Thọ": ["PT - GA", "GA - PT", "PT - HĐ", "HĐ - PT"],
  "Thái Bình": ["GA - TB", "HĐ - TB", "TB - HĐ", "TB - GA", "TB - BC", "BC - TB"],
  "Việt Trì": ["VT - GA", "GA - VT", "VT - HĐ", "HĐ - VT"],
  "Yên Bái": ["HĐ - YB", "GA - YB", "YB - HĐ", "YB - GA"],
};

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
        const fromApi = itineraries
          .filter((it) => it.branch?.id === branch.id || it.branch?.name === branchName)
          .map((it) => it.name);
        if (fromApi.length) return fromApi;
      }
      const fromApiByName = itineraries.filter((it) => it.branch?.name === branchName).map((it) => it.name);
      if (fromApiByName.length) return fromApiByName;
      return FALLBACK_ITINERARIES[branchName] ?? [];
    },
    [branchByName, itineraries],
  );

  const branchCodeOf = useCallback(
    (branchName: string) => branchByName.get(branchName)?.code ?? branchName,
    [branchByName],
  );

  const itineraryCodeOf = useCallback(
    (branchName: string | undefined | null, itineraryName: string | undefined | null): string | undefined => {
      if (!itineraryName) return undefined;
      const branch = branchName ? branchByName.get(branchName) : undefined;
      const hit = itineraries.find((it) => {
        if (it.name !== itineraryName) return false;
        if (!branch) return true;
        return it.branch?.id === branch.id || it.branch?.name === branchName;
      });
      return hit?.code ?? itineraryName;
    },
    [branchByName, itineraries],
  );

  return {
    loading,
    reload,
    branches,
    itineraries,
    branchNames,
    itinerariesForBranchName,
    branchCodeOf,
    itineraryCodeOf,
  };
}
