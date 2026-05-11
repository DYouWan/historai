/**
 * 豆包语音合成音色：与文档《音色列表》流式列 ID 一致（VC_*_streaming）。
 * POST /api/tts 调用火山 HTTP 非流式时会自动去掉 VC_ 前缀以匹配接口示例（BV*_streaming）。
 * https://www.volcengine.com/docs/6561/269555?lang=zh
 */
export const VOLCENGINE_TTS_VOICE_CUSTOM = "__custom__" as const;

export type VolcengineTtsVoicePreset = {
  /** 对应接口 audio.voice_type */
  id: string;
  /** 文档展示名 */
  label: string;
};

export const VOLCENGINE_TTS_VOICE_PRESETS: VolcengineTtsVoicePreset[] = [
  { id: "VC_BV001_streaming", label: "通用女声" },
  { id: "VC_BV056_streaming", label: "阳光男声" },
  { id: "VC_BV050_streaming", label: "动漫小新" },
  { id: "VC_BV051_streaming", label: "奶气萌娃" },
  { id: "VC_BV700_streaming", label: "灿灿" },
  { id: "VC_BV701_streaming", label: "擎苍" },
  { id: "VC_BV409_streaming", label: "TVB女声" },
  { id: "VC_BV064_streaming", label: "小萝莉" },
  { id: "VC_BV405_streaming", label: "甜美小源" },
  { id: "VC_BV406_streaming", label: "超自然音色-梓梓" },
  { id: "VC_BV407_streaming", label: "超自然音色-燃燃" },
  { id: "VC_BV408_streaming", label: "译制片男声" },
  { id: "VC_BR001_streaming", label: "说唱小哥" },
  { id: "VC_BV004_streaming", label: "开朗青年" },
  { id: "VC_BV005_streaming", label: "活泼女声" },
  { id: "VC_BV006_streaming", label: "磁性男声" },
  { id: "VC_BV009_streaming", label: "知性女声" },
  { id: "VC_BV011_streaming", label: "新闻女声" },
  { id: "VC_BV033_streaming", label: "温柔小哥" },
  { id: "VC_BV034_streaming", label: "知性姐姐-双语" },
  { id: "VC_BV057_streaming", label: "活泼幼教-双语" },
  { id: "VC_BV061_streaming", label: "天才童声" },
  { id: "VC_BV063_streaming", label: "动漫海绵" },
  { id: "VC_BV100_streaming", label: "质朴青年" },
  { id: "VC_BV102_streaming", label: "儒雅青年" },
  { id: "VC_BV104_streaming", label: "温柔淑女" },
  { id: "VC_BV107_streaming", label: "霸气青叔" },
  { id: "VC_BV113_streaming", label: "甜宠少御" },
  { id: "VC_BV115_streaming", label: "古风少御" },
  { id: "VC_BV119_streaming", label: "通用赘婿" },
  { id: "VC_BV120_streaming", label: "反卷青年" },
  { id: "VC_BV123_streaming", label: "阳光青年" },
  { id: "VC_BV210_streaming", label: "西安佟掌柜" },
  { id: "VC_BV222_streaming", label: "北京小伙儿" },
  { id: "VC_BV411_streaming", label: "影视解说小帅" },
  { id: "VC_BV417_streaming", label: "动漫海星" },
  { id: "VC_BV426_streaming", label: "懒小羊" },
  { id: "VC_BV430_streaming", label: "容嬷嬷" },
  { id: "VC_BV506_streaming", label: "天真萌娃-Lily" },
  { id: "VC_BV511_streaming", label: "慵懒女声-Ava" },
];
