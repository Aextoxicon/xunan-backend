export type CheckItem = {
  item_code: string;
  category: string;
  item_name: string;
  photo_required_when_abnormal: boolean;
};

export const checkItems: CheckItem[] = [
  { item_code: "elec.socket", category: "用电", item_name: "插座与线路无破损", photo_required_when_abnormal: true },
  { item_code: "fire.extinguisher", category: "消防", item_name: "灭火器压力正常", photo_required_when_abnormal: true },
  { item_code: "chemical.cabinet", category: "危化品", item_name: "危化品柜双人双锁", photo_required_when_abnormal: true },
  { item_code: "equipment.grounding", category: "设备", item_name: "设备接地可靠", photo_required_when_abnormal: true },
];

export function itemsForRoom(codes: string[] | null | undefined): CheckItem[] {
  if (!codes || codes.length === 0) return checkItems;
  return checkItems.filter((item) => codes.includes(item.item_code));
}
