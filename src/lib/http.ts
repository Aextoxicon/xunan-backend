import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const errorMessages: Record<string, string> = {
  validation_error: "参数校验失败",
  unauthorized: "未提供或无效的访问令牌",
  forbidden: "无权执行此操作",
  token_expired: "访问令牌已过期，请重新登录",
  invalid_credentials: "账号或密码不正确",
  auth_not_configured: "服务端未配置 JWT 密钥",
  database_unavailable: "数据库暂时不可用",
  invalid_id: "ID 必须为正整数字符串",
  not_found: "资源不存在",
  invalid_status_transition: "状态流转不允许",
  idempotency_key_conflict: "同一 client_uuid 不能用于不同的目标状态",
  foreign_key_violation: "引用的资源不存在",
  location_out_of_range: "超出实训室允许的定位范围",
  internal_error: "服务内部错误",
  storage_not_configured: "对象存储未配置",
};

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    public issues?: unknown,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export function okJson<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ ok: true, data } as const, status);
}

export function failJson(c: Context, status: ContentfulStatusCode, code: string, issues?: unknown) {
  return c.json(
    {
      ok: false,
      error: {
        code,
        message: errorMessages[code] ?? code,
        ...(issues ? { issues } : {}),
      },
    } as const,
    status,
  );
}

export function isPgError(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}
