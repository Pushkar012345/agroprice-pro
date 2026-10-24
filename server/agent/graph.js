// AgroBot on LangGraph. Same contract as runAgent() in agent.js, so index.js can switch
// engines with AGENT_ENGINE=langgraph and the client sees no difference.
//
//   START -> agent -> (tool calls?) -> tools -> agent ... -> END
//                          |                       |
//                          no                      step limit reached
//                          v                       v
//                         END                    final -> END   (answer from what we have, no tools)
//
// Reused as-is from the plain agent: system prompt, input sanitising, tool validation
// (executeToolCall), citation fix-up. Only the orchestration is LangGraph.

const { StateGraph, Annotation, MessagesAnnotation, START, END } = require('@langchain/langgraph');
const { HumanMessage, AIMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages');
const { toolSchemas } = require('./tools');
const {
  sanitizeMessages, normalizeCitations, executeToolCall, modelParams,
  SYSTEM_PROMPT, MODEL, MAX_STEPS, MAX_CALLS_PER_STEP,
} = require('./agent');

// Messages use LangGraph's built-in reducer (append). steps is a plain counter.
const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  steps: Annotation({ reducer: (_, next) => next, default: () => 0 }),
});

function createChatModel({ apiKey = process.env.GROQ_API_KEY, model = MODEL } = {}) {
  const { ChatGroq } = require('@langchain/groq');
  const p = modelParams(model);
  return new ChatGroq({
    apiKey,
    model,
    temperature: 0.2,
    maxTokens: p.max_completion_tokens ?? p.max_tokens,
    ...(p.reasoning_effort && { reasoningEffort: p.reasoning_effort }),
  });
}

const toLc = (m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));

// LangChain tool call {name, args, id} -> the shape executeToolCall already validates.
const toRaw = (tc) => ({ id: tc.id, function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) } });

// model: anything with bindTools(tools) and invoke/stream (a ChatGroq, or a fake in tests).
async function runAgentGraph({ model, repo, messages, maxSteps = MAX_STEPS, onEvent, isCancelled, log }) {
  const llm = model || createChatModel();
  const withTools = llm.bindTools(toolSchemas);
  const records = [];
  let cancelled = false;
  let hitStepLimit = false;

  // Streams tokens to the UI while rebuilding the full message (tool calls included).
  const call = async (runnable, msgs) => {
    if (!onEvent) return runnable.invoke(msgs);
    let full;
    for await (const chunk of await runnable.stream(msgs)) {
      if (isCancelled?.()) { cancelled = true; break; }
      const t = typeof chunk.content === 'string' ? chunk.content : '';
      if (t) onEvent({ type: 'token', text: t });
      full = full ? full.concat(chunk) : chunk;
    }
    return full ?? new AIMessage('');
  };

  const agentNode = async (state) => {
    const msg = await call(withTools, state.messages);
    // Text streamed before a tool call was a preamble, not the answer: tell the UI to drop it.
    if (onEvent && msg.tool_calls?.length && msg.content) onEvent({ type: 'reset' });
    return { messages: [msg], steps: state.steps + 1 };
  };

  const toolsNode = async (state) => {
    const last = state.messages.at(-1);
    const out = [];
    for (const tc of (last.tool_calls || []).slice(0, MAX_CALLS_PER_STEP)) {
      onEvent?.({ type: 'tool_start', name: tc.name });
      const { record, message } = await executeToolCall(toRaw(tc), repo);
      records.push(record);
      onEvent?.({ type: 'tool_end', name: record.name, ok: record.ok, ms: record.ms, sources: record.sources });
      out.push(new ToolMessage({ tool_call_id: message.tool_call_id, name: tc.name, content: message.content }));
    }
    // Calls beyond the cap still need an answer, or the API rejects the next request.
    for (const tc of (last.tool_calls || []).slice(MAX_CALLS_PER_STEP)) {
      out.push(new ToolMessage({ tool_call_id: tc.id, name: tc.name, content: JSON.stringify({ error: 'too many tool calls at once' }) }));
    }
    return { messages: out };
  };

  // Step limit hit: force a plain-text answer (model without tools).
  const finalNode = async (state) => {
    hitStepLimit = true;
    return { messages: [await call(llm, state.messages)] };
  };

  const afterAgent = (state) => {
    if (cancelled || isCancelled?.()) return END;
    return state.messages.at(-1).tool_calls?.length ? 'tools' : END;
  };
  const afterTools = (state) => (cancelled || isCancelled?.() ? END : state.steps >= maxSteps ? 'final' : 'agent');

  const graph = new StateGraph(State)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('final', finalNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', afterAgent, ['tools', END])
    .addConditionalEdges('tools', afterTools, ['agent', 'final', END])
    .addEdge('final', END)
    .compile();

  const input = [new SystemMessage(SYSTEM_PROMPT), ...sanitizeMessages(messages).map(toLc)];
  let state;
  try {
    state = await graph.invoke({ messages: input }, { recursionLimit: maxSteps * 2 + 5 });
  } catch (err) {
    log?.(`graph error: ${err?.message}`);
    throw err;
  }

  if (cancelled || isCancelled?.()) return { reply: '', toolCalls: records, steps: state?.steps ?? 0, cancelled: true };

  const last = state.messages.at(-1);
  const text = typeof last.content === 'string' ? last.content : '';
  return {
    reply: normalizeCitations(text.trim() || 'Sorry, I could not produce an answer.'),
    toolCalls: records,
    steps: state.steps,
    ...(hitStepLimit && { hitStepLimit: true }),
  };
}

module.exports = { runAgentGraph, createChatModel };