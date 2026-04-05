import "./style.scss";
import Sidebar from "components/sidebar";
import toast from "components/toast";
import Ref from "html-tag-js/ref";
import { generateResponseStream } from "lib/claudeService";

/**@type {HTMLElement} */
let container;
/** @type {HTMLElement} */
let $chatContainer = null;
/** @type {Ref} */
const $input = new Ref();
/** @type {Ref} */
const $sendBtn = new Ref();

let history = [];
let isGenerating = false;

export default [
	"chat", // icon
	"clare", // id
	strings["clare ai"], // title
	initApp, // init function
	false, // prepend
	onSelected, // onSelected function
];

function initApp(el) {
	container = el;
	container.classList.add("clare-ai");

	const $header = (
		<div className="header">
			<div className="title">
				{strings["clare ai"]}
				<span
					className="clear-chat icon delete_outline"
					onclick={clearChat}
				></span>
			</div>
		</div>
	);

	$chatContainer = <div className="chat-container scroll"></div>;

	const $inputArea = (
		<div className="input-container">
			<textarea
				ref={$input}
				placeholder={strings["ask clare"]}
				oninput={handleInput}
				onkeydown={handleKeydown}
			></textarea>
			<button ref={$sendBtn} onclick={sendMessage} disabled={true}>
				<i className="icon send"></i>
			</button>
		</div>
	);

	container.append($header, $chatContainer, $inputArea);

	Sidebar.on("show", onSelected);
}

function handleInput() {
	const text = $input.el.value.trim();
	$sendBtn.el.disabled = !text || isGenerating;

	// Auto-resize textarea
	$input.el.style.height = "auto";
	$input.el.style.height = `${$input.el.scrollHeight}px`;
}

function handleKeydown(e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
}

function onSelected() {
	if ($chatContainer) {
		$chatContainer.scrollTop = $chatContainer.scrollHeight;
	}
}

function clearChat() {
	$chatContainer.innerHTML = "";
	history = [];
}

async function sendMessage() {
	const prompt = $input.el.value.trim();
	if (!prompt || isGenerating) return;

	isGenerating = true;
	$sendBtn.el.disabled = true;
	$input.el.value = "";
	$input.el.style.height = "auto";

	// Add user message to UI
	addMessage("user", prompt);

	// Get context from active file
	let context = "";
	const activeFile = window.editorManager?.activeFile;
	if (activeFile) {
		context = `File: ${activeFile.filename}\n\n${activeFile.session.getValue()}`;
	}

	// Add assistant message container
	const $assistantMsg = addMessage("assistant", "");
	const $content = $assistantMsg.querySelector(".content");

	let fullResponse = "";

	try {
		const stream = generateResponseStream(prompt, context, history);
		for await (const chunk of stream) {
			if (chunk.type === "text") {
				fullResponse += chunk.content;
				updateAssistantMessage($content, fullResponse);
				$chatContainer.scrollTop = $chatContainer.scrollHeight;
			} else if (chunk.type === "error") {
				addMessage("error", chunk.content);
			}
		}

		history.push({ role: "user", content: prompt });
		history.push({ role: "assistant", content: fullResponse });
	} catch (error) {
		addMessage("error", error.message);
	} finally {
		isGenerating = false;
		handleInput();
	}
}

function addMessage(role, content) {
	const $msg = (
		<div className={`message ${role}`}>
			<div className="content">{content}</div>
		</div>
	);
	$chatContainer.append($msg);
	$chatContainer.scrollTop = $chatContainer.scrollHeight;
	return $msg;
}

function updateAssistantMessage($container, text) {
	// Simple markdown-to-html (specifically for code blocks)
	const parts = text.split("```");
	$container.innerHTML = "";

	parts.forEach((part, index) => {
		if (index % 2 === 0) {
			// Regular text
			const $text = <span>{part}</span>;
			$container.append($text);
		} else {
			// Code block
			if (!part.trim()) return;
			const lines = part.split("\n");
			const lang = lines[0].trim();
			const code = lines.slice(1).join("\n").trim();

			const $pre = (
				<pre>
					<button className="apply-btn" onclick={() => applyCode(code)}>
						{strings["apply"]}
					</button>
					<code className={`language-${lang}`}>{code}</code>
				</pre>
			);
			$container.append($pre);
		}
	});
}

function applyCode(code) {
	const activeFile = window.editorManager?.activeFile;
	if (!activeFile) {
		toast("No active file to apply code to.");
		return;
	}

	const { editor } = window.editorManager;
	const session = activeFile.session;
	const cursor = editor.getCursorPosition();

	session.insert(cursor, code);
	toast("Code applied.");
}
