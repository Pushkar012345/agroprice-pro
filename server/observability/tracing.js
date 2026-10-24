// Observability for the agent: one trace per question, with a generation per LLM call and a
// span per tool call / retrieval. Tracing is optional and never allowed to break a chat:
//   - no LANGFUSE_* keys  -> no-op tracer (zero overhead, nothing leaves the server)
//   - any tracing error   -> swallowed (logged once), the user still gets an answer
//
// Interface (the real and no-op tracers are interchangeable, tests pass their own):
//   tracer.trace({ name, input, metadata, tags }) -> trace
//   trace.generation({ name, model, input, modelParameters }) -> obs
//   trace.span({ name, input, metadata }) -> obs
//   obs.end({ output, usage, level, statusMessage, metadata })
//   trace.end({ output, metadata })
//   tracer.flush() / tracer.shutdown()   (async, safe to call always)

const { AsyncLocalStorage } = require('node:async_hooks');

const NOOP_OBS = Object.freeze({ end() {} });
const NOOP_TRACE = Object.freeze({
  generation: () => NOOP_OBS,
  span: () => NOOP_OBS,
  end() {},
});
const noopTracer = Object.freeze({
  enabled: false,
  trace: () => NOOP_TRACE,
  async flush() {},
  async shutdown() {},
});

// Wraps any tracer so a bug or outage in the tracing backend can never reach the caller.
function safeTracer(inner, { log = console.warn } = {}) {
  let warned = false;
  const guard = (fn, fallback) => (...args) => {
    try { return fn(...args); } catch (err) {
      if (!warned) { warned = true; log(`tracing disabled after error: ${err?.message}`); }
      return fallback;
    }
  };
  const wrapObs = (obs) => (!obs ? NOOP_OBS : { end: guard((d) => obs.end(d), undefined) });
  const wrapTrace = (t) => (!t ? NOOP_TRACE : {
    generation: guard((d) => wrapObs(t.generation(d)), NOOP_OBS),
    span: guard((d) => wrapObs(t.span(d)), NOOP_OBS),
    end: guard((d) => t.end(d), undefined),
  });
  return {
    enabled: inner.enabled !== false,
    trace: guard((d) => wrapTrace(inner.trace(d)), NOOP_TRACE),
    flush: async () => { try { await inner.flush?.(); } catch { /* ignore */ } },
    shutdown: async () => { try { await inner.shutdown?.(); } catch { /* ignore */ } },
  };
}

// Optional pricing (USD per 1M tokens) so Langfuse can show cost for models it has no price list for.
function costFor(usage, { inPerM, outPerM }) {
  if (!usage || !(inPerM >= 0) || !(outPerM >= 0)) return undefined;
  const inputCost = ((usage.input || 0) * inPerM) / 1e6;
  const outputCost = ((usage.output || 0) * outPerM) / 1e6;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

function createLangfuseTracer({
  publicKey, secretKey, baseUrl, log = console.warn,
  inPerM = parseFloat(process.env.AGENT_COST_IN_PER_M),
  outPerM = parseFloat(process.env.AGENT_COST_OUT_PER_M),
  client,
} = {}) {
  const { Langfuse } = client ? { Langfuse: null } : require('langfuse');
  const lf = client || new Langfuse({ publicKey, secretKey, baseUrl, flushAt: 10, flushInterval: 2000 });
  lf.on?.('error', (err) => log(`langfuse: ${err?.message || err}`));

  const wrapObs = (o) => ({
    end({ output, usage, level, statusMessage, metadata } = {}) {
      const cost = costFor(usage, { inPerM, outPerM });
      o.end({
        output, level, statusMessage, metadata,
        ...(usage && { usage: { input: usage.input, output: usage.output, total: usage.total, unit: 'TOKENS', ...cost } }),
      });
    },
  });

  return safeTracer({
    enabled: true,
    trace({ name, input, metadata, tags }) {
      const t = lf.trace({ name, input, metadata, tags });
      return {
        generation: (d) => wrapObs(t.generation({ name: d.name, model: d.model, input: d.input, modelParameters: d.modelParameters })),
        span: (d) => wrapObs(t.span({ name: d.name, input: d.input, metadata: d.metadata })),
        end: ({ output, metadata: md } = {}) => t.update({ output, metadata: md }),
      };
    },
    flush: () => lf.flushAsync(),
    shutdown: () => lf.shutdownAsync(),
  }, { log });
}

// Reads LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL. Missing keys -> no-op.
function createTracerFromEnv(env = process.env, { log = console.warn } = {}) {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return noopTracer;
  return createLangfuseTracer({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
    log,
  });
}

// The active trace for the current request, so code deep in the stack (RAG retrieval) can add
// child spans without every function having to pass a tracer around.
const als = new AsyncLocalStorage();
const runWithTrace = (trace, fn) => als.run(trace, fn);
const activeTrace = () => als.getStore() || NOOP_TRACE;

// Times an async step as a span: output on success, level=ERROR (and rethrow) on failure.
async function withSpan(name, input, fn, { trace = activeTrace(), summarize = (r) => r } = {}) {
  const span = trace.span({ name, input });
  try {
    const result = await fn();
    span.end({ output: summarize(result) });
    return result;
  } catch (err) {
    span.end({ level: 'ERROR', statusMessage: err?.message });
    throw err;
  }
}

module.exports = {
  noopTracer, safeTracer, createLangfuseTracer, createTracerFromEnv,
  runWithTrace, activeTrace, withSpan, costFor,
};