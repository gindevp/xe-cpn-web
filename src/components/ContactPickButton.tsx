import { useEffect, useState } from "react";
import { BookUser } from "lucide-react";
import { toast } from "sonner";
import { normalizePhoneInput } from "@/components/PhoneInput";
import { cn } from "@/lib/utils";

type ContactsManager = {
  select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
};

function contactsApi(): ContactsManager | null {
  if (typeof navigator === "undefined" || typeof window === "undefined") return null;
  const api = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  return api && "ContactsManager" in window ? api : null;
}

/** Mở danh bạ máy (Contact Picker API — Chrome Android) để điền SĐT + tên; trình duyệt không hỗ trợ thì ẩn nút. */
export function ContactPickButton({
  onPick,
  className,
}: {
  onPick: (contact: { phone: string; name: string }) => void;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(contactsApi() != null), []);
  if (!supported) return null;

  const pick = async () => {
    const api = contactsApi();
    if (!api) return;
    try {
      const [c] = await api.select(["name", "tel"], { multiple: false });
      if (!c) return;
      const phones = (c.tel ?? []).map(normalizePhoneInput).filter(Boolean);
      const phone = phones.find((p) => p.length === 10) ?? phones[0] ?? "";
      const name = (c.name ?? []).find((n) => n?.trim())?.trim() ?? "";
      if (!phone && !name) {
        toast.error("Liên hệ không có SĐT");
        return;
      }
      onPick({ phone, name });
    } catch {
      /* người dùng đóng danh bạ */
    }
  };

  return (
    <button
      type="button"
      onClick={() => void pick()}
      className={cn(
        "ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5",
        className,
      )}
    >
      <BookUser className="h-3.5 w-3.5" />
      Danh bạ
    </button>
  );
}
