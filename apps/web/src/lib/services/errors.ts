export function serviceMessage(error: unknown) {
  return error instanceof Error ? error.message : "服务暂不可用，请重试。";
}
