import { redirect } from "next/navigation";

/** 旧路径兼容：首页即为创作中心 */
export default function TopicsPage() {
  redirect("/");
}
