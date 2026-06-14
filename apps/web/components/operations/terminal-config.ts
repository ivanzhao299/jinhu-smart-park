import { BadgeCheck, Car, Droplets, Flame, Leaf, PlugZap, ShieldCheck, Sparkles, SprayCan, Wrench } from "lucide-react";

export type OperationSceneKey = "sanitation" | "fire" | "equipment" | "parking" | "electric" | "landscape" | "concealedFacility" | "general";

export interface OperationSceneConfig {
  key: OperationSceneKey;
  label: string;
  description: string;
  recommendedCycle: string;
  planFrequency: "daily" | "weekly" | "monthly";
  keywords: string[];
  defaultWorkOrderTitle: string;
  defaultWorkOrderDescription: string;
  icon: typeof Sparkles;
}

export const OPERATION_SCENES: OperationSceneConfig[] = [
  {
    key: "sanitation",
    label: "卫生巡检",
    description: "公共区域、楼道、卫生间、垃圾点",
    recommendedCycle: "每日 2 次",
    planFrequency: "daily",
    keywords: ["卫生", "保洁", "清洁", "垃圾", "公共区域"],
    defaultWorkOrderTitle: "现场卫生问题处理",
    defaultWorkOrderDescription: "请描述卫生问题位置、现场情况和处理要求。",
    icon: SprayCan
  },
  {
    key: "fire",
    label: "消防安全",
    description: "消防通道、灭火器、消防栓、应急照明",
    recommendedCycle: "每日 1 次",
    planFrequency: "daily",
    keywords: ["消防", "通道", "灭火", "消防栓", "应急照明"],
    defaultWorkOrderTitle: "消防安全问题处理",
    defaultWorkOrderDescription: "请描述消防安全问题、现场风险和整改要求。",
    icon: Flame
  },
  {
    key: "equipment",
    label: "设备安全",
    description: "电梯、水泵、配电箱、照明和公共设备",
    recommendedCycle: "每日 1 次",
    planFrequency: "daily",
    keywords: ["设备", "电梯", "水泵", "空调", "照明", "配电"],
    defaultWorkOrderTitle: "设备异常处理",
    defaultWorkOrderDescription: "请描述设备异常现象、影响范围和现场照片。",
    icon: Wrench
  },
  {
    key: "parking",
    label: "停车管理",
    description: "车位占用、道闸、车辆秩序、出入口",
    recommendedCycle: "每日 2 次",
    planFrequency: "daily",
    keywords: ["停车", "车位", "道闸", "车辆", "出入口"],
    defaultWorkOrderTitle: "停车现场问题处理",
    defaultWorkOrderDescription: "请描述停车现场问题、位置和处理建议。",
    icon: Car
  },
  {
    key: "electric",
    label: "用电安全",
    description: "临时用电、私拉乱接、配电箱和高负荷",
    recommendedCycle: "每周 2 次",
    planFrequency: "weekly",
    keywords: ["用电", "电气", "配电", "临电", "电表", "私拉乱接"],
    defaultWorkOrderTitle: "用电安全问题处理",
    defaultWorkOrderDescription: "请描述用电安全隐患、现场位置和整改要求。",
    icon: PlugZap
  },
  {
    key: "landscape",
    label: "园区绿化",
    description: "修剪需求、绿化垃圾、破坏痕迹、浇水养护",
    recommendedCycle: "每周 2 次",
    planFrequency: "weekly",
    keywords: ["绿化", "草坪", "树木", "修剪", "浇水", "养护", "绿植"],
    defaultWorkOrderTitle: "园区绿化养护处理",
    defaultWorkOrderDescription: "请描述绿化位置、是否需修剪/浇水、是否有垃圾或破坏情况。",
    icon: Leaf
  },
  {
    key: "concealedFacility",
    label: "隐蔽设施",
    description: "楼顶排水孔、排水管道、暗沟、清淤需求",
    recommendedCycle: "每月 1 次",
    planFrequency: "monthly",
    keywords: ["隐蔽", "排水", "排水孔", "管道", "暗沟", "清淤", "楼顶", "雨水"],
    defaultWorkOrderTitle: "隐蔽设施排查处理",
    defaultWorkOrderDescription: "请描述排水孔、管道或暗沟位置，是否堵塞、有垃圾或需要清淤。",
    icon: Droplets
  },
  {
    key: "general",
    label: "综合巡查",
    description: "其他现场问题、业主诉求和临时任务",
    recommendedCycle: "按需触发",
    planFrequency: "daily",
    keywords: [],
    defaultWorkOrderTitle: "现场问题处理",
    defaultWorkOrderDescription: "请描述现场问题、诉求或处理建议。",
    icon: ShieldCheck
  }
];

export const TERMINAL_QUICK_ACTIONS = [
  { key: "today", label: "今日待办", description: "按责任人聚合巡检任务", icon: BadgeCheck },
  { key: "report", label: "快速上报", description: "拍照、定位、提交工单", icon: Sparkles }
] as const;

export const TERMINAL_DICT_CODES = [
  "safety_inspect_task_status",
  "safety_inspect_item_result",
  "safety_inspect_result",
  "workorder_status",
  "workorder_type",
  "workorder_priority",
  "workorder_urgency"
] as const;

export function matchScene(text: string, scene: OperationSceneConfig): boolean {
  if (scene.key === "general") return true;
  return scene.keywords.some((keyword) => text.includes(keyword));
}
