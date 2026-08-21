import { useCallback, useEffect, useMemo, useState } from "react";
import { asArray, fetchBranches, fetchItineraries, type BranchDTO, type ItineraryDTO } from "@/lib/api/domain-api";
import { isApiEnabled } from "@/lib/api/client";

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

  const branchNames = useMemo(() => branches.map((b) => b.name), [branches]);

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
      return itineraries.filter((it) => it.branch?.name === branchName).map((it) => it.name);
    },
    [branchByName, itineraries],
  );

  const branchCodeOf = useCallback(
    (branchName: string) => branchByName.get(branchName)?.code ?? branchName,
    [branchByName],
  );

  const findItinerary = useCallback(
    (branchName: string | undefined | null, itineraryName: string | undefined | null): ItineraryDTO | undefined => {
      if (!itineraryName) return undefined;
      const branch = branchName ? branchByName.get(branchName) : undefined;
      return itineraries.find((it) => {
        if (it.name !== itineraryName) return false;
        if (!branch) return true;
        return it.branch?.id === branch.id || it.branch?.name === branchName;
      });
    },
    [branchByName, itineraries],
  );

  const itineraryCodeOf = useCallback(
    (branchName: string | undefined | null, itineraryName: string | undefined | null): string | undefined => {
      return findItinerary(branchName, itineraryName)?.code ?? itineraryName ?? undefined;
    },
    [findItinerary],
  );

  return {
    loading,
    reload,
    branches,
    itineraries,
    branchNames,
    itinerariesForBranchName,
    findItinerary,
    branchCodeOf,
    itineraryCodeOf,
  };
}
