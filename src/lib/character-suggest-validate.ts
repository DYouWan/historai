/** 推荐人物 · ② 批量形象：服务端轻量校验与套话检测 */

const APPEARANCE_CLICHE_PATTERNS: RegExp[] = [
  /面若桃花/,
  /面若芙蓉/,
  /面如满月/,
  /肤白胜雪/,
  /肤如凝脂/,
  /眼含秋水/,
  /眉蹙春山/,
  /眼波流转/,
  /相貌堂堂/,
  /气宇轩昂/,
  /清丽脱俗/,
  /妖冶妩媚/,
];

const APPEARANCE_ROLE_PREFIX =
  /^(青楼名妓|歌妓|名妓|太后|女皇|皇后|贵妃|宠妃|王后|公主|才女)/;

export function appearanceLengthOk(s: string): boolean {
  const n = Array.from(s).length;
  return n >= 20 && n <= 64;
}

export function findAppearanceIssues(appearance: string): string[] {
  const t = appearance.trim();
  const issues: string[] = [];
  if (!t) issues.push("appearance 为空");
  if (t && !appearanceLengthOk(t)) {
    issues.push(`appearance 字数应在 20～64（当前 ${Array.from(t).length}）`);
  }
  if (APPEARANCE_ROLE_PREFIX.test(t)) {
    issues.push("appearance 勿以职业/身份头衔起句（身份已在 name/dynasty）");
  }
  for (const re of APPEARANCE_CLICHE_PATTERNS) {
    if (re.test(t)) issues.push(`含套话「${re.source}」`);
  }
  if (!/(眉|眼|目|脸|颧|颌|须|发|鬓|鼻|唇|面容|眉目)/.test(t)) {
    issues.push("须写可画面化的眉/眼/须发/脸型之一，勿仅气质形容词");
  }
  return issues;
}

export function validateAppearanceBatch(
  rows: { name: string; appearance: string }[],
): string | null {
  const issues: string[] = [];
  for (const r of rows) {
    const local = findAppearanceIssues(r.appearance);
    for (const msg of local) {
      issues.push(`${r.name}：${msg}`);
    }
  }
  const sigs = rows.map((r) =>
    r.appearance
      .replace(/[，。；、\s]/g, "")
      .slice(0, 24),
  );
  for (let i = 0; i < sigs.length; i++) {
    for (let j = i + 1; j < sigs.length; j++) {
      if (sigs[i] === sigs[j] && sigs[i].length >= 12) {
        issues.push(
          `${rows[i]!.name} 与 ${rows[j]!.name} 的 appearance 开头过于雷同`,
        );
      }
    }
  }
  return issues.length ? issues.join("；") : null;
}
