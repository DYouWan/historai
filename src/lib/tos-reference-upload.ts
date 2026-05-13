/**
 * 封面 / 参考图上传：火山引擎对象存储 TOS（@volcengine/tos-sdk）
 * 文档与仓库：https://github.com/volcengine/ve-tos-js-sdk
 *
 * 环境变量（须全部配置后，上传封面 / 参考图接口才会成功；未配置时接口返回 503）：
 * - VOLCENGINE_TOS_ACCESS_KEY_ID
 * - VOLCENGINE_TOS_SECRET_ACCESS_KEY（或 VOLCENGINE_TOS_ACCESS_KEY_SECRET）
 * - VOLCENGINE_TOS_REGION（如 cn-beijing）
 * - VOLCENGINE_TOS_BUCKET
 * - VOLCENGINE_TOS_ENDPOINT（可选；**填主机名或完整 URL 均可**，如 `tos-cn-beijing.volces.com` 或 `https://tos-cn-beijing.volces.com`；程序会去掉协议后交给 SDK。**勿只填 https**）
 * - VOLCENGINE_TOS_PUBLIC_BASE_URL（可选，公网访问根 URL，无尾斜杠；省略则用虚拟托管风格 https://{bucket}.{host}）
 * - VOLCENGINE_TOS_KEY_PREFIX（可选，对象键前缀，默认 historai/references）
 */

import path from "node:path";
import { TosClient, ACLType } from "@volcengine/tos-sdk";

export type TosReferenceUploadEnv = {
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
  /**
   * 须为**无协议**的 TOS 主机名（与 ve-tos-js-sdk 一致），如 `tos-cn-beijing.volces.com`。
   * 切勿传 `https://...`：SDK 会拼成 `{bucket}.{endpoint}`，含 `https://` 时请求主机易被错解析为 `{bucket}.https`。
   */
  endpoint: string;
  bucket: string;
  /** 以 / 结尾 */
  keyPrefix: string;
  /** 无尾斜杠，用于拼接对象 URL */
  publicBaseUrl: string;
};

function trimEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function defaultTosEndpointForRegion(region: string): string {
  return `https://tos-${region}.volces.com`;
}

/**
 * 规范化 TOS API endpoint。
 * 常见误填：`VOLCENGINE_TOS_ENDPOINT=https`（无 `://`）→ 代码拼成 `https://https`，
 * SDK 虚拟托管域名为 `{bucket}.https`，报 getaddrinfo ENOTFOUND historai.https。
 */
function parseTosEndpointForRegion(
  region: string,
  rawEndpoint: string,
): { endpointUrl: string; hostForVirtualHostedUrl: string } {
  const fallbackUrl = defaultTosEndpointForRegion(region);
  const fallbackHost = new URL(fallbackUrl).host;

  let candidate = rawEndpoint.trim();
  if (!candidate) {
    return { endpointUrl: fallbackUrl, hostForVirtualHostedUrl: fallbackHost };
  }
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { endpointUrl: fallbackUrl, hostForVirtualHostedUrl: fallbackHost };
  }

  const h = u.hostname.toLowerCase();
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
  const ipv6 = /^\[.+\]$/.test(h);
  const looksLikeDomain = h.includes(".");
  const bogusHost =
    !h || h === "https" || h === "http" || (!ipv4 && !ipv6 && !looksLikeDomain);

  if (bogusHost) {
    return { endpointUrl: fallbackUrl, hostForVirtualHostedUrl: fallbackHost };
  }

  const endpointUrl = `${u.protocol}//${u.host}`;
  return { endpointUrl, hostForVirtualHostedUrl: u.host };
}

function normalizeTosPublicBaseUrl(params: {
  bucket: string;
  hostForVirtualHostedUrl: string;
  rawPublicBase: string;
}): string {
  const derived = `https://${params.bucket}.${params.hostForVirtualHostedUrl}`;
  let s = params.rawPublicBase.trim().replace(/\/+$/, "");
  if (!s) return derived;
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    const h = u.hostname.toLowerCase();
    if (!h || h === "https" || h === "http") return derived;
    return `${u.protocol}//${u.host}`;
  } catch {
    return derived;
  }
}

/** 若返回 null，表示未配置完整 TOS，上传接口应返回错误 */
export function resolveTosReferenceUploadEnv(): TosReferenceUploadEnv | null {
  const accessKeyId = trimEnv("VOLCENGINE_TOS_ACCESS_KEY_ID");
  const accessKeySecret =
    trimEnv("VOLCENGINE_TOS_SECRET_ACCESS_KEY") ||
    trimEnv("VOLCENGINE_TOS_ACCESS_KEY_SECRET");
  const region = trimEnv("VOLCENGINE_TOS_REGION");
  const bucket = trimEnv("VOLCENGINE_TOS_BUCKET");
  if (!accessKeyId || !accessKeySecret || !region || !bucket) {
    return null;
  }

  const { hostForVirtualHostedUrl } = parseTosEndpointForRegion(
    region,
    trimEnv("VOLCENGINE_TOS_ENDPOINT"),
  );

  const prefixRaw =
    trimEnv("VOLCENGINE_TOS_KEY_PREFIX") || "historai/references";
  const keyPrefix =
    prefixRaw.replace(/^\/+/, "").replace(/\/+$/, "") + "/";

  const publicBaseUrl = normalizeTosPublicBaseUrl({
    bucket,
    hostForVirtualHostedUrl,
    rawPublicBase: trimEnv("VOLCENGINE_TOS_PUBLIC_BASE_URL"),
  });

  return {
    accessKeyId,
    accessKeySecret,
    region,
    endpoint: hostForVirtualHostedUrl,
    bucket,
    keyPrefix,
    publicBaseUrl,
  };
}

function safeFileSegment(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return (base || "image").slice(0, 120);
}

export async function uploadReferenceBufferViaTos(params: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<{ url: string; objectKey: string }> {
  const env = resolveTosReferenceUploadEnv();
  if (!env) {
    throw new Error("TOS 环境未就绪");
  }

  const client = new TosClient({
    accessKeyId: env.accessKeyId,
    accessKeySecret: env.accessKeySecret,
    region: env.region,
    endpoint: env.endpoint,
  });

  const ext =
    path.extname(params.fileName) ||
    (params.mimeType.toLowerCase().includes("png") ? ".png"
    : params.mimeType.toLowerCase().includes("webp") ? ".webp"
    : params.mimeType.toLowerCase().includes("gif") ? ".gif"
    : ".jpg");
  const stem = safeFileSegment(path.basename(params.fileName, ext) || "ref");
  const objectKey = `${env.keyPrefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}_${stem}${ext}`.replace(
    /\/+/g,
    "/",
  );

  await client.putObject({
    bucket: env.bucket,
    key: objectKey,
    body: params.buffer,
    contentType: params.mimeType || "application/octet-stream",
    acl: ACLType.ACLPublicRead,
  });

  const url = `${env.publicBaseUrl}/${objectKey.replace(/^\/+/, "")}`;
  return { url, objectKey };
}
