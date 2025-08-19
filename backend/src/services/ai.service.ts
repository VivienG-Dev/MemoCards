const MODEL = "gpt-5-nano";

export async function chatJson(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  responseObject = false,
  useCase: 'flashcards' | 'summary' = 'flashcards'
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error("OPENAI_API_KEY environment variable is required");

  // Dynamic system message based on use case
  const systemMessages = {
    flashcards: "You ONLY reply with JSON matching the provided schema. Every flashcard MUST have a question (q), answer (a), and topic. The topic should be a short category or subject name for the flashcard content.",
    summary: "You ONLY reply with valid JSON matching the exact schema provided. Generate comprehensive summaries with meaningful key phrases that can be highlighted in the original text."
  };

  const finalMessages = [
    {
      role: "system",
      content: systemMessages[useCase],
    },
    ...messages,
  ];

  // Dynamic schemas based on use case
  const schemas = {
    flashcards: {
      name: "cards",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["cards"],
        properties: {
          cards: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["q", "a", "topic"],
              properties: {
                q: { type: "string" },
                a: { type: "string" },
                topic: { type: "string" },
              },
            },
          },
        },
      },
    },
    summary: {
      name: "summary_response",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["summary", "keyPhrases"],
        properties: {
          summary: { 
            type: "string",
            description: "Multi-paragraph organized summary with clear structure, maximum 800 words"
          },
          keyPhrases: {
            type: "array",
            description: "Exactly 8-15 important phrases from the original text to highlight",
            minItems: 8,
            maxItems: 15,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "importance", "category", "startPos"],
              properties: {
                text: { 
                  type: "string",
                  description: "Exact phrase from original text, 3-80 characters",
                  minLength: 3,
                  maxLength: 80
                },
                startPos: {
                  type: "integer",
                  description: "Character position where phrase starts in original text",
                  minimum: 0
                },
                importance: { 
                  type: "string", 
                  enum: ["high", "medium", "low"],
                  description: "Importance level of this phrase"
                },
                category: { 
                  type: "string", 
                  enum: ["definition", "fact", "concept", "example", "warning"],
                  description: "Content category of this phrase"
                }
              }
            }
          }
        },
      },
    }
  };

  const payload: any = {
    model: MODEL,
    messages: finalMessages,
    response_format: responseObject
      ? { type: "json_object" }
      : {
          type: "json_schema",
          json_schema: schemas[useCase],
        },
    // Reasonable token limit - gpt-5-nano spends all tokens on reasoning
    max_completion_tokens: 2000,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("OpenAI API Error Details:", {
      status: response.status,
      statusText: response.statusText,
      response: raw,
      model: MODEL,
      messageCount: finalMessages.length,
    });
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${raw}`
    );
  }

  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content;
  console.log(`OpenAI Response Debug (${useCase}):`, {
    hasChoices: !!data.choices,
    choicesLength: data.choices?.length,
    hasMessage: !!data.choices?.[0]?.message,
    hasContent: !!content,
    contentType: typeof content,
    contentLength: content?.length,
    rawDataKeys: Object.keys(data),
    useCase
  });

  if (!content) {
    console.error(
      `No content in OpenAI response for ${useCase}:`,
      JSON.stringify(data, null, 2)
    );
    throw new Error(`No content received from OpenAI for ${useCase}`);
  }

  const parsed = JSON.parse(content);
  
  // Handle different response formats based on use case
  if (responseObject) {
    return parsed;
  }
  
  if (useCase === 'flashcards') {
    return parsed.cards || [];
  } else if (useCase === 'summary') {
    return parsed; // Return the whole summary object with summary and keyPhrases
  }
  
  return parsed;
}
