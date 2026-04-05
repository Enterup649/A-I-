import settings from "./settings";

const SYSTEM_PROMPT = `You are Clare, an elite AI developer agent integrated into Acode editor.
You have the ability to read the current file's content and provide suggestions.
When asked to modify code, write complete, working implementations.
Be concise, technical, and direct. Format code with markdown code blocks.
You can help with various programming languages supported by Acode.`;

/**
 * @typedef {Object} ChatMessage
 * @property {'user'|'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {Object} StreamChunk
 * @property {'text'|'done'|'error'} type
 * @property {string} [content]
 */

/**
 * Stream a response from Claude
 * @param {string} prompt
 * @param {string} context
 * @param {ChatMessage[]} history
 * @returns {AsyncGenerator<StreamChunk>}
 */
export async function* generateResponseStream(prompt, context, history = []) {
	const apiKey = settings.value.anthropicApiKey;
	if (!apiKey) {
		yield { type: "error", content: "Anthropic API Key not set in settings." };
		return;
	}

	const messages = history.map((msg) => ({
		role: msg.role,
		content: msg.content,
	}));

	messages.push({
		role: "user",
		content: context
			? `Current file content:\n\`\`\`\n${context}\n\`\`\`\n\nUser: ${prompt}`
			: prompt,
	});

	try {
		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"anthropic-dangerous-direct-browser-access": "true",
			},
			body: JSON.stringify({
				model: "claude-3-5-sonnet-20240620",
				max_tokens: 4096,
				messages,
				system: SYSTEM_PROMPT,
				stream: true,
			}),
		});

		if (!response.ok) {
			const errorData = await response.json();
			yield { type: "error", content: errorData.error?.message || "API error" };
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop();

			for (const line of lines) {
				const trimmedLine = line.trim();
				if (trimmedLine.startsWith("data: ")) {
					const data = trimmedLine.slice(6);
					try {
						const parsed = JSON.parse(data);
						if (
							parsed.type === "content_block_delta" &&
							parsed.delta?.type === "text_delta"
						) {
							yield { type: "text", content: parsed.delta.text };
						}
					} catch (e) {
						// Ignore parse errors for non-JSON lines
					}
				}
			}
		}
		yield { type: "done" };
	} catch (error) {
		yield { type: "error", content: error.message };
	}
}

/**
 * Non-streaming response from Claude
 * @param {string} prompt
 * @param {string} context
 * @param {ChatMessage[]} history
 * @returns {Promise<string>}
 */
export async function generateResponse(prompt, context, history = []) {
	const apiKey = settings.value.anthropicApiKey;
	if (!apiKey) {
		return "Error: Anthropic API Key not set in settings.";
	}

	const messages = history.map((msg) => ({
		role: msg.role,
		content: msg.content,
	}));

	messages.push({
		role: "user",
		content: context
			? `Current file content:\n\`\`\`\n${context}\n\`\`\`\n\nUser: ${prompt}`
			: prompt,
	});

	try {
		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"anthropic-dangerous-direct-browser-access": "true",
			},
			body: JSON.stringify({
				model: "claude-3-5-sonnet-20240620",
				max_tokens: 4096,
				messages,
				system: SYSTEM_PROMPT,
			}),
		});

		const data = await response.json();
		if (!response.ok) {
			return `Error: ${data.error?.message || "API error"}`;
		}

		return data.content?.[0]?.text || "No response from AI.";
	} catch (error) {
		return `Error: ${error.message}`;
	}
}
