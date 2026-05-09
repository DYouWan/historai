/**
 * 上传文件到腾讯云 COS（后端直接上传）
 * POST /api/upload-to-cos
 * Body: { fileName: string, mimeType: string, fileSize: number, fileData: string(base64) }
 */

import { NextRequest, NextResponse } from "next/server";
import COS from "cos-nodejs-sdk-v5";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileName, mimeType, fileSize, fileData } = body;

    if (!fileName || !mimeType || !fileSize || !fileData) {
      return NextResponse.json(
        { error: "缺少必要参数: fileName, mimeType, fileSize, fileData" },
        { status: 400 }
      );
    }

    // 获取 COS 配置
    const secretId = process.env.TENCENT_COS_SECRET_ID;
    const secretKey = process.env.TENCENT_COS_SECRET_KEY;
    const bucket = process.env.TENCENT_COS_BUCKET;
    const region = process.env.TENCENT_COS_REGION;
    const prefix = process.env.TENCENT_COS_PREFIX || "historai/";

    if (!secretId || !secretKey || !bucket || !region) {
      return NextResponse.json(
        { error: "腾讯云 COS 未配置，请检查环境变量" },
        { status: 500 }
      );
    }

    // 生成对象路径
    const timestamp = Math.floor(Date.now() / 1000);
    const random = Math.random().toString(36).substring(2, 10);
    const ext = fileName.split(".").pop() || "png";
    const key = `${prefix}${timestamp}-${random}.${ext}`;

    // 使用官方SDK上传
    const buffer = Buffer.from(fileData, "base64");

    return new Promise((resolve) => {
      const cos = new COS({
        SecretId: secretId,
        SecretKey: secretKey,
      });

      cos.putObject(
        {
          Bucket: bucket,
          Region: region,
          Key: key,
          Body: buffer,
          ContentLength: buffer.length,
          ContentType: mimeType,
        },
        (err, _data) => {
          if (err) {
            resolve(NextResponse.json(
              { error: err.message || "上传到云存储失败" },
              { status: 500 }
            ));
            return;
          }

          const url = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
          resolve(NextResponse.json({
            success: true,
            url,
            key: `/${key}`,
          }));
        }
      );
    });

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传失败" },
      { status: 500 }
    );
  }
}
