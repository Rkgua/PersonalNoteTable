/**
 * 全局错误处理中间件（必须保持 4 个参数） express 会自动识别为错误处理中间件
 * 在所有路由之后注册，统一接管未捕获的异常
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message;

  // Mongoose 无效 ID 格式（如 "abc" 不是 24 位 hex）
  if (err.name === "CastError") {
    statusCode = 400;
    message = "无效的 ID 格式";
  }

  // Mongoose 验证错误（保存数据不符合 Schema 定义）
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join("; ");
  }

  // 已知操作错误（如 throw new AppError）
  if (err.isOperational) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // 未标记的操作错误 → 程序 bug，不暴露详情
  if (
    !err.isOperational &&
    err.name !== "CastError" &&
    err.name !== "ValidationError"
  ) {
    message = "服务器内部错误";
  }

  // 对外（前端/网络）统一返回 500 错误码和模糊的提示，对内（服务器日志）记录详细的错误信息
  if (process.env.NODE_ENV !== "production") {
    console.error(`[Error] ${statusCode} - ${message}`);
    if (!err.isOperational) console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
  });
};

module.exports = errorHandler;
