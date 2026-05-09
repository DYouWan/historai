/**
 * 创作中心按「垂直业务」拆分：当前线上仅人物向工作区；物品、地理等可后续独立路由与组件挂载。
 */
export type StudioVerticalId = "person";

export const ACTIVE_STUDIO_VERTICAL: StudioVerticalId = "person";

/** 规划中的垂直，未实现前勿在导航或路由中暴露 */
export type StudioVerticalIdPlanned = StudioVerticalId | "artifact" | "geography";
