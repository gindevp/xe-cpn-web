
## Mục tiêu

Cho phép tạo đơn **tỉnh → tỉnh** (VD: Nam Định → Thái Bình) chạy qua hub Hà Nội bằng cách gắn nhiều **chặng (legs)** vào cùng 1 mã đơn duy nhất. Mã vận đơn, thu hộ, doanh thu, lịch sử đều tập trung 1 chỗ; mỗi chặng có tripCode / trạng thái riêng.

## Mô hình dữ liệu

Mở rộng `Order` trong `src/lib/mock-data.ts`:

```ts
export type LegStatus =
  | "PENDING"      // chờ gán xe
  | "ASSIGNED"     // đã gán xe, chờ bàn giao
  | "LOADED"       // tài xế đã nhận, đang chờ xuất
  | "IN_TRANSIT"   // đang chạy
  | "AT_HUB"       // đến VP trung chuyển (chỉ chặng không phải cuối)
  | "AT_DEST";     // đến VP đích cuối

export type OrderLeg = {
  index: number;           // 0-based
  fromOffice: string;
  toOffice: string;
  tripCode?: string;
  status: LegStatus;
  handoverAt?: string;     // thời điểm tài xế nhận hàng
  departedAt?: string;
  arrivedAt?: string;
};

// bổ sung vào Order:
legs?: OrderLeg[];         // optional để không phá vỡ dữ liệu cũ
currentLegIndex?: number;  // 0..legs.length-1
```

Đơn cũ không có `legs` sẽ được coi như 1 chặng duy nhất `fromOffice → toOffice` (helper `getLegs(order)` chuẩn hoá).

## Sinh chặng khi tạo đơn

Trong `TaoDonDialog.tsx` (chế độ tạo mới), sau khi user chọn From/To:

- Nếu `from === "HN"` hoặc `to === "HN"` → **1 chặng** trực tiếp.
- Nếu cả 2 đầu đều không phải HN → **2 chặng**: `from → HN` (leg 0) + `HN → to` (leg 1). `hubOffice = "HN"`.

Set `currentLegIndex = 0`, `legs[0].status = "PENDING"`.

Hiển thị 1 dòng info nhỏ trong dialog: *"Hành trình: NĐ → HN → TB (2 chặng, trung chuyển qua Hà Nội)"* để user biết.

## Helpers dùng chung (thêm vào `src/lib/store.ts`)

```ts
getCurrentLeg(order): OrderLeg          // hoặc dựng ảo từ from/to nếu chưa có legs
advanceLeg(orderCode): void             // AT_HUB → next leg PENDING
setLegStatus(orderCode, legIdx, status, extra?)
assignLegToTrip(orderCode, tripCode)    // set current leg .tripCode + status=ASSIGNED
```

Mọi màn hình dưới đây thay các đoạn đọc `order.tripCode / order.status` bằng đọc `currentLeg`. Tương thích ngược: `order.tripCode` / `order.status` vẫn được đồng bộ theo current leg để code cũ không vỡ.

## Cập nhật các màn hình theo flow

| Màn hình | Lọc theo | Ghi chú |
|---|---|---|
| Đơn chờ gán xe (`van-don`) | `currentLeg.status === PENDING` tại `currentLeg.fromOffice` | Thêm badge **Chặng 1/2** hoặc **Chặng 2/2** cạnh mã đơn. Popup "Gán lên xe" gọi `assignLegToTrip`. |
| Hàng chờ lên xe (`hang-cho-len-xe`) | `currentLeg.status === ASSIGNED` | Nút "Xác nhận bàn giao" → `LOADED` + `handoverAt`. |
| Hàng trên xe (`duyet-huy`) | `currentLeg.status ∈ {LOADED, IN_TRANSIT}` | Hiển thị chặng hiện tại (VD `NĐ → HN`). |
| Hàng sắp về (`hang-sap-ve`) | trip có leg đích = VP hiện tại | Popup "Nhập kho nhận": nếu là chặng cuối → `AT_DEST`; nếu là chặng trung chuyển → `AT_HUB` rồi tự `advanceLeg` sang chặng 2 PENDING tại HN, đơn quay lại "Đơn chờ gán xe" của HN. |
| Đơn hàng đến (`dieu-chinh`) | `currentLeg.status === AT_DEST` và đó là leg cuối | Không hiện đơn đang chờ transit tại hub. |
| Hàng đã giao (`hoan-hang`) | không đổi (`DELIVERED`) | Sau khi giao xong, đóng đơn như cũ. |

## UI phụ trợ

- Cột **Hành trình** trong bảng vận đơn: `NĐ → HN → TB` với chặng hoàn thành in đậm/gạch chân, ví dụ: `NĐ ✓ HN → TB`.
- `OrderHistoryDialog`: mỗi lần chuyển leg / handover / arrival ghi 1 dòng lịch sử ("Chặng 1 hoàn tất tại HN", "Bắt đầu chặng 2 HN → TB", …).
- `TaoDonDialog` (chế độ sửa): cho sửa `toOffice`; nếu đổi khiến hành trình phải re-plan và các chặng đã đi rồi thì **chặn** không cho sửa, hiện cảnh báo.

## Mock data

Thêm 3–4 đơn mẫu tỉnh↔tỉnh ở các trạng thái khác nhau (leg 1 đang chạy, leg 1 đã `AT_HUB` chờ gán leg 2, leg 2 đang chạy, đã `DELIVERED`) trong `src/lib/mock-data.ts` để thấy flow trên tất cả màn.

## Phạm vi file sẽ sửa

- `src/lib/mock-data.ts` – type + mock
- `src/lib/store.ts` – helpers `getCurrentLeg / advanceLeg / assignLegToTrip / setLegStatus`, giữ đồng bộ `order.status / tripCode`
- `src/components/TaoDonDialog.tsx` – sinh legs khi tạo, hiển thị hành trình
- `src/routes/van-don.tsx` – filter theo current leg, cột hành trình, gán xe → leg hiện tại
- `src/routes/hang-cho-len-xe.tsx` – action theo current leg
- `src/routes/duyet-huy.tsx` (Hàng trên xe) – filter theo current leg
- `src/routes/hang-sap-ve.tsx` – nhập kho: AT_HUB vs AT_DEST + advanceLeg
- `src/routes/dieu-chinh.tsx` (Đơn hàng đến) – chỉ hiện leg cuối AT_DEST
- `src/components/OrderHistoryDialog.tsx` – hiển thị event chặng

## Không thay đổi

Giao diện chung, sidebar, module tài chính, POD, RBAC, các màn báo cáo. Doanh thu vẫn tính theo 1 đơn (không cộng đôi).
