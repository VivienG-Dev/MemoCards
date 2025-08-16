const MODEL = "gpt-5-nano";

export async function chatJson(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  responseObject = false
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error("OPENAI_API_KEY environment variable is required");

  const finalMessages = [
    {
      role: "system",
      content:
        "You ONLY reply with JSON matching the provided schema. Every flashcard MUST have a question (q), answer (a), and topic. The topic should be a short category or subject name for the flashcard content.",
    },
    ...messages,
  ];

  const payload: any = {
    model: MODEL,
    messages: finalMessages,
    response_format: responseObject
      ? { type: "json_object" }
      : {
          type: "json_schema",
          json_schema: {
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
        },
    // Increase tokens significantly for longer texts and reasoning models
    max_completion_tokens: 4000,
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
  console.log("OpenAI Response Debug:", {
    hasChoices: !!data.choices,
    choicesLength: data.choices?.length,
    hasMessage: !!data.choices?.[0]?.message,
    hasContent: !!content,
    contentType: typeof content,
    contentLength: content?.length,
    rawDataKeys: Object.keys(data),
  });

  if (!content) {
    console.error(
      "No content in OpenAI response:",
      JSON.stringify(data, null, 2)
    );
    throw new Error("No content received from OpenAI");
  }

  const parsed = JSON.parse(content);
  return responseObject ? parsed : parsed.cards || [];
}
