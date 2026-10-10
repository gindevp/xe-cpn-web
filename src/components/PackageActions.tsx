import { useState } from "react";
import { toast } from "sonner";
import { EditPackageDialog } from "@/components/EditPackageDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { applyPackageDuplicate, applyPackageRemove, packageCode } from "@/lib/package-label";
import { useStore } from "@/lib/store";

/** Sửa / thêm / nhân bản / xóa kiện trên bảng danh sách — truyền {@code handlers} vào OrderPackageListRow. */
export function usePackageActions() {
  const updateOrder = useStore((s) => s.updateOrder);
  const [editPkg, setEditPkg] = useState<{ code: string; seq: number; adding?: boolean } | null>(null);
  const [deletePkg, setDeletePkg] = useState<{ code: string; seq: number } | null>(null);

  const duplicatePackage = (code: string, seq: number) => {
    const order = useStore.getState().orders.find((o) => o.code === code);
    if (!order) return toast.error("Không tìm thấy đơn");
    const result = applyPackageDuplicate(order, seq);
    if (!result.ok) return toast.error(result.error);
    updateOrder(code, result.patch, {
      eventAction: "PACKAGE_DUPLICATE",
      eventDetail: `Nhân bản ${packageCode(code, seq)} → ${packageCode(code, seq + 1)}`,
    });
    toast.success(`Đã nhân bản kiện ${packageCode(code, seq)}`);
  };

  const confirmDelete = () => {
    if (!deletePkg) return;
    const order = useStore.getState().orders.find((o) => o.code === deletePkg.code);
    const result = order ? applyPackageRemove(order, deletePkg.seq) : null;
    if (!order || !result) toast.error("Không tìm thấy đơn");
    else if (!result.ok) toast.error(result.error);
    else {
      updateOrder(order.code, result.patch, {
        eventAction: "PACKAGE_REMOVE",
        eventDetail: `Xóa ${packageCode(order.code, deletePkg.seq)}`,
      });
      toast.success(`Đã xóa kiện ${packageCode(order.code, deletePkg.seq)}`);
    }
    setDeletePkg(null);
  };

  const handlers = {
    onEditPackage: (code: string, seq: number) => setEditPkg({ code, seq }),
    onDuplicatePackage: duplicatePackage,
    onDeletePackage: (code: string, seq: number) => setDeletePkg({ code, seq }),
    onAddPackage: (code: string) => setEditPkg({ code, seq: 0, adding: true }),
  };

  const dialogs = (
    <>
      <EditPackageDialog
        orderCode={editPkg?.code ?? null}
        packageSeq={editPkg?.seq ?? null}
        adding={editPkg?.adding}
        open={!!editPkg}
        onOpenChange={(v) => !v && setEditPkg(null)}
      />
      <AlertDialog open={!!deletePkg} onOpenChange={(o) => !o && setDeletePkg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa kiện?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletePkg
                ? `Xác nhận xóa kiện ${packageCode(deletePkg.code, deletePkg.seq)}. Số kiện / cước / KL của đơn sẽ được tính lại.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { handlers, dialogs };
}
