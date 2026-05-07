/**
 * 异步路由包装器 — 捕获所有 async 异常并交给全局错误中间件
 *
 * 用法：router.get("/", asyncHandler(async (req, res) => { ... }))
 * 替代：router.get("/", async (req, res) => { try { ... } catch (err) { ... } })
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
