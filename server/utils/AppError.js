/**
 * 自定义错误类 — 携带 HTTP 状态码
 * 用法：throw new AppError(404, "文章不存在")
 */
class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // 标记为"已知操作错误"，区别于程序 bug
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
