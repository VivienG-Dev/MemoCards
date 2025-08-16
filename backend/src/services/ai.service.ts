const MODEL = "gpt-4o-mini";

export async function chatJson(messages: any[], responseObject = false) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: responseObject
        ? { type: "json_object" }
        : {
            type: "json_schema",
            json_schema: {
              name: "cards",
              schema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    q: { type: "string" },
                    a: { type: "string" },
                    topic: { type: "string" },
                  },
                  required: ["q", "a"],
                },
              },
            },
          },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "[]";
}
