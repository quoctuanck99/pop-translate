const OpenAI = require('openai');

async function translate(text, settings) {
  const { apiKey, model, sourceLang, targetLang, tone } = settings;

  if (!apiKey) throw new Error('NO_API_KEY');

  const client = new OpenAI({ apiKey });

  const sourcePart = sourceLang === 'auto'
    ? 'Detect the source language automatically.'
    : `Source language: ${sourceLang}.`;

  const prompt = [
    `Translate the following text to ${targetLang}.`,
    `Tone: ${tone}.`,
    sourcePart,
    'Reply with only the translated text, no explanation.',
    '',
    text
  ].join('\n');

  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000
  });

  return response.choices[0].message.content.trim();
}

module.exports = { translate };
