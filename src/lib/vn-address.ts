// Dữ liệu hành chính rút gọn cho các địa bàn X.E đang khai thác
export type Ward = string;
export type District = { name: string; wards: Ward[] };
export type Province = { name: string; districts: District[] };

export const VN_PROVINCES: Province[] = [
  {
    name: "Hà Nội",
    districts: [
      { name: "Hoàng Mai", wards: ["Giáp Bát", "Hoàng Liệt", "Thịnh Liệt", "Định Công", "Tân Mai"] },
      { name: "Hai Bà Trưng", wards: ["Bách Khoa", "Đồng Tâm", "Trương Định", "Vĩnh Tuy", "Minh Khai"] },
      { name: "Thanh Trì", wards: ["Ngọc Hồi", "Tứ Hiệp", "Vĩnh Quỳnh", "Tam Hiệp", "Liên Ninh"] },
      { name: "Hà Đông", wards: ["Văn Quán", "Mộ Lao", "La Khê", "Quang Trung", "Phú La"] },
      { name: "Đống Đa", wards: ["Khâm Thiên", "Trung Liệt", "Láng Hạ", "Kim Liên", "Ô Chợ Dừa"] },
      { name: "Cầu Giấy", wards: ["Dịch Vọng", "Quan Hoa", "Nghĩa Tân", "Yên Hoà", "Trung Hoà"] },
    ],
  },
  {
    name: "Nam Định",
    districts: [
      { name: "TP Nam Định", wards: ["Trần Đăng Ninh", "Vị Xuyên", "Bà Triệu", "Lộc Vượng", "Cửa Bắc"] },
      { name: "Nam Trực", wards: ["Nam Giang", "Nam Hồng", "Nam Mỹ", "Điền Xá"] },
      { name: "Ý Yên", wards: ["Lâm", "Yên Ninh", "Yên Tiến", "Yên Đồng"] },
      { name: "Hải Hậu", wards: ["Yên Định", "Cồn", "Thịnh Long", "Hải Long"] },
    ],
  },
  {
    name: "Thái Bình",
    districts: [
      { name: "TP Thái Bình", wards: ["Trần Hưng Đạo", "Lê Hồng Phong", "Bồ Xuyên", "Kỳ Bá", "Quang Trung"] },
      { name: "Vũ Thư", wards: ["Vũ Thư", "Tân Phong", "Song An", "Hoà Bình"] },
      { name: "Đông Hưng", wards: ["Đông Hưng", "Đông La", "Đông Phương", "Nguyên Xá"] },
      { name: "Tiền Hải", wards: ["Tiền Hải", "Tây Giang", "Đông Minh", "Nam Thịnh"] },
    ],
  },
  {
    name: "Ninh Bình",
    districts: [
      { name: "TP Ninh Bình", wards: ["Đông Thành", "Tân Thành", "Vân Giang", "Nam Bình", "Ninh Khánh"] },
      { name: "Tam Điệp", wards: ["Bắc Sơn", "Trung Sơn", "Nam Sơn", "Tây Sơn"] },
      { name: "Hoa Lư", wards: ["Thiên Tôn", "Ninh Mỹ", "Ninh Hải", "Trường Yên"] },
      { name: "Kim Sơn", wards: ["Phát Diệm", "Bình Minh", "Kim Đông", "Lai Thành"] },
    ],
  },
  {
    name: "Phú Thọ",
    districts: [
      { name: "TP Việt Trì", wards: ["Gia Cẩm", "Tân Dân", "Nông Trang", "Vân Cơ", "Bến Gót"] },
      { name: "TX Phú Thọ", wards: ["Hùng Vương", "Âu Cơ", "Phong Châu", "Trường Thịnh"] },
      { name: "Lâm Thao", wards: ["Lâm Thao", "Hùng Sơn", "Cao Xá", "Tứ Xã"] },
      { name: "Phù Ninh", wards: ["Phong Châu", "Phú Lộc", "Tiên Du", "Trạm Thản"] },
    ],
  },
  {
    name: "Yên Bái",
    districts: [
      { name: "TP Yên Bái", wards: ["Đồng Tâm", "Nguyễn Thái Học", "Yên Ninh", "Minh Tân", "Hồng Hà"] },
      { name: "TX Nghĩa Lộ", wards: ["Trung Tâm", "Tân An", "Cầu Thia", "Pú Trạng"] },
      { name: "Trấn Yên", wards: ["Cổ Phúc", "Báo Đáp", "Đào Thịnh", "Việt Thành"] },
      { name: "Yên Bình", wards: ["Yên Bình", "Thác Bà", "Hán Đà", "Đại Minh"] },
    ],
  },
];

export function getDistricts(province: string): District[] {
  return VN_PROVINCES.find((p) => p.name === province)?.districts ?? [];
}

export function getWards(province: string, district: string): Ward[] {
  return getDistricts(province).find((d) => d.name === district)?.wards ?? [];
}

export function composeAddress(parts: {
  street?: string;
  ward?: string;
  district?: string;
  province?: string;
}) {
  return [parts.street, parts.ward, parts.district, parts.province].filter(Boolean).join(", ");
}
