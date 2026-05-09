/**
 * OpenAI 兼容 Chat Completions（DeepSeek、通义千问 compatible-mode 等）
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function callOpenAICompatibleChat(args: {
  url: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  responseFormatJsonObject?: boolean;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    temperature: args.temperature,
    max_tokens: args.maxTokens,
  };
  if (args.responseFormatJsonObject) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(args.url.trim(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Chat Completions 失败（${res.status}）：${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) {
    throw new Error("Chat Completions 返回内容为空");
  }
  return String(content).trim();
}
