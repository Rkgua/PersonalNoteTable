const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

// 中间件：根据 ID 查找文章（用 asyncHandler 包装，捕获异常后交给全局错误中间件）
const getPost = asyncHandler(async (req, res, next) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw new AppError(404, "文章不存在");
  res.post = post;
  next();
});

// 1. 获取所有文章
router.get("/", asyncHandler(async (req, res) => {
  const posts = await Post.find();
  res.json(posts);
}));

// 2. 创建新文章
router.post("/", asyncHandler(async (req, res) => {
  const post = new Post({
    title: req.body.title,
    content: req.body.content,
    category: req.body.category || "未分类",
  });
  const newPost = await post.save();
  res.status(201).json(newPost);
}));

// 3. 获取所有分类
router.get("/categories", asyncHandler(async (req, res) => {
  const categories = await Post.distinct("category");
  res.json(categories.filter(Boolean));
}));

// 4. 根据 ID 获取单篇文章
router.get("/:id", getPost, (req, res) => {
  res.json(res.post);
});

// 5. 删除文章
router.delete("/:id", getPost, asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (password !== "123456") throw new AppError(401, "密码错误");
  await Post.deleteOne({ _id: req.params.id });
  res.json({ message: "Deleted Post" });
}));

// 6. 批量删除文章
router.post("/batch-delete", asyncHandler(async (req, res) => {
  const { ids, password } = req.body;
  if (password !== "123456") throw new AppError(401, "密码错误");
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new AppError(400, "请选择要删除的文章");
  }
  const result = await Post.deleteMany({ _id: { $in: ids } });
  res.json({ message: `成功删除 ${result.deletedCount} 篇文章` });
}));

// 7. 批量移动文章到指定分类
router.post("/batch-move", asyncHandler(async (req, res) => {
  const { ids, category } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new AppError(400, "请选择要移动的文章");
  }
  if (!category || !category.trim()) {
    throw new AppError(400, "请指定目标分类");
  }
  const result = await Post.updateMany(
    { _id: { $in: ids } },
    { $set: { category: category.trim() } },
  );
  res.json({
    message: `成功将 ${result.modifiedCount} 篇文章移动到「${category.trim()}」`,
    modifiedCount: result.modifiedCount,
  });
}));

// 8. 更新文章 cue/summary/difficulty
router.patch("/:id", getPost, asyncHandler(async (req, res) => {
  const { cue, summary, difficulty } = req.body;
  if (cue !== undefined) res.post.cue = cue;
  if (summary !== undefined) res.post.summary = summary;
  if (difficulty !== undefined) {
    if (["频繁", "常见", "偶尔", "罕见", ""].includes(difficulty)) {
      res.post.difficulty = difficulty;
    }
  }
  const updatedPost = await res.post.save();
  res.json(updatedPost);
}));

module.exports = router;
