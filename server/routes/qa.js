const express = require("express");
const router = express.Router();
const axios = require("axios");
// Get-Content C:\Users\Public\server.log -Encoding UTF8 | Select-String "\[QA\]" 终端查看日志

// 去掉 HTML 标签，提取纯文本（因为 content 存的是 HTML）
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "") // 去标签
    .replace(/&amp;/g, "&") // 解码 HTML 实体
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ") // 合并空白
    .trim();
}

// POST /api/qa  — 问问题
router.post("/", async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ message: "请输入问题" });
  const Post = require("../models/Post");

  // 提取搜索关键词：去掉常见疑问词，提取核心词
  const keywords = question
    .replace(
      /[？?的什么是哪怎么如何有没有为什么哪些哪个可以需要]|是什么意思/g,
      " ",
    )
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const searchTerms = keywords.length > 0 ? keywords : [question];

  console.log("[QA] question:", question);
  console.log("[QA] searchTerms:", searchTerms);

  // ★★★ 同时搜标题、分类、内容（content 存的是 HTML，但纯文本词会原样出现在 HTML 中）★★★
  const searchConditions = searchTerms.map((kw) => ({
    $or: [
      {
        title: {
          $regex: kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        },
      },
      {
        category: {
          $regex: kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        },
      },
      {
        content: {
          $regex: kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        },
      },
    ],
  }));

  // 搜所有字段
  let posts = await Post.find({ $or: searchConditions }).limit(10);
  console.log("[QA] MongoDB regex found:", posts.length, "posts");

  // 如果 MongoDB 的 regex 没找到，降级到 JS 侧 stripHtml 后匹配
  if (posts.length === 0) {
    console.log("[QA] Falling back to JS stripHtml search...");
    const allPosts = await Post.find({}).limit(100);
    console.log("[QA] Total posts scanned:", allPosts.length);
    posts = allPosts
      .filter((p) => {
        const text = stripHtml(p.content);
        const match = searchTerms.some((kw) => text.includes(kw));
        if (match) console.log("[QA] JS match found in:", p.title);
        return match;
      })
      .slice(0, 10);
    console.log("[QA] JS stripHtml search found:", posts.length, "posts");
  }

  if (posts.length > 0) {
    console.log(
      "[QA] Top result:",
      posts[0].title,
      "| category:",
      posts[0].category,
    );
  }

  // 把笔记内容拼进 prompt（使用纯文本）
  const context = posts
    .map(
      (p) =>
        `分类：${p.category} > 标题：${p.title}\n内容：${stripHtml(p.content)}`,
    )
    .join("\n---\n");
  console.log("[QA] context length:", context.length, "chars");

  try {
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
  } catch (err) {
    console.error("QA API error:", err.message);
    res.status(500).json({ message: "问答服务出错" });
  }
});

// 诊断接口：检查某个词是否在数据库中出现
router.get("/check", async (req, res) => {
  const { word } = req.query;
  if (!word) return res.json({ found: false, message: "请提供 word 参数" });

  const Post = require("../models/Post");

  // 搜标题
  const titleMatch = await Post.countDocuments({
    title: { $regex: word, $options: "i" },
  });
  // 搜内容（原始 HTML）
  const contentMatch = await Post.countDocuments({
    content: { $regex: word, $options: "i" },
  });
  // 搜分类
  const categoryMatch = await Post.countDocuments({
    category: { $regex: word, $options: "i" },
  });

  res.json({
    word,
    found: titleMatch + contentMatch + categoryMatch > 0,
    details: {
      title: titleMatch,
      content: contentMatch,
      category: categoryMatch,
    },
  });
});

module.exports = router;
