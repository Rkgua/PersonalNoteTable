const express = require("express");
const router = express.Router();
const axios = require("axios");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

// 去掉 HTML 标签，提取纯文本
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// POST /api/qa — 问答
router.post("/", asyncHandler(async (req, res) => {
  const { question } = req.body;
  if (!question) throw new AppError(400, "请输入问题");

  const Post = require("../models/Post");

  // 提取英文词作为搜索关键词
  const englishWords = question.match(/[a-zA-Z0-9_]+/g) || [];
  const chineseChars = question.match(/[\u4e00-\u9fff]+/g) || [];

  let searchTerms;
  if (englishWords.length > 0) {
    searchTerms = englishWords;
  } else if (chineseChars.length > 0) {
    const cleaned = chineseChars
      .map((c) => c.replace(/[？?的什么是哪怎么如何有没有为什么哪些哪个可以需要]|是什么意思/g, ""))
      .filter(Boolean);
    searchTerms = cleaned.length > 0 ? cleaned : chineseChars;
  } else {
    searchTerms = [question];
  }

  console.log("[QA] question:", question);
  console.log("[QA] searchTerms:", searchTerms);

  const searchConditions = searchTerms.map((kw) => ({
    $or: [
      { title: { $regex: kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      { category: { $regex: kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      { content: { $regex: kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    ],
  }));

  let posts = await Post.find({ $or: searchConditions }).limit(10);
  console.log("[QA] MongoDB regex found:", posts.length, "posts");

  if (posts.length === 0) {
    console.log("[QA] Falling back to JS stripHtml search...");
    const allPosts = await Post.find({}).limit(100);
    posts = allPosts
      .filter((p) => searchTerms.some((kw) => stripHtml(p.content).includes(kw)))
      .slice(0, 10);
    console.log("[QA] JS stripHtml search found:", posts.length, "posts");
  }

  if (posts.length > 0) {
    console.log("[QA] Top result:", posts[0].title, "| category:", posts[0].category);
  }

  const context = posts
    .map((p) => `分类：${p.category} > 标题：${p.title}\n内容：${stripHtml(p.content)}`)
    .join("\n---\n");
  console.log("[QA] context length:", context.length, "chars");

  const response = await axios.post(
    "https://api.deepseek.com/v1/chat/completions",
    {
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: context
            ? `你是一个技术笔记助手。下面是从用户笔记中搜索到的相关内容。

要求：
1. 仔细阅读下面的笔记内容，并基于这些内容回答问题
2. 回答时必须说明依据了哪篇笔记（分类和标题）
3. 笔记内容中提到了哪些信息，就如实回答哪些。即使信息很简单，也要回答
4. 只有在笔记内容中完全找不到这个词或相关内容时，才说"笔记中没有找到"
5. 用纯文本回答，不要使用 Markdown 符号
6.如果没有找到相关内容，可以回答"正在给你联网回答"+你的搜索结果，但不要回答"根据笔记内容，..."之类的话

笔记内容：
${context}`
            : "你是一个技术笔记助手，回答问题。",
        },
        { role: "user", content: question },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  res.json({ answer: response.data.choices[0].message.content });
}));

// GET /api/qa/check — 诊断接口
router.get("/check", asyncHandler(async (req, res) => {
  const { word } = req.query;
  if (!word) return res.json({ found: false, message: "请提供 word 参数" });

  const Post = require("../models/Post");

  const [titleMatch, contentMatch, categoryMatch] = await Promise.all([
    Post.countDocuments({ title: { $regex: word, $options: "i" } }),
    Post.countDocuments({ content: { $regex: word, $options: "i" } }),
    Post.countDocuments({ category: { $regex: word, $options: "i" } }),
  ]);

  res.json({
    word,
    found: titleMatch + contentMatch + categoryMatch > 0,
    details: { title: titleMatch, content: contentMatch, category: categoryMatch },
  });
}));

module.exports = router;
