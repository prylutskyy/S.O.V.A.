/**
 * Neural Embeddings Helper using Transformers.js (for Offscreen / background)
 */
export async function getTransformersPipeline() {
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    // Disable local model checking and allow loading quantized web models
    if (env) {
      env.allowLocalModels = false;
      env.useBrowserCache = true;
    }
    return pipeline;
  } catch (err) {
    console.warn('[SOVA:NeuralEmbeddings] Failed to load @xenova/transformers:', err);
    return null;
  }
}
