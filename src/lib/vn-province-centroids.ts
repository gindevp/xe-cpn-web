/** Tâm tỉnh/TP gần đúng — ping map khi geocode API fail. */
const PROVINCE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  hanoi: { lat: 21.0285, lng: 105.8542 },
  thanhphohanoi: { lat: 21.0285, lng: 105.8542 },
  hochiminh: { lat: 10.7769, lng: 106.7009 },
  thanhphohochiminh: { lat: 10.7769, lng: 106.7009 },
  tphochiminh: { lat: 10.7769, lng: 106.7009 },
  saigon: { lat: 10.7769, lng: 106.7009 },
  haiphong: { lat: 20.8449, lng: 106.6881 },
  thanhphohaiphong: { lat: 20.8449, lng: 106.6881 },
  danang: { lat: 16.0544, lng: 108.2022 },
  thanhphodanang: { lat: 16.0544, lng: 108.2022 },
  cantho: { lat: 10.0452, lng: 105.7469 },
  thanhphocantho: { lat: 10.0452, lng: 105.7469 },
  namdinh: { lat: 20.4388, lng: 106.1621 },
  thaibinh: { lat: 20.4463, lng: 106.3366 },
  ninhbinh: { lat: 20.2506, lng: 105.9745 },
  phutho: { lat: 21.3227, lng: 105.401 },
  yenbai: { lat: 21.7056, lng: 104.8708 },
  hatinh: { lat: 18.3428, lng: 105.9058 },
  nghean: { lat: 18.6796, lng: 105.6813 },
  thanhhoa: { lat: 19.8067, lng: 105.7852 },
  quangninh: { lat: 21.0064, lng: 107.2925 },
  bacninh: { lat: 21.1861, lng: 106.0763 },
  bacgiang: { lat: 21.2817, lng: 106.1974 },
  hungyen: { lat: 20.6464, lng: 106.0511 },
  haiduong: { lat: 20.9373, lng: 106.3146 },
  vinhphuc: { lat: 21.3609, lng: 105.5474 },
  hoabinh: { lat: 20.8133, lng: 105.3383 },
  sonla: { lat: 21.3257, lng: 103.9188 },
  laichau: { lat: 22.3687, lng: 103.279 },
  dienbien: { lat: 21.386, lng: 103.016 },
  laocai: { lat: 22.4809, lng: 103.9755 },
  yenbai: { lat: 21.7056, lng: 104.8708 },
  tuyenquang: { lat: 21.7767, lng: 105.228 },
  haigiang: { lat: 22.8026, lng: 104.9784 },
  caobang: { lat: 22.6663, lng: 106.263 },
  backan: { lat: 22.147, lng: 105.8348 },
  langson: { lat: 21.8537, lng: 106.761 },
  thainguyen: { lat: 21.5942, lng: 105.848 },
  quangbinh: { lat: 17.468, lng: 106.622 },
  quangtri: { lat: 16.75, lng: 107.2 },
  hue: { lat: 16.4637, lng: 107.5909 },
  thanhphohue: { lat: 16.4637, lng: 107.5909 },
  thuathienhue: { lat: 16.4637, lng: 107.5909 },
  quangnam: { lat: 15.5394, lng: 108.0191 },
  quangngai: { lat: 15.1214, lng: 108.8044 },
  binhdinh: { lat: 13.783, lng: 109.219 },
  phuyen: { lat: 13.0882, lng: 109.308 },
  khanhhoa: { lat: 12.2388, lng: 109.1967 },
  ninhthuan: { lat: 11.5643, lng: 108.988 },
  binhthuan: { lat: 10.928, lng: 108.1 },
  kontum: { lat: 14.3497, lng: 108.0005 },
  gialai: { lat: 13.9833, lng: 108.0 },
  daklak: { lat: 12.6667, lng: 108.05 },
  daknong: { lat: 12.2646, lng: 107.609 },
  lambong: { lat: 11.9404, lng: 108.4583 },
  lamdong: { lat: 11.9404, lng: 108.4583 },
  binhphuoc: { lat: 11.647, lng: 106.606 },
  binhduong: { lat: 11.3254, lng: 106.477 },
  dongnai: { lat: 10.95, lng: 106.85 },
  bariavungtau: { lat: 10.346, lng: 107.0843 },
  longan: { lat: 10.6956, lng: 106.2431 },
  tiengiang: { lat: 10.3604, lng: 106.356 },
  bentre: { lat: 10.2434, lng: 106.3759 },
  travinh: { lat: 9.934, lng: 106.345 },
  vinhlong: { lat: 10.239, lng: 105.957 },
  dongthap: { lat: 10.493, lng: 105.688 },
  angiang: { lat: 10.5216, lng: 105.1259 },
  kiengiang: { lat: 9.9905, lng: 105.098 },
  haugiang: { lat: 9.757, lng: 105.641 },
  soctrang: { lat: 9.603, lng: 105.98 },
  baclieu: { lat: 9.294, lng: 105.7218 },
  camau: { lat: 9.1767, lng: 105.152 },
};

export function foldPlaceKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(tinh|thanh pho|tp\.?|tx\.?)\s+/i, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Tâm tỉnh/TP theo tên (Hà Nội, Nam Định, …). */
export function provinceCentroid(name: string): { lat: number; lng: number } | null {
  const key = foldPlaceKey(name);
  if (!key) return null;
  if (PROVINCE_CENTROIDS[key]) return PROVINCE_CENTROIDS[key];
  for (const [k, v] of Object.entries(PROVINCE_CENTROIDS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}
