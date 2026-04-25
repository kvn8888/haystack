import { GoogleGenAI, Type } from "@google/genai";
import { config, integrations } from "./config.js";
import {
  chargeRead,
  getApiKey,
  getPost,
  searchPosts,
} from "./store.js";

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "search_haystack_index",
        description:
          "Search HayStack post previews for free. Returns matching posts with titles, preview snippets, per-read prices, and author info. Always call this first.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "User query in plain English." },
          },
          required: ["query"],
        },
      },
      {
        name: "check_wallet_balance",
        description:
          "Check the agent's remaining USDC budget on its HayStack API key.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "read_full_post",
        description:
          "Pay the per-read price for a post and retrieve the full text. Settles a USDC nanopayment to the writer's Arc wallet via x402. Only call after search and balance check.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            post_id: { type: Type.STRING, description: "ID of the post to read." },
          },
          required: ["post_id"],
        },
      },
    ],
  },
];

const SYSTEM_INSTRUCTION = `You are HayStack Agent, a budgeted research agent that pays writers per read.
You have a strict USDC budget. Your job is to:
1. Call search_haystack_index once with the user's question.
2. Call check_wallet_balance once.
3. Choose at most 3 of the most relevant returned posts whose combined price fits the budget.
4. Call read_full_post for each chosen post.
5. Synthesize a final answer in 2-4 short paragraphs that cites each purchased post by title.

Always prefer fewer high-relevance reads over many marginal ones.
Never call read_full_post on a post you did not see in search results.
Never exceed the budget. If nothing fits, say so plainly.`;

export function isGeminiLive() {
  return integrations.gemini.live;
}

function searchTool(query) {
  const posts = searchPosts(query);
  return {
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      preview: p.body_preview?.slice(0, 280),
      price_per_read: p.price_per_read,
      access_policy: p.access_policy,
      author_id: p.author_id,
    })),
  };
}

function balanceTool(apiKey) {
  const key = getApiKey(apiKey);
  if (!key) return { ok: false, error: "Unknown API key." };
  return { ok: true, name: key.name, balance_usdc: key.balance_usdc };
}

async function readTool({ postId, apiKey, publish }) {
  const post = getPost(postId);
  if (!post) return { ok: false, error: "Post not found." };
  const charge = await chargeRead({
    post,
    apiKey,
    agentIdentifier: "Gemini",
  });
  if (!charge.ok) return { ok: false, error: charge.code };
  publish?.({ type: "settlement", tx: charge.tx, post_title: post.title });
  return {
    ok: true,
    post_id: post.id,
    title: post.title,
    body_full: post.body_full,
    amount_usdc: post.price_per_read,
    arc_tx_hash: charge.tx.arc_tx_hash,
    provider_tx_id: charge.tx.provider_tx_id,
    settlement_status: charge.tx.settlement_status,
  };
}

export async function runGeminiAgent({ query, budgetUsdc, apiKey, publish }) {
  if (!isGeminiLive()) {
    throw new Error("Gemini is not configured");
  }

  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  const reads = [];
  let spent = 0;

  const userPrompt = `User question: ${query}\nUSDC budget: ${budgetUsdc.toFixed(4)} USDC\nAPI key in use: ${apiKey}`;
  const contents = [{ role: "user", parts: [{ text: userPrompt }] }];

  let answer = "";
  for (let turn = 0; turn < 8; turn += 1) {
    const result = await ai.models.generateContent({
      model: config.gemini.flashModel,
      contents,
      config: {
        tools: TOOLS,
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.4,
      },
    });

    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length === 0) {
      answer = parts
        .map((p) => p.text)
        .filter(Boolean)
        .join("\n")
        .trim();
      contents.push({ role: "model", parts });
      break;
    }

    contents.push({ role: "model", parts });

    const responseParts = [];
    for (const call of calls) {
      const { name, args } = call.functionCall;
      let response;
      if (name === "search_haystack_index") {
        response = searchTool(String(args?.query ?? query));
      } else if (name === "check_wallet_balance") {
        response = balanceTool(apiKey);
      } else if (name === "read_full_post") {
        const postId = String(args?.post_id ?? "");
        const post = getPost(postId);
        if (post && spent + post.price_per_read > budgetUsdc) {
          response = { ok: false, error: "OVER_BUDGET" };
        } else {
          const tool = await readTool({ postId, apiKey, publish });
          if (tool.ok) {
            spent += tool.amount_usdc;
            reads.push({
              post_id: tool.post_id,
              title: tool.title,
              amount_usdc: tool.amount_usdc,
              citation: `/post/${tool.post_id}`,
              excerpt: `${tool.body_full.slice(0, 200)}...`,
              arc_tx_hash: tool.arc_tx_hash,
              provider_tx_id: tool.provider_tx_id,
              settlement_status: tool.settlement_status,
            });
          }
          response = tool;
        }
      } else {
        response = { ok: false, error: `Unknown tool: ${name}` };
      }

      responseParts.push({
        functionResponse: { name, response },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  if (!answer) {
    answer = reads.length
      ? `Read ${reads.length} sources within the ${budgetUsdc.toFixed(4)} USDC budget. (Model returned no synthesis text.)`
      : "No relevant HayStack posts fit within the budget.";
  }

  return {
    query,
    budget_usdc: budgetUsdc,
    spent_usdc: Number(spent.toFixed(6)),
    reads,
    answer,
    model: { flash: config.gemini.flashModel, pro: config.gemini.proModel },
  };
}
